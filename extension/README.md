# FieldMic Chrome Extension

This folder contains the Chrome browser extension.

The extension uses Manifest V3 with plain JavaScript, content scripts for page interaction, a simple popup UI, and audio recording after explicit user action.

## Current State

FieldMic can detect supported fields, show a microphone button beside the active field, record a short audio clip after the user clicks the button, send the clip to the configured FastAPI backend, and insert the backend transcript. The extension does not call xAI directly.

## Icons

The extension includes PNG icons at `16`, `32`, `48`, and `128` pixels under `icons/`. They are referenced by `manifest.json` for Chrome extension surfaces.

## Load Locally

1. Open `chrome://extensions` in Chrome.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this `extension/` folder.
5. Open the extension popup from the Chrome toolbar.

## Settings

The popup stores local settings with `chrome.storage.local`:

- Enabled state: defaults to on. When off, no page microphone button is shown and recording cannot start.
- Backend URL: defaults to `https://voice-dictation-extension.onrender.com/api/transcribe`.
- Recording limit: defaults to 10 seconds and is clamped between 1 and 30 seconds.
- Check Backend: available under Advanced and checks the corresponding `/health` endpoint without recording or uploading audio.

The backend URL must end with `/api/transcribe`. The release build permits the production Render backend or local HTTP (`localhost` or `127.0.0.1`) for development. Other remote hosts and xAI hostnames are rejected; xAI remains backend-only.

## Deployed Backend

1. Deploy the FastAPI backend behind HTTPS.
2. Open the extension popup.
3. Enter `https://YOUR_BACKEND_HOST/api/transcribe`.
4. Click Save Settings.
5. Open Advanced, click Check Backend, and confirm the backend is reachable.
6. Run a short dictation test on a non-sensitive text field.

The connectivity check calls only `/health`; it does not access xAI or upload audio.

## Manual Test

Backend setup:

```bash
cd "/Users/fk/Documents/Projects/voice-dictation-extension/backend"
cp .env.example .env
```

Set `XAI_API_KEY` in `.env`, then run:

```bash
source .venv/bin/activate
uvicorn app.main:app --reload
```

Open the extension popup, expand Advanced, and change Backend URL to `http://127.0.0.1:8000/api/transcribe` before local-backend testing. Fresh installations default to the production HTTPS backend.

Extension setup:

1. Start the FastAPI backend at `http://127.0.0.1:8000`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Load or reload this `extension/` folder as an unpacked extension.
5. Open the extension popup and confirm FieldMic is enabled, then confirm the backend URL under Advanced and the recording limit.
6. Open or reload a normal web page with a text field. For local QA, use `http://127.0.0.1:8080/qa/manual-test-page.html`.
7. Focus a supported field such as a text input or textarea.
8. Confirm a small microphone icon button appears beside the field.
9. Click the microphone icon button.
10. Allow microphone access if Chrome prompts.
11. Confirm the button changes to a stop icon and a recording status appears.
12. Click the stop icon, or wait for the configured recording limit.
13. Confirm a transcribing status appears.
14. Confirm the backend transcript is inserted into the focused field.
15. Turn FieldMic off in the popup, refocus the page field, and confirm the microphone button is hidden.

For structured QA, use the checklist and local test page in `../qa/`.

## Troubleshooting

- If the microphone button does not appear, reload the page after loading or reloading the extension.
- If Chrome does not prompt for microphone permission, test on `http://127.0.0.1` or an HTTPS page.
- If the button stays on Transcribing, reload the extension and test page, then retry with a short recording.
- If transcription fails, check the FastAPI terminal logs first. The extension intentionally shows safe, generic error messages.
- If a custom backend fails, verify the URL is local HTTP or HTTPS and points directly to `/api/transcribe`.
- If Check Backend fails, open the deployed `/health` URL directly and check the hosting provider logs, TLS certificate, and CORS configuration.
