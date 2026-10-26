# Phase 3 compatibility and daily reliability report

Date: **2026-10-25** (America/Toronto). Branch: `codex/phase-3-compatibility-reliability`.
Accepted Phase 2 base: `bbdf9a2`.
Implementation commits: `066833e` (editor focus/placement and regressions),
`14eda7a` (test startup and repeated-session evidence).

**Local implementation and automated validation are complete. Full live-application and physical
microphone acceptance are incomplete. This is not a production-readiness or compatibility certification.**
The user chose to leave login-dependent editor checks pending. Phase 4 has not begun.
The initial report below is followed by an acceptance update with **293 passing automated tests**
and separately labeled human/agent evidence.

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
manual protocol. The latest full automated result remains **293 passed, zero failures/skips** from
the recovery-fix validation; no new automated test run is claimed for these manual trials.
The product remains at **10 seconds default / 30 seconds maximum**. All six release gates remain
open, including fuller human acceptance, screen-reader/zoom work, login-dependent editor checks
and pilot evaluation. No deployment, publication, infrastructure change or Phase 4 work.
