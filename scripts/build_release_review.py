"""Build a review-only 0.1.13 artifact; never upload to the Chrome Web Store."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import zipfile

from package_extension import PACKAGE_FILES, build_zip, read_manifest, validate_files, validate_manifest

ROOT = Path(__file__).resolve().parents[1]
BASE = "c8fda6c7d4884297275e1c34eb418fc1c18714f9"
VERSION = "0.1.13"
OUTPUT = ROOT / "dist" / f"release-{VERSION}"


def git(*args: str) -> bytes:
    return subprocess.check_output(["git", *args], cwd=ROOT)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def main() -> None:
    source_commit = git("rev-parse", "HEAD").decode().strip()
    subprocess.run(["git", "merge-base", "--is-ancestor", BASE, source_commit], cwd=ROOT, check=True)
    require(not git("diff", "--name-only", BASE, source_commit, "--", "backend"), "Backend differs from accepted deployment")
    require(not OUTPUT.exists(), f"Refusing to overwrite existing review output: {OUTPUT}")

    manifest = read_manifest()
    validate_manifest(manifest)
    validate_files()
    require(manifest.get("version") == VERSION, "Unexpected candidate version")
    package = json.loads((ROOT / "package.json").read_text())
    lock = json.loads((ROOT / "package-lock.json").read_text())
    require(package["version"] == lock["version"] == lock["packages"][""]["version"] == VERSION, "Version metadata differs")

    for name in PACKAGE_FILES:
        source = (ROOT / "extension" / name).read_bytes()
        accepted = git("show", f"{BASE}:extension/{name}")
        if name == "manifest.json":
            old_manifest = json.loads(accepted)
            candidate = json.loads(source)
            candidate["version"] = old_manifest["version"]
            require(candidate == old_manifest, "Manifest changed beyond its version")
        else:
            require(source == accepted, f"Unreviewed extension runtime change: {name}")

    OUTPUT.mkdir(parents=True)
    archive_path = build_zip(manifest, OUTPUT)
    entries = {}
    with zipfile.ZipFile(archive_path) as archive:
        require(archive.testzip() is None, "ZIP integrity check failed")
        require(len(archive.namelist()) == len(PACKAGE_FILES), "Duplicate or unexpected ZIP entry")
        require(set(archive.namelist()) == set(PACKAGE_FILES), "ZIP allowlist mismatch")
        for name in archive.namelist():
            data = archive.read(name)
            require(data == (ROOT / "extension" / name).read_bytes(), f"ZIP/source mismatch: {name}")
            entries[name] = hashlib.sha256(data).hexdigest()

    archive_sha = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    provenance = {
        "status": "review_only_not_submitted",
        "version": VERSION,
        "source_commit": source_commit,
        "accepted_runtime_commit": BASE,
        "package": archive_path.name,
        "package_sha256": archive_sha,
        "package_file_count": len(entries),
        "entries_sha256": entries,
        "store_draft_and_version_availability": "requires_authenticated_check_before_upload",
    }
    (OUTPUT / "PROVENANCE.json").write_text(json.dumps(provenance, indent=2) + "\n")
    (OUTPUT / "SHA256SUMS").write_text(f"{archive_sha}  {archive_path.name}\n")
    review = OUTPUT / "review"
    review.mkdir()
    for source, destination in (
        ("PRIVACY.md", "PRIVACY-prepared.md"),
        ("site/privacy.html", "privacy-prepared.html"),
        ("store/release-0.1.13.md", "release-0.1.13.md"),
    ):
        shutil.copyfile(ROOT / source, review / destination)
    (OUTPUT / "README.txt").write_text(
        "DICTOZY 0.1.13: REVIEW ONLY. Nothing was submitted or published.\n"
        "The GitHub artifact is an outer review bundle, NOT the extension ZIP.\n"
        "The inner dictozy-v0.1.13.zip is the candidate; verify SHA256SUMS.\n"
        "Authenticated Store draft/version checks, asset review, coordinated privacy\n"
        "publication, and separate release approval remain required.\n"
        "Do not deploy this branch to Render or enable auto-deploy from older main.\n"
    )
    print(f"PASS: {archive_path.name}, {len(entries)} exact source entries")
    print(f"SOURCE_COMMIT: {source_commit}")
    print(f"SHA256: {archive_sha}")


if __name__ == "__main__":
    main()
