# Dictozy Chrome Extension

This folder contains the Chrome extension that adds Dictozy's microphone control to supported web fields.

The extension uses Manifest V3 with plain JavaScript, content scripts for page interaction, a focused popup UI, and audio recording after explicit user action.

## Current State

Dictozy detects supported fields, shows a microphone button beside the active field, and records a short audio clip after an explicit microphone-button click or assigned browser shortcut. The clip and selected language-formatting code are sent only to the fixed Dictozy production backend, and the returned transcript is inserted into the active field. The shortcut and visible control share the same start, stop, cancellation, retry, and stale-operation protections. The extension does not call xAI directly.

`dictation-lifecycle.js` owns privacy-safe request IDs, stale-operation rejection, cancellation signals, conservative local microphone-signal inspection, and bounded microphone-failure classification. `site-preferences.js` validates exact HTTP/HTTPS origins and the bounded, explicitly disabled-origin list. `content.js` remains responsible for page fields, the visible control, recording, insertion, and accessible status UI. The service worker classifies network and backend failures without exposing response bodies or exception details. Runtime code has no third-party JavaScript dependencies.

Supported fields include normal text inputs, textareas, contenteditable elements, and ARIA textboxes that are actually editable, such as `[role="textbox"][contenteditable="true"]`. A bare `role="textbox"` does not provide a standard writable editing mechanism and is ignored.

Form values are updated through native input and textarea setters followed by one standard editing-event sequence. Contenteditable transcripts are inserted as plain text at the current saved selection. Delegated focus handling supports fields created after page load, while a lightweight observer checks only fields Dictozy is actively tracking so detached, hidden, readonly, disabled, or otherwise unsupported targets cannot receive late text.

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
- Current-site state: supported sites are enabled by default. Turning off `Enable on this site` stores only that exact origin in `chrome.storage.local`; paths, queries, and fragments share the preference, while subdomains and non-default ports remain separate.
- Keyboard shortcut: the `toggle-dictation` command suggests `Ctrl+Shift+Y` by default and `Command+Shift+Y` on macOS. Chrome may leave it unassigned after a conflict; the popup shows the current assignment and opens `chrome://extensions/shortcuts` for remapping.
- Language formatting: defaults to English. Automatic asks the backend to omit provider language and formatting parameters; an explicit choice sends its language code so xAI can guide written formatting for numbers, currencies, and units. It is not a guarantee of improved speech recognition.
- Recording limit: defaults to 10 seconds and is clamped between 1 and 30 seconds.
- Reset Site Preferences: removes only explicitly disabled origins and leaves the global enabled state, recording limit, language formatting, and keyboard shortcut unchanged.

The release build pins transcription to `https://voice-dictation-extension.onrender.com/api/transcribe`. Popup messages, page data, and stored settings cannot select another endpoint. xAI remains backend-only.

## Deployed Backend

1. Deploy the FastAPI backend behind HTTPS at the production Render origin packaged in `config.js`.
2. Open `https://voice-dictation-extension.onrender.com/health` and confirm `{"status":"ok"}`.
3. Open the extension popup and choose the language-formatting preference to test.
4. Run a short dictation test on a non-sensitive text field.
5. Confirm extension traffic goes only to the packaged production backend and never directly to xAI.

Maintainers can also use `backend/scripts/smoke_test.py` for direct health and provider-path checks.

## Manual Test

Backend setup:

```bash
cd "/Users/fk/Documents/Projects/voice-dictation-extension/backend"
cp .env.example .env
```

Configure the backend environment as documented in `../backend/.env.example`, then run:

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --no-access-log
```

The production extension does not connect to localhost. Test a local backend directly with `python scripts/smoke_test.py http://127.0.0.1:8000 --allow-http`; mocked extension browser tests exercise the fixed production endpoint without contacting production.

Extension setup:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Load or reload this `extension/` folder as an unpacked extension.
4. Open the extension popup and confirm the global and current-site controls are enabled, then confirm English language formatting and the recording limit.
5. Confirm no backend URL, health-check, or Advanced Backend control appears.
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
27. On the local QA page, replace selected text in the normal input, textarea, and contenteditable fixtures; confirm only the selection changes and the caret follows the transcript.
28. Test the controlled input and textarea fixtures; confirm each keeps the transcript and reports one `input` and one `change` event.
29. Add a dynamic field after page load and confirm it receives one microphone control and one transcript.
30. During a pending transcription, replace the dynamic field or make the target readonly; confirm no transcript is inserted and a safe field-unavailable message appears.
31. Disable the current site and confirm the microphone control disappears, the shortcut is ignored, active recording or transcription is cancelled, and no late transcript is inserted.
32. Re-enable the current site, refocus a supported field, and confirm normal behavior returns.
33. Open the QA page once through `127.0.0.1` and once through `localhost`; confirm their exact-origin preferences remain independent.
34. Reset site preferences from the settings panel and confirm unrelated settings remain unchanged.
35. Open the popup on `chrome://extensions` and the Chrome Web Store; confirm the current-site control shows a safe unavailable state while global settings remain usable.
36. Repeat the start, stop, cancel, and successful insertion flow with the visible click controls.

For structured QA, use the checklist and local test page in `../qa/`.

## Troubleshooting

- If the microphone button does not appear, reload the page after loading or reloading the extension.
- If the microphone button is missing on one site, confirm both the global and current-site toggles are enabled. The current-site toggle is intentionally unavailable on restricted Chrome pages.
- If the keyboard shortcut does not work, check the popup for `Not assigned`, then use its keyboard icon to assign or remap the command in `chrome://extensions/shortcuts`.
- If Chrome does not prompt for microphone permission, test on `http://127.0.0.1` or an HTTPS page.
- If the button stays on Transcribing, click the cancel icon and retry with a short recording. The extension also applies a response timeout.
- If an error includes a short `Reference`, use it to locate the matching privacy-safe backend request log. Do not share audio, transcript text, or field contents in support reports.
- If Dictozy reports no microphone signal, confirm the selected Chrome input is active and not muted. Quiet or unsupported signal-inspection cases continue to the backend rather than being aggressively rejected.
- If transcription fails, check the FastAPI terminal logs first. The extension intentionally shows safe, generic error messages.
- If the production backend is unavailable, open its `/health` URL directly and check the hosting provider logs, TLS certificate, and CORS configuration.
- Canvas-based editors and custom widgets without a standard writable DOM input or contenteditable surface remain unsupported.


## Phase 1 safety behavior (unpublished)

- Only trusted mouse/keyboard clicks or extension commands can activate recording. Page scripts
  cannot start recording by dispatching a click. Enter and Space on the microphone use the retained
  supported field; successful insertion restores focus and retains native Undo.
- Unsafe focus, a hidden tab, page exit, loss of the recording control, or loss of window focus
  during active recording discards the recording and stops tracks. Pending permission results
  and recorder events are tied to their originating session and cannot revive cancelled work.
- Field contents and rich-text selection boundaries are captured temporarily in memory and
  rechecked before insertion and after `beforeinput` page handlers. Caret-only movement remains
  supported; intervening text/markup edits cause refusal rather than stale-offset replacement.
- When a completed result cannot be safely inserted, a small Copy/Discard notice retains one
  transcript per page in memory for at most 60 seconds. It never displays transcript content or
  inserts into a different field. Copy requires an explicit trusted action and browser clipboard
  availability; failure leaves the result available until expiry. Copy/discard/expiry/new recording,
  disable, hidden tab and page exit clear it. Deliberately cancelled operations have no recovery.
- No new permissions, storage keys, preferences, language options or duration changes were added.
  Full recovery UX, timers, onboarding, editor expansion and longer clips remain later phases.

See [Phase 1 manual acceptance](../qa/phase-1-acceptance.md) and
[implementation tracking](../docs/IMPROVEMENT_ROADMAP.md). `npm run test:browser` includes ordinary
page tests with Chrome/media mocks and separate unpacked-MV3 Chromium tests using a synthetic
microphone and stubbed backend. Neither establishes physical-microphone or named-site compatibility.

## Phase 2 first use and feedback (unpublished)

Open **Try dictation** in the popup to revisit the optional bundled practice page. Its Try action
focuses a practice textarea; microphone capture still requires explicit activation of the ordinary
microphone control or assigned shortcut. The page reuses the existing engine and backend, respects
the master toggle, shows the assigned shortcut, and includes permission/privacy/help guidance.
It does not add an install-time tab, onboarding tracking, permissions, account or stored practice text.

During recording, the existing status area shows elapsed/remaining seconds, a small current-activity
indicator, and Stop/Discard buttons. Timing uses the existing recording loop and activity uses the
existing sampler. The default/max remain 10/30 seconds. Status announcements are separate from the
non-live timer/activity text. While recording, Tab from the editor reaches its Stop icon, then Stop
and Discard; Shift+Tab from the icon returns to the editor. Editor handlers that prevent Tab are
respected. Keyboard focus returns to the original editor when stopping or discarding.

Recovery remains one in-memory result per page for 60 seconds. It now explains refusal, confirms
Copy/Discard/expiry, supports retry after clipboard denial, and returns focus only when removing a
focused recovery control. It never automatically pastes or rebases stale offsets. A late copy result
cannot remove a newer result; a clipboard operation already handed to the browser cannot be revoked.

See [Phase 2 manual acceptance](../qa/phase-2-acceptance.md) and the
[Phase 2 report](../docs/PHASE_2_REPORT.md). Physical microphone, screen-reader, live-editor and
production validation remain open; bundled Chromium/synthetic audio is a separate test method.

## Phase 3 compatibility validation (unpublished)

Focus resolution follows nested open shadow roots. Recording ends immediately when the target loses
focus to another editor or unsafe target, while movement within one rich editor and to DICTOZY's
controls remains valid. Iframe and closed-shadow editors are still unsupported.

The microphone checks nearby page controls before choosing a position and retains that side during
recording/transcription. This avoids the observed ChatGPT native-voice-button collision, but does
not guarantee collision-free placement in every crowded layout. No site-specific permissions or
framework integrations were added. Recording remains 10 seconds by default, at most 30 seconds.

See the [dated compatibility matrix](../docs/COMPATIBILITY_MATRIX.md) and
[Phase 3 acceptance procedure](../qa/phase-3-acceptance.md). Local native-browser tests cover open
shadow fields, native Undo, rich DOM replacement, iframe exclusion, Permissions Policy and repeated
insert/discard sessions. Their synthetic audio and stubbed backend do not establish speech accuracy,
production latency or full Gmail/ChatGPT/Notion/Outlook/WhatsApp compatibility.
