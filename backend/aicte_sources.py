"""
AENOVA - AICTE NATIONAL INTERNSHIP PORTAL CONNECTOR

Purpose
-------
Collect real, public internship listings from the official AICTE
National Internship Portal.

This connector supports both:
1. The current portal route:
      https://internship.aicte-india.org/internships
2. The older public city route:
      https://internship.aicte-india.org/fetch_city.php

IMPORTANT
---------
- No fake listings are created.
- No organization names are invented.
- Original AICTE URLs are preserved.
- Expired listings are skipped when their page clearly says expired.
- If the current portal is JavaScript-rendered and does not expose
  listing links to a normal HTTP request, this connector safely returns
  zero results instead of fabricating data.
"""

from __future__ import annotations

import base64
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import parse_qs, unquote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup


# ============================================================
# CONFIGURATION
# ============================================================

AICTE_BASE_URL = "https://internship.aicte-india.org"
AICTE_LISTING_URL = f"{AICTE_BASE_URL}/internships"
AICTE_OLD_LISTING_URL = f"{AICTE_BASE_URL}/fetch_city.php"

TIMEOUT = 25

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/154.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;"
        "q=0.9,image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
}


# Keep this broad. The old portal accepted city names.
CITIES = [
    "Agartala", "Agra", "Ahmedabad", "Ahmednagar", "Aizawl",
    "Ajmer", "Aligarh", "Allahabad", "Amritsar", "Anand",
    "Asansol", "Aurangabad", "Bangalore", "Bareilly", "Belgaum",
    "Bengaluru", "Bhopal", "Bhubaneswar", "Bilaspur", "Bokaro",
    "Chandigarh", "Chennai", "Coimbatore", "Cuttack", "Dehradun",
    "Delhi", "Dhanbad", "Dharwad", "Dibrugarh", "Durgapur",
    "Faridabad", "Gandhinagar", "Gangtok", "Ghaziabad", "Goa",
    "Gorakhpur", "Gurgaon", "Gurugram", "Guwahati", "Gwalior",
    "Haridwar", "Hyderabad", "Imphal", "Indore", "Itanagar",
    "Jaipur", "Jalandhar", "Jammu", "Jamnagar", "Jamshedpur",
    "Jhansi", "Jodhpur", "Kakinada", "Kanpur", "Kochi",
    "Kolkata", "Kota", "Kozhikode", "Lucknow", "Ludhiana",
    "Madurai", "Mangalore", "Meerut", "Mumbai", "Mysore",
    "Nagpur", "Nashik", "Navi Mumbai", "Nellore", "Noida",
    "Panaji", "Patiala", "Patna", "Pondicherry", "Pune",
    "Raipur", "Rajahmundry", "Rajkot", "Ranchi", "Rohtak",
    "Salem", "Shillong", "Shimla", "Siliguri", "Srinagar",
    "Surat", "Thane", "Thiruvananthapuram", "Thrissur",
    "Tiruchirappalli", "Tirunelveli", "Udaipur", "Vadodara",
    "Varanasi", "Vasai", "Vellore", "Vijayawada", "Visakhapatnam",
    "Warangal"
]


# ============================================================
# BASIC HELPERS
# ============================================================

def clean_text(value: Any) -> str:
    if value is None:
        return ""

    text = BeautifulSoup(str(value), "html.parser").get_text(" ", strip=True)

    text = re.sub(r"\s+", " ", text)

    return text.strip()


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def absolute_url(href: str) -> str:
    href = clean_text(href)

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


def encode_city(city: str) -> str:
    return base64.b64encode(
        city.encode("utf-8")
    ).decode("ascii")


def is_detail_url(url: str) -> bool:
    """
    Current AICTE detail pages use:
        /internships/1-INTERNSHIP_...
    Older pages use:
        /internship-details.php?... 
    """

    if not is_aicte_url(url):
        return False

    path = urlparse(url).path.lower()

    return (
        "/internships/" in path
        or "internship-details.php" in path
    )


# ============================================================
# HTTP
# ============================================================

def fetch(url: str, params: Optional[dict] = None) -> str:
    response = requests.get(
        url,
        params=params,
        headers=HEADERS,
        timeout=TIMEOUT,
        allow_redirects=True,
    )

    response.raise_for_status()

    return response.text


# ============================================================
# TEXT FIELD EXTRACTION
# ============================================================

def extract_after_label(text: str, labels: List[str]) -> str:
    """
    Conservative label-based extraction.

    Example:
        "Apply by 29-Jun-2026"
        -> "29-Jun-2026"
    """

    for label in labels:
        pattern = (
            rf"{re.escape(label)}"
            rf"\s*[:\-]?\s*"
            rf"(.{{1,160}}?)"
            rf"(?=\s{{2,}}|$)"
        )

        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE,
        )

        if match:
            value = clean_text(match.group(1))

            if value:
                return value

    return ""


def extract_deadline(text: str) -> str:
    patterns = [
        r"apply\s+by\s*[:\-]?\s*"
        r"([0-9]{1,2}[-/\s][A-Za-z0-9]{2,9}[-/\s][0-9]{2,4})",

        r"last\s+date\s+to\s+apply\s*[:\-]?\s*"
        r"([0-9]{1,2}[-/\s][A-Za-z0-9]{2,9}[-/\s][0-9]{2,4})",

        r"application\s+deadline\s*[:\-]?\s*"
        r"([0-9]{1,2}[-/\s][A-Za-z0-9]{2,9}[-/\s][0-9]{2,4})",

        r"deadline\s*[:\-]?\s*"
        r"([0-9]{1,2}[-/\s][A-Za-z0-9]{2,9}[-/\s][0-9]{2,4})",
    ]

    for pattern in patterns:
        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE,
        )

        if match:
            value = clean_text(match.group(1))

            if value:
                return value

    return extract_after_label(
        text,
        [
            "Apply by",
            "Last date to apply",
            "Application deadline",
            "Deadline",
        ],
    )


def extract_duration(text: str) -> str:
    patterns = [
        r"duration\s*[:\-]?\s*"
        r"([0-9]+(?:\.[0-9]+)?\s*"
        r"(?:days?|weeks?|months?|years?))",

        r"available\s+for\s+duration\s+of\s+"
        r"([0-9]+(?:\.[0-9]+)?\s*"
        r"(?:days?|weeks?|months?|years?))",
    ]

    for pattern in patterns:
        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE,
        )

        if match:
            return clean_text(match.group(1))

    return ""


def extract_stipend(text: str) -> str:
    patterns = [
        r"stipend\s*[:\-]?\s*"
        r"(₹\s*[\d,]+(?:\s*/\s*month)?|"
        r"Rs\.?\s*[\d,]+(?:\s*/\s*month)?|"
        r"INR\s*[\d,]+(?:\s*/\s*month)?)",

        r"₹\s*[\d,]+\s*/\s*month",
    ]

    for pattern in patterns:
        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE,
        )

        if match:
            return clean_text(match.group(0))

    if re.search(r"stipend\s*[:\-]?\s*0\b", text, re.I):
        return "₹0 / month"

    return ""


def extract_mode(text: str) -> str:
    lowered = text.lower()

    if (
        "work from home" in lowered
        or "remote" in lowered
        or "fully online" in lowered
        or "100% online" in lowered
    ):
        return "Online"

    if (
        "hybrid" in lowered
        or "online and offline" in lowered
        or "online/offline" in lowered
    ):
        return "Hybrid"

    if (
        "full time (in-office)" in lowered
        or "in-office" in lowered
        or "offline" in lowered
        or "in person" in lowered
    ):
        return "Offline"

    if "online" in lowered or "virtual" in lowered:
        return "Online"

    return "See official listing"


def extract_location(text: str) -> str:
    patterns = [
        r"\bPan India\b",
        r"\bRemote\b",
        r"\bWork from Home\b",
        r"\bHybrid\b",
        r"\bDelhi\b",
        r"\bMumbai\b",
        r"\bBengaluru\b",
        r"\bBangalore\b",
        r"\bChennai\b",
        r"\bHyderabad\b",
        r"\bPune\b",
        r"\bKolkata\b",
        r"\bAhmedabad\b",
        r"\bNoida\b",
        r"\bGurugram\b",
        r"\bGurgaon\b",
        r"\bCoimbatore\b",
        r"\bSalem\b",
    ]

    for pattern in patterns:
        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE,
        )

        if match:
            return clean_text(match.group(0))

    return ""


def extract_organization(text: str) -> str:
    """
    Organization is extracted only from explicit labels or known
    detail-page structures. We do not guess from arbitrary sentences.
    """

    patterns = [
        r"(?:organization|organisation|company|employer)"
        r"\s*[:\-]\s*([^|]{2,120})",

        r"^([A-Z][A-Za-z0-9&.,'()\- ]{2,100})\s+"
        r"(?:Full Time|Part Time|Work from Home|Remote)",
    ]

    for pattern in patterns:
        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE,
        )

        if match:
            value = clean_text(match.group(1))

            if value and len(value) <= 120:
                return value

    return "Organization not available"


def extract_field(text: str) -> str:
    """
    Broad academic/professional classification.
    This does not invent a specific department; it only reports
    domains supported by words actually present in the listing.
    """

    aliases = {
        "Artificial Intelligence / Machine Learning": [
            "artificial intelligence",
            "machine learning",
            "deep learning",
            "generative ai",
            "llm",
            "large language model",
        ],
        "Computer Science / Software": [
            "software development",
            "software engineer",
            "web development",
            "website development",
            "full stack",
            "frontend",
            "backend",
            "python",
            "java",
            "programming",
        ],
        "Data Science / Analytics": [
            "data science",
            "data analyst",
            "data analytics",
            "business analytics",
            "data visualization",
        ],
        "Electronics / Electrical": [
            "electronics",
            "embedded",
            "electrical",
            "vlsi",
            "microcontroller",
            "iot",
        ],
        "Mechanical / Automotive": [
            "mechanical",
            "automotive",
            "cad",
            "manufacturing",
            "robotics",
        ],
        "Civil / Infrastructure": [
            "civil engineering",
            "construction",
            "structural",
            "infrastructure",
            "roads",
            "highways",
        ],
        "Chemical / Biotechnology": [
            "chemical engineering",
            "biotechnology",
            "biotech",
            "pharmaceutical",
            "laboratory",
        ],
        "Finance / Commerce": [
            "finance",
            "accounting",
            "commerce",
            "investment",
            "financial",
            "banking",
        ],
        "Management / Business": [
            "business development",
            "management",
            "marketing",
            "human resources",
            "operations",
            "sales",
        ],
        "Design / Media": [
            "graphic design",
            "ui/ux",
            "user experience",
            "content creation",
            "video editing",
            "media",
        ],
        "Law / Policy / Government": [
            "law",
            "legal",
            "policy",
            "public administration",
            "government",
            "governance",
        ],
        "Education / Teaching": [
            "teaching",
            "education",
            "trainer",
            "academic",
            "curriculum",
        ],
        "Social Sciences / Humanities": [
            "social science",
            "psychology",
            "sociology",
            "economics",
            "humanities",
            "journalism",
        ],
        "Agriculture / Environment": [
            "agriculture",
            "agri",
            "environment",
            "sustainability",
            "climate",
            "forestry",
        ],
    }

    lowered = text.lower()

    found = []

    for field, keywords in aliases.items():
        if any(keyword in lowered for keyword in keywords):
            found.append(field)

    if not found:
        return "General / Interdisciplinary"

    return " / ".join(found[:3])


def extract_eligibility(text: str) -> str:
    patterns = [
        r"who can apply\??\s*(.{20,700}?)(?="
        r"\s+terms of engagement|\s+number of openings|"
        r"\s+apply now|\s+brief abstract|$)",

        r"requirements?\s*(.{20,700}?)(?="
        r"\s+terms of engagement|\s+number of openings|"
        r"\s+apply now|\s+brief abstract|$)",
    ]

    for pattern in patterns:
        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE,
        )

        if match:
            value = clean_text(match.group(1))

            if value:
                return value[:1000]

    return ""


def extract_event_date(text: str) -> str:
    patterns = [
        r"start\s+date\s*[:\-]?\s*"
        r"([0-9]{1,2}[-/\s][A-Za-z0-9]{2,9}[-/\s][0-9]{2,4})",

        r"starts?\s+on\s+"
        r"([0-9]{1,2}[-/\s][A-Za-z0-9]{2,9}[-/\s][0-9]{2,4})",
    ]

    for pattern in patterns:
        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE,
        )

        if match:
            return clean_text(match.group(1))

    return ""


# ============================================================
# EXPIRY CHECK
# ============================================================

def is_expired(text: str) -> bool:
    lowered = text.lower()

    expired_phrases = [
        "sorry you cannot apply",
        "date expired",
        "application closed",
        "applications closed",
        "expired",
        "closed for applications",
    ]

    return any(
        phrase in lowered
        for phrase in expired_phrases
    )


# ============================================================
# CURRENT PORTAL PARSER
# ============================================================

def find_current_detail_links(html: str) -> List[str]:
    """
    Find current AICTE detail URLs exposed in normal HTML.

    Current pages use URLs like:
      /internships/1-INTERNSHIP_...

    We deliberately do not manufacture URLs if the portal is
    client-side rendered.
    """

    soup = BeautifulSoup(
        html,
        "html.parser",
    )

    links = []

    for anchor in soup.find_all(
        "a",
        href=True,
    ):
        href = anchor.get("href", "")

        url = absolute_url(href)

        if not is_detail_url(url):
            continue

        links.append(url)

    # Also inspect raw HTML for absolute URLs that may be present
    # inside script/data attributes.
    raw_matches = re.findall(
        r"https?://internship\.aicte-india\.org/"
        r"(?:internships/[^\"'\\\s<>]+|internship-details\.php\?[^\"'\\\s<>]+)",
        html,
        flags=re.IGNORECASE,
    )

    links.extend(
        absolute_url(url)
        for url in raw_matches
    )

    # De-duplicate while preserving order.
    unique = []

    seen = set()

    for url in links:
        key = url.rstrip("/").lower()

        if key in seen:
            continue

        seen.add(key)

        unique.append(url)

    return unique


def parse_current_detail_page(
    url: str,
) -> Optional[Dict[str, Any]]:

    try:
        html = fetch(url)

    except Exception as exc:
        print(
            f"[AICTE] detail fetch failed: "
            f"{url} -> {exc}"
        )
        return None

    soup = BeautifulSoup(
        html,
        "html.parser",
    )

    text = clean_text(
        soup.get_text(
            " ",
            strip=True,
        )
    )

    if not text:
        return None

    if is_expired(text):
        return None

    title = ""

    # Prefer H1/H2/H3 because AICTE detail pages place the
    # internship title prominently.
    for heading in soup.find_all(
        ["h1", "h2", "h3"],
    ):
        candidate = clean_text(
            heading.get_text(
                " ",
                strip=True,
            )
        )

        if (
            candidate
            and len(candidate) >= 5
            and candidate.lower()
            not in {
                "apply now",
                "brief abstract",
                "requirements",
                "requirements:",
            }
        ):
            title = candidate

            break

    if not title:
        # Current pages may have the title in a metadata tag.
        for selector in [
            ("meta", {"property": "og:title"}),
            ("meta", {"name": "title"}),
        ]:
            tag = soup.find(
                selector[0],
                attrs=selector[1],
            )

            if tag:
                candidate = clean_text(
                    tag.get("content", "")
                )

                if candidate:
                    title = candidate
                    break

    if not title:
        return None

    organization = extract_organization(text)

    location = extract_location(text)

    mode = extract_mode(text)

    deadline = extract_deadline(text)

    event_date = extract_event_date(text)

    duration = extract_duration(text)

    stipend = extract_stipend(text)

    eligibility = extract_eligibility(text)

    field = extract_field(
        f"{title} {text}"
    )

    description = ""

    # Use the "About the program" section when available.
    about_match = re.search(
        r"about the program\s*(.{40,1800}?)(?="
        r"\s+perks|\s+who can apply|\s+terms of engagement|"
        r"\s+number of openings|\s+apply now|$)",
        text,
        flags=re.IGNORECASE,
    )

    if about_match:
        description = clean_text(
            about_match.group(1)
        )

    if not description:
        description = (
            f"Internship listed on the official "
            f"AICTE National Internship Portal."
        )

    details = []

    if duration:
        details.append(
            f"Duration: {duration}"
        )

    if stipend:
        details.append(
            f"Stipend: {stipend}"
        )

    if mode != "See official listing":
        details.append(
            f"Mode: {mode}"
        )

    if details:
        description = (
            description
            + " "
            + " ".join(details)
        )

    source_id = (
        urlparse(url)
        .path
        .rstrip("/")
        .split("/")
        [-1]
    )

    return {
        "title": title[:500],
        "description": description[:2500],
        "category": "Internship",
        "field": field,
        "eligibility": eligibility[:1500],
        "organization": organization,
        "location": (
            location
            or "See official listing"
        ),
        "deadline": deadline,
        "event_date": event_date,
        "mode": mode,
        "skills_required": "",
        "url": url,
        "official_url": url,
        "source": "AICTE National Internship Portal",
        "source_id": source_id,
        "last_verified": now_utc(),
    }


# ============================================================
# OLD CITY-PAGE FALLBACK
# ============================================================

def parse_old_city_page(
    html: str,
) -> List[Dict[str, Any]]:

    soup = BeautifulSoup(
        html,
        "html.parser",
    )

    results = []

    for anchor in soup.find_all(
        "a",
        href=True,
    ):
        label = clean_text(
            anchor.get_text(
                " ",
                strip=True,
            )
        ).lower()

        href = anchor.get(
            "href",
            "",
        )

        url = absolute_url(href)

        if not is_detail_url(url):
            continue

        # Old pages commonly used "View Details".
        # We also accept any real AICTE detail link because
        # current markup can differ.
        card = anchor

        for _ in range(4):
            if card.parent is None:
                break

            parent = card.parent

            parent_text = clean_text(
                parent.get_text(
                    " ",
                    strip=True,
                )
            )

            if (
                len(parent_text) >= 40
                and len(parent_text) <= 3000
            ):
                card = parent
                break

            card = parent

        card_text = clean_text(
            card.get_text(
                " ",
                strip=True,
            )
        )

        if not card_text:
            continue

        if is_expired(card_text):
            continue

        title = ""

        # Look for a meaningful heading inside the card.
        for heading in card.find_all(
            ["h1", "h2", "h3", "h4", "strong"],
        ):
            candidate = clean_text(
                heading.get_text(
                    " ",
                    strip=True,
                )
            )

            if (
                len(candidate) >= 5
                and candidate.lower()
                not in {
                    "view details",
                    "apply now",
                    "register now",
                }
            ):
                title = candidate
                break

        if not title:
            title = (
                label
                if label
                not in {
                    "view details",
                    "view",
                    "details",
                    "apply now",
                }
                else ""
            )

        if not title:
            continue

        organization = extract_organization(
            card_text
        )

        location = extract_location(
            card_text
        )

        mode = extract_mode(
            card_text
        )

        deadline = extract_deadline(
            card_text
        )

        field = extract_field(
            f"{title} {card_text}"
        )

        eligibility = extract_eligibility(
            card_text
        )

        source_id = (
            urlparse(url)
            .path
            .rstrip("/")
            .split("/")
            [-1]
        )

        results.append(
            {
                "title": title[:500],
                "description": (
                    "Internship listed on the official "
                    "AICTE National Internship Portal."
                ),
                "category": "Internship",
                "field": field,
                "eligibility": eligibility[:1500],
                "organization": organization,
                "location": (
                    location
                    or "See official listing"
                ),
                "deadline": deadline,
                "event_date": "",
                "mode": mode,
                "skills_required": "",
                "url": url,
                "official_url": url,
                "source": "AICTE National Internship Portal",
                "source_id": source_id,
                "last_verified": now_utc(),
            }
        )

    return results


def fetch_old_city(
    city: str,
    page: int,
) -> List[Dict[str, Any]]:

    params = {
        "city": encode_city(city),
        "page": page,
    }

    try:
        response = requests.get(
            AICTE_OLD_LISTING_URL,
            params=params,
            headers=HEADERS,
            timeout=TIMEOUT,
            allow_redirects=True,
        )

        response.raise_for_status()

        # If the old endpoint now redirects to the current
        # /internships page, do not pretend that it is still
        # a city-specific listing page.
        if (
            "/internships" in response.url
            and "fetch_city.php" not in response.url
        ):
            return []

        return parse_old_city_page(
            response.text
        )

    except Exception as exc:
        print(
            f"[AICTE] old city page failed "
            f"{city} page {page}: {exc}"
        )

        return []


# ============================================================
# DEDUPLICATION
# ============================================================

def deduplicate(
    opportunities: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:

    final = []

    seen_urls = set()
    seen_titles = set()

    for item in opportunities:

        url = clean_text(
            item.get("url")
        )

        title = clean_text(
            item.get("title")
        ).lower()

        url_key = (
            url.rstrip("/")
            .lower()
        )

        title_key = title

        if (
            url_key
            and url_key in seen_urls
        ):
            continue

        if (
            title_key
            and title_key in seen_titles
        ):
            continue

        if url_key:
            seen_urls.add(url_key)

        if title_key:
            seen_titles.add(title_key)

        final.append(item)

    return final


# ============================================================
# VALIDATION
# ============================================================

def validate(
    opportunities: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:

    final = []

    for item in opportunities:

        title = clean_text(
            item.get("title")
        )

        url = clean_text(
            item.get("url")
        )

        if len(title) < 4:
            continue

        if not is_aicte_url(url):
            continue

        if not is_detail_url(url):
            continue

        if clean_text(
            item.get("category")
        ) != "Internship":
            continue

        if not clean_text(
            item.get("organization")
        ):
            item["organization"] = (
                "Organization not available"
            )

        if not clean_text(
            item.get("location")
        ):
            item["location"] = (
                "See official listing"
            )

        final.append(item)

    return final


# ============================================================
# MAIN COLLECTOR
# ============================================================

def get_aicte_opportunities(
    max_pages: int = 1,
    max_results: int = 120,
) -> List[Dict[str, Any]]:
    """
    Collect live AICTE internships.

    Strategy:
    1. Try the current /internships portal.
    2. If ordinary HTML exposes detail links, open those detail pages.
    3. If it does not, try the old public city endpoint as a fallback.
    4. Never invent a listing URL or listing data.
    """

    all_results: List[Dict[str, Any]] = []

    # --------------------------------------------------------
    # CURRENT PORTAL
    # --------------------------------------------------------

    print(
        "[AICTE] Checking current National Internship Portal..."
    )

    try:
        html = fetch(
            AICTE_LISTING_URL
        )

        current_links = find_current_detail_links(
            html
        )

        print(
            f"[AICTE] Current portal exposed "
            f"{len(current_links)} detail links"
        )

        if current_links:

            current_links = current_links[
                :max_results
            ]

            with ThreadPoolExecutor(
                max_workers=8
            ) as executor:

                futures = [
                    executor.submit(
                        parse_current_detail_page,
                        url,
                    )
                    for url in current_links
                ]

                for future in as_completed(
                    futures
                ):
                    try:
                        result = future.result()

                        if result:
                            all_results.append(
                                result
                            )

                    except Exception as exc:
                        print(
                            f"[AICTE] detail parser error: "
                            f"{exc}"
                        )

    except Exception as exc:
        print(
            f"[AICTE] current portal failed: {exc}"
        )

    # --------------------------------------------------------
    # OLD PUBLIC CITY FALLBACK
    # --------------------------------------------------------

    if len(all_results) < max_results:

        print(
            "[AICTE] Trying legacy public city listings "
            "as a fallback..."
        )

        cities_to_check = CITIES

        with ThreadPoolExecutor(
            max_workers=8
        ) as executor:

            futures = []

            for city in cities_to_check:
                for page in range(
                    1,
                    max_pages + 1,
                ):
                    futures.append(
                        executor.submit(
                            fetch_old_city,
                            city,
                            page,
                        )
                    )

            for future in as_completed(
                futures
            ):
                try:
                    results = future.result()

                    if results:
                        all_results.extend(
                            results
                        )

                    if (
                        len(all_results)
                        >= max_results
                    ):
                        break

                except Exception as exc:
                    print(
                        f"[AICTE] legacy parser error: "
                        f"{exc}"
                    )

    all_results = deduplicate(
        all_results
    )

    all_results = validate(
        all_results
    )

    all_results = all_results[
        :max_results
    ]

    print(
        f"[AICTE] Final live listings added: "
        f"{len(all_results)}"
    )

    return all_results


# ============================================================
# OPTIONAL DIRECT TEST
# ============================================================

if __name__ == "__main__":
    results = get_aicte_opportunities(
        max_pages=1,
        max_results=20,
    )

    print()
    print(
        f"AICTE test result count: {len(results)}"
    )

    for item in results[:10]:
        print(
            f"- {item.get('title')} | "
            f"{item.get('organization')} | "
            f"{item.get('url')}"
        )
