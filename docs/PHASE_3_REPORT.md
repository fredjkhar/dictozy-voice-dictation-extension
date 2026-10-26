# Phase 3 compatibility and daily reliability report

Date: **2026-10-26** (America/Toronto). Branch: `codex/phase-3-compatibility-reliability`.
Accepted Phase 2 base: `bbdf9a2`.
Implementation commits: `066833e` (editor focus/placement and regressions),
`14eda7a` (test startup and repeated-session evidence).

**Local implementation and automated validation are complete. Full live-application and physical
microphone acceptance are incomplete. This is not a production-readiness or compatibility certification.**
The user chose to leave login-dependent editor checks pending. Phase 4 has not begun.
The initial report below is followed by recovery and accessibility updates; the latest full
automated coverage is **310 passing tests**, with separately labeled human/agent evidence and
per-suite rerun scope in the latest follow-up.

## Outcome

- Reproduced and fixed nested open-shadow activation and focus-cancellation gaps.
- Found DICTOZY overlapping ChatGPT's native voice button in a live Chrome check, added a generic
  nearby-control placement correction, and verified the corrected idle geometry on the live page.
- Added 13 automated tests: 12 unpacked-extension compatibility cases and one repeated-session case.
- Initial completion suites: **290 passed, zero failures or skips**: 54 unit, 120 browser, 95 backend, 21 website.
  Browser tests comprise **102 mocked workflows and 18 unpacked MV3 tests with synthetic audio**.
- Created a dated five-application matrix and a content-free manual pilot procedure/template.
- Preserved **10-second default / 30-second maximum**, existing permissions, shortcuts, settings,
  insertion safeguards, native Undo paths and one-result, 60-second memory-only recovery.

## Baseline and test-runner investigation

The accepted Phase 2 commits were present on `codex/phase-2-first-use-feedback`. A dedicated Phase 3
branch was created; the unrelated untracked `SEO Report.pdf` was preserved.

Initial unit 54/54, backend 95/95 and website 21/21 suites passed. The initial browser baseline was
105 passed / 2 failed, with failures inside `launchPersistentContext` setup before product assertions.
An isolated parallel run reproduced one startup failure among five cases. A clean sequential repeat
passed 10/10. A separate overlapping runner attempt lost its shared localhost server; those two
connection-refused results were orchestration failures and were not counted as product passes.

The existing installed-extension file now executes its independent cases in one worker. New native
files use the same per-file mode. Test assertions and existing timeouts were not weakened; later
cases still execute if one fails. This addresses expensive parallel browser startup without enabling
blind retries. The final standard full browser command passes with this configuration.

## Corrections and technical decisions

### Open-shadow focus and recording lifecycle

The page's composed event path could find a nested open-shadow editor, while activation followed
only one shadow root. The mic appeared but could not start. Focus resolution now follows the complete
active chain through open roots; closed roots remain inaccessible and unsupported.

Focus events within one shadow host can be suppressed at document level. Existing safety polling
stopped unsafe recording, but the control could remain attached to the old field. A session-bound
listener on the recording target now cancels synchronously when focus leaves for a different or
unsafe editor. Cleanup removes this listener with the other recording resources. Cancellation hides
a stale mic when no supported target is focused. Existing polling still protects against DOM changes.

Independent review caught an edge case introduced by that listener: focus moving between focusable
descendants of the same rich editor unnecessarily cancelled recording. A native regression reproduced
it before correction. The listener now permits movement within the retained supported editor and to
DICTOZY controls. Tests verify successful Stop/insertion/Undo afterward, alongside immediate unsafe
and other-editor cancellation and clean re-recording.

### Adjacent native controls

In the live logged-out ChatGPT composer, the old 42×42 DICTOZY control substantially overlapped the
app's 44×44 voice button. A local narrow-textarea/toolbar fixture reproduced this geometry.

Placement retains the existing right-side preference, then considers left, above and below when
bounded hit tests find nearby interactive page controls. It uses no application-specific selectors
or page-wide element scan. The chosen side stays fixed through recording/transcription so a changing
toolbar does not make Stop jump between sides. Positions remain viewport-clamped.

After Chrome's Details view confirmed this repository's extension source folder, the extension was
reloaded and the live ChatGPT page refreshed. The DICTOZY control moved above the composer; rectangles
no longer intersected and visual inspection showed both controls. This is an **idle-layout pass**,
not a live dictation pass. Very crowded layouts, small unsampled overlaps and controls hidden behind
closed shadow roots remain limitations of this bounded heuristic.

### Duration and performance

Recording limits stay at 10/30 seconds. The backend's 60-second decoded-audio limit is a validation
ceiling, not evidence for longer capture. A nominal 60-second timer can produce audio beyond that
ceiling; real latency, cutoff frequency, correction effort and cost exposure also need pilot data.
No streaming, infrastructure, provider or backend configuration changes were made.

The repeated-session test alternates five selected-text insertions (textarea/rich text) with five
explicit discards, verifying native Undo, unchanged unrelated fields, visible controls, clean state,
no spurious recovery and exactly five stub requests. A numeric-only attachment measures trusted Stop
click to the first insertion input event on the same monotonic clock.

One recorded focused run had **5 samples, median 112 ms and nearest-rank p95 120 ms**, with a deliberate
**100 ms backend stub delay**. These are local harness timings, not actual speech/provider latency.
The five-sample p95 is simply the largest sample and is not a service-level estimate. These ten
controlled sessions are not the human pilot and do not establish the proposed 95% completion target.

## Initial live application evidence

The [dated compatibility matrix](COMPATIBILITY_MATRIX.md) contains methods, environments, outcomes
and limitations. Gmail, ChatGPT and Notion are provisional priorities representing email, prompts
and notes; there is no customer usage evidence establishing their rank.

| Application | Actual browser-automated observation | End-to-end acceptance |
|---|---|---|
| Gmail | New empty draft body is a top-document rich textbox; DICTOZY idle mic visible; no recipients or text entered | Pending |
| ChatGPT | Logged-out textarea detected; native-button overlap reproduced and corrected idle placement rechecked | Pending; authenticated variants also untested |
| Notion | Marketing/login reached; no authenticated notes editor | Pending by user direction |
| Outlook | Mail URL redirected to marketing/sign-in; no compose editor | Pending by user direction |
| WhatsApp Web | Device-link/QR screen; no message composer | Pending by user direction |

These checks used the user's existing Chrome and an unpacked extension, not injected content-script
mocks. The running Chrome version was not verified, so that environment record is incomplete.
Source folder and local extension reload were verified. No microphone was activated, no provider
request was made by these checks, and no email/message/prompt was sent. The empty Gmail body was
verified unchanged. Temporary inspection tabs were closed. No existing draft or note was edited.

At the initial report, no human physical-microphone, physical-shortcut, screen-reader or full
live-editor acceptance had been performed. Subsequent user reports are recorded in the update
below and compatibility matrix. Existing user-entered practice text was not interpreted as test evidence. The final
same-editor-focus refinement was verified locally; live recording of that refinement is pending.

## Initial automated validation

Environment: macOS 15.6.1; Node 22.13.1; Python 3.14.7; Playwright 1.61.1;
bundled Chromium/Chrome for Testing 149.0.7827.55. No production credentials were used.

| Command / check | Final result | Method |
|---|---:|---|
| `npm test` | 54 passed | JavaScript unit |
| `npm run test:browser` | 120 passed | 102 mocked + 18 unpacked/native-browser cases; synthetic microphone and stub backend |
| Isolated local pytest command below | 95 passed | Backend tests; provider mocked where applicable, decoded generated-audio fixtures |
| `npm run test:site` | 21 passed | Local website browser tests |
| Extension package `--check-only`, Store assets, site validation | Passed | Validation only; no ZIP publication/upload |
| Python `pip check`, changed JavaScript syntax, `git diff --check` | Passed | Dependency/syntax/whitespace |

Focused new compatibility tests passed 12/12. The daily-reliability case passed with all ten internal
cycles. Its 60-second test budget accommodates ten native capture sessions; it is not a product
timeout or a performance threshold. Browser and website suites ran sequentially to avoid output
directory interference. No test was deleted or weakened to obtain these results.

New compatibility coverage includes one/two-level open-shadow text selection and Undo; open-shadow
rich selection and Undo; same-editor descendant focus; password/other-field cancellation and retry;
closed-root exclusion; identical-HTML node replacement and recovery; same/cross-origin iframe
exclusion and cancellation; actual browser Permissions Policy denial; and control collision/stability.

## Files changed

| Files | Purpose |
|---|---|
| `extension/content.js` | Nested focus, session focus listener/cleanup, control placement |
| `extension/tests/browser/compatibility.spec.js` (new) | 12 local native-browser compatibility regressions |
| `extension/tests/browser/daily-reliability.spec.js` (new) | Repeated sessions and content-free local timing attachment |
| `extension/tests/browser/installed-extension.spec.js` | Per-file browser startup serialization |
| `docs/IMPROVEMENT_ROADMAP.md` | Phase approvals, tracking and open gates |
| `docs/COMPATIBILITY_MATRIX.md` (new), this report | Dated evidence and honest limits |
| `qa/phase-3-acceptance.md`, `qa/phase-3-pilot.csv` (new) | Manual protocol and empty metrics template |
| `README.md`, `extension/README.md`, `store/changelog.md` | Unpublished changes, testing instructions and limitations |

No manifest, dependency, backend, secret, deployment or infrastructure files changed. Nothing was
deployed, published or merged to production. No new browser permission, telemetry, persistent
transcript storage, account or paid service was introduced.

## Local reproduction and concise manual checklist

From the repository root:

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

For optional numeric test attachments, run the focused daily-reliability file with Playwright's
`--reporter=json` and inspect `local-synthetic-stubbed-latency-aggregates`. Keep fixture results
separate from human/production measurements.

For local UI inspection, serve the repository with `python3 -m http.server 4173 --bind 127.0.0.1`,
reload the unpacked extension and open `/qa/manual-test-page.html`. **Manual Stop still uses the
fixed production backend; starting local FastAPI does not redirect it.** The automated suite
deliberately stubs responses and blocks that host. Use only non-sensitive phrases in an approved
human transcription environment.

1. Try practice, explicitly allow the microphone, speak a synthetic phrase and Stop; check native Undo.
2. Repeat in fresh Gmail/ChatGPT/Notion test fields without sending or sharing anything; check caret
   and selected-text insertion, formatting and Undo. Record exact app/browser/build/environment.
3. Reach Stop/Discard by keyboard. Confirm readable timing/activity and immediate discard on tab
   switch, unsafe focus or target removal; check the browser's microphone indicator releases.
4. With a delayed test response, edit the field before completion. Confirm preservation and explicit
   recovery; test Copy/Discard/clipboard denial and 60-second expiration without focus theft.
5. Execute the screen-reader/zoom/reduced-motion checks and the proposed 60-trial pilot in the
   [full procedure](../qa/phase-3-acceptance.md). Record counts/timings only, not private speech/text.

## Remaining gates and next step

| Gate | Status / required evidence |
|---|---|
| Actual Render proxy, worker, replica and ingress configuration | Open; deployment-side verification not performed |
| Aggregate usage protection across restarts/multiple instances | Open; existing budget remains process-local, not a durable spending cap |
| Real microphone and human installed-extension acceptance | Open; limited human walkthrough passes supplement automation, but full acceptance and pilot remain incomplete |
| Real-world editor compatibility | Open; limited Gmail/ChatGPT speech/Undo/cancellation/recovery evidence; fuller workflows and remaining applications pending |
| Production logging and deployment validation | Open; local tests do not validate production behavior |
| Coordinated publication of revised privacy disclosures | Open; no publication authorized/performed |

Additional limits: iframe/closed-shadow editors remain unsupported; same-host programmatic idle
focus can require a click/key event; frequent rich DOM replacement can conservatively require
recovery; fallback editing paths cannot guarantee native Undo in every editor; the placement
heuristic cannot guarantee an unobstructed location on every page. Physical screen-reader behavior,
OS shortcut conflicts and provider accuracy remain unmeasured.

Recommended next step: review this local Phase 3 work, then complete the human acceptance/pilot and
login-dependent editor checks. Keep Phase 4 deferred and require separate release authorization.

## Acceptance update — 2026-10-25

The user accepted local Phase 3 changes and reported successful physical-microphone Gmail and
ChatGPT insertion/Undo, ChatGPT Discard and tab-switch cancellation, Gmail selected-word
replacement/Undo and changed-content Copy recovery, and Command+Shift+Y start/stop with Undo.
These are **Passed — user reported**, with details and limits in the [matrix](COMPATIBILITY_MATRIX.md).
They do not establish the 60-trial pilot target or close a release gate.

The user then authorized autonomous remaining tests. They exposed a recovery keyboard-focus bug:
after editing Subject, Tab could pass through the microphone before reaching Copy/Discard, leaving
recovery's remembered focus on the original body. Both native keyboard tests failed before the
fix. `extension/content.js` now updates only recovery's return-focus field whenever it remembers
a supported field. It does not change insertion targets or selections. Expiry still moves focus
only if a removed recovery control held it, preserving typing in another editor.

New `extension/tests/browser/recovery-acceptance.spec.js` adds three tests using the actual unpacked
extension, synthetic microphone, native clipboard/keys and a deferred backend stub with production
blocked. They cover edits made after Stop while a response is pending, actual minute-long expiry
(visible at 55s, removed after 61s, observed lifetime at least 59.9s), keyboard Copy followed by
explicit paste, and keyboard Discard. All preserve the body and intended Subject focus. A host
pause interrupted an initial expiry run; `caffeinate -i` prevented idle sleep for the clean reruns.
No clock advancement, test deletion, timeout weakening or product duration change was used.

Final full validation: **293 passed, zero failures/skips** — 54 unit, 123 browser (102 mocked,
21 unpacked/synthetic), 95 backend and 21 website. Package check-only, asset/site validation,
dependency and whitespace checks also passed. Independent review found no blocking issue in the
focus fix. Browser and website suites ran sequentially.

In the actual Chrome UI, version **156.0.8078.47 arm64**, macOS **15.6.1 (24G90)**, and unpacked
source were verified. ChatGPT Enter activation and Space Discard passed with a temporary generated
audio stream and intercepted content-script messaging: fixture preserved, zero transcription
messages, zero remaining generated tracks. The overrides were restored before reloading the fix.
Opening optional practice and selecting Try focused its field without starting recording or
showing a permission prompt; inline troubleshooting was accessible. These are agent-operated
live-editor-stubbed/UI checks, not physical speech or screen-reader evidence.

Live Gmail expiry subsequently passed joint human/agent execution. Chrome's debugging interface
prevented a reliable response override after reload, so the user supplied a fresh spoken result.
The agent observed recovery, put focus in Subject, left the notice untouched, then confirmed its
expired announcement/removal, unchanged body and preserved Subject focus. A native X keypress
without clicking landed in Subject. The final check was approximately 66 seconds after first
observation, not a precise measurement of the expiration boundary. An earlier already-copied
attempt was excluded. No email was sent. Original tabs were retained; the extra expiry fixture/tab
were cleaned up. At 200% zoom, the idle mic remained within the viewport after reopening Gmail's
automatically minimized composer. At 400%, compose could not be reopened through the tested
control, so DICTOZY layout there remains unvalidated. Original 100% zoom was restored.

The focus correction and three regression tests are committed as `8753628`. Clipboard denial/retry
has mocked coverage only. At this recovery-fix checkpoint, physical 10/30-second speech was still
pending; see the follow-up below. Screen-reader use, fuller editor acceptance, login-dependent apps
and pilot measurements remain pending. All six release gates above remain open.

Follow-up files: `extension/content.js`, the new recovery spec, `qa/phase-3-acceptance.md`,
`docs/COMPATIBILITY_MATRIX.md`, `docs/IMPROVEMENT_ROADMAP.md`, this report and the unreleased changelog.
No backend, manifest, dependency, production configuration, secret or infrastructure changes.

## Physical duration follow-up — 2026-10-25

The user approved fix `8753628` and authorized 10- and 30-second physical-microphone tests in
ChatGPT. These used the same L2 Chrome/macOS environment, the repository's unpacked extension,
English formatting and the existing production backend/xAI route. No generated audio, response
stub or message override was used for these checks. Only the disposable fixture and harmless
spoken test phrase/counting were used; no audio or returned transcript was saved in the test record.

| Check | Evidence and outcome |
|---|---|
| 10-second automatic stop | **Passed — joint human speech/agent observation.** Agent started recording after the user's Ready reply; UI polling at approximately 500 ms intervals observed Recording → Transcribing → Success without a manual Stop. The interval from first observed Recording to first observed Transcribing was about 9.98 seconds. Elapsed/remaining feedback progressed to 10s/0s; recording controls remained visible at every sample and activity was indicated. Original fixture preserved, text appended, and one native Undo restored the exact fixture |
| First 30-second attempt | **Interrupted; excluded from automatic-stop acceptance.** Observations ended on idle at about 23 seconds, before the configured limit. The user confirmed switching windows/tabs or changing focus. The user then independently started another recording, explaining the later completed timer and appended text. No complete network/track trace was collected for the interrupted attempt |
| Second 30-second attempt | **Passed — user reported, with agent verification afterward.** User confirmed automatic stop at 30 seconds without Stop, visible controls throughout, successful insertion and Chrome's microphone-use indicator turning off. Agent observed idle with a 30s/0s timer, preserved fixture prefix and appended text, then verified one native Undo restored the exact fixture. This run was not continuously timed by the agent |
| Preference restoration | **Passed — agent UI verification.** Original 10-second setting restored through the popup, saved value confirmed; English formatting preserved. Composer left idle with its original fixture; no message sent |

UI polling measures observed state transitions, not sample-accurate decoded audio duration,
provider latency or physical device release. Microphone-indicator release was confirmed by the user
for the second 30-second run; it was not independently confirmed for the 10-second run. These two
limited completion checks do not establish recognition accuracy, a pilot completion rate, broad
editor compatibility or readiness to raise duration limits. The interrupted trial is kept separate.

This follow-up changes documentation only: roadmap, compatibility matrix, this report and the
manual protocol. At this duration-check checkpoint, the latest full automated result was
**293 passed, zero failures/skips** from the recovery-fix validation; no new automated test run is
claimed for those manual trials.
The product remains at **10 seconds default / 30 seconds maximum**. All six release gates remain
open, including fuller human acceptance, screen-reader/zoom work, login-dependent editor checks
and pilot evaluation. No deployment, publication, infrastructure change or Phase 4 work.

## Enlarged-layout and accessibility follow-up — 2026-10-25

Actual L2 Chrome zoom was used for the ChatGPT checks below. They were short installed-extension
microphone captures followed by Discard, with no requested speech, manual Stop or Send. They are
not transcription/recognition tests. Network suppression and physical device release were not
independently traced. The existing 10-second setting and original fixture were preserved.

| Check | Result / evidence |
|---|---|
| ChatGPT 200% page zoom | Idle mic and recording mic/panel/timer/activity/Stop/Discard all fit the 600×456 CSS viewport. Visual inspection confirmed readable controls. Tab reached microphone then Stop; mouse Discard returned to idle with the fixture unchanged. Full keyboard Discard was tested separately at 400% |
| ChatGPT 400% page zoom | All recording controls fit the 300×228 CSS viewport. Tab reached microphone → Stop → Discard; Space returned to idle and preserved the fixture. **Partial layout acceptance:** the panel obscures part of the composer even though controls remain readable/reachable. This does not satisfy the protocol's broader no-editor-occlusion check |
| Gmail fullscreen compose, 200% | Idle mic was within the 600×456 viewport. The recording attempt became **Blocked/inconclusive**: browser control timed out on `Page.getFrameTree`; native accessibility and screenshot states disagreed, and the page stopped responding. Discard was attempted but its effect could not be reliably verified. No recording/cancellation pass is claimed, and no extension-specific cause was established |
| Restore test environment | ChatGPT restored to 100%, idle with original fixture. Gmail restored to 100%; ended the stalled debugging connection and closed the unresponsive tab, leaving a working fresh Gmail tab. A search restricted to drafts and the unique harmless layout phrase found no matching draft. Existing unrelated drafts were not edited. No message sent |
| Actual VoiceOver spoken output | **Pending.** Listening handoff prepared with the user only needing to report what is spoken. No VoiceOver pass is inferred from accessible names, ARIA attributes or automated keyboard input |

`extension/tests/browser/dictation.spec.js` adds two targeted tests at 300×228 CSS pixels. They
check both axes of recording/recovery panel fit, center hit targets, keyboard traversal/Discard,
focus restoration, clipboard-denial reflow, transcript absence from the DOM, reduced-motion styling
and polite/atomic status versus non-live timer/activity semantics. Both passed; no application
source fix was needed for these local fixtures. These are **mocked_browser** tests, not actual
Chrome zoom, Gmail, physical keyboard or VoiceOver evidence.

Full rerun: **295 passed, zero failed/skipped** — 54 extension unit, 125 browser (104 mocked,
21 unpacked MV3 with synthetic audio/stubbed transcription), 95 backend, 21 website. Browser ran
under `caffeinate -i`; website followed sequentially. Package check-only and `git diff --check`
passed. Runtime/dependencies/permissions/defaults/backend were unchanged. No audio or returned
transcript was saved in the test record.

Remaining work: actual VoiceOver labels/announcements and speech frequency; processing/success/error
and recovery announcements; live recovery/processing layout at enlarged zoom; ChatGPT composer
occlusion at 400%; a fresh diagnostic Gmail run without the stalled control connection; fuller
editor acceptance and pilot measurements. The six release gates remain open. No deployment,
publication, infrastructure change or Phase 4 work occurred.

## Recording-panel overlap correction — 2026-10-26

**Implemented and Tested in the reported ChatGPT layout; broader accessibility remains pending.**
The user authorized fixing the 400% recording-panel overlap and explicitly left VoiceOver pending.
The new generic bottom-composer regression failed before the fix: at 300×228, a 234×117 panel
covered approximately 22,660 CSS square pixels of a 250×110 textarea. Existing viewport-fit tests
did not assert editor clearance, which explains why they had passed.

`extension/content.js` now evaluates a small set of viewport-clamped panel positions against both
the retained editor and microphone. It keeps a valid position across timer updates. In
`extension/content.css`, recording feedback has a stable width and, in viewports at most 320 CSS
pixels high, a compact three-row layout with unchanged labels, timing/activity, DOM tab order
and at least 32-pixel Stop/Discard controls. No host editor styles, focus, selection, insertion,
Undo, recording duration or lifecycle code changed. A viewport-filling editor may leave no fully
clear placement; the bounded fallback prioritizes reachable recording controls. This is not a
universal no-overlap guarantee for arbitrary host layouts.

The new `extension/tests/browser/dictation.spec.js` test covers zero panel/editor overlap, panel
and control bounds, unobstructed control centers, the longer Activity unavailable state, timer
updates, resize to 340×260 and back, keyboard Discard, unchanged text/selection, restored field
focus and zero mocked transcription requests. It failed before and passes after the correction.
The three focused compact-layout tests passed. Full validation: **296 passed, zero failed/skipped**
— 54 unit, 126 browser (105 mocked + 21 unpacked MV3/synthetic audio/stubbed provider), 95 backend
and 21 website. Package check-only, asset/site validators, dependency check and `git diff --check`
passed. Browser and website suites ran sequentially; browser used `caffeinate -i`.

**Actual Chrome recheck:** reloaded the repository's unpacked extension, then the existing ChatGPT
tab in the same L2 environment. Native Chrome UI confirmed 400% zoom, with a 300×228 CSS viewport.
During recording, the panel was 208×81.20 at (84,14), ending at y95.20; the editable text rectangle
began at y101.50, leaving approximately 6.3 pixels of clearance. Screenshot inspection confirmed
readable feedback and visible Stop/Discard. Browser-generated Tab moved from editor → microphone
→ Stop → Discard, and Space discarded. State returned to idle, focus returned to Ask ChatGPT,
and the exact fixture remained unchanged. Nothing was sent. Original 100% zoom was restored and
verified; the 10-second preference was preserved. These were brief real installed-extension
captures with no requested speech, not recognition, provider or physical-device-release tests.
No network trace was collected, so UI Discard is not proof of upload suppression.

Two setup attempts were excluded: navigation while microphone access was still pending reached
ChatGPT's own dictation control (explicitly cancelled; fixture unchanged), and a recording cancelled
after a focus interruption. The final complete check above was separately observed.

Documentation updated: this report, roadmap, compatibility matrix, manual protocol and unreleased
changelog. Independent source review found no blocking issue. VoiceOver listening stays **Pending
by user choice**; enlarged recovery/processing layouts, Gmail's inconclusive enlarged capture,
full live-editor acceptance and pilot metrics remain open. All six release gates remain open.
No deployment, publication, infrastructure change, new permissions/dependencies or Phase 4 work.

## VoiceOver listening follow-up — 2026-10-26

The user resumed the previously deferred VoiceOver check. VoiceOver **10 (964.12.11)** was
identified from the system application's version metadata on the existing macOS 15.6.1 environment.
System Settings confirmed VoiceOver was initially off; it was enabled for the listening cycle and
restored to off afterward. No speech settings were changed.

**Passed — joint human listening / agent-operated installed-extension check in L2 Chrome.** The
existing ChatGPT fixture was unchanged, recording idle, at the restored normal page zoom. After
focusing Start dictation, Enter started capture. Once recording controls were visible, Tab reached
Stop recording and Discard recording; Space discarded at approximately 4 seconds elapsed. DOM
state returned to idle with Recording discarded, focus returned to Ask ChatGPT, and the exact
fixture remained unchanged. No Send. The user explicitly reported clear labels and status with
no repeated countdown announcements. This verifies heard output for this cycle; it is not merely
an accessibility-tree inference. Browser-generated keys were used, not a human physical-keyboard
test. No requested speech or transcription completion was part of this cycle.

The subsequent source-UI listening checks used a temporary local fixture with the current DICTOZY
scripts, simulated microphone/recorder/extension APIs, a fixed synthetic transcript and an in-memory
clipboard stub. Actual Chrome and VoiceOver were used, with the user reporting heard output. This
is **human screen-reader listening to mocked-source UI**, not installed-MV3/provider/microphone
completion evidence. No audio was captured, real clipboard accessed, or private transcript stored
by this fixture.

Early fixture trials are excluded from hearing acceptance: the user could not verify all messages,
then reported no audible voice. The agent found that browser DOM actions had not reliably selected
the native Chrome tab. A fixture-only button readiness race was also corrected. After explicitly
selecting the fixture in native Chrome, the user confirmed audible page labels and an independent
plain-page live-region sentence. The system voice sample was audible through the selected MacBook
Pro speakers. Output/speech/live-region settings were inspected but not changed. No VoiceOver
caption-output verification is claimed. A later source-UI success/error trial was still unclear,
so it is not counted as a pass.

Inspection found two actionable issues: keyboard Dismiss could remove the focused error button
without returning focus to the current supported editor; discrete recording/transcription status
messages used a live node inside a bubble that was shown/hidden, with success disappearing after
1.4 seconds. The correction restores only focus when Dismiss owns it (never old editor text or
selection), and routes discrete messages through the existing persistent polite/atomic announcer.
Startup initialization was already present and is preserved. Visible text stays readable without
being a second live channel; timer/activity updates remain silent. This is delivery hardening,
not proof that one implementation detail explained every earlier inaudible trial.

After the correction, the user explicitly confirmed:

- **Processing/success:** both “Transcribing” and “Transcript inserted” were clear. The canned
  transcript replaced only the selected word and focus remained in the practice field.
- **Microphone error:** blocked-microphone guidance was clear. Native Chrome Tab navigation reached
  Dismiss, Space dismissed it, and the user heard Subject again. Native accessibility and DOM focus
  independently showed Subject; the other field remained unchanged.
- **Recovery/Copy:** the field-change explanation, simulated clipboard failure and successful retry
  were all clear. Native Tab reached Copy and Enter activated each attempt. The edited field stayed
  `Dear Alpha Beta Gamma`; recovery cleared on success and focus returned to Subject. This does not
  establish real clipboard permission behavior.

- **Recovery Discard/expiry:** the user confirmed both “Transcript discarded” and “Transcript
  expired” were clear. Native Tab reached Discard and Space activated it. A separate recovery used
  the real 60-second timer (no fake clock); the final observation was at approximately 82 seconds.
  Recovery was gone, both native accessibility and DOM focus remained on Subject, and the edited
  practice field was unchanged. No native typing-after-expiry claim is made.

VoiceOver was restored to off. The successfully heard cases above complete this limited listening
check; they do not certify other readers, browsers, editors, full live-app coverage or physical
keyboard operation. Actual installed-extension capture/Discard evidence and mocked-source response
states remain distinct. All six release gates remain open. No deployment, publication,
infrastructure change or Phase 4 work.

### Final review, regression coverage and limitations

Review caught two edges before committing the correction. An announcer inside an editable body
would change that editor's content/snapshot. The announcer now uses a noneditable body when safe,
or a sibling outside the body otherwise. Placement is checked before selection capture; the
existing observer also moves an already connected announcer when body/html `contenteditable`
changes, so an idle transition does not leave a prior generic status inside the editor. No new
observer or broad reattachment loop was added. Static and dynamically editable body insertion and
native Undo pass. DesignMode coverage checks placement only, not new editor support. The observer
cannot guarantee protection against a host serializing its own body synchronously in the same
JavaScript stack that changes editability; root-level fallback speech was not human-tested.

The other edge was consecutive clipboard failures: identical-message deduplication could suppress
the second outcome. Each explicit Copy attempt now announces “Copying transcript” before awaiting
the clipboard result; outcomes remain guarded against expired/replaced recovery sessions. Repeated
failure mutation coverage passes. This added per-attempt message and the editable-body edge cases
were validated automatically; they are not additional human listening claims.

**Fourteen new regressions:** five error-Dismiss focus cases; five persistent-status, lifetime,
duplicate-render and silent-timer cases; two editable-body insertion/Undo cases; one designMode
placement case; one repeated-Copy-failure case. Relevant failures were reproduced before fixes:
three of the five focus cases, all five initial announcement cases, and all four edge cases. The
dynamic-body test was then strengthened to check a prior nonempty status and clean body content
before recording; it failed before the narrow observer guard and passes after it. Existing compact
layout semantics now assert the persistent live channel and absence of a second live channel.
An installed denial test's broad text locator matched both visual and live text; scoping it retained
the visible-error assertion and added matching persistent-announcement coverage.

| Suite | Passed | Execution scope |
|---|---:|---|
| Extension unit | 54 | Rerun after the placement/retry correction; unchanged by the last observer guard |
| Mocked browser workflows | 119 | Full browser suite rerun after the final observer guard |
| Unpacked MV3, synthetic audio/stubbed provider | 21 | Same final full browser rerun; not physical microphone/provider tests |
| Backend | 95 | Passed earlier in this follow-up; backend unchanged by these extension-only corrections |
| Website | 21 | Passed earlier in this follow-up; site unchanged by these corrections |
| **Combined validated coverage** | **310** | **No remaining failures or skips** |

The final browser run passed 140/140 under `caffeinate -i`. Package check-only and whitespace checks
passed on the final source; asset/site validators and dependency consistency passed earlier in the
follow-up. Browser and website runs remained sequential. The initial expanded browser run had one
strict-locator failure, corrected as described above; no test was removed or weakened to pass.

**Final installed-source recheck: limited pass after setup correction.** The first ChatGPT reload
encountered a `Page.getFrameTree` control timeout and rendered blank before capture. The debugging
connection was ended; a fresh tab restored `Keep this text.`. A stale source marker led to finding
an agent targeting mistake: Chrome's toolbar Reload and the extension's own Reload share a label;
the first action had refreshed the details page, not the extension. Selecting Reload inside the
extension details produced Chrome's explicit “Reloaded” confirmation. After a page reload, the
installed announcer was verified as one body child with `contenteditable=false`, matching final
source. No disable/re-enable cycle or permission-setting change was made.

One following capture attempt is excluded: the browser-control wait/Discard action timed out, and
the page later reported “No speech was detected.” It is not a Discard or upload-suppression pass.
A separate repeat using native Chrome controls observed Recording, timer at approximately six
seconds, Stop and Discard, then activated Discard. The final native state showed Start dictation,
Recording discarded, no recording controls or microphone-recording title indicator, focus in
Ask ChatGPT and the exact unchanged fixture. Nothing was sent through ChatGPT. This is a brief
installed real-capture/UI-cancellation recheck with no requested speech; it is not a recognition,
provider-latency, physical-device trace or network-suppression result. VoiceOver stayed off, so it
adds no new spoken-output claim. No extension-specific cause of the control timeouts is asserted.

The old stalled tab and temporary fixture tab were closed, the fixture server stopped, and the
working replacement ChatGPT tab retained. The final source also loaded with the expected announcer
shape in the local mocked-source Chrome fixture before cleanup. These results remain separate
from the human-listening evidence and do not close any release gate.

### Accessibility correction scope and repeat procedure

Files changed for this follow-up: `extension/content.js`,
`extension/tests/browser/dictation.spec.js`, `extension/tests/browser/installed-extension.spec.js`,
this report, `docs/IMPROVEMENT_ROADMAP.md`, `docs/COMPATIBILITY_MATRIX.md`,
`qa/phase-3-acceptance.md` and `store/changelog.md`.

Local development uses the existing unpacked `extension/` directory. Reload it through
`chrome://extensions`, then reload only a disposable test page to pick up content-script changes.
Run `npm test` and `npm run test:browser`; run `npm run test:site` after the browser suite finishes
because they share the local server port. Backend regression invocation remains
`PYTHON_DOTENV_DISABLED=1 PYTHONDONTWRITEBYTECODE=1 XAI_API_KEY='' APP_ENV=local backend/.venv/bin/python -m pytest -q -p no:cacheprovider`.
Packaging validation is `python3 scripts/package_extension.py --check-only`; it does not publish.

For a short manual repeat, use an unsent disposable field, confirm the intended tab is selected,
enable VoiceOver only for the check, and verify these separate cases: start/record/discard without
countdown speech; processing/success; denied microphone then keyboard Dismiss returning to the
current field; changed-field recovery with Copy failure/retry; transcript Discard; real-minute
expiry with focus in another supported field. Restore the previous VoiceOver and zoom settings.
The exact procedures and remaining application checks are in `qa/phase-3-acceptance.md`.

Permissions, microphone activation rules, 10/30-second limits, shortcuts/preferences, backend-only
xAI access and one-result memory-only recovery are unchanged. Status text contains generic outcomes,
not dictated text. Native Undo and stale-content validation remain required regression gates.
These changes make no new production-readiness claim. The next approved work remains Phase 3's
pending app/layout/pilot checks; Phase 4 requires separate authorization.
