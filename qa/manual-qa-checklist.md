# Manual QA Checklist

Use this checklist after backend, extension, listing, or release-package changes. It covers the user-visible flow first, then the technical safety checks.

For the published extension, use [post-publish-monitoring.md](post-publish-monitoring.md) after this checklist.

## Backend

- `GET /health` returns `{"status":"ok"}`.
- `POST /api/transcribe` rejects missing files with `422`.
- `POST /api/transcribe` rejects non-audio files with `400`.
- `POST /api/transcribe` rejects empty audio files with `400`.
- With a valid `XAI_API_KEY`, a short real audio file returns a transcript.
- A request that omits `language` defaults to English for compatibility with `0.1.5` clients.
- A request with `language=auto` succeeds without sending provider language or formatting parameters.
- Each supported explicit language code succeeds and is sent to xAI with formatting enabled.
- An unsupported language value returns a safe `400` without calling xAI.
- Without `XAI_API_KEY`, the endpoint returns a safe `503` message.
- Missing or blank `TRANSCRIPTION_ENABLED` uses the documented default; valid false values disable transcription, and malformed non-empty values stop startup clearly.
- Backend logs may include upstream xAI status details, but API responses must not expose secrets.

## Extension

- The unpacked extension loads without errors in `chrome://extensions`.
- Popup settings persist after closing and reopening the popup.
- The popup shows `Dictozy` branding and version `0.1.10` in `chrome://extensions` when testing the unpacked release candidate.
- The popup displays the current `toggle-dictation` shortcut or `Not assigned`.
- The popup keyboard icon opens `chrome://extensions/shortcuts`.
- The suggested shortcut is `Ctrl+Shift+Y`, or `Command+Shift+Y` on macOS, when Chrome can assign it without a conflict.
- Remapping or removing the command in Chrome is reflected after reopening the popup.
- Language formatting defaults to English on a fresh installation.
- Automatic and all 25 explicit language options appear in the native language selector.
- Saving Automatic or an explicit language persists the selection after reopening the popup.
- Automatic is sent to the backend as `auto`; explicit selections are sent as their supported language code.
- Missing or invalid stored values safely fall back to English.
- Turning Dictozy off hides the page microphone button and prevents recording from starting.
- Turning Dictozy back on restores microphone behavior on supported fields.
- Supported sites are enabled by default when the global master toggle is on.
- Disabling the current site stores only its exact origin and does not change the global enabled state.
- Paths, queries, and fragments share one origin preference; subdomains, schemes, and ports remain separate.
- Disabling the current site during microphone access, recording, or transcription stops extension-side work and prevents upload or late insertion as appropriate.
- The shortcut and a stale click control cannot start dictation while the current site is disabled.
- Re-enabling the current site restores normal behavior after a supported field is focused.
- Reset Site Preferences is available in the normal settings panel, removes only explicitly disabled origins, and preserves the recording limit, language formatting, global enabled state, and keyboard shortcut.
- Malformed or duplicate stored origin values do not break the popup or content script.
- On restricted Chrome pages, the current-site control is unavailable while the global toggle and other popup settings remain usable.
- The popup contains no Advanced Backend, Backend URL, or Check Backend control.
- An obsolete stored `backendUrl` value is removed on update and cannot change the request destination.
- `chrome://extensions` shows backend host access only for `https://voice-dictation-extension.onrender.com/*`; localhost backend fetch access is absent.
- Production transcription requests always target `https://voice-dictation-extension.onrender.com/api/transcribe`.
- Recording limit defaults to 10 seconds and clamps to the allowed range.
- The microphone icon button appears on supported fields only.
- Editable ARIA textboxes, such as `[role="textbox"][contenteditable="true"]`, are supported; bare non-editable ARIA textboxes are ignored.
- The microphone icon button does not appear on password, payment, hidden, readonly, disabled, checkbox, radio, or file inputs.
- Payment exclusions cover standard `cc-*` autocomplete values and common camel-case, snake-case, kebab-case, and compact card identifiers.
- Safe near-misses such as `postcardMessage` remain supported.
- Clicking the microphone icon requests microphone permission only after the user clicks.
- With a supported focused field, the assigned shortcut requests microphone permission as an explicit user action.
- While recording, pressing the shortcut stops the current recording.
- While microphone permission is pending, pressing the shortcut cancels the pending attempt safely and does not upload audio.
- While transcribing, pressing the shortcut cancels extension-side work and prevents a late result from being inserted.
- The shortcut does nothing when Dictozy is disabled, no supported field is focused, or a password, payment, hidden, readonly, disabled, checkbox, radio, or file field is focused.
- Repeated shortcut presses do not create overlapping recordings or transcription requests.
- The visible click controls and keyboard shortcut produce the same recording, cancellation, retry, and insertion behavior.
- The user can stop recording immediately with the stop icon button.
- Recording auto-stops after the configured popup recording limit.
- The extension shows recording and transcribing status.
- During transcription, the on-page control is an enabled cancel icon with an accessible `Cancel transcription` label and tooltip.
- Cancelling transcription returns the control to idle and prevents a late response from inserting text.
- Cancellation aborts the extension-side request where practical; it does not claim that already-uploaded provider work is guaranteed to stop.
- Short recordings should move from the stop icon to Transcribing quickly; long pauses here suggest extension message-passing or backend latency.
- Transcribing must recover to success or a persistent error/retry state; it should not remain stuck indefinitely.
- Failure details remain visible until dismissed, retried, disabled, or cleared by moving to another field.
- A request failure shows only a short support reference, not audio, transcript text, field content, or a full request ID.
- Clicking the retry icon starts a new recording with a new request ID; failed audio is not resent.
- A backend timeout returns to the persistent retry state.
- Turning Dictozy off during recording stops the stream and does not upload the cancelled recording.
- Turning Dictozy off during transcription prevents any late response from being inserted.
- Turning Dictozy back on restores an enabled microphone control.
- A clearly silent or unavailable microphone produces a local, privacy-safe message where signal inspection is reliable.
- A successful transcript is inserted into the focused field.
- If focus moves away before transcription completes, the transcript is not inserted into an old field.
- Native inputs and textareas preserve existing text, replace only the selected range, and place the caret after the transcript.
- Moving the caret within the same input while transcription is pending does not change the captured insertion point.
- Controlled input and textarea fixtures retain inserted text after their normal event-driven state update.
- Each insertion dispatches one `beforeinput`, one `input`, and one `change` event; no duplicate events are observed.
- Focus returns to the intended field after insertion.
- Contenteditable fields replace an in-field selection or insert at the saved caret, preserve surrounding content, and treat transcript markup as plain text.
- Contenteditable insertion keeps surrounding elements and formatting intact when the caret is nested inside formatted markup.
- Leading or trailing transcript whitespace does not create duplicated spaces next to existing text.
- Nested `contenteditable` fields resolve to one editable host and receive one transcript and one editing-event sequence.
- A supported field added after page load shows one microphone control and accepts a transcript without a full-page scan.
- Replacing or detaching the original field during transcription cancels extension-side work, inserts nothing into the replacement, and shows a safe field-unavailable message.
- Making the original field hidden, readonly, disabled, or unsupported during transcription prevents insertion and removes the stale microphone control.
- Shadow DOM inputs on the local QA page should show the microphone icon button and accept inserted text.
- Canvas-based editors and custom widgets without a standard writable DOM field are unsupported.
- Record actual results before claiming named-site compatibility; where practical, test Gmail compose, Outlook Web compose, a controlled form, and a contenteditable chat or note editor.
- Repeat the core input, textarea, contenteditable, focus-change, and excluded-field smoke tests in current Chrome and Brave builds.
- xAI API keys never appear in extension files, browser console output, or network calls from the page.
- Site preferences, origins, URLs, hostnames, page content, and field metadata never appear in backend transcription requests.

## Store Presentation

- `store/listing.md` uses user-friendly copy for the public listing and technical language for reviewer notes.
- `site/index.html` opens locally and presents the current product without unsupported features.
- `store/assets/screenshot-dictation-1280x800.png`, `store/assets/screenshot-settings-1280x800.png`, and `store/assets/promo-small-440x280.png` match the current Dictozy name, icon, and popup.
- The Chrome Web Store description does not imply background recording, direct xAI calls from the extension, or features that are not implemented.

## Published Extension Smoke QA

- Install Dictozy from the Chrome Web Store.
- Confirm extension ID `folpeencabfejhjokmldikaelonphmma`.
- Confirm version `0.1.8` after the per-site controls release is installed.
- Confirm English is selected by default, then save and smoke-test Automatic and one explicit non-English language.
- Run a short dictation on a supported HTTPS text field.
- Confirm recording starts only after clicking the visible microphone button or pressing the assigned browser shortcut.
- Confirm the shortcut stops recording and cancels pending transcription without late insertion.
- Confirm transcript insertion and focus behavior.
- Confirm unsupported and sensitive fields are ignored.
- Confirm the global/site precedence matrix: global on + site on works; global on + site off is disabled; global off always disables dictation.
- Disable and re-enable the current site, confirm persistence after reload, then reset site preferences and confirm unrelated settings remain.
- Open the popup on a restricted Chrome page and confirm the safe unavailable state.
- Confirm editable ARIA textboxes work while bare non-editable ARIA textboxes remain ignored.
- Confirm extension network traffic goes only to `https://voice-dictation-extension.onrender.com`, never directly to xAI.

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
- For local backend checks, use the direct smoke-test script; the production extension is intentionally pinned to the deployed backend.

For a deployed backend, use [deployment-smoke-test.md](deployment-smoke-test.md).
