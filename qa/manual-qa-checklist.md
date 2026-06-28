# Manual QA Checklist

Use this checklist after backend or extension changes.

## Backend

- `GET /health` returns `{"status":"ok"}`.
- `POST /api/transcribe` rejects missing files with `422`.
- `POST /api/transcribe` rejects non-audio files with `400`.
- `POST /api/transcribe` rejects empty audio files with `400`.
- With a valid `XAI_API_KEY`, a short real audio file returns a transcript.
- Without `XAI_API_KEY`, the endpoint returns a safe `503` message.
- Backend logs may include upstream xAI status details, but API responses must not expose secrets.

## Extension

- The unpacked extension loads without errors in `chrome://extensions`.
- Popup settings persist after closing and reopening the popup.
- The popup shows `FieldMic` branding and version `0.1.2` in `chrome://extensions`.
- Turning FieldMic off hides the page microphone button and prevents recording from starting.
- Turning FieldMic back on restores microphone behavior on supported fields.
- Backend URL defaults to `https://voice-dictation-extension.onrender.com/api/transcribe`.
- Backend URL rejects unapproved remote hosts, xAI URLs, and paths that do not end in `/api/transcribe`.
- Backend URL rejects embedded credentials, query strings, and fragments.
- Advanced Check Backend reports success when the configured backend `/health` endpoint returns `{"status":"ok"}`.
- Recording limit defaults to 10 seconds and clamps to the allowed range.
- The microphone icon button appears on supported fields only.
- The microphone icon button does not appear on password, payment, hidden, readonly, disabled, checkbox, radio, or file inputs.
- Clicking the microphone icon requests microphone permission only after the user clicks.
- The user can stop recording immediately with the stop icon button.
- Recording auto-stops after the configured popup recording limit.
- The extension shows recording and transcribing status.
- Short recordings should move from the stop icon to Transcribing quickly; long pauses here suggest extension message-passing or backend latency.
- Transcribing must recover to success or an error message; it should not remain stuck indefinitely.
- A successful transcript is inserted into the focused field.
- If focus moves away before transcription completes, the transcript is not inserted into an old field.
- Inserted text dispatches `input` and `change` events.
- Focus returns to the active field after insertion.
- React-style controlled inputs should retain inserted text after blur or subsequent typing.
- Nested `contenteditable` fields should insert at the cursor rather than always appending.
- Shadow DOM inputs on the local QA page should show the microphone icon button and accept inserted text.
- xAI API keys never appear in extension files, browser console output, or network calls from the page.

## Local Test Page

Run this from the repository root:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://127.0.0.1:8080/qa/manual-test-page.html
```

## Troubleshooting

- If the button stays on Transcribing, reload the extension in `chrome://extensions`, refresh the test page, and retry with a shorter recording.
- Check the backend terminal for `xAI STT` warning lines when the extension shows a speech-to-text error.
- Make sure the backend is running on `http://127.0.0.1:8000`.

For a deployed backend, use [deployment-smoke-test.md](deployment-smoke-test.md).
