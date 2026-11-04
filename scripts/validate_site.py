#!/usr/bin/env python3
"""Validate the public Dictozy website without external dependencies."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from html.parser import HTMLParser
import json
from pathlib import Path
import sys
from urllib.parse import unquote, urlsplit
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site"
PRIVACY_SOURCE = ROOT / "PRIVACY.md"
INDEXABLE_PAGES = ("index.html", "guide.html", "privacy.html", "support.html")
PUBLIC_PAGES = (*INDEXABLE_PAGES, "404.html")
VERIFICATION_FILE = "google477277a037f62b85.html"
VERIFICATION_CONTENT = b"google-site-verification: google477277a037f62b85.html"
STORE_URL = "https://chromewebstore.google.com/detail/folpeencabfejhjokmldikaelonphmma"
PUBLIC_ROOT = "https://dictozy.com/"
LEGACY_PUBLIC_ROOT = "https://fredjkhar.github.io/dictozy-voice-dictation-extension/"
PUBLISHED_EXTENSION_VERSION = "0.1.14"
HOMEPAGE_DESCRIPTION = (
    "Dictate short messages, notes, and searches in supported Chrome fields. Explore Dictozy’s recording controls, "
    "safe transcript recovery, and optional vocabulary."
)
SOCIAL_IMAGE = f"{PUBLIC_ROOT}assets/dictozy-social.png"
EXPECTED_CANONICALS = {
    name: PUBLIC_ROOT if name == "index.html" else f"{PUBLIC_ROOT}{name}"
    for name in INDEXABLE_PAGES
}
POLICY_SECTIONS = (
    "Data Handled",
    "How Data Is Used",
    "Data Sharing",
    "Storage And Retention",
    "Security",
    "User Controls",
    "Limited Use",
    "Changes And Contact",
)
POLICY_CLAIMS = (
    "Recording starts only when you click the visible microphone button or press the assigned browser shortcut",
    "The extension does not transmit the page URL, browsing history, existing field contents, or surrounding page content to the backend",
    "Dictozy does not activate on password or payment fields. Recording starts only after an explicit user action. "
    "In version 0.1.13, hiding the tab cancels the active recording.",
    "Recorded audio is sent to the fixed Dictozy production backend solely to generate a transcript",
    "Site preferences, origins, URLs, and hostnames are not sent to Dictozy's backend, xAI, or an analytics service",
    "Data is not used for advertising, profiling, credit decisions, or sale to third parties",
    "The extension and backend application code do not intentionally persist raw audio or transcripts",
    "The xAI API key is stored only in backend environment variables and is never included in extension code",
    "Recording begins only after the user clicks the microphone button or presses the assigned browser shortcut",
)
SUPPORT_SAFETY_TERMS = (
    "raw audio",
    "transcript text",
    "passwords",
    "payment data",
    "API keys",
    "private page content",
    "existing field contents",
    "browser storage dumps",
)
FAQ_QUESTIONS = (
    "Where does Dictozy work?",
    "Does recording start automatically?",
    "When is microphone permission requested?",
    "Is audio or transcript history stored?",
    "Does Dictozy work offline?",
    "Why might the microphone button not appear?",
    "What if the keyboard shortcut conflicts with another command?",
    "What does language formatting change?",
    "Can Dictozy be disabled on one site?",
    "Is an account required?",
)
HOMEPAGE_FAQ_QUESTIONS = (
    "When does Dictozy request microphone access?",
    "Which fields can I use?",
    "What if the keyboard shortcut is already in use?",
    "How are audio and transcripts handled?",
    "Do I need an account?",
)


def normalize(value: str) -> str:
    return " ".join(value.split()).casefold()


@dataclass
class ScriptBlock:
    attributes: dict[str, str]
    content: str


@dataclass
class ParsedPage:
    path: Path
    title: str = ""
    text_parts: list[str] = field(default_factory=list)
    headings: list[tuple[str, str]] = field(default_factory=list)
    ids: set[str] = field(default_factory=set)
    links: list[str] = field(default_factory=list)
    resources: list[tuple[str, str]] = field(default_factory=list)
    metadata: list[dict[str, str]] = field(default_factory=list)
    canonical_urls: list[str] = field(default_factory=list)
    scripts: list[ScriptBlock] = field(default_factory=list)
    images: list[dict[str, str]] = field(default_factory=list)

    @property
    def text(self) -> str:
        return " ".join(self.text_parts)

    def meta(self, key: str, value: str) -> str | None:
        key = key.casefold()
        value = value.casefold()
        for attributes in self.metadata:
            if attributes.get(key, "").casefold() == value:
                return attributes.get("content")
        return None


class PageParser(HTMLParser):
    def __init__(self, path: Path) -> None:
        super().__init__(convert_charrefs=True)
        self.page = ParsedPage(path=path)
        self._inside_title = False
        self._inside_heading = False
        self._script_attributes: dict[str, str] | None = None
        self._script_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.casefold()
        attributes = {name.casefold(): value or "" for name, value in attrs}

        element_id = attributes.get("id")
        if element_id:
            self.page.ids.add(element_id)

        if tag == "title":
            self._inside_title = True
        elif tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self.page.headings.append((tag, ""))
            self._inside_heading = True
        elif tag == "a" and attributes.get("href"):
            self.page.links.append(attributes["href"])
        elif tag == "img":
            self.page.images.append(attributes)
            if attributes.get("src"):
                self.page.resources.append(("image", attributes["src"]))
            if attributes.get("srcset"):
                self._add_srcset(attributes["srcset"])
        elif tag == "source" and attributes.get("srcset"):
            self._add_srcset(attributes["srcset"])
        elif tag == "link":
            rel_values = set(attributes.get("rel", "").casefold().split())
            href = attributes.get("href")
            if "canonical" in rel_values and href:
                self.page.canonical_urls.append(href)
            elif href and rel_values.intersection({"stylesheet", "icon", "apple-touch-icon", "preload"}):
                self.page.resources.append(("link", href))
            if attributes.get("imagesrcset"):
                self._add_srcset(attributes["imagesrcset"])
        elif tag == "meta":
            self.page.metadata.append(attributes)
        elif tag == "script":
            self._script_attributes = attributes
            self._script_parts = []

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.casefold()
        if tag == "title":
            self._inside_title = False
        elif tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self._inside_heading = False
        elif tag == "script" and self._script_attributes is not None:
            self.page.scripts.append(ScriptBlock(self._script_attributes, "".join(self._script_parts)))
            self._script_attributes = None
            self._script_parts = []

    def handle_data(self, data: str) -> None:
        if self._script_attributes is not None:
            self._script_parts.append(data)
            return

        if data.strip():
            self.page.text_parts.append(data)
            if self._inside_title:
                self.page.title += data
            if self._inside_heading:
                tag, heading_text = self.page.headings[-1]
                self.page.headings[-1] = (tag, heading_text + data)

    def _add_srcset(self, srcset: str) -> None:
        for candidate in srcset.split(","):
            reference = candidate.strip().split()[0] if candidate.strip() else ""
            if reference:
                self.page.resources.append(("image", reference))


def parse_page(path: Path) -> ParsedPage:
    parser = PageParser(path)
    parser.feed(path.read_text(encoding="utf-8"))
    parser.close()
    return parser.page


def local_target(page_path: Path, reference: str) -> tuple[Path, str] | None:
    parsed = urlsplit(reference)
    if parsed.scheme or parsed.netloc:
        return None

    relative_path = unquote(parsed.path)
    if relative_path.startswith("/"):
        target = SITE_DIR / relative_path.lstrip("/")
    else:
        target = page_path if not relative_path else page_path.parent / relative_path
    if target.is_dir():
        target = target / "index.html"
    return target.resolve(), parsed.fragment


def validate_page_metadata(pages: dict[str, ParsedPage], errors: list[str]) -> None:
    titles: set[str] = set()
    descriptions: set[str] = set()

    for name in INDEXABLE_PAGES:
        page = pages[name]
        title = normalize(page.title)
        description = page.meta("name", "description")
        h1_count = sum(tag == "h1" for tag, _ in page.headings)

        if not title:
            errors.append(f"{name}: title is missing")
        elif title in titles:
            errors.append(f"{name}: title must be unique")
        titles.add(title)

        if not description or not description.strip():
            errors.append(f"{name}: meta description is missing")
        elif normalize(description) in descriptions:
            errors.append(f"{name}: meta description must be unique")
        else:
            descriptions.add(normalize(description))

        if h1_count != 1:
            errors.append(f"{name}: expected one H1, found {h1_count}")
        last_level = 0
        for tag, heading in page.headings:
            level = int(tag[1])
            if not heading.strip() or level > last_level + 1:
                errors.append(f"{name}: empty heading or skipped heading level at {tag}")
            last_level = level
        if page.canonical_urls != [EXPECTED_CANONICALS[name]]:
            errors.append(f"{name}: canonical must be {EXPECTED_CANONICALS[name]}")
        if page.meta("property", "og:url") != EXPECTED_CANONICALS[name]:
            errors.append(f"{name}: og:url must match the canonical")
        if "noindex" in normalize(page.meta("name", "robots") or ""):
            errors.append(f"{name}: indexable page contains noindex")
        if page.meta("property", "og:image") != SOCIAL_IMAGE:
            errors.append(f"{name}: og:image must use the production domain")
        if page.meta("name", "twitter:image") != SOCIAL_IMAGE:
            errors.append(f"{name}: twitter:image must use the production domain")
        if not any(
            kind == "link" and urlsplit(ref).path.lstrip("/") == "styles.css" and urlsplit(ref).query
            for kind, ref in page.resources
        ):
            errors.append(f"{name}: missing cache-busted shared stylesheet")

        for metadata_name, metadata_key in (
            ("Open Graph title", ("property", "og:title")),
            ("Open Graph description", ("property", "og:description")),
            ("Open Graph image", ("property", "og:image")),
            ("Twitter card", ("name", "twitter:card")),
            ("Twitter title", ("name", "twitter:title")),
            ("Twitter description", ("name", "twitter:description")),
            ("Twitter image", ("name", "twitter:image")),
            ("Twitter image alt text", ("name", "twitter:image:alt")),
        ):
            if not page.meta(*metadata_key):
                errors.append(f"{name}: {metadata_name} metadata is missing")

    homepage_description = pages["index.html"].meta("name", "description") or ""
    if homepage_description != HOMEPAGE_DESCRIPTION:
        errors.append("index.html: homepage description must match the audited production copy")
    if not 150 <= len(homepage_description) <= 170:
        errors.append("index.html: homepage description must be 150 to 170 characters")


def validate_references(pages: dict[str, ParsedPage], errors: list[str]) -> None:
    parsed_by_path = {page.path.resolve(): page for page in pages.values()}

    for name, page in pages.items():
        for reference in page.links:
            if urlsplit(reference).scheme not in {"", "https", "mailto"}:
                errors.append(f"{name}: unsafe link scheme in {reference}")
            if unquote(urlsplit(reference).path) in {"index.html", "./index.html", "/index.html"}:
                errors.append(f"{name}: internal homepage link must use the canonical root URL: {reference}")

            target_info = local_target(page.path, reference)
            if target_info is None:
                continue
            target, fragment = target_info
            if not target.exists():
                errors.append(f"{name}: broken local link {reference}")
                continue
            if fragment:
                target_page = parsed_by_path.get(target)
                if target_page is None or fragment not in target_page.ids:
                    errors.append(f"{name}: missing fragment target {reference}")

        for resource_type, reference in page.resources:
            parsed = urlsplit(reference)
            if parsed.scheme or parsed.netloc:
                errors.append(f"{name}: remote {resource_type} dependency is not allowed: {reference}")
                continue
            target_info = local_target(page.path, reference)
            if target_info is None:
                continue
            target, _ = target_info
            if not target.is_file():
                errors.append(f"{name}: missing local {resource_type} {reference}")


def validate_scripts_and_privacy(pages: dict[str, ParsedPage], errors: list[str]) -> None:
    forbidden_copy = ("view source", "source code")
    forbidden_hosts = ("github.com", "googletagmanager.com", "google-analytics.com", "connect.facebook.net")

    for name, page in pages.items():
        page_text = normalize(page.text)
        for phrase in forbidden_copy:
            if phrase in page_text:
                errors.append(f"{name}: public source-code copy remains: {phrase}")

        for link in page.links:
            host = urlsplit(link).netloc.casefold()
            if any(forbidden in host for forbidden in forbidden_hosts):
                errors.append(f"{name}: forbidden public or tracking destination: {link}")

        for image in page.images:
            if "alt" not in image:
                errors.append(f"{name}: image is missing an alt attribute: {image.get('src', '')}")
            if not image.get("width") or not image.get("height"):
                errors.append(f"{name}: image dimensions are missing: {image.get('src', '')}")
            if image.get("width") == "1" or image.get("height") == "1":
                errors.append(f"{name}: possible tracking pixel detected")

        expected_sources = ["/navigation.js"]
        if name == "guide.html":
            expected_sources.append("guide.js")
        external = [script for script in page.scripts if "src" in script.attributes]
        if sorted(script.attributes["src"] for script in external) != sorted(expected_sources):
            errors.append(f"{name}: expected only these local script dependencies: {expected_sources}")
        for script in external:
            source = script.attributes["src"]
            if "defer" not in script.attributes or "async" in script.attributes:
                errors.append(f"{name}: external script must be deferred: {source}")
            if source in expected_sources and not (SITE_DIR / source.lstrip("/")).is_file():
                errors.append(f"{name}: missing script: {source}")
        for script in page.scripts:
            if "src" not in script.attributes and (
                name == "guide.html" or script.attributes.get("type", "").casefold() != "application/ld+json"
            ):
                errors.append(f"{name}: unexpected inline script")

    homepage_scripts = [script for script in pages["index.html"].scripts if "src" not in script.attributes]
    if len(homepage_scripts) != 1:
        errors.append("index.html: expected exactly one JSON-LD block")
        return

    try:
        structured_data = json.loads(homepage_scripts[0].content)
    except json.JSONDecodeError as exc:
        errors.append(f"index.html: JSON-LD is invalid: {exc}")
        return

    if structured_data.get("@type") != "SoftwareApplication":
        errors.append("index.html: JSON-LD must describe a SoftwareApplication")
    if structured_data.get("softwareVersion") != PUBLISHED_EXTENSION_VERSION:
        errors.append(
            f"index.html: JSON-LD softwareVersion must match published version {PUBLISHED_EXTENSION_VERSION}"
        )
    if structured_data.get("url") != PUBLIC_ROOT:
        errors.append("index.html: JSON-LD url must use the production homepage")
    if structured_data.get("image") != SOCIAL_IMAGE:
        errors.append("index.html: JSON-LD image must use the production domain")
    if structured_data.get("installUrl") != STORE_URL:
        errors.append("index.html: JSON-LD installUrl is incorrect")
    if structured_data.get("applicationCategory") != "UtilitiesApplication":
        errors.append("index.html: JSON-LD application category is incorrect")
    if structured_data.get("isAccessibleForFree") is not True:
        errors.append("index.html: JSON-LD free-access claim is incorrect")
    if "aggregateRating" in structured_data or "review" in structured_data:
        errors.append("index.html: fabricated rating or review data is not allowed")


def validate_product_previews(pages: dict[str, ParsedPage], errors: list[str]) -> None:
    homepage = pages["index.html"]
    for anchor in ("hero-title", "how-it-works", "controls", "privacy", "faq", "install", "compatibility-title"):
        if anchor not in homepage.ids:
            errors.append(f"index.html: missing homepage destination #{anchor}")
    guide = pages["guide.html"]
    for anchor in ("install", "record", "insert", "recover", "vocabulary", "troubleshoot"):
        if anchor not in guide.ids:
            errors.append(f"guide.html: missing walkthrough destination #{anchor}")
    if "interactive demo — no microphone access or audio is sent." not in normalize(guide.text):
        errors.append("guide.html: missing static simulation boundary")


def validate_policy_and_support(pages: dict[str, ParsedPage], errors: list[str]) -> None:
    markdown = PRIVACY_SOURCE.read_text(encoding="utf-8")
    privacy_text = pages["privacy.html"].text
    normalized_markdown = normalize(markdown)
    normalized_privacy = normalize(privacy_text)

    for section in POLICY_SECTIONS:
        if normalize(f"## {section}") not in normalized_markdown:
            errors.append(f"PRIVACY.md: missing policy section {section}")
        if normalize(section) not in normalized_privacy:
            errors.append(f"privacy.html: missing policy section {section}")

    for claim in POLICY_CLAIMS:
        normalized_claim = normalize(claim)
        if normalized_claim not in normalized_markdown:
            errors.append(f"PRIVACY.md: critical claim changed or missing: {claim}")
        if normalized_claim not in normalized_privacy:
            errors.append(f"privacy.html: critical claim changed or missing: {claim}")

    support_text = normalize(pages["support.html"].text)
    homepage_text = normalize(pages["index.html"].text)
    for safety_term in SUPPORT_SAFETY_TERMS:
        if normalize(safety_term) not in support_text:
            errors.append(f"support.html: safety disclosure is missing {safety_term}")
    for question in FAQ_QUESTIONS:
        if normalize(question) not in support_text:
            errors.append(f"support.html: FAQ is missing {question}")
    for question in HOMEPAGE_FAQ_QUESTIONS:
        if normalize(question) not in homepage_text:
            errors.append(f"index.html: homepage FAQ is missing {question}")

    accuracy_terms = (
        "microphone quality",
        "background noise",
        "pronunciation",
        "browser or device behavior",
    )
    for term in accuracy_terms:
        if normalize(term) not in homepage_text and normalize(term) not in support_text:
            errors.append(f"Home/support: accuracy disclosure is missing {term}")

    for feature in ("record", "recovery", "vocabulary", "shortcut", "supported", "account"):
        if feature not in homepage_text:
            errors.append(f"index.html: missing product explanation about {feature}")

    if STORE_URL not in pages["support.html"].links:
        errors.append("support.html: published Chrome Web Store support destination is missing")
    if not {"support.html", "/support.html"}.intersection(pages["privacy.html"].links):
        errors.append("privacy.html: first-party support link is missing")
    if f"{PUBLIC_ROOT}support.html" not in markdown:
        errors.append("PRIVACY.md: first-party support URL is missing")


def validate_sitemap_and_404(pages: dict[str, ParsedPage], errors: list[str]) -> None:
    try:
        root = ET.parse(SITE_DIR / "sitemap.xml").getroot()
    except (ET.ParseError, OSError) as exc:
        errors.append(f"sitemap.xml: could not parse: {exc}")
        return

    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    for entry in root.findall("sm:url", namespace):
        try:
            date.fromisoformat(entry.findtext("sm:lastmod", "", namespace))
        except ValueError:
            errors.append("sitemap.xml: every page needs an ISO modification date")
    sitemap_urls = [element.text or "" for element in root.findall("sm:url/sm:loc", namespace)]
    expected_urls = [EXPECTED_CANONICALS[name] for name in INDEXABLE_PAGES]
    if sorted(sitemap_urls) != sorted(expected_urls):
        errors.append(f"sitemap.xml: URLs must be exactly {expected_urls}")
    if any("404.html" in url for url in sitemap_urls):
        errors.append("sitemap.xml: 404.html must not be included")

    not_found = pages["404.html"]
    robots = normalize(not_found.meta("name", "robots") or "")
    if "noindex" not in robots:
        errors.append("404.html: robots noindex is required")
    if sum(tag == "h1" for tag, _ in not_found.headings) != 1:
        errors.append("404.html: expected exactly one H1")
    for required_link in ("/", "/guide.html", "/support.html", STORE_URL):
        if required_link not in not_found.links:
            errors.append(f"404.html: required destination is missing: {required_link}")


def validate_artifact(errors: list[str]) -> None:
    for name in PUBLIC_PAGES:
        if not (SITE_DIR / name).is_file():
            errors.append(f"missing required public page: site/{name}")

    verification_path = SITE_DIR / VERIFICATION_FILE
    if not verification_path.is_file():
        errors.append(f"missing Search Console verification file: site/{VERIFICATION_FILE}")
    elif verification_path.read_bytes() != VERIFICATION_CONTENT:
        errors.append(f"site/{VERIFICATION_FILE}: verification token changed")

    for required_file in (".nojekyll", "robots.txt", "sitemap.xml", "styles.css", "assets/dictozy-social.png"):
        if not (SITE_DIR / required_file).is_file():
            errors.append(f"missing required public file: site/{required_file}")

    robots_path = SITE_DIR / "robots.txt"
    if robots_path.is_file():
        robots_text = robots_path.read_text(encoding="utf-8")
        if f"Sitemap: {PUBLIC_ROOT}sitemap.xml" not in robots_text:
            errors.append("robots.txt: sitemap must use the production domain")

    for public_path in SITE_DIR.rglob("*"):
        if public_path.is_file() and public_path.suffix in {".html", ".txt", ".xml"}:
            if LEGACY_PUBLIC_ROOT in public_path.read_text(encoding="utf-8"):
                errors.append(f"{public_path.relative_to(ROOT)}: legacy public website URL remains")

    markdown_files = sorted(path.relative_to(ROOT) for path in SITE_DIR.rglob("*.md"))
    if markdown_files:
        errors.append(f"developer Markdown must not be deployed from site/: {markdown_files}")

    for path in SITE_DIR.glob("*.css"):
        css = path.read_text(encoding="utf-8").casefold()
        if "http://" in css or "https://" in css or "@import" in css:
            errors.append(f"{path.name}: remote dependencies and @import are not allowed")


def main() -> int:
    errors: list[str] = []
    validate_artifact(errors)

    pages: dict[str, ParsedPage] = {}
    for name in PUBLIC_PAGES:
        path = SITE_DIR / name
        if path.is_file():
            pages[name] = parse_page(path)

    if len(pages) == len(PUBLIC_PAGES):
        validate_page_metadata(pages, errors)
        validate_references(pages, errors)
        validate_scripts_and_privacy(pages, errors)
        validate_product_previews(pages, errors)
        validate_policy_and_support(pages, errors)
        validate_sitemap_and_404(pages, errors)

    if errors:
        print("Site validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print("PASS site validation")
    print(f"Validated pages: {', '.join(PUBLIC_PAGES)}")
    print(f"Validated Search Console file: {VERIFICATION_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
