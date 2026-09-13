"""
AENOVA - AICTE National Internship Portal connector.

Uses only public AICTE pages:
- corporate_work.php (current searchable public internship listing)
- fetch_city.php (legacy city listing fallback)
- official internship detail pages

No fake listings are generated.
"""

from __future__ import annotations

import base64
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


BASE = "https://internship.aicte-india.org"
LISTING_URL = f"{BASE}/corporate_work.php"
CITY_URL = f"{BASE}/fetch_city.php"
SOURCE = "AICTE National Internship Portal"
TIMEOUT = 25

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/154.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# A broad set of cities. The connector uses the searchable listing first,
# so this is only a fallback.
CITIES = [
    "Ahmedabad", "Bengaluru", "Bhopal", "Bhubaneswar", "Chandigarh",
    "Chennai", "Coimbatore", "Cuttack", "Dehradun", "Delhi",
    "Faridabad", "Gandhinagar", "Ghaziabad", "Gurugram", "Guwahati",
    "Hyderabad", "Indore", "Jaipur", "Jalandhar", "Jammu",
    "Jamshedpur", "Jodhpur", "Kanpur", "Kochi", "Kolkata",
    "Lucknow", "Ludhiana", "Madurai", "Mangaluru", "Mumbai",
    "Mysuru", "Nagpur", "Nashik", "Navi Mumbai", "Noida",
    "Panaji", "Patna", "Pune", "Raipur", "Rajkot", "Ranchi",
    "Salem", "Shillong", "Shimla", "Siliguri", "Srinagar",
    "Surat", "Thane", "Thiruvananthapuram", "Thrissur",
    "Tiruchirappalli", "Tirunelveli", "Udaipur", "Vadodara",
    "Varanasi", "Vellore", "Vijayawada", "Visakhapatnam", "Warangal",
]


def text(value: Any) -> str:
    if value is None:
        return ""
    # Do not send URLs through BeautifulSoup: that caused the warning
    # seen in Render logs.
    value = str(value).replace("\xa0", " ")
    return re.sub(r"\s+", " ", value).strip()


def soup_text(node: Any) -> str:
    if node is None:
        return ""
    return re.sub(
        r"\s+",
        " ",
        BeautifulSoup(
            str(node),
            "html.parser",
        ).get_text(" ", strip=True),
    ).strip()


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def abs_url(href: str) -> str:
    return urljoin(BASE + "/", text(href))


def is_aicte(url: str) -> bool:
    try:
        return (urlparse(url).hostname or "").lower() in {
            "internship.aicte-india.org",
            "www.internship.aicte-india.org",
        }
    except Exception:
        return False


def is_detail(url: str) -> bool:
    if not is_aicte(url):
        return False
    path = urlparse(url).path.lower()
    return (
        "internship-details.php" in path
        or "/internships/" in path
    )


def get(url: str, params: Optional[dict] = None) -> Optional[requests.Response]:
    try:
        r = requests.get(
            url,
            params=params,
            headers=HEADERS,
            timeout=TIMEOUT,
            allow_redirects=True,
        )
        r.raise_for_status()
        return r
    except Exception as exc:
        print(f"[AICTE] request failed: {url} -> {exc}")
        return None


def deadline_from(value: str) -> str:
    value = text(value)
    patterns = [
        r"apply\s+by\s*[:\-]?\s*"
        r"(\d{1,2}[-/ ](?:\d{1,2}|[A-Za-z]{3,9})[-/ ]\d{2,4})",
        r"deadline\s*[:\-]?\s*"
        r"(\d{1,2}[-/ ](?:\d{1,2}|[A-Za-z]{3,9})[-/ ]\d{2,4})",
        r"last\s+date\s+to\s+apply\s*[:\-]?\s*"
        r"(\d{1,2}[-/ ](?:\d{1,2}|[A-Za-z]{3,9})[-/ ]\d{2,4})",
    ]
    for p in patterns:
        m = re.search(p, value, re.I)
        if m:
            return text(m.group(1))
    return ""


def expired(deadline: str, full_text: str) -> bool:
    low = text(full_text).lower()
    if any(
        phrase in low
        for phrase in [
            "application closed",
            "applications closed",
            "date expired",
            "sorry you cannot apply",
        ]
    ):
        return True

    if deadline:
        for fmt in (
            "%d-%m-%Y", "%d/%m/%Y",
            "%d-%b-%Y", "%d-%B-%Y",
            "%d %b %Y", "%d %B %Y",
            "%Y-%m-%d",
        ):
            try:
                dt = datetime.strptime(deadline, fmt)
                if dt.date() < datetime.now().date():
                    return True
                break
            except ValueError:
                continue

    return False


def duration_from(value: str) -> str:
    m = re.search(
        r"duration\s*[:\-]?\s*(\d+(?:\.\d+)?\s*"
        r"(?:days?|weeks?|months?|years?))",
        text(value),
        re.I,
    )
    return text(m.group(1)) if m else ""


def stipend_from(value: str) -> str:
    patterns = [
        r"(₹\s*[\d,]+(?:\s*-\s*₹?\s*[\d,]+)?\s*/?\s*month)",
        r"(Rs\.?\s*[\d,]+(?:\s*-\s*[\d,]+)?\s*/?\s*month)",
        r"(INR\s*[\d,]+(?:\s*-\s*[\d,]+)?\s*/?\s*month)",
    ]
    for p in patterns:
        m = re.search(p, text(value), re.I)
        if m:
            return text(m.group(1))
    if re.search(r"\bunpaid internship\b", value, re.I):
        return "Unpaid internship"
    return ""


def mode_from(value: str) -> str:
    low = text(value).lower()
    if "virtual internship" in low or "work from home" in low or "remote" in low:
        return "Online"
    if "hybrid" in low:
        return "Hybrid"
    if "full time" in low or "in-office" in low:
        return "Offline"
    return "See official listing"


def location_from(value: str) -> str:
    # AICTE cards normally contain Pan India or a city list.
    for p in [
        r"\bPan India\b",
        r"\bRemote\b",
        r"\bChennai\b",
        r"\bCoimbatore\b",
        r"\bSalem\b",
        r"\bBengaluru\b",
        r"\bBangalore\b",
        r"\bHyderabad\b",
        r"\bMumbai\b",
        r"\bPune\b",
        r"\bDelhi\b",
        r"\bNoida\b",
        r"\bGurugram\b",
        r"\bKolkata\b",
        r"\bJaipur\b",
    ]:
        m = re.search(p, value, re.I)
        if m:
            return text(m.group(0))
    return ""


FIELD_WORDS = {
    "Artificial Intelligence / Machine Learning": [
        "artificial intelligence", "machine learning", "deep learning",
        "generative ai", "gen-ai", "llm",
    ],
    "Computer Science / IT": [
        "software development", "web development", "full stack",
        "frontend", "backend", "python", "java", "javascript",
        "programming", "cyber security", "cybersecurity", "devops",
    ],
    "Data Science / Analytics": [
        "data science", "data analyst", "data analytics",
        "data analysis", "sql", "data visualization",
    ],
    "Electronics / Electrical": [
        "electronics", "embedded", "electrical", "vlsi", "iot",
        "microcontroller",
    ],
    "Mechanical / Automotive": [
        "mechanical", "automotive", "manufacturing", "cad",
        "robotics", "aerospace",
    ],
    "Civil / Infrastructure": [
        "civil engineering", "construction", "infrastructure",
        "structural", "smart city",
    ],
    "Chemical / Biotechnology": [
        "chemical engineering", "biotechnology", "biotech",
        "pharmaceutical",
    ],
    "Finance / Commerce": [
        "finance", "accounting", "commerce", "banking",
        "financial",
    ],
    "Management / Business": [
        "business development", "management", "marketing",
        "human resources", "sales", "operations",
    ],
    "Design / Media": [
        "graphic design", "ui/ux", "user experience",
        "content creation", "media", "video editing",
    ],
    "Law / Policy / Government": [
        "law", "legal", "policy", "government", "governance",
    ],
    "Education / Teaching": [
        "teaching", "education", "trainer", "academic",
    ],
    "Agriculture / Environment": [
        "agriculture", "environment", "sustainability",
        "climate", "forestry",
    ],
}


def field_from(value: str) -> str:
    low = text(value).lower()
    found = [
        field
        for field, words in FIELD_WORDS.items()
        if any(word in low for word in words)
    ]
    return " / ".join(found[:3]) or "General / Interdisciplinary"


def detail_links(html: str) -> List[str]:
    soup = BeautifulSoup(html, "html.parser")
    urls = []

    for a in soup.find_all("a", href=True):
        url = abs_url(a.get("href", ""))
        label = soup_text(a).lower()

        if is_detail(url):
            urls.append(url)

        # Some old markup can use a relative PHP link without a
        # recognizable label.
        elif "view details" in label:
            candidate = abs_url(a.get("href", ""))
            if is_aicte(candidate):
                urls.append(candidate)

    # Search raw HTML too.
    urls += [
        abs_url(x)
        for x in re.findall(
            r"(?:https?:)?//internship\.aicte-india\.org/"
            r"(?:internship-details\.php\?[^\"'<> ]+|internships/[^\"'<> ]+)",
            html,
            re.I,
        )
    ]

    out = []
    seen = set()
    for url in urls:
        key = url.rstrip("/").lower()
        if key not in seen:
            seen.add(key)
            out.append(url)
    return out


def title_from_detail(soup: BeautifulSoup) -> str:
    for h in soup.find_all(["h1", "h2", "h3", "h4"]):
        value = soup_text(h)
        if len(value) >= 5 and value.lower() not in {
            "apply now", "view details", "requirements", "perks"
        }:
            return value

    meta = soup.find("meta", attrs={"property": "og:title"})
    if meta and meta.get("content"):
        return text(meta.get("content"))

    return ""


def organization_from(value: str) -> str:
    for p in [
        r"(?:organization|organisation|company|employer)\s*[:\-]\s*([^|]{2,120})",
    ]:
        m = re.search(p, value, re.I)
        if m:
            result = text(m.group(1))
            if result:
                return result
    return "Organization not available"


def parse_detail(url: str) -> Optional[Dict[str, Any]]:
    r = get(url)
    if r is None:
        return None

    soup = BeautifulSoup(r.text, "html.parser")
    full = soup_text(soup)
    title = title_from_detail(soup)

    if not title or expired(deadline_from(full), full):
        return None

    deadline = deadline_from(full)
    duration = duration_from(full)
    stipend = stipend_from(full)
    mode = mode_from(full)
    location = location_from(full)
    field = field_from(title + " " + full)
    organization = organization_from(full)

    description = (
        "Internship listed on the official AICTE National Internship Portal."
    )

    about = re.search(
        r"about\s+the\s+program\s*(.+?)(?="
        r"\s+perks|\s+who can apply|\s+requirements|"
        r"\s+terms of engagement|\s+apply now|$)",
        full,
        re.I,
    )
    if about:
        description = text(about.group(1))[:2500]

    extras = []
    if duration:
        extras.append(f"Duration: {duration}")
    if stipend:
        extras.append(f"Stipend: {stipend}")
    if mode != "See official listing":
        extras.append(f"Mode: {mode}")
    if extras:
        description += " " + " ".join(extras)

    return {
        "title": title[:500],
        "description": description[:3000],
        "category": "Internship",
        "field": field,
        "eligibility": "",
        "organization": organization,
        "location": location or "See official listing",
        "deadline": deadline,
        "event_date": "",
        "mode": mode,
        "skills_required": "",
        "url": url,
        "official_url": url,
        "source": SOURCE,
        "source_id": (
            urlparse(url).query
            or urlparse(url).path.rstrip("/").split("/")[-1]
        )[:500],
        "last_verified": now(),
    }


def city_links(city: str) -> List[str]:
    # AICTE's legacy endpoint uses Base64 in the indexed URLs.
    encoded = base64.b64encode(
        city.encode("utf-8")
    ).decode("ascii")

    r = get(
        CITY_URL,
        params={"city": encoded, "page": 1},
    )
    if r is None:
        return []

    # If AICTE redirected to the new generic portal, this response
    # is not a city listing.
    if urlparse(r.url).path.rstrip("/") == "/internships":
        return []

    return detail_links(r.text)


def get_aicte_opportunities(
    max_pages: int = 1,
    max_results: int = 120,
) -> List[Dict[str, Any]]:
    print("[AICTE] Starting official AICTE connector")

    links: List[str] = []

    # ---------------------------------------------------------
    # PRIMARY: current public searchable listing.
    # ---------------------------------------------------------
    # Use a few pages because the public listing is paginated.
    for page in range(1, max(2, min(max_pages + 1, 4))):
        r = get(
            LISTING_URL,
            params={"page": page, "search": ""},
        )
        if r is None:
            continue

        found = detail_links(r.text)
        print(
            f"[AICTE] corporate_work.php page {page}: "
            f"{len(found)} detail links"
        )
        links.extend(found)

        if len(links) >= max_results:
            break

    # ---------------------------------------------------------
    # FALLBACK: city listing pages.
    # ---------------------------------------------------------
    if len(links) < max_results:
        print("[AICTE] Falling back to public city listings")

        with ThreadPoolExecutor(max_workers=6) as executor:
            futures = {
                executor.submit(city_links, city): city
                for city in CITIES
            }

            for future in as_completed(futures):
                try:
                    links.extend(future.result())
                except Exception as exc:
                    print(
                        f"[AICTE] city failed "
                        f"{futures[future]}: {exc}"
                    )

                if len(set(links)) >= max_results * 2:
                    break

    # Deduplicate.
    unique = []
    seen = set()
    for url in links:
        key = url.rstrip("/").lower()
        if key not in seen:
            seen.add(key)
            unique.append(url)

    unique = unique[:max_results]

    print(
        f"[AICTE] Unique official detail URLs: {len(unique)}"
    )

    results: List[Dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=8) as executor:
        futures = [
            executor.submit(parse_detail, url)
            for url in unique
        ]

        for future in as_completed(futures):
            try:
                item = future.result()
                if item:
                    results.append(item)
            except Exception as exc:
                print(f"[AICTE] detail parse failed: {exc}")

    # Final URL/title dedupe.
    final = []
    seen = set()
    for item in results:
        url = text(item.get("url"))
        title = text(item.get("title"))
        if not is_detail(url) or not title:
            continue
        key = url.rstrip("/").lower()
        if key in seen:
            continue
        seen.add(key)
        final.append(item)

    print(
        f"[AICTE] Final live listings added: {len(final)}"
    )

    return final[:max_results]


if __name__ == "__main__":
    data = get_aicte_opportunities(
        max_pages=1,
        max_results=20,
    )
    print(f"AICTE test count: {len(data)}")
    for item in data[:10]:
        print(
            item["title"],
            "|",
            item["organization"],
            "|",
            item["deadline"],
            "|",
            item["url"],
        )
