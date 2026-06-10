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
- The Mic button appears on supported fields only.
- The Mic button does not appear on password, payment, hidden, readonly, disabled, checkbox, radio, or file inputs.
- Clicking Mic requests microphone permission only after the user clicks.
- The user can stop recording immediately with the Stop button.
- Recording auto-stops after the short safety cap currently set in `extension/content.js`.
- The extension shows recording and transcribing status.
- Short recordings should move from Stop to Transcribing quickly; long pauses here suggest extension message-passing or backend latency.
- Transcribing must recover to success or an error message; it should not remain stuck indefinitely.
- A successful transcript is inserted into the focused field.
- Inserted text dispatches `input` and `change` events.
- Focus returns to the active field after insertion.
- React-style controlled inputs should retain inserted text after blur or subsequent typing.
- Nested `contenteditable` fields should insert at the cursor rather than always appending.
- Shadow DOM inputs on the local QA page should show the Mic button and accept inserted text.
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
