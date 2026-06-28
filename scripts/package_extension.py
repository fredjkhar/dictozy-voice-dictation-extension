"""Validate and package the Chrome extension for a draft Web Store upload."""

from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import struct
import sys
import zipfile


ROOT = Path(__file__).resolve().parents[1]
EXTENSION_DIR = ROOT / "extension"
DEFAULT_OUTPUT_DIR = ROOT / "dist"
EXPECTED_PERMISSIONS = ["storage"]
EXPECTED_HOST_PERMISSIONS = {
    "http://127.0.0.1/*",
    "http://localhost/*",
    "https://voice-dictation-extension.onrender.com/*",
}
EXPECTED_CONTENT_MATCHES = {
    "http://127.0.0.1/*",
    "http://localhost/*",
    "https://*/*",
}
PACKAGE_FILES = (
    "manifest.json",
    "config.js",
    "dom-utils.js",
    "content.js",
    "content.css",
    "background.js",
    "popup.html",
    "popup.js",
    "icons/icon-16.png",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "icons/icon-128.png",
)
EXPECTED_ICON_SIZES = {
    "icons/icon-16.png": (16, 16),
    "icons/icon-32.png": (32, 32),
    "icons/icon-48.png": (48, 48),
    "icons/icon-128.png": (128, 128),
}


class ScriptSourceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.script_sources: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "script":
            return

        source = dict(attrs).get("src")
        if source:
            self.script_sources.append(source)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check-only", action="store_true", help="Validate without creating a ZIP")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    return parser.parse_args()


def read_manifest() -> dict[str, object]:
    with (EXTENSION_DIR / "manifest.json").open(encoding="utf-8") as manifest_file:
        return json.load(manifest_file)


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as image_file:
        header = image_file.read(24)

    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path.relative_to(ROOT)} is not a valid PNG")

    return struct.unpack(">II", header[16:24])


def validate_manifest(manifest: dict[str, object]) -> None:
    errors: list[str] = []

    if manifest.get("manifest_version") != 3:
        errors.append("manifest_version must be 3")
    if manifest.get("permissions") != EXPECTED_PERMISSIONS:
        errors.append(f"permissions must be exactly {EXPECTED_PERMISSIONS}")
    if set(manifest.get("host_permissions", [])) != EXPECTED_HOST_PERMISSIONS:
        errors.append("host_permissions do not match the audited backend hosts")

    content_scripts = manifest.get("content_scripts")
    if not isinstance(content_scripts, list) or len(content_scripts) != 1:
        errors.append("exactly one content_scripts entry is required")
    else:
        matches = content_scripts[0].get("matches", [])
        if set(matches) != EXPECTED_CONTENT_MATCHES:
            errors.append("content script matches do not match the audited page scope")

    if manifest.get("background") != {"service_worker": "background.js"}:
        errors.append("background service worker configuration changed")

    if errors:
        raise ValueError("Manifest validation failed:\n- " + "\n- ".join(errors))


def validate_files() -> None:
    missing = [name for name in PACKAGE_FILES if not (EXTENSION_DIR / name).is_file()]
    if missing:
        raise ValueError("Missing extension files:\n- " + "\n- ".join(missing))

    for name, expected_size in EXPECTED_ICON_SIZES.items():
        actual_size = png_dimensions(EXTENSION_DIR / name)
        if actual_size != expected_size:
            raise ValueError(f"{name} must be {expected_size[0]}x{expected_size[1]}, got {actual_size}")

    parser = ScriptSourceParser()
    parser.feed((EXTENSION_DIR / "popup.html").read_text(encoding="utf-8"))
    for source in parser.script_sources:
        if "://" in source or source.startswith("//"):
            raise ValueError(f"Remote popup script is not allowed: {source}")
        if not (EXTENSION_DIR / source).is_file():
            raise ValueError(f"Popup script does not exist: {source}")

    background = (EXTENSION_DIR / "background.js").read_text(encoding="utf-8")
    if 'importScripts("config.js")' not in background:
        raise ValueError("background.js must import the packaged config.js")


def build_zip(manifest: dict[str, object], output_dir: Path) -> Path:
    version = manifest.get("version")
    if not isinstance(version, str) or not version:
        raise ValueError("manifest version is missing")

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"fieldmic-v{version}.zip"

    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name in sorted(PACKAGE_FILES):
            data = (EXTENSION_DIR / name).read_bytes()
            info = zipfile.ZipInfo(name, date_time=(2026, 6, 13, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)

    with zipfile.ZipFile(output_path) as archive:
        if set(archive.namelist()) != set(PACKAGE_FILES):
            raise ValueError("ZIP contents do not match the approved package file list")
        if "manifest.json" not in archive.namelist():
            raise ValueError("manifest.json must be at the ZIP root")

    return output_path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as artifact:
        for chunk in iter(lambda: artifact.read(64 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    args = parse_args()

    try:
        manifest = read_manifest()
        validate_manifest(manifest)
        validate_files()

        if args.check_only:
            print("PASS extension package validation")
            return 0

        output_path = build_zip(manifest, args.output_dir)
        print(f"PASS package: {output_path}")
        print(f"SHA256: {sha256(output_path)}")
        return 0
    except (OSError, ValueError, json.JSONDecodeError, zipfile.BadZipFile) as exc:
        print(f"Package validation failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
