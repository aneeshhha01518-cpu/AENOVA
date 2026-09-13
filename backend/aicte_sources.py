"""
AENOVA - AICTE NATIONAL INTERNSHIP PORTAL CONNECTOR

Real public-source collector for the AICTE National Internship Portal.

Source:
    https://internship.aicte-india.org/

The connector reads publicly accessible AICTE internship listing pages.

IMPORTANT:
    - No fake opportunities are generated.
    - Original AICTE listing URLs are preserved.
    - Expired listings are rejected when a usable deadline is available.
    - Dummy/test listings are rejected.
    - The connector is defensive because the portal can change its HTML.
    - No AICTE login credentials are required.
"""

from __future__ import annotations

import base64
import re

from concurrent.futures import (
    ThreadPoolExecutor,
    as_completed,
)

from datetime import (
    datetime,
    timezone,
)

from typing import (
    Any,
    Dict,
    List,
    Optional,
)

from urllib.parse import (
    urljoin,
    urlparse,
)

import requests

from bs4 import (
    BeautifulSoup,
)


# ============================================================
# CONFIGURATION
# ============================================================

AICTE_BASE_URL = (
    "https://internship.aicte-india.org"
)

AICTE_LISTING_URL = (
    f"{AICTE_BASE_URL}/fetch_city.php"
)

AICTE_SOURCE_NAME = (
    "AICTE National Internship Portal"
)

TIMEOUT = 30

MAX_PAGES_PER_CITY = 2

MAX_CITIES = 25

MAX_RESULTS = 120


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 "
        "(Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 "
        "(KHTML, like Gecko) "
        "Chrome/154.0.0.0 "
        "Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,"
        "application/xml;q=0.9,image/avif,"
        "image/webp,*/*;q=0.8"
    ),
    "Accept-Language": (
        "en-US,en;q=0.9"
    ),
    "Cache-Control": "no-cache",
}


# ============================================================
# CITIES / DISTRICTS
# ============================================================

# We intentionally use a practical representative list.
#
# The AICTE portal's public city pages are used as the
# discovery mechanism. We do not pretend this list is the
# complete list of every district in India.
#
# More cities can be added later without changing the parser.

AICTE_CITIES = [

    # Tamil Nadu
    "Chennai",
    "Coimbatore",
    "Salem",
    "Madurai",
    "Tiruchirappalli",
    "Tirunelveli",
    "Erode",
    "Vellore",
    "Thanjavur",
    "Thoothukudi",

    # Karnataka
    "Bangalore",
    "Bengaluru",
    "Mysore",
    "Mysuru",
    "Mangalore",
    "Mangaluru",

    # Telangana
    "Hyderabad",
    "Warangal",

    # Andhra Pradesh
    "Visakhapatnam",
    "Vijayawada",
    "Tirupati",

    # Kerala
    "Kochi",
    "Thiruvananthapuram",

    # Maharashtra
    "Mumbai",
    "Pune",

    # Delhi / NCR
    "Delhi",
    "New Delhi",
    "Noida",
    "Gurugram",

    # Gujarat
    "Ahmedabad",

    # Rajasthan
    "Jaipur",

    # West Bengal
    "Kolkata",

    # Odisha
    "Bhubaneswar",

    # Madhya Pradesh
    "Indore",
    "Bhopal",

    # Uttar Pradesh
    "Lucknow",
    "Kanpur",

    # Bihar
    "Patna",

    # Jharkhand
    "Ranchi",

    # Assam
    "Guwahati",

    # Chandigarh
    "Chandigarh",

    # Punjab
    "Ludhiana",
    "Amritsar",

    # Haryana
    "Faridabad",

    # Goa
    "Panaji",
]


# ============================================================
# SESSION
# ============================================================

SESSION = requests.Session()

SESSION.headers.update(
    HEADERS
)


# ============================================================
# BASIC HELPERS
# ============================================================

def clean_text(
    value: Any,
) -> str:

    if value is None:
        return ""

    text = str(value)

    text = (
        text
        .replace("\xa0", " ")
        .replace("\u200b", "")
        .replace("\r", " ")
        .replace("\n", " ")
        .replace("\t", " ")
    )

    text = re.sub(
        r"\s+",
        " ",
        text,
    )

    return text.strip()


def normalize_key(
    value: str,
) -> str:

    text = clean_text(
        value
    ).lower()

    text = re.sub(
        r"[^a-z0-9]+",
        "-",
        text,
    )

    return text.strip("-")


def now_utc() -> str:

    return datetime.now(
        timezone.utc
    ).isoformat()


# ============================================================
# URL HELPERS
# ============================================================

def encode_city(
    city: str,
) -> str:

    """
    AICTE's fetch_city.php endpoint currently uses
    a Base64-encoded city parameter.

    Example:
        Salem
        ->
        U2FsZW0=
    """

    raw = city.strip().encode(
        "utf-8"
    )

    encoded = base64.b64encode(
        raw
    ).decode(
        "ascii"
    )

    return encoded


def city_url(
    city: str,
    page: int = 1,
) -> str:

    encoded = encode_city(
        city
    )

    return (
        f"{AICTE_LISTING_URL}"
        f"?city={encoded}"
        f"&page={page}"
    )


def is_aicte_url(
    url: str,
) -> bool:

    if not url:
        return False

    try:

        host = (
            urlparse(url)
            .netloc
            .lower()
        )

        return (
            host
            in {
                "internship.aicte-india.org",
                "www.internship.aicte-india.org",
            }
        )

    except Exception:

        return False


def absolute_url(
    href: str,
    base_url: str = AICTE_BASE_URL,
) -> str:

    href = clean_text(
        href
    )

    if not href:
        return ""

    return urljoin(
        base_url,
        href,
    )


# ============================================================
# HTTP
# ============================================================

def fetch_page(
    url: str,
) -> Optional[str]:

    try:

        response = SESSION.get(
            url,
            timeout=TIMEOUT,
            allow_redirects=True,
        )

        response.raise_for_status()

        if not response.text:
            return None

        return response.text

    except Exception as exc:

        print(
            f"[AICTE] fetch failed: "
            f"{url} | {exc}"
        )

        return None


# ============================================================
# DEADLINE PARSING
# ============================================================

MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


def parse_date_value(
    value: str,
) -> Optional[datetime]:

    value = clean_text(
        value
    )

    if not value:
        return None

    formats = [

        "%d-%m-%Y",
        "%d/%m/%Y",
        "%d.%m.%Y",

        "%d-%m-%y",
        "%d/%m/%y",

        "%d %b %Y",
        "%d %B %Y",

        "%d-%b-%Y",
        "%d-%B-%Y",

        "%d/%b/%Y",
        "%d/%B/%Y",

        "%b %d, %Y",
        "%B %d, %Y",
    ]

    for fmt in formats:

        try:

            return datetime.strptime(
                value,
                fmt,
            )

        except ValueError:

            continue

    # Generic numeric date
    match = re.search(
        r"\b"
        r"(\d{1,2})"
        r"[-/]"
        r"(\d{1,2})"
        r"[-/]"
        r"(\d{4})"
        r"\b",
        value,
    )

    if match:

        try:

            return datetime(
                int(match.group(3)),
                int(match.group(2)),
                int(match.group(1)),
            )

        except ValueError:

            pass

    # Textual month date
    match = re.search(
        r"\b"
        r"(\d{1,2})\s+"
        r"([A-Za-z]{3,12})\s+"
        r"(\d{4})"
        r"\b",
        value,
    )

    if match:

        day = int(
            match.group(1)
        )

        month_name = (
            match.group(2)
            .lower()
        )

        year = int(
            match.group(3)
        )

        month = MONTHS.get(
            month_name
        )

        if month:

            try:

                return datetime(
                    year,
                    month,
                    day,
                )

            except ValueError:

                pass

    return None


def extract_deadline(
    text: str,
) -> str:

    text = clean_text(
        text
    )

    if not text:
        return ""

    patterns = [

        r"Apply\s+by\s*[:\-]?\s*"
        r"(\d{1,2}[-/]\d{1,2}[-/]\d{4})",

        r"Apply\s+by\s*[:\-]?\s*"
        r"(\d{1,2}\s+[A-Za-z]{3,12}\s+\d{4})",

        r"Application\s+Deadline\s*[:\-]?\s*"
        r"(\d{1,2}[-/]\d{1,2}[-/]\d{4})",

        r"Deadline\s*[:\-]?\s*"
        r"(\d{1,2}[-/]\d{1,2}[-/]\d{4})",

        r"Last\s+Date\s*[:\-]?\s*"
        r"(\d{1,2}[-/]\d{1,2}[-/]\d{4})",

        r"\b"
        r"(\d{1,2}[-/]\d{1,2}[-/]\d{4})"
        r"\b",
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


def is_expired(
    deadline: str,
) -> bool:

    parsed = parse_date_value(
        deadline
    )

    if not parsed:
        return False

    today = datetime.now(
        timezone.utc
    ).date()

    return (
        parsed.date()
        < today
    )


# ============================================================
# FIELD CLASSIFICATION
# ============================================================

FIELD_KEYWORDS = {

    "Computer Science / IT": [

        "computer science",
        "information technology",
        "software",
        "software development",
        "software engineering",
        "web development",
        "full stack",
        "frontend",
        "backend",
        "developer",
        "programming",
        "coding",
        "java",
        "python",
        "javascript",
        "typescript",
        "react",
        "node",
        "database",
        "sql",
        "cloud computing",
        "devops",
        "cyber security",
        "cybersecurity",
        "networking",
    ],

    "Artificial Intelligence / Machine Learning": [

        "artificial intelligence",
        "machine learning",
        "deep learning",
        "generative ai",
        "gen ai",
        "genai",
        "ai/ml",
        "ai ml",
        "large language model",
        "llm",
        "natural language processing",
        "nlp",
        "computer vision",
        "neural network",
        "robotics",
    ],

    "Data Science / Analytics": [

        "data science",
        "data scientist",
        "data analytics",
        "data analyst",
        "analytics",
        "big data",
        "business intelligence",
        "statistics",
        "power bi",
        "tableau",
        "data engineering",
        "data visualization",
    ],

    "Electronics / Electrical": [

        "electronics",
        "electrical engineering",
        "electrical",
        "ece",
        "eee",
        "embedded",
        "embedded systems",
        "microcontroller",
        "vlsi",
        "semiconductor",
        "iot",
        "internet of things",
        "arduino",
        "raspberry pi",
        "pcb",
        "signal processing",
        "power systems",
        "control systems",
    ],

    "Mechanical Engineering": [

        "mechanical engineering",
        "mechanical",
        "automobile engineering",
        "automotive",
        "automobile",
        "cad",
        "cam",
        "solidworks",
        "autocad",
        "ansys",
        "thermodynamics",
        "manufacturing",
        "production engineering",
        "mechatronics",
        "3d printing",
        "additive manufacturing",
    ],

    "Civil Engineering": [

        "civil engineering",
        "civil",
        "construction",
        "structural engineering",
        "structural",
        "infrastructure",
        "surveying",
        "geotechnical",
        "transportation engineering",
        "urban planning",
        "building design",
    ],

    "Chemical Engineering": [

        "chemical engineering",
        "chemical",
        "process engineering",
        "process technology",
        "petrochemical",
        "petroleum",
        "oil and gas",
        "refinery",
        "polymer",
        "materials engineering",
    ],

    "Biotechnology / Life Sciences": [

        "biotechnology",
        "biotech",
        "life sciences",
        "genetics",
        "genomics",
        "microbiology",
        "molecular biology",
        "biomedical",
        "biochemistry",
        "cell biology",
        "bioinformatics",
        "neuroscience",
    ],

    "Medicine / Healthcare": [

        "medicine",
        "medical",
        "healthcare",
        "health care",
        "clinical",
        "hospital",
        "nursing",
        "public health",
        "clinical research",
        "medical research",
        "physiotherapy",
        "dentistry",
        "dental",
        "health technology",
    ],

    "Pharmacy": [

        "pharmacy",
        "pharmaceutical",
        "pharmaceuticals",
        "pharmacology",
        "pharmacist",
        "drug discovery",
        "drug development",
        "clinical pharmacy",
        "medicinal chemistry",
    ],

    "Finance": [

        "finance",
        "financial",
        "investment",
        "banking",
        "fintech",
        "stock market",
        "capital market",
        "portfolio",
        "financial analysis",
        "financial modelling",
        "financial modeling",
        "insurance",
        "wealth management",
    ],

    "Commerce / Accounting": [

        "commerce",
        "accounting",
        "accountant",
        "taxation",
        "audit",
        "auditing",
        "gst",
        "income tax",
        "bookkeeping",
        "chartered accountant",
    ],

    "Business / Management": [

        "business",
        "management",
        "mba",
        "entrepreneurship",
        "entrepreneur",
        "startup",
        "business development",
        "operations",
        "strategy",
        "consulting",
        "project management",
        "human resources",
        "supply chain",
        "logistics",
    ],

    "Marketing / Media": [

        "marketing",
        "digital marketing",
        "social media",
        "content",
        "content creation",
        "media",
        "communications",
        "public relations",
        "branding",
        "advertising",
        "copywriting",
        "seo",
    ],

    "Law": [

        "law",
        "legal",
        "llb",
        "llm",
        "moot court",
        "advocacy",
        "litigation",
        "corporate law",
        "legal research",
        "intellectual property",
        "compliance",
    ],

    "Agriculture": [

        "agriculture",
        "agri",
        "farming",
        "farmer",
        "horticulture",
        "agricultural",
        "agronomy",
        "crop",
        "soil science",
        "agritech",
        "food technology",
        "food science",
    ],

    "Environment": [

        "environment",
        "environmental",
        "climate",
        "climate change",
        "sustainability",
        "sustainable development",
        "renewable energy",
        "green energy",
        "solar energy",
        "wind energy",
        "clean energy",
        "waste management",
        "water management",
        "carbon",
        "esg",
    ],

    "Design / Architecture": [

        "design",
        "ui/ux",
        "ui ux",
        "ux",
        "user experience",
        "user interface",
        "graphic design",
        "visual design",
        "product design",
        "industrial design",
        "architecture",
        "architectural",
        "fashion design",
        "interior design",
        "illustration",
        "figma",
        "adobe",
    ],

    "Arts / Humanities": [

        "arts",
        "humanities",
        "history",
        "literature",
        "english",
        "language",
        "linguistics",
        "psychology",
        "sociology",
        "political science",
        "philosophy",
        "anthropology",
        "cultural studies",
        "journalism",
    ],

    "Education": [

        "education",
        "teaching",
        "teacher",
        "training",
        "pedagogy",
        "educational",
        "edtech",
        "e-learning",
        "elearning",
        "curriculum",
    ],

    "Science / Research": [

        "science",
        "research",
        "physics",
        "chemistry",
        "astronomy",
        "scientific",
        "scientist",
        "mathematics",
        "mathematical",
        "laboratory",
        "lab research",
    ],
}


def extract_field(
    text: str,
) -> str:

    text = clean_text(
        text
    ).lower()

    if not text:
        return "All Fields / General"

    scores = {}

    for field, keywords in (
        FIELD_KEYWORDS.items()
    ):

        score = 0

        for keyword in keywords:

            if keyword in text:

                if " " in keyword:

                    score += 2

                else:

                    score += 1

        if score > 0:

            scores[field] = score

    if not scores:

        return "All Fields / General"

    return max(
        scores,
        key=scores.get,
    )


# ============================================================
# MODE
# ============================================================

def extract_mode(
    text: str,
) -> str:

    text = clean_text(
        text
    ).lower()

    if any(
        value in text
        for value in [
            "virtual internship",
            "work from home",
            "work-from-home",
            "remote",
            "fully remote",
        ]
    ):

        return "Remote"

    if any(
        value in text
        for value in [
            "hybrid",
            "online and offline",
            "offline and online",
        ]
    ):

        return "Hybrid"

    if any(
        value in text
        for value in [
            "online",
            "virtual",
        ]
    ):

        return "Online"

    if any(
        value in text
        for value in [
            "full time",
            "offline",
            "on-site",
            "onsite",
            "in-person",
            "in person",
        ]
    ):

        return "Offline"

    return "See official listing"


# ============================================================
# LOCATION
# ============================================================

def extract_location(
    text: str,
    city: str,
) -> str:

    text = clean_text(
        text
    )

    if re.search(
        r"\bpan\s*india\b",
        text,
        flags=re.IGNORECASE,
    ):

        return "Pan India"

    if re.search(
        r"\bindia\b",
        text,
        flags=re.IGNORECASE,
    ):

        return "India"

    mode_patterns = [
        "remote",
        "work from home",
        "virtual internship",
        "online",
    ]

    for pattern in mode_patterns:

        if re.search(
            re.escape(pattern),
            text,
            flags=re.IGNORECASE,
        ):

            return "Remote / Online"

    if city:

        return city

    return "See official listing"


# ============================================================
# STIPEND
# ============================================================

def extract_stipend(
    text: str,
) -> str:

    text = clean_text(
        text
    )

    patterns = [

        r"Stipend\s*"
        r"₹\s*[\d,]+"
        r"(?:\s*/\s*month)?",

        r"₹\s*[\d,]+"
        r"(?:\s*/\s*month)?",

        r"Stipend\s*"
        r"Rs\.?\s*[\d,]+"
        r"(?:\s*/\s*month)?",

        r"Stipend\s*"
        r"Unpaid internship",

        r"Unpaid",
    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE,
        )

        if match:

            return clean_text(
                match.group(0)
            )

    return "See official listing"


# ============================================================
# DURATION
# ============================================================

def extract_duration(
    text: str,
) -> str:

    text = clean_text(
        text
    )

    patterns = [

        r"Duration\s*"
        r"(\d+\s*(?:week|weeks|month|months|year|years))",

        r"(\d+\s*(?:week|weeks|month|months|year|years))"
        r"\s+(?:internship|program)",
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

    return "See official listing"


# ============================================================
# TEST / DUMMY FILTER
# ============================================================

def is_test_listing(
    title: str,
    organization: str,
    text: str,
) -> bool:

    combined = (
        f"{title} "
        f"{organization} "
        f"{text}"
    ).lower()

    blocked = [

        "dummy internship",

        "dummy listing",

        "test internship",

        "test listing",

        "do not apply",

        "dont apply",

        "don't apply",

        "sample internship",

        "sample listing",
    ]

    return any(
        phrase in combined
        for phrase in blocked
    )


# ============================================================
# LINK EXTRACTION
# ============================================================

def extract_detail_url(
    card,
    base_url: str,
) -> str:

    """
    Find the real AICTE 'View Details' URL.
    """

    # Prefer anchors containing View Details.
    for anchor in card.find_all(
        "a",
        href=True,
    ):

        label = clean_text(
            anchor.get_text(
                " ",
                strip=True,
            )
        ).lower()

        href = absolute_url(
            anchor.get(
                "href",
                ""
            ),
            base_url,
        )

        if (
            "view details"
            in label
            and href
        ):

            if is_aicte_url(
                href
            ):

                return href

    # Fallback: first AICTE detail link.
    for anchor in card.find_all(
        "a",
        href=True,
    ):

        href = absolute_url(
            anchor.get(
                "href",
                ""
            ),
            base_url,
        )

        if not is_aicte_url(
            href
        ):
            continue

        path = (
            urlparse(href)
            .path
            .lower()
        )

        if (
            "internship"
            in path
            and
            "fetch_city"
            not in path
        ):

            return href

    return ""


# ============================================================
# CARD DISCOVERY
# ============================================================

def find_candidate_cards(
    soup: BeautifulSoup,
) -> List[Any]:

    """
    AICTE's HTML can change.

    We therefore identify cards by finding elements
    containing the characteristic internship labels
    rather than relying on one fragile CSS class.
    """

    candidates = []

    seen = set()

    # --------------------------------------------------------
    # First: anchors with "View Details"
    # --------------------------------------------------------

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

        if (
            "view details"
            not in label
        ):
            continue

        parent = anchor

        # Move upward until we find a reasonable
        # card-sized container.
        for _ in range(7):

            if parent is None:
                break

            text = clean_text(
                parent.get_text(
                    " ",
                    strip=True,
                )
            )

            if (
                "apply by"
                in text.lower()
                and
                len(text)
                >= 80
            ):

                marker = id(parent)

                if marker not in seen:

                    seen.add(
                        marker
                    )

                    candidates.append(
                        parent
                    )

                break

            parent = (
                parent.parent
            )

    # --------------------------------------------------------
    # Fallback: headings containing internship content
    # --------------------------------------------------------

    if not candidates:

        for heading in soup.find_all(
            [
                "h2",
                "h3",
                "h4",
            ]
        ):

            text = clean_text(
                heading.get_text(
                    " ",
                    strip=True,
                )
            )

            if len(text) < 5:
                continue

            parent = heading

            for _ in range(6):

                if parent is None:
                    break

                parent_text = clean_text(
                    parent.get_text(
                        " ",
                        strip=True,
                    )
                )

                if (
                    "apply by"
                    in parent_text.lower()
                    and
                    len(parent_text)
                    >= 80
                ):

                    marker = id(parent)

                    if marker not in seen:

                        seen.add(
                            marker
                        )

                        candidates.append(
                            parent
                        )

                    break

                parent = (
                    parent.parent
                )

    return candidates


# ============================================================
# TITLE / ORGANIZATION
# ============================================================

def extract_title(
    card,
) -> str:

    for heading in card.find_all(
        [
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
        ]
    ):

        text = clean_text(
            heading.get_text(
                " ",
                strip=True,
            )
        )

        if (
            len(text) >= 5
            and
            "view details"
            not in text.lower()
        ):

            return text[:300]

    # Fallback: use first meaningful text
    # line before organization-like content.
    lines = []

    for element in card.find_all(
        string=True
    ):

        text = clean_text(
            element
        )

        if text:

            lines.append(
                text
            )

    blocked = {

        "view details",

        "start date",

        "duration",

        "stipend",

        "apply by",

        "immediately",

        "virtual internship",

        "full time",
    }

    for line in lines:

        if (
            len(line) >= 5
            and
            line.lower()
            not in blocked
        ):

            return line[:300]

    return ""


def extract_organization(
    card,
    title: str,
) -> str:

    text_lines = []

    for element in card.find_all(
        string=True
    ):

        text = clean_text(
            element
        )

        if text:

            text_lines.append(
                text
            )

    # Remove title and generic labels.
    blocked = {

        title.lower(),

        "view details",

        "start date",

        "duration",

        "stipend",

        "apply by",

        "immediately",

        "virtual internship",

        "full time",

        "part time",

        "remote",

        "online",

        "offline",

        "hybrid",
    }

    for line in text_lines:

        lower = line.lower()

        if lower in blocked:
            continue

        if re.fullmatch(
            r"\d{1,2}[-/]\d{1,2}[-/]\d{4}",
            line,
        ):
            continue

        if re.fullmatch(
            r"₹[\d,]+.*",
            line,
        ):
            continue

        if len(line) < 2:
            continue

        # Organization names on the portal
        # are normally short and appear directly
        # after the title.
        if (
            len(line) <= 180
            and
            not any(
                word in lower
                for word in [
                    "start date",
                    "duration",
                    "stipend",
                    "apply by",
                    "pan india",
                    "india,",
                ]
            )
        ):

            return line[:180]

    return "Organization not available"


# ============================================================
# RECORD BUILDER
# ============================================================

def build_record(
    card,
    city: str,
    listing_url: str,
) -> Optional[Dict[str, Any]]:

    text = clean_text(
        card.get_text(
            " ",
            strip=True,
        )
    )

    if not text:
        return None

    title = extract_title(
        card
    )

    if not title:
        return None

    organization = (
        extract_organization(
            card,
            title,
        )
    )

    if is_test_listing(
        title,
        organization,
        text,
    ):

        return None

    deadline = extract_deadline(
        text
    )

    # Reject expired listings when a real
    # deadline is available.
    if (
        deadline
        and
        is_expired(
            deadline
        )
    ):

        return None

    detail_url = (
        extract_detail_url(
            card,
            listing_url,
        )
    )

    # AENOVA must not create fake application URLs.
    if not detail_url:
        return None

    combined_text = (
        f"{title} "
        f"{organization} "
        f"{text}"
    )

    field = extract_field(
        combined_text
    )

    mode = extract_mode(
        combined_text
    )

    location = extract_location(
        combined_text,
        city,
    )

    stipend = extract_stipend(
        text
    )

    duration = extract_duration(
        text
    )

    source_id = normalize_key(
        detail_url
    )

    if not source_id:

        source_id = normalize_key(
            f"{title}-{organization}"
        )

    return {

        "title": title,

        "category": "Internship",

        "field": field,

        "organization": organization,

        "location": location,

        "mode": mode,

        "deadline": (
            deadline
            or
            "See official listing"
        ),

        "duration": duration,

        "stipend": stipend,

        "description": (
            text[:1200]
        ),

        "url": detail_url,

        "source": AICTE_SOURCE_NAME,

        "source_id": source_id,

        "source_city": city,

        "last_verified": now_utc(),

        "is_real": True,

        "is_live_source": True,
    }


# ============================================================
# PARSE ONE CITY PAGE
# ============================================================

def parse_city_page(
    city: str,
    page: int = 1,
) -> List[Dict[str, Any]]:

    url = city_url(
        city,
        page,
    )

    html = fetch_page(
        url
    )

    if not html:
        return []

    soup = BeautifulSoup(
        html,
        "html.parser",
    )

    cards = find_candidate_cards(
        soup
    )

    results = []

    seen_urls = set()

    for card in cards:

        record = build_record(
            card,
            city,
            url,
        )

        if not record:
            continue

        record_url = record.get(
            "url",
            ""
        )

        if (
            record_url
            in seen_urls
        ):
            continue

        seen_urls.add(
            record_url
        )

        results.append(
            record
        )

    return results


# ============================================================
# DEDUPLICATION
# ============================================================

def deduplicate(
    opportunities: List[
        Dict[str, Any]
    ],
) -> List[
    Dict[str, Any]
]:

    result = []

    seen_urls = set()

    seen_keys = set()

    for item in opportunities:

        url = clean_text(
            item.get(
                "url",
                "",
            )
        )

        title = normalize_key(
            item.get(
                "title",
                "",
            )
        )

        organization = normalize_key(
            item.get(
                "organization",
                "",
            )
        )

        key = (
            f"{title}|"
            f"{organization}"
        )

        if url:

            normalized_url = (
                url.rstrip("/")
                .lower()
            )

            if normalized_url in seen_urls:
                continue

            seen_urls.add(
                normalized_url
            )

        if key in seen_keys:
            continue

        seen_keys.add(
            key
        )

        result.append(
            item
        )

    return result


# ============================================================
# FETCH AICTE OPPORTUNITIES
# ============================================================

def get_aicte_opportunities(
    cities: Optional[
        List[str]
    ] = None,
    max_pages: int = MAX_PAGES_PER_CITY,
    max_results: int = MAX_RESULTS,
) -> List[
    Dict[str, Any]
]:

    """
    Collect real public AICTE internship listings.

    The collector uses a bounded number of city pages
    to avoid excessive requests.

    Returns normalized AENOVA opportunity dictionaries.
    """

    selected_cities = (
        cities
        if cities
        else AICTE_CITIES[:MAX_CITIES]
    )

    # Remove duplicates while preserving order.
    selected_cities = list(
        dict.fromkeys(
            selected_cities
        )
    )

    jobs = []

    tasks = []

    for city in selected_cities:

        for page in range(
            1,
            max_pages + 1,
        ):

            tasks.append(
                (
                    city,
                    page,
                )
            )

    # --------------------------------------------------------
    # Concurrent requests
    # --------------------------------------------------------

    with ThreadPoolExecutor(
        max_workers=6
    ) as executor:

        future_map = {

            executor.submit(
                parse_city_page,
                city,
                page,
            ): (
                city,
                page,
            )

            for city, page in tasks
        }

        for future in as_completed(
            future_map
        ):

            city, page = (
                future_map[
                    future
                ]
            )

            try:

                records = (
                    future.result()
                )

                if records:

                    jobs.extend(
                        records
                    )

            except Exception as exc:

                print(
                    "[AICTE] parser failed "
                    f"{city} page {page}: "
                    f"{exc}"
                )

    jobs = deduplicate(
        jobs
    )

    # --------------------------------------------------------
    # Prefer records with real deadlines
    # --------------------------------------------------------

    def sort_key(
        item: Dict[str, Any]
    ):

        deadline = clean_text(
            item.get(
                "deadline",
                "",
            )
        )

        has_deadline = (
            deadline
            and
            deadline
            != "See official listing"
        )

        return (
            0
            if has_deadline
            else 1
        )

    jobs.sort(
        key=sort_key
    )

    if max_results > 0:

        jobs = jobs[
            :max_results
        ]

    print(
        "[AICTE] collected "
        f"{len(jobs)} live public "
        "internship listings"
    )

    return jobs


# ============================================================
# SIMPLE HEALTH CHECK
# ============================================================

def aicte_source_health() -> Dict[str, Any]:

    """
    Lightweight health check.

    This does not require login.
    """

    test_city = "Salem"

    url = city_url(
        test_city,
        1,
    )

    try:

        response = SESSION.get(
            url,
            timeout=TIMEOUT,
            allow_redirects=True,
        )

        return {

            "source": AICTE_SOURCE_NAME,

            "ok": (
                response.ok
                and
                bool(
                    response.text
                )
            ),

            "status_code": (
                response.status_code
            ),

            "url": url,
        }

    except Exception as exc:

        return {

            "source": AICTE_SOURCE_NAME,

            "ok": False,

            "status_code": None,

            "url": url,

            "error": str(exc),
        }


# ============================================================
# PUBLIC ALIAS
# ============================================================

def fetch_aicte_internships(
    cities: Optional[
        List[str]
    ] = None,
) -> List[
    Dict[str, Any]
]:

    return get_aicte_opportunities(
        cities=cities
    )


# ============================================================
# LOCAL TEST
# ============================================================

if __name__ == "__main__":

    print(
        "AICTE source health:"
    )

    print(
        aicte_source_health()
    )

    print(
        "\nCollecting AICTE internships..."
    )

    records = (
        get_aicte_opportunities(
            cities=[
                "Salem",
                "Chennai",
                "Coimbatore",
                "Bangalore",
                "Hyderabad",
            ],
            max_pages=1,
            max_results=20,
        )
    )

    print(
        f"\nCollected: {len(records)}"
    )

    for record in records:

        print(
            "\n--------------------------------"
        )

        print(
            "TITLE:",
            record.get(
                "title"
            ),
        )

        print(
            "ORGANIZATION:",
            record.get(
                "organization"
            ),
        )

        print(
            "FIELD:",
            record.get(
                "field"
            ),
        )

        print(
            "LOCATION:",
            record.get(
                "location"
            ),
        )

        print(
            "MODE:",
            record.get(
                "mode"
            ),
        )

        print(
            "DEADLINE:",
            record.get(
                "deadline"
            ),
        )

        print(
            "SOURCE:",
            record.get(
                "source"
            ),
        )

        print(
            "URL:",
            record.get(
                "url"
            ),
        )
