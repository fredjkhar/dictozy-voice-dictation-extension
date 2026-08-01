# Dictozy Chrome Extension

This folder contains the Chrome extension that adds Dictozy's microphone control to supported web fields.

The extension uses Manifest V3 with plain JavaScript, content scripts for page interaction, a focused popup UI, and audio recording after explicit user action.

## Current State

Dictozy detects supported fields, shows a microphone button beside the active field, and records a short audio clip after an explicit microphone-button click or assigned browser shortcut. The clip and selected language-formatting code are sent to the configured FastAPI backend, and the returned transcript is inserted into the active field. The shortcut and visible control share the same start, stop, cancellation, retry, and stale-operation protections. The extension does not call xAI directly.

`dictation-lifecycle.js` owns privacy-safe request IDs, stale-operation rejection, cancellation signals, and conservative local microphone-signal inspection. `content.js` remains responsible for page fields, the visible control, recording, insertion, and accessible status UI. Runtime code has no third-party JavaScript dependencies.

Supported fields include normal text inputs, textareas, contenteditable elements, and ARIA textboxes that are actually editable, such as `[role="textbox"][contenteditable="true"]`. A bare `role="textbox"` does not provide a standard writable editing mechanism and is ignored.

## Icons

The extension includes PNG icons at `16`, `32`, `48`, and `128` pixels under `icons/`. They are referenced by `manifest.json` for Chrome extension surfaces.

The normalized source image is `icons/icon-source.png`, with larger exported sizes available at `256`, `512`, and `1024` pixels for future Store or site use. The release package includes only the PNG icon files listed by `scripts/package_extension.py`.

## Load Locally

1. Open `chrome://extensions` in Chrome.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this `extension/` folder.
5. Open the extension popup from the Chrome toolbar.

## Settings

The popup stores local settings with `chrome.storage.local`:

- Enabled state: defaults to on. When off, the page microphone button is hidden and recording cannot start.
- Keyboard shortcut: the `toggle-dictation` command suggests `Ctrl+Shift+Y` by default and `Command+Shift+Y` on macOS. Chrome may leave it unassigned after a conflict; the popup shows the current assignment and opens `chrome://extensions/shortcuts` for remapping.
- Language formatting: defaults to English. Automatic asks the backend to omit provider language and formatting parameters; an explicit choice sends its language code so xAI can guide written formatting for numbers, currencies, and units. It is not a guarantee of improved speech recognition.
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

Configure the backend environment as documented in `../backend/.env.example`, then run:

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
5. Open the extension popup and confirm Dictozy is enabled, then confirm English language formatting, the backend URL under Advanced, and the recording limit.
6. Open or reload a normal web page with a text field. For local QA, use `http://127.0.0.1:8080/qa/manual-test-page.html`.
7. Focus a supported field such as a text input or textarea.
8. Confirm a small microphone icon button appears beside the field.
9. Use the assigned shortcut and allow microphone access if Chrome prompts.
10. Confirm the button changes to a stop icon and a recording status appears.
11. Use the shortcut again to stop recording and confirm a transcribing status appears.
12. During another recording, use the shortcut while transcribing and confirm no late result is inserted. Cancellation stops the extension-side request where practical but cannot guarantee that provider processing has stopped.
13. Start a recording and use the shortcut while the microphone permission prompt is pending; deny or close the prompt and confirm no upload occurs.
14. Press the shortcut repeatedly and confirm recordings or transcription requests do not overlap.
15. Trigger a safe failure and confirm the error remains visible, includes a short reference when a request was sent, and offers a retry icon.
16. Click the retry icon, make a new recording, and confirm only the new recording is used.
17. Confirm a successful backend transcript is inserted only if the original field remains focused.
18. Turn Dictozy off during recording and during transcription, then confirm active work is cancelled and no result is inserted.
19. While Dictozy is off, press the shortcut and confirm nothing records or uploads.
20. Turn Dictozy back on, refocus a supported field, and confirm both the microphone button and shortcut are usable.
21. Open the popup, confirm the displayed shortcut matches `chrome://extensions/shortcuts`, remap it, reopen the popup, and confirm the new assignment appears.
22. Remove the assignment, reopen the popup, and confirm it shows `Not assigned`.
23. Select Automatic language formatting, save, reopen the popup, and confirm the choice persists.
24. Select an explicit language, save, dictate a short phrase containing a number or unit, and confirm the request succeeds. Treat the resulting punctuation and number formatting as provider-dependent.
25. Confirm common payment fields, including camel-case and snake-case card identifiers, never show the microphone control and ignore the shortcut.
26. Confirm an editable ARIA textbox accepts a transcript while a bare non-editable ARIA textbox is ignored.
27. Repeat the start, stop, cancel, and successful insertion flow with the visible click controls.

For structured QA, use the checklist and local test page in `../qa/`.

## Troubleshooting

- If the microphone button does not appear, reload the page after loading or reloading the extension.
- If the keyboard shortcut does not work, check the popup for `Not assigned`, then use its keyboard icon to assign or remap the command in `chrome://extensions/shortcuts`.
- If Chrome does not prompt for microphone permission, test on `http://127.0.0.1` or an HTTPS page.
- If the button stays on Transcribing, click the cancel icon and retry with a short recording. The extension also applies a response timeout.
- If an error includes a short `Reference`, use it to locate the matching privacy-safe backend request log. Do not share audio, transcript text, or field contents in support reports.
- If Dictozy reports no microphone signal, confirm the selected Chrome input is active and not muted. Quiet or unsupported signal-inspection cases continue to the backend rather than being aggressively rejected.
- If transcription fails, check the FastAPI terminal logs first. The extension intentionally shows safe, generic error messages.
- If a custom backend fails, verify the URL is local HTTP or HTTPS and points directly to `/api/transcribe`.
- If Check Backend fails, open the deployed `/health` URL directly and check the hosting provider logs, TLS certificate, and CORS configuration.
