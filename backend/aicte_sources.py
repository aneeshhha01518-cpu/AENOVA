"""
AENOVA - AICTE National Internship Portal connector.

This connector only returns internships that are actually exposed by
the official AICTE portal. It never invents opportunities.

Discovery strategy:
1. Try the legacy public AICTE city listing with the city name as plain text.
2. Try the older Base64 city format as a fallback.
3. Extract real "View Details" links from the returned HTML.
4. Open each official detail page and build the AENOVA opportunity record.
5. Keep only non-expired records when an application deadline is available.
6. Also check the current /internships page, but do not pretend that its
   client-rendered cards exist when normal HTTP HTML does not expose them.

The current AICTE portal is a live/filter-driven page. The connector therefore
uses the public listing/detail pages only where normal HTTP responses expose
actual listing URLs.
"""

from __future__ import annotations

import base64
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Dict, Iterable, List, Optional
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


AICTE_BASE_URL = "https://internship.aicte-india.org"
CURRENT_URL = f"{AICTE_BASE_URL}/internships"
CITY_URL = f"{AICTE_BASE_URL}/fetch_city.php"

SOURCE_NAME = "AICTE National Internship Portal"
TIMEOUT = 25

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/154.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
}

# Broad city coverage. We do not claim that every city has a result.
CITIES = [
    "Ahmedabad", "Agra", "Ajmer", "Aligarh", "Amritsar", "Aurangabad",
    "Bengaluru", "Bhopal", "Bhubaneswar", "Chandigarh", "Chennai",
    "Coimbatore", "Cuttack", "Dehradun", "Delhi", "Dhanbad", "Durgapur",
    "Faridabad", "Gandhinagar", "Ghaziabad", "Gurugram", "Guwahati",
    "Gwalior", "Hyderabad", "Indore", "Jaipur", "Jalandhar", "Jammu",
    "Jamshedpur", "Jodhpur", "Kanpur", "Kochi", "Kolkata", "Kota",
    "Lucknow", "Ludhiana", "Madurai", "Mangaluru", "Meerut", "Mumbai",
    "Mysuru", "Nagpur", "Nashik", "Navi Mumbai", "Noida", "Panaji",
    "Patna", "Pune", "Raipur", "Rajkot", "Ranchi", "Salem", "Shillong",
    "Shimla", "Siliguri", "Srinagar", "Surat", "Thane",
    "Thiruvananthapuram", "Thrissur", "Tiruchirappalli", "Tirunelveli",
    "Udaipur", "Vadodara", "Varanasi", "Vellore", "Vijayawada",
    "Visakhapatnam", "Warangal",
]


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str) and (
        value.startswith("http://") or value.startswith("https://")
    ):
        return value.strip()

    soup = BeautifulSoup(str(value), "html.parser")
    return re.sub(r"\s+", " ", soup.get_text(" ", strip=True)).strip()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def absolute_url(href: str) -> str:
    href = (href or "").strip()
    if not href:
        return ""
    return urljoin(AICTE_BASE_URL + "/", href)


def is_aicte_url(url: str) -> bool:
    try:
        host = (urlparse(url).hostname or "").lower()
        return host in {
            "internship.aicte-india.org",
            "www.internship.aicte-india.org",
        }
    except Exception:
        return False


def is_detail_url(url: str) -> bool:
    if not is_aicte_url(url):
        return False

    path = urlparse(url).path.lower()

    return (
        "/internships/" in path
        or path.endswith("/internship-details.php")
        or "internship-details.php" in path
    )


def request_html(url: str, params: Optional[dict] = None) -> Optional[requests.Response]:
    try:
        response = requests.get(
            url,
            params=params,
            headers=HEADERS,
            timeout=TIMEOUT,
            allow_redirects=True,
        )
        response.raise_for_status()
        return response
    except Exception as exc:
        print(f"[AICTE] request failed: {url} -> {exc}")
        return None


def encode_city(city: str) -> str:
    return base64.b64encode(city.encode("utf-8")).decode("ascii")


def parse_date(value: str) -> Optional[datetime]:
    value = clean_text(value)

    if not value:
        return None

    formats = [
        "%d-%m-%Y",
        "%d/%m/%Y",
        "%d-%b-%Y",
        "%d-%B-%Y",
        "%d %b %Y",
        "%d %B %Y",
        "%Y-%m-%d",
        "%Y-%m-%d %H:%M:%S",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(value, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    try:
        return parsedate_to_datetime(value)
    except Exception:
        return None


def is_expired(deadline: str, page_text: str = "") -> bool:
    lowered = clean_text(page_text).lower()

    explicit_expired = [
        "date expired",
        "application closed",
        "applications closed",
        "sorry you cannot apply",
        "expired",
        "closed for applications",
    ]

    if any(p in lowered for p in explicit_expired):
        return True

    dt = parse_date(deadline)

    if dt is not None:
        now = datetime.now(timezone.utc)
        if dt.date() < now.date():
            return True

    return False


def extract_label_value(text: str, labels: Iterable[str]) -> str:
    for label in labels:
        pattern = rf"{re.escape(label)}\s*[:\-]?\s*([^\n|]{{1,180}})"
        match = re.search(pattern, text, flags=re.I)
        if match:
            value = clean_text(match.group(1))
            if value:
                return value
    return ""


def extract_deadline(text: str) -> str:
    patterns = [
        r"apply\s+by\s*[:\-]?\s*"
        r"(\d{1,2}[-/ ](?:\d{1,2}|[A-Za-z]{3,9})[-/ ]\d{2,4})",
        r"last\s+date\s+to\s+apply\s*[:\-]?\s*"
        r"(\d{1,2}[-/ ](?:\d{1,2}|[A-Za-z]{3,9})[-/ ]\d{2,4})",
        r"application\s+deadline\s*[:\-]?\s*"
        r"(\d{1,2}[-/ ](?:\d{1,2}|[A-Za-z]{3,9})[-/ ]\d{2,4})",
        r"deadline\s*[:\-]?\s*"
        r"(\d{1,2}[-/ ](?:\d{1,2}|[A-Za-z]{3,9})[-/ ]\d{2,4})",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.I)
        if match:
            return clean_text(match.group(1))

    return extract_label_value(
        text,
        ["Apply by", "Last date to apply", "Deadline"],
    )


def extract_duration(text: str) -> str:
    match = re.search(
        r"duration\s*[:\-]?\s*"
        r"(\d+(?:\.\d+)?\s*(?:days?|weeks?|months?|years?))",
        text,
        flags=re.I,
    )
    return clean_text(match.group(1)) if match else ""


def extract_stipend(text: str) -> str:
    patterns = [
        r"(₹\s*[\d,]+(?:\s*-\s*₹?\s*[\d,]+)?\s*/?\s*month)",
        r"(INR\s*[\d,]+(?:\s*-\s*[\d,]+)?\s*/?\s*month)",
        r"(Rs\.?\s*[\d,]+(?:\s*-\s*[\d,]+)?\s*/?\s*month)",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.I)
        if match:
            return clean_text(match.group(1))

    if re.search(r"\bunpaid\b", text, flags=re.I):
        return "Unpaid"

    return ""


def extract_mode(text: str) -> str:
    lowered = text.lower()

    if "virtual internship" in lowered or "work from home" in lowered:
        return "Online"

    if "remote" in lowered:
        return "Online"

    if "hybrid" in lowered:
        return "Hybrid"

    if "full time" in lowered or "in-office" in lowered:
        return "Offline"

    if "part time" in lowered:
        return "See official listing"

    return "See official listing"


def extract_location(text: str) -> str:
    patterns = [
        r"\bPan India\b",
        r"\bWork from Home\b",
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
        r"\bGurgaon\b",
        r"\bKolkata\b",
        r"\bAhmedabad\b",
        r"\bJaipur\b",
        r"\bKochi\b",
        r"\bLucknow\b",
        r"\bPanjim\b",
        r"\bPanaji\b",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.I)
        if match:
            return clean_text(match.group(0))

    # AICTE cards often place the location immediately after mode/date.
    match = re.search(
        r"\b(?:Full Time|Part Time|Virtual Internship)\b\s+"
        r"(?:\d{1,2}[-/][A-Za-z0-9-]+[-/]\d{2,4})?\s*"
        r"([A-Za-z][A-Za-z .,&-]{2,80})",
        text,
        flags=re.I,
    )
    return clean_text(match.group(1)) if match else ""


def extract_field(text: str) -> str:
    lowered = text.lower()

    fields = [
        (
            "Artificial Intelligence / Machine Learning",
            [
                "artificial intelligence", "machine learning",
                "deep learning", "generative ai", "llm",
            ],
        ),
        (
            "Computer Science / IT",
            [
                "software development", "software engineer",
                "web development", "full stack", "frontend",
                "backend", "python", "java", "javascript",
                "react", "flutter", ".net", "programming",
            ],
        ),
        (
            "Data Science / Analytics",
            [
                "data science", "data analyst", "data analytics",
                "data visualization", "business analytics",
            ],
        ),
        (
            "Electronics / Electrical",
            [
                "electronics", "embedded", "electrical",
                "vlsi", "microcontroller", "iot",
            ],
        ),
        (
            "Mechanical / Automotive",
            [
                "mechanical", "automotive", "manufacturing",
                "cad", "robotics",
            ],
        ),
        (
            "Civil / Infrastructure",
            [
                "civil engineering", "construction",
                "structural", "infrastructure",
            ],
        ),
        (
            "Chemical / Biotechnology",
            [
                "chemical engineering", "biotechnology",
                "biotech", "pharmaceutical",
            ],
        ),
        (
            "Finance / Commerce",
            [
                "finance", "accounting", "commerce",
                "investment", "banking",
            ],
        ),
        (
            "Management / Business",
            [
                "business development", "management",
                "marketing", "human resources", "operations", "sales",
            ],
        ),
        (
            "Design / Media",
            [
                "graphic design", "ui/ux", "user experience",
                "content creation", "video editing", "media",
            ],
        ),
        (
            "Law / Policy / Government",
            [
                "law", "legal", "policy",
                "public administration", "government", "governance",
            ],
        ),
        (
            "Education / Teaching",
            [
                "teaching", "education", "trainer",
                "academic", "curriculum",
            ],
        ),
        (
            "Agriculture / Environment",
            [
                "agriculture", "environment", "sustainability",
                "climate", "forestry",
            ],
        ),
    ]

    found = []
    for field, keywords in fields:
        if any(k in lowered for k in keywords):
            found.append(field)

    return " / ".join(found[:3]) or "General / Interdisciplinary"


def extract_organization(card_text: str, detail_text: str = "") -> str:
    for text in [detail_text, card_text]:
        patterns = [
            r"(?:organization|organisation|company|employer)\s*[:\-]\s*"
            r"([A-Z][^|]{2,120})",
        ]

        for pattern in patterns:
            match = re.search(pattern, text, flags=re.I)
            if match:
                value = clean_text(match.group(1))
                if value:
                    return value

    return "Organization not available"


def extract_title_from_detail(soup: BeautifulSoup, text: str) -> str:
    for heading in soup.find_all(["h1", "h2", "h3"]):
        value = clean_text(heading.get_text(" ", strip=True))
        if (
            len(value) >= 5
            and value.lower() not in {
                "apply now", "apply !!", "requirements",
                "perks", "who can apply?",
            }
        ):
            return value

    meta = soup.find("meta", attrs={"property": "og:title"})
    if meta and meta.get("content"):
        return clean_text(meta.get("content"))

    return ""


def parse_detail(url: str) -> Optional[Dict[str, Any]]:
    response = request_html(url)

    if response is None:
        return None

    soup = BeautifulSoup(response.text, "html.parser")
    text = clean_text(soup.get_text(" ", strip=True))

    if not text:
        return None

    title = extract_title_from_detail(soup, text)

    if not title:
        return None

    deadline = extract_deadline(text)

    if is_expired(deadline, text):
        return None

    duration = extract_duration(text)
    stipend = extract_stipend(text)
    mode = extract_mode(text)
    location = extract_location(text)
    organization = extract_organization(text, text)
    field = extract_field(f"{title} {text}")

    description = ""

    about = re.search(
        r"about\s+the\s+program\s*(.+?)(?="
        r"\s+perks\s+|\s+who\s+can\s+apply\s*\??"
        r"|\s+terms\s+of\s+engagement|\s+number\s+of\s+openings|"
        r"\s+apply\s+now|\s+apply\s+!!|$)",
        text,
        flags=re.I,
    )

    if about:
        description = clean_text(about.group(1))[:2500]

    if not description:
        description = (
            "Internship listed on the official "
            "AICTE National Internship Portal."
        )

    source_id = (
        urlparse(url).query
        or urlparse(url).path.rstrip("/").split("/")[-1]
    )

    return {
        "title": title[:500],
        "description": description,
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
        "source": SOURCE_NAME,
        "source_id": source_id[:500],
        "last_verified": now_iso(),
    }


def find_detail_links(html: str) -> List[str]:
    soup = BeautifulSoup(html, "html.parser")
    found: List[str] = []

    for anchor in soup.find_all("a", href=True):
        label = clean_text(anchor.get_text(" ", strip=True)).lower()
        href = absolute_url(anchor.get("href", ""))

        if not is_detail_url(href):
            continue

        # Accept all real AICTE detail links. "View Details" is the
        # common label, but markup has changed over time.
        if label in {
            "view details",
            "view",
            "details",
            "apply now",
            "apply",
            "",
        } or is_detail_url(href):
            found.append(href)

    # Some pages put URLs inside JS/data attributes.
    raw = re.findall(
        r"https?://internship\.aicte-india\.org/"
        r"(?:internships/[^\"'\\\s<>]+|internship-details\.php\?[^\"'\\\s<>]+)",
        html,
        flags=re.I,
    )
    found.extend(raw)

    unique = []
    seen = set()

    for url in found:
        key = url.rstrip("/").lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(url)

    return unique


def fetch_city_page(city: str, encoded: bool) -> Optional[str]:
    value = encode_city(city) if encoded else city

    response = request_html(
        CITY_URL,
        params={
            "city": value,
            "page": 1,
        },
    )

    if response is None:
        return None

    # Do not treat a redirect to the new generic portal as a city page.
    final_path = urlparse(response.url).path.lower()

    if final_path == "/internships":
        return None

    return response.text


def collect_city(city: str) -> List[str]:
    # Plain city is tried first because the current legacy route may
    # accept ordinary query values. Base64 is kept as compatibility.
    for encoded in (False, True):
        html = fetch_city_page(city, encoded=encoded)

        if not html:
            continue

        links = find_detail_links(html)

        if links:
            print(
                f"[AICTE] {city}: {len(links)} detail links found"
            )
            return links

    return []


def dedupe_urls(urls: List[str]) -> List[str]:
    result = []
    seen = set()

    for url in urls:
        key = url.rstrip("/").lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(url)

    return result


def get_aicte_opportunities(
    max_pages: int = 1,
    max_results: int = 120,
) -> List[Dict[str, Any]]:
    """
    Main entry point expected by opportunity_sources.py.
    """

    print(
        "[AICTE] Starting official AICTE National Internship Portal connector"
    )

    # ------------------------------------------------------------
    # 1. Current portal
    # ------------------------------------------------------------

    current = request_html(CURRENT_URL)

    if current is not None:
        current_links = find_detail_links(current.text)

        print(
            f"[AICTE] Current /internships page exposed "
            f"{len(current_links)} detail links to normal HTTP"
        )

        if current_links:
            links = current_links[:max_results]
        else:
            links = []
    else:
        links = []

    # ------------------------------------------------------------
    # 2. Legacy public city pages
    # ------------------------------------------------------------

    if len(links) < max_results:
        print(
            "[AICTE] Checking public city listing pages as fallback"
        )

        # Keep concurrency moderate so the official portal is not flooded.
        city_links: List[str] = []

        with ThreadPoolExecutor(max_workers=6) as executor:
            futures = {
                executor.submit(collect_city, city): city
                for city in CITIES
            }

            for future in as_completed(futures):
                try:
                    city_links.extend(future.result())
                except Exception as exc:
                    city = futures[future]
                    print(
                        f"[AICTE] city parser failed {city}: {exc}"
                    )

                if len(city_links) >= max_results * 2:
                    break

        links.extend(city_links)

    links = dedupe_urls(links)[:max_results]

    print(
        f"[AICTE] Total unique detail URLs discovered: {len(links)}"
    )

    # ------------------------------------------------------------
    # 3. Detail pages
    # ------------------------------------------------------------

    results: List[Dict[str, Any]] = []

    if links:
        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = [
                executor.submit(parse_detail, url)
                for url in links
            ]

            for future in as_completed(futures):
                try:
                    item = future.result()
                    if item:
                        results.append(item)
                except Exception as exc:
                    print(
                        f"[AICTE] detail parsing failed: {exc}"
                    )

    # ------------------------------------------------------------
    # 4. Final validation + dedup
    # ------------------------------------------------------------

    final: List[Dict[str, Any]] = []
    seen = set()

    for item in results:
        url = clean_text(item.get("url"))
        title = clean_text(item.get("title"))

        if not is_aicte_url(url):
            continue

        if not is_detail_url(url):
            continue

        if not title:
            continue

        key = url.rstrip("/").lower()

        if key in seen:
            continue

        seen.add(key)
        final.append(item)

    final = final[:max_results]

    print(
        f"[AICTE] Final live listings added: {len(final)}"
    )

    return final


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
            item["url"],
        )
