# Phase 2 manual acceptance

Status: **Pending human execution.** Automated unpacked-extension tests used Chromium's synthetic
microphone and a stubbed backend. They do not verify a physical device, spoken recognition,
Chrome permission dialogs, a screen reader, live editors or the Store-installed build.

## Load and run

1. Check out `codex/phase-2-first-use-feedback`. In Chrome, open `chrome://extensions`, enable
   Developer mode, and Load unpacked using the repository's `extension/` directory (or reload
   this existing unpacked extension). Reload any test webpages after updating it.
2. Open the Dictozy popup and select **Try dictation**. This opens the bundled practice page;
   no web server or account is needed. Close it whenever desired and revisit from the popup.
3. The practice page uses the existing fixed Dictozy backend. A real recording transmits audio
   for transcription; use a non-sensitive phrase and an approved test environment. Starting
   local FastAPI does not redirect this extension. No backend deployment is needed for local UI
   inspection. Use the automated suite below for isolated, provider-free transcription fixtures.

## Concise checklist

Record date, OS, Chrome version, extension revision, microphone and outcome for each item.

- [ ] **No automatic recording:** opening practice or choosing Try dictation must not prompt or
  capture. Try focuses the labeled field. Activate its microphone explicitly, allow permission,
  say “Remember to water the plants,” and select Stop. Confirm the returned text appears only in
  that field. Ordinary provider wording may vary.
- [ ] **Keyboard:** from the focused practice field, Tab to the microphone and press Enter.
  Recording returns focus to the editor. Tab reaches its Stop icon; another Tab reaches the text
  Stop button, then Discard. This recording-only Tab path also works on ordinary pages unless
  the editor consumes Tab. Shift+Tab from the icon returns to the field. Use Space/Enter to stop or discard. Confirm Undo reverses successful
  insertion. Confirm the displayed shortcut matches Chrome's assignment, including a remapped
  or unassigned shortcut. Test the real OS shortcut on practice and a supported webpage.
- [ ] **Feedback:** recording, elapsed seconds, remaining seconds and Stop/Discard are visible.
  Speak and pause to inspect subtle activity feedback. A quiet indicator does not establish that
  speech recognition works. Stop shows processing/transcribing, then success or a useful error.
  Default remains 10 seconds; a 30-second setting automatically stops at its limit.
- [ ] **Discard and lifecycle:** discard by mouse and keyboard; no transcript or recovery should
  appear. Start again, switch tabs or focus a password/unsupported field on the local QA page;
  capture must stop. Disable Dictozy in the popup and confirm practice and webpages respect it.
- [ ] **Preserve writing:** select a word in an input, textarea and editable fixture, dictate,
  then Undo. Repeat while editing the field during transcription: existing edits must remain,
  and recovery must explain why insertion was refused. Moving to another field must never
  redirect a completed transcript into it.
- [ ] **Recovery:** Tab/Shift+Tab to its Copy and Discard controls; use Enter/Space. Check a valid
  copy by pasting into a disposable field. Confirm generic confirmation, no transcript shown in
  the notice, and no automatic paste. Test clipboard denial/retry, 60-second expiry and switching
  tabs. Expiry must not steal focus from an editor; if a recovery button itself had focus, return
  to the last usable field. Copy already handed to the browser may complete after Discard/expiry.
- [ ] **Permission/error/help:** deny microphone permission and verify understandable guidance,
  a usable retry and accessible troubleshooting. Check OS microphone settings when appropriate.
  No recording should begin merely by opening Help, Privacy or shortcut settings.
- [ ] **Accessibility:** test with the actual screen reader you use. Check one concise announcement
  for state changes and recovery outcomes, with no continuous timer/activity announcements.
  Verify labels, visible keyboard focus, 200%/400% zoom, reduced motion and narrow viewport layout.
  Reading the timer on demand should remain possible.

For fixture fields, run from the repository root:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/qa/manual-test-page.html` with the unpacked extension enabled.
Named third-party application certification belongs to Phase 3 and has not been performed here.

## Repeat automated validation

From the repository root, with project Node and backend development dependencies installed:

```bash
npm test
npm run test:browser
PYTHON_DOTENV_DISABLED=1 PYTHONDONTWRITEBYTECODE=1 XAI_API_KEY='' APP_ENV=local backend/.venv/bin/python -m pytest -q -p no:cacheprovider
npm run test:site
python3 scripts/package_extension.py --check-only
python3 scripts/validate_store_assets.py
python3 scripts/validate_site.py
backend/.venv/bin/python -m pip check
```

Use `npm ci`, `npx playwright install chromium` and the backend README setup if dependencies are
missing. The browser runner starts the local fixture server. Provider calls are mocked; unpacked
integration tests also block the production hostname as a fallback.

## Release gates remain open

- Actual Render proxy, worker, replica and ingress configuration verification.
- Aggregate usage protection across restarts and multiple instances.
- Physical microphone and manual installed-extension acceptance.
- Real-world editor compatibility.
- Production logging and deployment validation.
- Coordinated publication of revised privacy disclosures.

Passing these local tests does not authorize deployment, infrastructure changes, Store upload,
merging into production or starting Phase 3.
