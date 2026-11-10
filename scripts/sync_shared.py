"""Copy reviewed shared sources into the extension and static-site artifacts.

Edit shared/, then run this command. --check verifies byte identity without writes.
The browser artifacts never fetch executable code from each other or a CDN.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FILES = ("config.js", "dom-utils.js", "dictation-lifecycle.js", "dictation-controller.js", "content.css")
DESTINATIONS = (ROOT / "extension", ROOT / "site" / "shared")


def stale_copies() -> list[str]:
    return [str((destination / name).relative_to(ROOT))
            for name in FILES for destination in DESTINATIONS
            if not (destination / name).is_file()
            or (destination / name).read_bytes() != (ROOT / "shared" / name).read_bytes()]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail on missing or stale copies; never write")
    args = parser.parse_args()
    if args.check:
        stale = stale_copies()
        if stale:
            print("Stale shared copies: " + ", ".join(stale), file=sys.stderr)
            return 1
    else:
        for destination in DESTINATIONS:
            destination.mkdir(parents=True, exist_ok=True)
            for name in FILES:
                (destination / name).write_bytes((ROOT / "shared" / name).read_bytes())
    print("PASS shared source copies")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
