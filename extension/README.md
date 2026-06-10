# Chrome Extension

This folder contains the Chrome browser extension.

The MVP will use Manifest V3 with plain JavaScript, content scripts for page interaction, a simple popup UI, and audio recording after explicit user action.

## Current State

This is an MVP test build. It can detect supported fields, show a microphone button beside the active field, record a short local audio clip after the user clicks the button, send the clip to the local FastAPI backend, and insert the backend transcript. The extension does not call xAI directly.

## Icons

The extension includes PNG icons at `16`, `32`, `48`, and `128` pixels under `icons/`. They are referenced by `manifest.json` for Chrome extension surfaces.

## Load Locally

1. Open `chrome://extensions` in Chrome.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this `extension/` folder.
5. Open the extension popup from the Chrome toolbar.

## MVP Settings

The popup stores local settings with `chrome.storage.local`:

- Backend URL: defaults to `http://127.0.0.1:8000/api/transcribe`.
- Recording limit: defaults to 5 seconds and is clamped between 1 and 30 seconds.

The backend URL may be local HTTP (`localhost` or `127.0.0.1`) or HTTPS. xAI hostnames are rejected by the extension settings; xAI remains backend-only.

## Manual Test

Backend setup:

```bash
cd "/Users/fk/Documents/Voice Dictation Browser Extension/voice-dictation-extension/backend"
cp .env.example .env
```

Set `XAI_API_KEY` in `.env`, then run:

```bash
source .venv/bin/activate
uvicorn app.main:app --reload
```

Extension setup:

1. Start the FastAPI backend at `http://127.0.0.1:8000`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Load or reload this `extension/` folder as an unpacked extension.
5. Open the extension popup and confirm the backend URL and recording limit.
6. Open or reload a normal web page with a text field. For local QA, use `http://127.0.0.1:8080/qa/manual-test-page.html`.
7. Focus a supported field such as a text input or textarea.
8. Confirm a small Mic button appears beside the field.
9. Click the Mic button.
10. Allow microphone access if Chrome prompts.
11. Confirm the button changes to Stop and a recording status appears.
12. Click Stop, or wait for the configured recording limit.
13. Confirm a transcribing status appears.
14. Confirm the backend transcript is inserted into the focused field.

The popup Insert Test Text button remains available as a debug fallback.

For structured QA, use the checklist and local test page in `../qa/`.

## Troubleshooting

- If the Mic button does not appear, reload the page after loading or reloading the extension.
- If Chrome does not prompt for microphone permission, test on `http://127.0.0.1` or an HTTPS page.
- If the button stays on Transcribing, reload the extension and test page, then retry with a short recording.
- If transcription fails, check the FastAPI terminal logs first. The extension intentionally shows safe, generic error messages.
- If a custom backend fails, verify the URL is local HTTP or HTTPS and points directly to `/api/transcribe`.
