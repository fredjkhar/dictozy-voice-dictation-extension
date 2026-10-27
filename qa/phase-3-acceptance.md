# Phase 3 compatibility and daily reliability acceptance

Protocol date: **2026-10-25**. Status: **Partially executed; results in the compatibility matrix.** This is a test plan, not a
record of passes. Record results in the dated compatibility matrix and identify the exact method
used. Passing local fixtures or a synthetic microphone test does not establish compatibility with
a live application, speech accuracy, physical microphone behavior or production readiness.

Closeout updated **2026-10-26**: available local validation is complete, with **314 passing tests**.
The [final summary](../docs/PHASE_3_CLOSEOUT.md) consolidates completed human/Chrome checks and
remaining manual work. Unchecked items here describe the reusable protocol, not a claim that
every step is untested. Notion/Outlook/WhatsApp editor access, broader layouts/device coverage and
the human pilot remain unverified; all release gates stay open. Phase 4 implementation is not authorized.

The user's streamlined policy makes additional app/zoom/screen-reader/pilot scenarios **optional
follow-ups**, unless an observed critical defect or specific release requirement makes one necessary.
Use relevant existing automated tests and prior successful evidence first. This protocol is a
reference, not a requirement to repeat every manual step or request personal-account access.
Unavailable external checks do not automatically block development. Full automated validation and
explicit release approval remain required for a production release.

## Scope and evidence labels

Prioritize **Gmail, ChatGPT and Notion** for deeper testing: email, short questions and notes cover
three distinct everyday writing tasks and editor interaction patterns. This is a product hypothesis;
no customer usage data or feedback establishes their rank. Also evaluate **Outlook on the web**
and **WhatsApp Web**. Revisit the priorities when actual user feedback is available.

Use these labels on every result; never combine their pass rates:

| Label | What the result establishes |
|---|---|
| `unit` | Isolated JavaScript or backend behavior; no installed extension |
| `mocked_browser` | Browser DOM behavior with injected Chrome/media/provider APIs |
| `unpacked_synthetic` | Actual unpacked MV3 extension and browser APIs; synthetic audio and stubbed backend |
| `live_editor_stubbed` | Actual named application's editor with the unpacked extension, synthetic audio and a verified stubbed backend; no speech/provider result |
| `physical_mic_provider` | Human-operated installed extension, real microphone, named application and explicitly identified transcription environment |
| `browser_ui_preflight` | Browser-automated live editor access, field detection or geometry inspection; no recording/insertion claim |
| `manual_ui_only` | Human inspection/navigation without a dictation request; no insertion or recording claim |

If an editor cannot be reached because sign-in, a workspace or a suitable test account is unavailable,
mark it **Blocked — editor unavailable**. A login page, marketing page, DOM screenshot or vendor
documentation cannot count as editor validation. Distinguish the branch's unpacked build from the
published Store build even if the manifest version is the same.

## Safe preparation

1. Record date, OS, browser name/version, exact Git revision, extension source (unpacked or Store),
   selected language, duration limit, zoom, input method and microphone class. Record browser policy
   or clipboard restrictions when relevant. Use an environment ID instead of a person or device name.
2. Load/reload the reviewed branch's `extension/` directory using Chrome's Load unpacked control.
   Reload the test page afterward. Avoid duplicate enabled Dictozy builds in the test profile.
   Do not upload a package, change production configuration or install into another person's profile.
3. **The checked-in extension uses the fixed production Dictozy backend.** Merely starting local
   FastAPI does not redirect it. Activating recording and completing a normal stop can send audio to
   `https://voice-dictation-extension.onrender.com/api/transcribe` and onward to xAI. Do not use this
   manual checklist to imply that a local provider-free run is configured. During automated branch
   verification, use the suite's isolated synthetic microphone/stubbed backend and production-host
   blocking. Human physical-microphone/provider work remains a separately identified pending run in
   an approved transcription environment; no such request is needed to inspect the UI.
4. Use only the synthetic phrases below. Do not read email, personal notes, names, credentials or
   real message contents aloud. Do not save audio, transcripts, page screenshots, DOM dumps,
   clipboard contents, account identifiers or full page URLs in the test record. Do not introduce
   analytics or new production logging for this pilot.
5. Use a private disposable draft/scratch field with no existing writing. Drafts and notes may
   autosave to their application's service even without submission. Never use a shared document,
   real customer conversation or pre-existing draft. Do not click Send, submit an AI prompt or press
   an application's submission shortcut. Clean up only the synthetic content created by this test.
6. Stop a run immediately if insertion reaches the wrong field, unrelated writing changes, recording
   continues without reachable visible controls, or recording survives a hidden/unsafe page. Use
   Discard or close the test tab to end capture, record a content-free issue and treat it as release
   blocking. Do not continue performance sampling around a known data-preservation failure.

To inspect local fixtures, run `python3 -m http.server 4173 --bind 127.0.0.1` from the repository
root and open `http://127.0.0.1:4173/qa/manual-test-page.html`. Loading this page is not a live-app test.

## Controlled phrases and editor setup

| ID | Synthetic phrase or initial field text | Purpose |
|---|---|---|
| P1 | Remember to water the plants. | Short ordinary dictation |
| P2 | Please review the draft before Friday. | Sentence and punctuation |
| P3 | The blue notebook is beside the window. | Selection replacement |
| P4 | Tomorrow I will make a list, check the schedule, and prepare a short note for the afternoon. | Longer phrase; speak naturally, do not rush to fit |
| E1 | Alpha Beta Gamma | Existing content; select only `Beta` |
| E2 | Dear Alpha Beta Gamma | Expected user edit when `Dear ` is inserted before a pending result |

Provider capitalization and punctuation can vary. Record counts of corrections, not the returned
text. For a deterministic insertion test use a verified stub response, and label it accordingly.

| Application | Disposable workflow | Deeper checks |
|---|---|---|
| Gmail — priority | New private draft, no recipients; message body | Rich text, selection, toolbar-induced focus, draft re-render and native Undo |
| ChatGPT — priority | Empty new-chat composer; do not submit | Composer resize, line breaks, selection, focus changes and prevention of accidental submission |
| Notion — priority | Private disposable scratch page/block | Block focus, formatting, block replacement/re-render, selection and native Undo |
| Outlook on the web | New private draft, no recipients; message body | Body/subject focus separation, formatting, compose window changes and native Undo |
| WhatsApp Web | Disposable self-chat composer; do not send | Composer focus, multiline editing, selection, visible controls and no automatic send |

These are intended tests, not assertions about current app internals. If an application uses an
iframe or shadow tree in the tested workflow, record that observed boundary without retaining its
contents. Do not infer editor technology or support from the application's name.

## Concise installed-extension acceptance checklist

Run all items on local fixtures; run the applicable items in each accessible live editor. Keep
expected cancellation/recovery scenarios separate from ordinary completion-rate trials.

- [ ] **First use:** from opening the popup, choose Try dictation, read the short guidance and focus
  the practice field. Opening it and selecting Try must not request a microphone. In a physical-mic
  run, explicitly activate the microphone, allow access, speak P1 and Stop. Time to the first correct
  insertion includes permission and orientation time. Record denied permission as a separate case.
- [ ] **Normal writing:** at the start, middle and end of a field, dictate P1/P2. Confirm only the
  intended field changes, no submission occurs and surrounding text survives. Immediately use the
  platform's native Undo (Cmd+Z/Ctrl+Z); confirm only the insertion is reversed. Check Redo once.
- [ ] **Selection:** populate E1, select only `Beta`, dictate P3 and Stop. Check surrounding words
  and formatting, then native Undo. Repeat in a textarea and the app's supported editable field.
- [ ] **Keyboard:** activate with mouse, Enter and Space; exercise the actual assigned OS shortcut,
  not only an invocation of its routing function. During recording, Tab/Shift+Tab must reach Stop
  and Discard without changing the retained selection. Note when an editor consumes Tab itself.
- [ ] **State and timing:** confirm distinct idle/recording/processing/success/error feedback,
  readable elapsed and remaining time, reachable Stop and Discard, and activity changes while
  speaking/pausing. Check a 10-second automatic stop and the existing optional 30-second setting.
  Keep Chrome and the test tab in front until recording finishes; switching to another window to
  report progress can cancel capture. Report afterward. If interrupted, record that separately and
  begin a fresh trial. Verify insertion and one-step Undo, check the browser microphone-use
  indicator, and restore the original duration preference after testing. Distinguish continuously
  observed timing from a user-reported result or a timer inspected only after completion.
  Record a cutoff only when it ends an intended phrase unexpectedly; a correctly reached configured
  limit is not itself a lifecycle failure. Never infer recognition accuracy from the activity dot.
- [ ] **Explicit discard:** discard with mouse and keyboard; no transcript, upload or recovery
  should follow. In a provider-free run verify zero calls through the harness's request counter;
  for human UI-only checks record that network suppression was not independently inspected.
- [ ] **Unsafe transitions:** during capture switch tabs, hide/minimize the window, focus an
  unsupported/password field on the local fixture, remove the target, or disable Dictozy. Capture
  must stop and discard. Re-entering the page must not restart it. Do not use real password fields
  or enter secrets in a live app to test this. Verify device release using browser microphone UI.
- [ ] **Pending edits:** using a deliberately delayed stub, stop a recording with `Beta` selected
  in E1, then insert `Dear ` at the beginning before the result arrives. The field must remain E2;
  the completed result must be offered through temporary recovery, never stale-offset replacement.
  Repeat with selection/cursor movement, changing focus to another field, rich-text DOM replacement
  and editor formatting while pending. A removed or unsupported target may cancel the request;
  cancellation must not later insert or offer a deliberately cancelled transcript.
- [ ] **Recovery:** check that its reason is understandable and the transcript is not displayed.
  Reach Copy/Discard with Tab, activate with Enter/Space, and paste a copied result only into a
  disposable test field. Include moving from the original body to Subject, then tabbing through
  the microphone to Copy/Discard: when the recovery control disappears, focus must return to
  Subject, not the original body. Exercise clipboard denial/retry, new recording, hiding the page and the
  60-second expiry. Expiry must not steal focus from another editor. A clipboard operation already
  accepted by the browser can finish after Discard/expiry; note that separately from new insertion.
- [ ] **Boundaries:** check local same-origin/cross-origin iframe, open/closed shadow-root and
  microphone-blocked Permissions Policy fixtures where available. Record unsupported contexts and
  absence of automatic capture. Do not broaden permissions or bypass a site's policy to get a pass.
  Test the actual named app workflow separately; a local boundary fixture is not app certification.
- [ ] **Accessibility:** use a physical keyboard and actual screen reader. Check accessible names,
  one useful announcement for state/recovery transitions, no continuous timer announcements,
  visible focus, 200%/400% zoom and reduced motion. Verify narrow layouts do not cover the editor
  or hide Stop/Discard. Record screen reader name/version; leave this pending if none was used.

For the enlarged-layout check, use Chrome's actual page-zoom control and verify its displayed
percentage. On the inspected L2 display, 200% yielded a 600×456 CSS viewport and 400% yielded
300×228. A resized mocked viewport is separate evidence. Inspect both horizontal and vertical
bounds, readable timing, button hit targets and overlap with editor content. A control fitting the
viewport does not establish an unobscured editor. Test recording and recovery/clipboard errors,
not only idle controls. Restore each site's original zoom. If the editor or automation connection
stalls, stop the trial and mark it inconclusive rather than interpreting stale state as a pass.

To recheck the 2026-10-26 recording-panel fix locally: reload DICTOZY in `chrome://extensions`,
reload the disposable ChatGPT tab, leave `Keep this text.` unsent, and set Chrome page zoom to 400%.
Start DICTOZY and **wait for Recording and Stop/Discard to appear before tabbing**. Verify the
panel clears the editable text and all controls fit. Tab from the editor through microphone,
Stop and Discard; Space must discard, restore editor focus and preserve the fixture. Restore
100% zoom. The agent completed this check in L2 Chrome; broader layout acceptance remains open.
The corresponding generic mocked regression is runnable with
`npx playwright test extension/tests/browser/dictation.spec.js --grep 'recording panel avoids a bottom composer'`.

The user resumed VoiceOver listening on **2026-10-26**. The installed ChatGPT recording/Discard
cycle passed with human confirmation of clear labels/status and no repeated countdown speech.
After targeted status/focus corrections, the user also confirmed processing, success, microphone
error/return to Subject, recovery reason, Copy failure/success, Discard and expiry in a local
mocked-source fixture using actual Chrome and VoiceOver. These are distinct evidence types; see
the dated Phase 3 report. Preserve and restore the original VoiceOver setting for each check.

A final installed-source reload and short native-Chrome capture/Discard recheck passed after setup
correction; source shape, idle return, recording-indicator removal and unchanged fixture/focus
were observed. Earlier timeout attempts are excluded. When repeating, choose Reload **inside the
extension's details panel**, not Chrome's identically named toolbar control; require Chrome's
“Reloaded” confirmation, then reload the disposable page. The final recheck did not include new
speech/recognition or human listening; successful insertion/Undo evidence retains its earlier scope.

For a minimal VoiceOver listening handoff, first prepare an unchanged disposable fixture with
recording idle. Record whether VoiceOver was already enabled and preserve that preference. Once
the listener is ready, focus the field/microphone, traverse the named controls, briefly record and
Discard, and ask whether labels, Recording and Discard were intelligible without repeated countdown
speech. The listener need not speak. This short check covers only those states: separately verify
processing, success/error, recovery/clipboard failure and expiry announcements in a controlled
trial. Record actually heard output; an accessibility-tree snapshot cannot replace it. Apple's
[VoiceOver on/off instructions](https://support.apple.com/en-gb/guide/voiceover/vo2682/mac) describe
Command-F5; restore the initial setting afterward.

For a repeat, confirm the test tab is visibly selected in native Chrome before starting: a DOM
automation handle can target a background tab. Check a page label or independent live-region
sentence first if the listener hears nothing. Keep each check short and ask about specific spoken
outcomes. Allow the recovery explanation to finish before Copy/Discard; leave a separate recovery
untouched for a real minute while a different supported field has focus. Confirm expiry does not
move focus or change text. Use native keyboard navigation for focus-return evidence. Any synthetic
recorder/provider/clipboard behavior must remain labeled as such; do not infer physical audio,
real clipboard access or actual spoken output from mocked tests.

## Pilot measurements without private content

For an initial pilot, propose **20 ordinary trials in each of the three priority applications**
(60 total), spread across at least two sessions. For each app use five start/middle/end insertion
trials, five selected-word replacement trials, five keyboard-start/stop trials and five longer
phrase trials within the existing duration settings. Rotate P1–P4. Keep safety, explicit-discard,
denial and deliberately forced-recovery cases in a separate scenario set. Report unavailable apps,
failures and exclusions; do not silently replace them with a more favorable workflow.

| Metric | Definition and reporting |
|---|---|
| First successful dictation | Seconds from opening the popup to correct practice insertion; include permission/orientation. Report each novice attempt and its evidence type, not an experienced tester's speed as first-use evidence. |
| Stop-to-text latency | Seconds from explicit Stop (or automatic stop) to completed correct insertion. Use one stopwatch or monotonic clock for both endpoints. For recovery record time to the recovery notice separately; failures/timeouts remain outcomes, not dropped samples. Report median and p95 with sample count and timer precision. |
| Direct insertion rate | Correct intended-field insertions / all started ordinary trials. A recovery is not a direct insertion. |
| Completion rate | Ordinary trials with correct insertion and usable text, or explicit successful recovery into the intended disposable field, / all started ordinary trials. Show direct and recovered completions separately. A started but failed attempt stays in the denominator. |
| Recovery frequency | Ordinary trials showing recovery / all started ordinary trials. Also report forced-recovery checks separately. |
| Accidental cutoffs | Ordinary trials where the speaker reports an unfinished intended phrase because capture ended unexpectedly / all started ordinary trials. Record cause category: configured limit, unsafe focus/visibility, other or unknown. |
| Correction effort | Number of word insertions/deletions/substitutions and optional elapsed correction seconds to make the synthetic result usable; count punctuation edits separately. Store counts only. Distinguish transcription corrections from UI/insertion failures. |
| Safety | Counts of wrong-field insertion, unintended replacement and capture without a reachable visible control. Any occurrence blocks acceptance regardless of average completion rate. |

Proposed targets are **first success within one minute**, **at least 95% completion** in selected
supported workflows, **zero wrong-field insertions** and **zero uncontrolled recording sessions**.
They are evaluation targets, not existing measurements, service guarantees or statistical proof
from a small pilot. Report per-app results as well as pooled results so weaker workflows remain
visible. A synthetic/stubbed run can measure the local mechanism; it cannot establish provider
latency, real recognition quality or the physical-mic completion target.

The optional [CSV template](phase-3-pilot.csv) contains only column names and no fabricated results.
Keep any filled copy as an explicitly chosen local QA artifact, outside production telemetry. Use
short enumerated outcome/reason codes; never put dictated text or page content in those fields.
If sharing results, share aggregates and synthetic scenario IDs only. Delete the filled local
records when review no longer needs them. This protocol does not add extension storage or history.

## Recording-duration decision

Keep **10 seconds default / 30 seconds maximum** for this phase's initial validation. The frontend
and popup currently clamp to 30 seconds; the backend validates actual decoded audio up to 60 seconds
with a 10 MiB file limit. The frontend's 55-second response timeout begins in the transcription flow;
it is not a promise that a longer capture will transcribe within that interval. A backend ceiling
alone does not validate a new recording limit. Actual browser encoding/duration overhead, latency,
cutoff frequency, correction effort, accessibility and budget exposure need measured evidence.

Before considering a 30-second default or optional 60-second capture, require passing lifecycle and
native-Undo acceptance, zero known safety failures, real 10/30-second pilot data showing the benefit,
and tests around actual decoded duration and size boundaries. A nominal 60-second browser timer may
produce audio beyond a strict 60-second backend limit. Resolve that boundary deliberately instead
of weakening validation. Longer clips also consume more of the process-local aggregate allowance;
its restart/replica limitation remains open. No streaming or infrastructure change is proposed here.

## Re-run local validation

From the repository root, run the existing isolated suites. Run browser and website suites
sequentially because their output directories overlap.

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

The unpacked recovery acceptance file includes a real 60-second wait. Keep the test host awake;
on macOS, `caffeinate -i npm run test:browser` prevents idle sleep during the suite without changing
product clocks or persistent power settings. Synthetic audio/stubbed-provider labels still apply.

## Release gates still open

1. Actual Render proxy, worker, replica and ingress configuration verification.
2. Aggregate backend usage protection across restarts and multiple instances.
3. Real microphone and installed-extension manual acceptance testing.
4. Real-world editor compatibility testing.
5. Production logging and deployment validation.
6. Coordinated publication of revised privacy disclosures.

Track partial evidence without closing a gate prematurely. Automated implementation completeness,
manual testing completeness and production readiness are separate judgments. Phase 3 approval does
not authorize deployment, Store publication, infrastructure changes or Phase 4.
