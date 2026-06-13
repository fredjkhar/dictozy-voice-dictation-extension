"""Validate Chrome Web Store asset dimensions and required listing files."""

from __future__ import annotations

import json
from pathlib import Path
import struct
import sys


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_IMAGES = {
    ROOT / "extension/icons/icon-128.png": (128, 128),
    ROOT / "store/assets/screenshot-dictation-1280x800.png": (1280, 800),
    ROOT / "store/assets/screenshot-settings-1280x800.png": (1280, 800),
    ROOT / "store/assets/promo-small-440x280.png": (440, 280),
}
REQUIRED_FILES = (
    ROOT / "PRIVACY.md",
    ROOT / "store/listing.md",
    ROOT / "store/permission-audit.md",
    ROOT / "store/release-checklist.md",
)


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as image_file:
        header = image_file.read(24)

    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError(f"{path.relative_to(ROOT)} is not a valid PNG")

    return struct.unpack(">II", header[16:24])


def validate() -> None:
    errors: list[str] = []

    for path in REQUIRED_FILES:
        if not path.is_file():
            errors.append(f"missing required file: {path.relative_to(ROOT)}")

    for path, expected in EXPECTED_IMAGES.items():
        if not path.is_file():
            errors.append(f"missing image: {path.relative_to(ROOT)}")
            continue

        try:
            actual = png_dimensions(path)
        except ValueError as exc:
            errors.append(str(exc))
            continue

        if actual != expected:
            errors.append(
                f"{path.relative_to(ROOT)} must be {expected[0]}x{expected[1]}, got {actual[0]}x{actual[1]}"
            )

    manifest_path = ROOT / "extension/manifest.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"could not read manifest: {exc}")
    else:
        if manifest.get("name") != "Voice Dictation Browser Extension":
            errors.append("listing name and manifest name must remain aligned")

    if errors:
        raise ValueError("Store asset validation failed:\n- " + "\n- ".join(errors))


def main() -> int:
    try:
        validate()
    except (OSError, ValueError) as exc:
        print(exc, file=sys.stderr)
        return 1

    print("PASS Chrome Web Store visual assets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
