"""
AENOVA - LIVE OPPORTUNITY COLLECTOR

Source:
    Unstop

Categories:
    Hackathons
    Internships
    Competitions
    Workshops

IMPORTANT:
    - Real public listings only
    - No fake opportunities
    - No fake organizations
    - Categories remain separate
    - Original Unstop URLs are preserved
    - Organization is shown only when confidently extracted
    - If organization cannot be verified, we use:
          "Organization not available"
"""

from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


# ============================================================
# CONFIGURATION
# ============================================================

BASE_URL = "https://api.unstop.com"

TIMEOUT = 30

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/154.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,"
        "application/xml;q=0.9,image/avif,image/webp,"
        "*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
}


# ============================================================
# REAL UNSTOP CATEGORY SOURCES
# ============================================================

CATEGORY_URLS = {
    "Hackathon": "https://api.unstop.com/hackathons/",
    "Internship": "https://api.unstop.com/internship",
    "Competition": "https://api.unstop.com/competitions/",
    "Workshop": "https://api.unstop.com/workshops-webinars/",
}


# ============================================================
# CONSTANTS
# ============================================================

UNKNOWN_ORGANIZATION = "Organization not available"

VALID_CATEGORIES = {
    "Hackathon",
    "Internship",
    "Competition",
    "Workshop",
}

CATEGORY_ORDER = {
    "Hackathon": 1,
    "Internship": 2,
    "Competition": 3,
    "Workshop": 4,
}


# ============================================================
# HTTP
# ============================================================

def fetch_html(url: str) -> str:
    """
    Fetch a public Unstop page.
    """

    response = requests.get(
        url,
        headers=HEADERS,
        timeout=TIMEOUT,
    )

    response.raise_for_status()

    return response.text


# ============================================================
# TEXT CLEANING
# ============================================================

def clean_text(value: Any) -> str:
    """
    Normalize text.
    """

    if value is None:
        return ""

    text = str(value)

    text = text.replace("\xa0", " ")
    text = text.replace("\u200b", "")
    text = text.replace("\u2013", "-")
    text = text.replace("\u2014", "-")
    text = text.replace("\u2018", "'")
    text = text.replace("\u2019", "'")
    text = text.replace("\u201c", '"')
    text = text.replace("\u201d", '"')

    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    return text.strip()


def clean_title(value: str) -> str:
    """
    Clean an opportunity title.
    """

    text = clean_text(value)

    if not text:
        return ""

    text = re.sub(
        r"^(hackathons?|internships?|internship|"
        r"competitions?|workshops?)"
        r"\s*[:|-]?\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"\b\d[\d,]*\s*"
        r"(registered|registrations|applied|"
        r"applications|participants?|views?|impressions?)\b",
        "",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"\b\d+\s+(day|days|hour|hours)\s+left\b",
        "",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    return text.strip(" |-:")


def clean_description(value: str) -> str:
    """
    Clean description text.
    """

    text = clean_text(value)

    if not text:
        return ""

    unwanted = [
        "See official listing",
        "View Details",
        "View details",
        "Register Now",
        "Apply Now",
        "Login",
        "Sign Up",
        "Registered",
        "Applied",
        "Impressions",
        "Participants",
        "Registrations",
    ]

    for phrase in unwanted:

        text = re.sub(
            re.escape(phrase),
            "",
            text,
            flags=re.IGNORECASE,
        )

    text = re.sub(
        r"\s+",
        " ",
        text,
    ).strip()

    if len(text) > 500:
        text = text[:497].rstrip() + "..."

    return text


# ============================================================
# URL HELPERS
# ============================================================

def make_absolute_url(href: str) -> str:
    """
    Convert relative URLs to absolute URLs.
    """

    href = clean_text(href)

    if not href:
        return ""

    if href.startswith("//"):
        return "https:" + href

    if href.startswith("http://"):
        return href

    if href.startswith("https://"):
        return href

    return urljoin(
        BASE_URL,
        href,
    )


def is_unstop_host(url: str) -> bool:
    """
    Ensure URL belongs to Unstop.
    """

    try:

        host = urlparse(
            url
        ).netloc.lower()

        return host in {
            "api.unstop.com",
            "unstop.com",
            "www.unstop.com",
        }

    except Exception:

        return False


# ============================================================
# CATEGORY URL VALIDATION
# ============================================================

def matches_category_url(
    url: str,
    category: str,
) -> bool:
    """
    Check whether a URL belongs to a category.
    """

    if not url:
        return False

    if not is_unstop_host(url):
        return False

    path = (
        urlparse(url)
        .path
        .lower()
        .rstrip("/")
    )

    blocked_paths = [
        "/login",
        "/signup",
        "/register",
        "/search",
        "/browse",
        "/all-opportunities",
    ]

    if any(
        blocked in path
        for blocked in blocked_paths
    ):
        return False

    # --------------------------------------------------------
    # HACKATHON
    # --------------------------------------------------------

    if category == "Hackathon":

        return (
            path.startswith("/hackathons/")
            or "/hackathon-" in path
            or "/hackathon/" in path
        )

    # --------------------------------------------------------
    # INTERNSHIP
    # --------------------------------------------------------

    if category == "Internship":

        return (
            path.startswith("/internships/")
            or path.startswith("/internship/")
            or path.startswith("/jobs/")
            or path.startswith("/job/")
        )

    # --------------------------------------------------------
    # COMPETITION
    # --------------------------------------------------------

    if category == "Competition":

        return (
            path.startswith("/competitions/")
            or "/competition-" in path
            or "/competition/" in path
        )

    # --------------------------------------------------------
    # WORKSHOP
    # --------------------------------------------------------

    if category == "Workshop":

        return (
            path.startswith("/workshops-webinars/")
            or path.startswith("/workshop/")
            or "/workshop-" in path
        )

    return False


# ============================================================
# CLOSED LISTING DETECTION
# ============================================================

def is_closed(text: str) -> bool:
    """
    Detect obviously closed opportunities.
    """

    text = clean_text(
        text
    ).lower()

    closed_phrases = [
        "registration closed",
        "registrations closed",
        "application closed",
        "applications closed",
        "registration has closed",
        "applications have closed",
        "deadline passed",
        "event has ended",
        "closed for registration",
    ]

    return any(
        phrase in text
        for phrase in closed_phrases
    )


# ============================================================
# DEADLINE EXTRACTION
# ============================================================

def extract_deadline(
    text: str,
) -> str:
    """
    Extract remaining time or deadline.
    """

    text = clean_text(
        text
    )

    # Example:
    # 5 days left
    match = re.search(
        r"(\d+)\s+(day|days|hour|hours)\s+left",
        text,
        flags=re.IGNORECASE,
    )

    if match:

        return (
            f"{match.group(1)} "
            f"{match.group(2)} left"
        )

    patterns = [
        r"Registration\s+Deadline\s*[:\-]?\s*"
        r"(\d{1,2}\s+[A-Za-z]{3}'?\d{2,4})",

        r"Application\s+Deadline\s*[:\-]?\s*"
        r"(\d{1,2}\s+[A-Za-z]{3}'?\d{2,4})",

        r"Deadline\s*[:\-]?\s*"
        r"(\d{1,2}\s+[A-Za-z]{3}'?\d{2,4})",
    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE,
        )

        if match:

            return clean_text(
                match.group(1)
            )

    return ""


# ============================================================
# LOCATION EXTRACTION
# ============================================================

def extract_location(
    text: str,
) -> str:
    """
    Extract online/remote/mode/city information.
    """

    text = clean_text(
        text
    )

    modes = [
        "Work from Home",
        "Remote",
        "Online",
        "Hybrid",
        "Offline",
    ]

    for mode in modes:

        if re.search(
            rf"\b{re.escape(mode)}\b",
            text,
            flags=re.IGNORECASE,
        ):

            return mode

    cities = [
        "Bangalore",
        "Bengaluru",
        "Chennai",
        "Coimbatore",
        "Hyderabad",
        "Mumbai",
        "Delhi",
        "New Delhi",
        "Pune",
        "Kolkata",
        "Noida",
        "Gurgaon",
        "Gurugram",
        "Ahmedabad",
        "Jaipur",
        "Mysuru",
        "Mysore",
        "Namakkal",
        "Tirupati",
        "Madurai",
        "Trichy",
        "Tiruchirappalli",
        "Kochi",
        "Chandigarh",
    ]

    for city in cities:

        if re.search(
            rf"\b{re.escape(city)}\b",
            text,
            flags=re.IGNORECASE,
        ):

            return city

    return "See official listing"


# ============================================================
# CARD FINDING
# ============================================================

def find_card(anchor):
    """
    Walk up the DOM to find the opportunity card.
    """

    current = anchor

    for _ in range(8):

        if current is None:
            break

        try:

            text = clean_text(
                current.get_text(
                    " ",
                    strip=True,
                )
            )

        except Exception:

            text = ""

        if 50 <= len(text) <= 3000:
            return current

        current = current.parent

    return anchor.parent


# ============================================================
# TITLE EXTRACTION FROM CATEGORY PAGE
# ============================================================

def extract_card_title(
    card,
    anchor,
) -> str:
    """
    Extract title from category card.
    """

    selectors = [
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        '[class*="title"]',
        '[class*="name"]',
        '[class*="heading"]',
    ]

    for selector in selectors:

        try:

            elements = card.select(
                selector
            )

        except Exception:

            elements = []

        for element in elements:

            value = clean_title(
                element.get_text(
                    " ",
                    strip=True,
                )
            )

            if not value:
                continue

            if len(value) < 4:
                continue

            if len(value) > 200:
                continue

            bad = {
                "hackathon",
                "hackathons",
                "internship",
                "internships",
                "competition",
                "competitions",
                "workshop",
                "workshops",
                "login",
                "signup",
                "register",
                "browse",
            }

            if value.lower() in bad:
                continue

            return value

    anchor_title = clean_title(
        anchor.get_text(
            " ",
            strip=True,
        )
    )

    if 4 <= len(anchor_title) <= 200:
        return anchor_title

    return ""


# ============================================================
# TITLE FROM URL FALLBACK
# ============================================================

def title_from_url(
    url: str,
) -> str:
    """
    Generate a fallback title from the official URL.
    """

    try:

        path = urlparse(
            url
        ).path

        pieces = [
            piece
            for piece in path.split("/")
            if piece
        ]

        if not pieces:
            return ""

        slug = pieces[-1]

        slug = re.sub(
            r"-\d{5,}$",
            "",
            slug,
        )

        slug = slug.replace(
            "-",
            " ",
        )

        slug = re.sub(
            r"\s+",
            " ",
            slug,
        )

        return clean_title(
            slug.title()
        )

    except Exception:

        return ""


# ============================================================
# INTERNSHIP SAFETY
# ============================================================

def is_probably_internship(
    text: str,
    url: str,
) -> bool:
    """
    Prevent ordinary jobs from being classified as internships.
    """

    combined = (
        clean_text(text).lower()
        + " "
        + clean_text(url).lower()
    )

    terms = [
        "internship",
        "intern ",
        " intern",
        "intern-",
        "intern/",
    ]

    return any(
        term in combined
        for term in terms
    )


# ============================================================
# ORGANIZATION VALIDATION
# ============================================================

def clean_organization(
    value: str,
) -> str:
    """
    Accept an organization only if it looks like an actual
    organization/company name.

    IMPORTANT:
    We reject sentence-like text.
    """

    value = clean_text(
        value
    )

    if not value:
        return ""

    value = re.sub(
        r"^(organization|organisation|company|"
        r"organizer|organiser|posted by|"
        r"offered by)\s*[:\-]?\s*",
        "",
        value,
        flags=re.IGNORECASE,
    )

    value = clean_text(
        value
    ).strip(
        " |-:"
    )

    if len(value) < 2:
        return ""

    if len(value) > 120:
        return ""

    # --------------------------------------------------------
    # Reject obvious UI text.
    # --------------------------------------------------------

    rejected_exact = {
        "unstop",
        "unstop listing",
        "view details",
        "view detail",
        "register",
        "register now",
        "login",
        "sign up",
        "signup",
        "see official listing",
        "official website",
        "free",
        "eligibility",
        "details",
        "important dates",
        "rewards and prizes",
        "contact the organisers",
    }

    if value.lower() in rejected_exact:
        return ""

    # --------------------------------------------------------
    # Reject sentences.
    # --------------------------------------------------------

    sentence_indicators = [
        " is ",
        " are ",
        " was ",
        " were ",
        " this ",
        " that ",
        " these ",
        " those ",
        " focused on ",
        " looking for ",
        " looking to ",
        " opportunity ",
        " responsibilities ",
        " requirements ",
        " students ",
        " candidates ",
        " participants ",
        " internship ",
        " workshop ",
        " competition ",
        " hackathon ",
        " learn ",
        " learning ",
        " build ",
        " building ",
        " create ",
        " creating ",
        " help ",
        " helps ",
        " provide ",
        " provides ",
        " develop ",
        " developing ",
    ]

    lower = value.lower()

    if any(
        indicator in lower
        for indicator in sentence_indicators
    ):
        return ""

    # Too many words generally indicates description text.
    word_count = len(
        value.split()
    )

    if word_count > 12:
        return ""

    # Reject long sentence-like punctuation.
    if value.count(".") > 1:
        return ""

    if value.endswith(
        (
            ".",
            ",",
            ";",
            ":",
        )
    ):
        return ""

    return value


# ============================================================
# STRICT ORGANIZATION FROM JSON
# ============================================================

def find_organization_in_json(
    data: Any,
) -> str:
    """
    Search structured JSON for organization/company data.
    """

    if isinstance(
        data,
        dict,
    ):

        preferred_keys = [
            "organization_name",
            "organisation_name",
            "company_name",
            "organizer_name",
            "organiser_name",
            "organizationName",
            "organisationName",
            "companyName",
            "organizerName",
            "organiserName",
        ]

        for key in preferred_keys:

            if key in data:

                value = clean_organization(
                    data[key]
                )

                if value:
                    return value

        # Schema.org organization.
        organization = data.get(
            "organization"
        )

        if isinstance(
            organization,
            dict,
        ):

            value = clean_organization(
                organization.get(
                    "name",
                    "",
                )
            )

            if value:
                return value

        # Schema.org organizer.
        organizer = data.get(
            "organizer"
        )

        if isinstance(
            organizer,
            dict,
        ):

            value = clean_organization(
                organizer.get(
                    "name",
                    "",
                )
            )

            if value:
                return value

        elif isinstance(
            organizer,
            str,
        ):

            value = clean_organization(
                organizer
            )

            if value:
                return value

        # Recursive search.
        for child in data.values():

            result = find_organization_in_json(
                child
            )

            if result:
                return result

    elif isinstance(
        data,
        list,
    ):

        for child in data:

            result = find_organization_in_json(
                child
            )

            if result:
                return result

    return ""


# ============================================================
# STRICT ORGANIZATION FROM DETAIL PAGE
# ============================================================

def extract_organization_from_detail(
    html: str,
) -> str:
    """
    Extract organization from the official detail page.

    Priority:
        1. Structured JSON-LD
        2. Explicit organization/company metadata
        3. Heading immediately below opportunity title
        4. Very short nearby heading/link

    We deliberately DO NOT blindly trust arbitrary elements
    with class names such as "organization".
    """

    soup = BeautifulSoup(
        html,
        "html.parser",
    )

    # --------------------------------------------------------
    # METHOD 1: JSON-LD
    # --------------------------------------------------------

    for script in soup.find_all(
        "script",
        type="application/ld+json",
    ):

        raw = (
            script.string
            or script.get_text()
        )

        if not raw:
            continue

        try:

            data = json.loads(
                raw
            )

            organization = (
                find_organization_in_json(
                    data
                )
            )

            if organization:
                return organization

        except Exception:
            continue

    # --------------------------------------------------------
    # METHOD 2: explicit meta tags
    # --------------------------------------------------------

    meta_candidates = [
        ("name", "author"),
        ("name", "publisher"),
        ("name", "organization"),
        ("name", "company"),
        ("property", "og:site_name"),
    ]

    for attribute, value in meta_candidates:

        meta = soup.find(
            "meta",
            attrs={
                attribute: value,
            },
        )

        if meta is None:
            continue

        organization = clean_organization(
            meta.get(
                "content",
                "",
            )
        )

        if organization:
            return organization

    # --------------------------------------------------------
    # METHOD 3:
    # Find the main H1 title.
    # --------------------------------------------------------

    h1 = soup.find(
        "h1"
    )

    if h1 is not None:

        title = clean_title(
            h1.get_text(
                " ",
                strip=True,
            )
        )

        # Look at the next heading elements in document order.
        # On current Unstop detail pages the organization/company
        # is presented immediately below the opportunity title.
        headings = soup.find_all(
            [
                "h2",
                "h3",
                "h4",
            ]
        )

        h1_position = 0

        for index, element in enumerate(
            soup.find_all(
                True
            )
        ):

            if element is h1:
                h1_position = index
                break

        all_elements = soup.find_all(
            True
        )

        for element in all_elements[
            h1_position + 1 :
        ]:

            if element.name not in {
                "h2",
                "h3",
                "h4",
            }:
                continue

            candidate = clean_organization(
                element.get_text(
                    " ",
                    strip=True,
                )
            )

            if not candidate:
                continue

            if (
                title
                and candidate.lower()
                == title.lower()
            ):
                continue

            # Avoid generic sections.
            generic = {
                "eligibility",
                "details",
                "important dates",
                "important dates & deadlines?",
                "recruitment process",
                "rewards and prizes",
                "refer & win",
                "contact the organisers",
                "all that you need to know",
                "stages and timelines",
                "about the competition",
                "about the company",
                "about the event",
            }

            if candidate.lower() in generic:
                continue

            return candidate

    # --------------------------------------------------------
    # METHOD 4:
    # Look for a short anchor near the top of the page.
    # --------------------------------------------------------

    # We deliberately only inspect anchors before the first
    # large "Details" section. This prevents description text
    # from being mistaken for an organization.
    detail_marker = None

    for element in soup.find_all(
        [
            "h2",
            "h3",
        ]
    ):

        text = clean_text(
            element.get_text(
                " ",
                strip=True,
            )
        ).lower()

        if text in {
            "details",
            "all that you need to know",
            "about the competition",
            "about the event",
            "recruitment process",
        }:

            detail_marker = element
            break

    for anchor in soup.find_all(
        "a",
        href=True,
    ):

        if detail_marker is not None:

            try:

                if (
                    anchor.sourceline
                    and detail_marker.sourceline
                    and anchor.sourceline
                    > detail_marker.sourceline
                ):
                    break

            except Exception:
                pass

        candidate = clean_organization(
            anchor.get_text(
                " ",
                strip=True,
            )
        )

        if not candidate:
            continue

        if len(
            candidate.split()
        ) > 8:
            continue

        # Reject obvious navigation.
        navigation = {
            "login",
            "sign up",
            "signup",
            "register",
            "register now",
            "apply now",
            "official website",
            "know more",
            "refer now",
            "view details",
        }

        if candidate.lower() in navigation:
            continue

        return candidate

    # --------------------------------------------------------
    # Nothing confidently found.
    # --------------------------------------------------------

    return ""


# ============================================================
# ORGANIZATION ENRICHMENT
# ============================================================

def enrich_one_organization(
    item: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Open the official opportunity page and extract the
    organization safely.
    """

    url = item.get(
        "url",
        "",
    )

    if not url:
        item["organization"] = (
            UNKNOWN_ORGANIZATION
        )

        return item

    try:

        response = requests.get(
            url,
            headers=HEADERS,
            timeout=TIMEOUT,
        )

        response.raise_for_status()

        organization = (
            extract_organization_from_detail(
                response.text
            )
        )

        if organization:

            item["organization"] = organization

            print(
                f"[ORG] "
                f"{item.get('title', '')[:50]} "
                f"-> {organization}"
            )

        else:

            item["organization"] = (
                UNKNOWN_ORGANIZATION
            )

            print(
                f"[ORG] "
                f"{item.get('title', '')[:50]} "
                f"-> not confidently available"
            )

    except Exception as exc:

        item["organization"] = (
            UNKNOWN_ORGANIZATION
        )

        print(
            f"[ORG] "
            f"{item.get('title', '')[:50]} "
            f"-> detail page unavailable"
        )

    return item


def enrich_organizations(
    opportunities: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Enrich all listings using official detail pages.
    """

    print()
    print(
        "[ORG] Verifying organizations from "
        "official Unstop pages..."
    )
    print()

    results = []

    with ThreadPoolExecutor(
        max_workers=6
    ) as executor:

        futures = [
            executor.submit(
                enrich_one_organization,
                item,
            )
            for item in opportunities
        ]

        for future in as_completed(
            futures
        ):

            try:

                results.append(
                    future.result()
                )

            except Exception:

                continue

    return results


# ============================================================
# PARSE CATEGORY CARD
# ============================================================

def parse_opportunity(
    anchor,
    category: str,
) -> Dict[str, Any] | None:

    href = anchor.get(
        "href",
        "",
    )

    url = make_absolute_url(
        href
    )

    if not matches_category_url(
        url,
        category,
    ):
        return None

    card = find_card(
        anchor
    )

    try:

        card_text = clean_text(
            card.get_text(
                " ",
                strip=True,
            )
        )

    except Exception:

        card_text = clean_text(
            anchor.get_text(
                " ",
                strip=True,
            )
        )

    if not card_text:
        return None

    if is_closed(
        card_text
    ):
        return None

    if category == "Internship":

        if not is_probably_internship(
            card_text,
            url,
        ):
            return None

    title = extract_card_title(
        card,
        anchor,
    )

    if not title:

        title = title_from_url(
            url
        )

    title = clean_title(
        title
    )

    if not title:
        return None

    if len(title) < 4:
        return None

    bad_titles = {
        "login",
        "sign up",
        "signup",
        "register",
        "browse",
        "view all",
        "all opportunities",
    }

    if title.lower() in bad_titles:
        return None

    deadline = extract_deadline(
        card_text
    )

    location = extract_location(
        card_text
    )

    description_parts = []

    if location != "See official listing":

        description_parts.append(
            f"Location/Mode: {location}."
        )

    if deadline:

        description_parts.append(
            f"Registration: {deadline}."
        )

    if description_parts:

        description = " ".join(
            description_parts
        )

    else:

        description = (
            f"{category} opportunity "
            f"listed on Unstop."
        )

    return {
        "title": title,
        "description": clean_description(
            description
        ),
        "category": category,
        "organization": UNKNOWN_ORGANIZATION,
        "location": location,
        "deadline": deadline,
        "event_date": "",
        "skills_required": "",
        "url": url,
        "source": "Unstop",
    }


# ============================================================
# CATEGORY PAGE PARSER
# ============================================================

def parse_category_page(
    html: str,
    category: str,
) -> List[Dict[str, Any]]:

    soup = BeautifulSoup(
        html,
        "html.parser",
    )

    results = []

    seen_urls = set()

    # --------------------------------------------------------
    # NORMAL HTML LINKS
    # --------------------------------------------------------

    for anchor in soup.find_all(
        "a",
        href=True,
    ):

        url = make_absolute_url(
            anchor.get(
                "href",
                "",
            )
        )

        if not matches_category_url(
            url,
            category,
        ):
            continue

        normalized = (
            url.rstrip("/")
            .lower()
        )

        if normalized in seen_urls:
            continue

        item = parse_opportunity(
            anchor,
            category,
        )

        if not item:
            continue

        seen_urls.add(
            normalized
        )

        results.append(
            item
        )

    # --------------------------------------------------------
    # FALLBACK:
    # Search embedded HTML/JSON for URLs.
    # --------------------------------------------------------

    if not results:

        html_urls = re.findall(
            r'https?://(?:api\.)?unstop\.com/[^"\'>\s]+',
            html,
            flags=re.IGNORECASE,
        )

        relative_urls = re.findall(
            r'["\'](/(?:internships|internship|'
            r"hackathons|competitions|"
            r"workshops-webinars)/[^\"']+)['\"]",
            html,
            flags=re.IGNORECASE,
        )

        candidates = (
            html_urls
            + [
                make_absolute_url(
                    value
                )
                for value in relative_urls
            ]
        )

        for url in candidates:

            url = make_absolute_url(
                url
            )

            if not matches_category_url(
                url,
                category,
            ):
                continue

            normalized = (
                url.rstrip("/")
                .lower()
            )

            if normalized in seen_urls:
                continue

            title = title_from_url(
                url
            )

            if not title:
                continue

            if category == "Internship":

                if not is_probably_internship(
                    title,
                    url,
                ):
                    continue

            seen_urls.add(
                normalized
            )

            results.append(
                {
                    "title": title,
                    "description": (
                        f"{category} opportunity "
                        f"listed on Unstop."
                    ),
                    "category": category,
                    "organization": UNKNOWN_ORGANIZATION,
                    "location": "See official listing",
                    "deadline": "",
                    "event_date": "",
                    "skills_required": "",
                    "url": url,
                    "source": "Unstop",
                }
            )

    return results


# ============================================================
# FETCH CATEGORY
# ============================================================

def fetch_category(
    category: str,
    url: str,
) -> List[Dict[str, Any]]:

    print(
        f"[UNSTOP] Fetching {category}: {url}"
    )

    try:

        html = fetch_html(
            url
        )

        print(
            f"[UNSTOP] {category} page size: "
            f"{len(html):,} characters"
        )

        results = parse_category_page(
            html,
            category,
        )

        print(
            f"[UNSTOP] {category}: "
            f"{len(results)} listings found"
        )

        return results

    except Exception as exc:

        print(
            f"[UNSTOP] {category} failed: "
            f"{exc}"
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
    seen_keys = set()

    for item in opportunities:

        url = clean_text(
            item.get(
                "url",
                "",
            )
        )

        title = clean_text(
            item.get(
                "title",
                "",
            )
        ).lower()

        category = clean_text(
            item.get(
                "category",
                "",
            )
        ).lower()

        url_key = (
            url.rstrip("/")
            .lower()
        )

        title_key = (
            f"{category}|{title}"
        )

        if (
            url_key
            and url_key in seen_urls
        ):
            continue

        if title_key in seen_keys:
            continue

        if url_key:
            seen_urls.add(
                url_key
            )

        seen_keys.add(
            title_key
        )

        final.append(
            item
        )

    return final


# ============================================================
# FINAL VALIDATION
# ============================================================

def validate_opportunities(
    opportunities: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:

    final = []

    for item in opportunities:

        category = clean_text(
            item.get(
                "category",
                "",
            )
        )

        title = clean_title(
            item.get(
                "title",
                "",
            )
        )

        url = clean_text(
            item.get(
                "url",
                "",
            )
        )

        if category not in VALID_CATEGORIES:
            continue

        if not title:
            continue

        if len(title) < 4:
            continue

        if not url.startswith(
            "http"
        ):
            continue

        if not is_unstop_host(
            url
        ):
            continue

        if not matches_category_url(
            url,
            category,
        ):
            continue

        if category == "Internship":

            combined = (
                title
                + " "
                + url
                + " "
                + clean_text(
                    item.get(
                        "description",
                        "",
                    )
                )
            )

            if not is_probably_internship(
                combined,
                url,
            ):
                continue

        organization = clean_organization(
            item.get(
                "organization",
                "",
            )
        )

        if not organization:

            organization = (
                UNKNOWN_ORGANIZATION
            )

        final.append(
            {
                "title": title,
                "description": clean_description(
                    item.get(
                        "description",
                        "",
                    )
                ),
                "category": category,
                "organization": organization,
                "location": (
                    clean_text(
                        item.get(
                            "location",
                            "",
                        )
                    )
                    or "See official listing"
                ),
                "deadline": clean_text(
                    item.get(
                        "deadline",
                        "",
                    )
                ),
                "event_date": clean_text(
                    item.get(
                        "event_date",
                        "",
                    )
                ),
                "skills_required": clean_text(
                    item.get(
                        "skills_required",
                        "",
                    )
                ),
                "url": url,
                "source": "Unstop",
            }
        )

    return final


# ============================================================
# MAIN PUBLIC FUNCTION
# ============================================================

def get_live_opportunities() -> List[Dict[str, Any]]:
    """
    Main function called by main.py.

    main.py does not need to change.
    """

    all_opportunities = []

    # --------------------------------------------------------
    # 1. Fetch four category pages.
    # --------------------------------------------------------

    with ThreadPoolExecutor(
        max_workers=4
    ) as executor:

        future_map = {
            executor.submit(
                fetch_category,
                category,
                url,
            ): category
            for category, url
            in CATEGORY_URLS.items()
        }

        for future in as_completed(
            future_map
        ):

            try:

                results = future.result()

                all_opportunities.extend(
                    results
                )

            except Exception:
                continue

    # --------------------------------------------------------
    # 2. Deduplicate.
    # --------------------------------------------------------

    all_opportunities = deduplicate(
        all_opportunities
    )

    # --------------------------------------------------------
    # 3. Validate.
    # --------------------------------------------------------

    all_opportunities = validate_opportunities(
        all_opportunities
    )

    # --------------------------------------------------------
    # 4. Verify organizations.
    # --------------------------------------------------------

    all_opportunities = enrich_organizations(
        all_opportunities
    )

    # --------------------------------------------------------
    # 5. Validate again.
    # --------------------------------------------------------

    all_opportunities = validate_opportunities(
        all_opportunities
    )

    # --------------------------------------------------------
    # 6. Stable ordering.
    # --------------------------------------------------------

    all_opportunities.sort(
        key=lambda item: (
            CATEGORY_ORDER.get(
                item.get(
                    "category",
                    "",
                ),
                99,
            ),
            item.get(
                "title",
                "",
            ).lower(),
        )
    )

    # --------------------------------------------------------
    # SUMMARY
    # --------------------------------------------------------

    counts = {
        "Hackathon": 0,
        "Internship": 0,
        "Competition": 0,
        "Workshop": 0,
    }

    verified = 0

    for item in all_opportunities:

        category = item.get(
            "category"
        )

        if category in counts:

            counts[
                category
            ] += 1

        if item.get(
            "organization"
        ) not in {
            "",
            UNKNOWN_ORGANIZATION,
        }:

            verified += 1

    print()
    print(
        "=================================================="
    )
    print(
        "        AENOVA LIVE OPPORTUNITY SUMMARY"
    )
    print(
        "=================================================="
    )

    print(
        f"Hackathons    : {counts['Hackathon']}"
    )

    print(
        f"Internships   : {counts['Internship']}"
    )

    print(
        f"Competitions  : {counts['Competition']}"
    )

    print(
        f"Workshops     : {counts['Workshop']}"
    )

    print(
        f"TOTAL         : {len(all_opportunities)}"
    )

    print(
        f"Verified orgs : {verified}/"
        f"{len(all_opportunities)}"
    )

    print(
        "=================================================="
    )
    print()

    return all_opportunities


# ============================================================
# DIRECT TEST
# ============================================================

if __name__ == "__main__":

    print()
    print(
        "Starting AENOVA live opportunity collector..."
    )
    print()

    opportunities = (
        get_live_opportunities()
    )

    print()
    print(
        "=================================================="
    )
    print(
        "FIRST 20 AENOVA OPPORTUNITIES"
    )
    print(
        "=================================================="
    )
    print()

    for index, item in enumerate(
        opportunities[:20],
        start=1,
    ):

        print(
            f"{index}. "
            f"[{item['category']}] "
            f"{item['title']}"
        )

        print(
            f"   Organization : "
            f"{item['organization']}"
        )

        print(
            f"   Location     : "
            f"{item['location']}"
        )

        print(
            f"   Deadline     : "
            f"{item['deadline']}"
        )

        print(
            f"   URL          : "
            f"{item['url']}"
        )

        print()