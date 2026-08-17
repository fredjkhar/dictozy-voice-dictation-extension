# Dictozy: Voice Dictation

Dictozy is a Chrome extension for dictating short text into supported web fields. Focus a field, use the visible microphone button or assigned browser shortcut, speak, and Dictozy inserts the returned transcript where you were writing.

The project includes both the Chrome Manifest V3 extension and the FastAPI backend that performs speech-to-text through xAI. The extension never calls xAI directly and never contains the xAI API key.

![Voice dictation MVP flow](docs/images/extension-flow.svg)

## Landing Page

A self-contained static product website is available at [site/index.html](site/index.html). It includes first-party privacy, support, and 404 pages and can be previewed with `python3 -m http.server 8080 --directory site`. Follow [docs/site-deployment.md](docs/site-deployment.md) for the manual GitHub Pages workflow and post-deployment checks.

## Architecture

The browser extension interacts with supported page fields, records short audio clips after explicit user action, and sends audio to the FastAPI backend. The backend calls xAI Speech-to-Text and returns a transcript for insertion into the active field.

The extension must never call xAI directly. API keys belong only on the backend.

## MVP Stack

- Chrome Extension Manifest V3
- Plain JavaScript
- HTML/CSS
- Python FastAPI
- xAI Speech-to-Text API

## Current Status

Version `0.1.8` is the published privacy-first per-site controls release.

- Chrome extension detects supported fields and ignores unsafe fields.
- Recording starts only after an explicit microphone-button click or assigned browser shortcut.
- A configurable browser shortcut starts, stops, or cancels dictation through the same lifecycle as the visible page control.
- A popup language-formatting preference offers Automatic plus 25 explicit languages. English is the default.
- The popup includes a global master toggle plus an exact-origin control for the current supported site.
- Only sites the user explicitly disables are retained in local extension storage; site preferences are never sent to the backend.
- Extension sends audio to the configured FastAPI backend.
- Backend calls xAI Speech-to-Text.
- Transcript is inserted back into the focused field.
- Controlled inputs receive updates through native setters and standard editing events, while contenteditable transcripts are inserted as plain text at the saved selection.
- Dynamically added fields work through delegated focus handling, and detached or newly unsupported targets are never given a late transcript.
- xAI API key stays backend-only in `.env`.
- Pending transcription can be cancelled from the on-page control without inserting a late result.
- Failures remain visible with a fresh-recording retry state and a short support reference.
- A conservative local signal check rejects clearly silent microphone input without storing or transmitting signal data.
- Backend tests, Node extension tests, Chromium workflow tests, and a local manual QA page are available.
- Backend Docker deployment files are available.
- Production endpoint validation and deployment smoke tests are available.
- Chrome Web Store copy, screenshots, promo tile, icon, and release notes are available under `store/`.
- Store discovery strategy, optimized listing copy, website deployment guidance, and Search Console and website-quality checklists are available under `store/`, `docs/`, and `qa/`.
- Post-publish monitoring and support triage checklists are available under `qa/`.
- The `0.1.8` package keeps the current Dictozy icons consistent across the toolbar, popup, and Chrome extensions page.

## Local Development

The extension records a short user-triggered clip, sends it to the configured FastAPI backend, and inserts the transcript returned by the backend. The backend calls xAI Speech-to-Text using `XAI_API_KEY` from environment variables.

## Quick Start

Clone and enter the project:

```bash
git clone https://github.com/fredjkhar/dictozy-voice-dictation-extension.git
cd dictozy-voice-dictation-extension
```

Backend setup:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
```

Set `XAI_API_KEY` in `backend/.env`, then run:

```bash
uvicorn app.main:app --reload
```

Extension setup:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the `extension/` folder.
5. Reload any test page after loading or reloading the extension.
6. Open the extension popup to use the global or current-site control, view or manage the keyboard shortcut, choose language formatting, adjust the recording limit, or open Advanced backend settings if needed.

QA page:

```bash
python3 -m http.server 8080
```

Open:

```text
http://127.0.0.1:8080/qa/manual-test-page.html
```

![Manual QA page preview](docs/images/manual-test-page.svg)

## Verification

Run backend tests:

```bash
cd backend
source .venv/bin/activate
pytest
```

Run extension syntax checks from the repository root:

```bash
python3 -m json.tool extension/manifest.json >/dev/null
node --check extension/content.js
node --check extension/dom-utils.js
node --check extension/dictation-lifecycle.js
node --check extension/site-preferences.js
node --check extension/background.js
node --check extension/popup.js
node --check extension/config.js
node --test extension/tests/*.test.js
```

Run mocked Chromium workflows without contacting the production backend:

```bash
npm ci
npm run test:browser
npm run test:site
```

Validate and create the Chrome Web Store draft ZIP:

```bash
python3 scripts/package_extension.py
```

Validate the Chrome Web Store visual assets:

```bash
python3 scripts/validate_store_assets.py
```

## Troubleshooting

- `502 Bad Gateway`: FastAPI reached xAI but xAI failed or rejected the request. Check backend logs for `xAI STT` warning lines.
- `403` from xAI: the xAI team may need credits or Speech-to-Text access.
- `503`: `XAI_API_KEY` is missing or not loaded by the backend.
- Extension stays on `Transcribing`: click the cancel icon, then record again. Dictozy also returns to an actionable error state after its timeout.
- Error includes `Reference`: include that short reference when reporting the failure; do not include private transcript or field content.
- No microphone signal detected: confirm Chrome is using the intended input and that the input is not muted, then record again.
- Microphone button does not appear: reload the page after loading the extension and focus a supported non-sensitive field.
- Microphone button does not appear on one site: confirm both the global Dictozy toggle and `Enable on this site` are on. Restricted Chrome pages do not support the current-site control.
- Keyboard shortcut does not work: open the popup and check whether it shows `Not assigned`. Use its keyboard icon to open `chrome://extensions/shortcuts`, then assign or remap the command.
- Backend URL does not work: use the production Render endpoint or local HTTP on `127.0.0.1` or `localhost`. Other remote hosts and xAI URLs are rejected.

## Deployment

The backend includes Docker deployment files under `backend/`. See [backend/DEPLOYMENT.md](backend/DEPLOYMENT.md).

After deploying the backend, set the extension popup Backend URL to the deployed HTTPS `/api/transcribe` endpoint.

Use the popup's Advanced Check Backend control to verify `/health`, then follow [qa/deployment-smoke-test.md](qa/deployment-smoke-test.md) for a complete production-path check. The backend also includes a reusable command-line smoke test:

```bash
cd backend
python scripts/smoke_test.py https://YOUR_BACKEND_HOST
```

## Chrome Web Store Materials

Privacy, release, Store listing, and search-discovery materials are available in [PRIVACY.md](PRIVACY.md), [store/](store/), [site/](site/), and [qa/](qa/). The generated ZIP under `dist/` is intentionally ignored by Git and should be rebuilt only for an extension-code release. Website-only changes do not require a new extension package.

Use [store/seo-strategy.md](store/seo-strategy.md) for the discovery strategy, [docs/site-deployment.md](docs/site-deployment.md) for GitHub Pages deployment, [qa/seo-launch-checklist.md](qa/seo-launch-checklist.md) for Search Console measurement, and [qa/site-quality-checklist.md](qa/site-quality-checklist.md) for website QA.

## Post-Publish Operations

Use [qa/post-publish-monitoring.md](qa/post-publish-monitoring.md) for daily first-week checks, weekly follow-up, Store-installed smoke testing, Render log review, xAI usage review, emergency cutoff steps, and mitigation guidance.

Use [qa/support-triage.md](qa/support-triage.md) for safe support intake and issue routing. Do not ask users for raw audio, transcript text, passwords, payment details, API keys, or private page content.

## Repository Rename

The recommended GitHub repository name is `dictozy-voice-dictation-extension`. After renaming the repository on GitHub, update the local remote with:

```bash
git remote set-url origin https://github.com/fredjkhar/dictozy-voice-dictation-extension.git
```

The local folder does not need to be renamed for the project to keep working.

## Commit Readiness

Before committing:

- Confirm `backend/.env` is not in `git status`.
- Confirm `backend/.venv/`, `__pycache__/`, and `.pytest_cache/` are not in `git status`.
- Run the verification commands above.
- Do not commit real API keys, raw audio, or generated local caches.

## GitHub Project Hygiene

Issue templates are available for:

- Bug reports
- Hardening tasks
- Future feature requests

Use hardening tasks for reliability, privacy, documentation, and QA work. Use feature requests for product scope changes.
