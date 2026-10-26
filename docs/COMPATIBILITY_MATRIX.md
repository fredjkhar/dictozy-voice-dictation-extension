# DICTOZY compatibility evidence

Assessment date: **2026-10-25**, America/Toronto. Working branch:
`codex/phase-3-compatibility-reliability`, accepted baseline `bbdf9a2`.
Initial automated code revision: `14eda7a` (includes product correction `066833e`).
The dated follow-ups below record subsequent human evidence and recovery-focus correction `8753628`.

**No named application is certified for end-to-end dictation by this assessment.**
The initial live checks establish access, editor structure and idle-control placement only.
Subsequent user-reported speech/Undo results and agent-operated checks are identified separately
below. Full application and human accessibility acceptance remain incomplete.

## Environments and methods

| ID | Environment | What was actually exercised | Limits |
|---|---|---|---|
| L1 | macOS 15.6.1, user's existing Google Chrome profile; enabled unpacked DICTOZY 0.1.12 | Browser automation through live application UI and read-only DOM geometry. Chrome Details confirmed this repository's `extension/` source folder; reloaded it for the placement recheck | Running Chrome version was not verified. Initial preflight preceded reload; placement recheck used the Phase 3 working tree. Manifest version alone does not identify a branch. No microphone activation, transcript insertion or provider request |
| A1 | macOS 15.6.1, Playwright 1.61.1 bundled Chromium/Chrome for Testing 149.0.7827.55, isolated temporary profiles, current checkout loaded unpacked | Native MV3 isolation, Chrome storage/messaging, MediaRecorder, browser focus/editing/Undo; synthetic microphone and stubbed backend | Local editor models only. Production backend DNS and page HTTPS traffic blocked. Not physical speech, real provider latency or named-site support |
| M1 | Playwright Chromium on local QA page with injected extension/media/provider APIs | Existing deterministic cancellation, response, recovery, storage and DOM regressions | Mocked workflow evidence; not installed-extension or real microphone evidence |
| L2 | macOS 15.6.1 (24G90), Google Chrome 156.0.8078.47 arm64, existing profile, unpacked DICTOZY 0.1.12 from this repository | Version/source verified through Chrome UI; optional practice navigation; ChatGPT Enter activation and Space discard using temporary synthetic audio in the extension's isolated world | Authenticated rich composer; generated Web Audio stream, native MediaRecorder, intercepted transcription messaging. No physical microphone/provider claim. Overrides restored before reloading the recovery-focus fix |

Live UI results are **browser-automated preflight**, not human manual acceptance. No personal
writing, account identifiers, full private URLs, screenshots of inboxes or transcript content are
retained in this matrix. No messages or prompts were sent, and no notes were created.

## Application matrix

Gmail, ChatGPT and Notion are the three provisional priorities: email composition, short prompts
and notes are distinct everyday writing tasks. This is a product hypothesis, not a measured user
preference. Outlook and WhatsApp Web remain in the evaluation set. Revisit priorities with feedback.

| Application / priority | Workflow and method | Observed result | Supported workflow claim | Outstanding checks / limits |
|---|---|---|---|---|
| Gmail / priority | L1: new empty compose body, no recipients or content; focus and inspect editor/control | Body is a top-document `DIV`, `contenteditable=true`, `role=textbox`; DICTOZY idle mic visible | Field detection observed only | Selection insertion, formatting, native Undo, pending edits, compose resizing/re-render, Stop/Discard, microphone policy and actual speech all pending |
| ChatGPT / priority | L1: logged-out empty new-chat composer; inspect field and adjacent controls, reload local extension and recheck | Top-document textarea. Before correction, DICTOZY's 42×42 control overlapped the native 44×44 voice button (roughly 36×42 px intersection). After correction it sits above the composer; DOM rectangles have zero overlap and screenshot inspection confirms both controls visible | Field detection and corrected idle placement observed only | Authenticated composer variants, resizing, insertion/Undo/recovery and real speech pending. The final same-editor-focus refinement was tested locally, not through live capture |
| Notion / priority | L1: navigate to notes application | Redirected to marketing/login; no authenticated notes editor reached | None | Block editing, formatting, DOM replacement, focus, insertion/Undo and microphone testing blocked on signed-in private scratch workspace |
| Outlook on the web | L1: open mail URL | Redirected to Outlook marketing/sign-in; compose unavailable | None | Private empty draft, body/subject separation, rich-text/iframe boundaries, insertion/Undo, recovery and speech blocked on sign-in |
| WhatsApp Web | L1: open web application | Device-link/QR login screen; no message composer reached | None | Device linking must be completed by account owner. Self-chat without Send, multiline/caret/Undo and speech checks pending |

Login screens and product pages are access observations, never compatibility passes. A visible
microphone alone does not establish successful capture or insertion. Chrome preflight results do
not establish Brave, other Chromium browsers, mobile, or Firefox support.
The user explicitly chose to leave login-dependent editor tests pending. Temporary inspection tabs
were closed; the empty Gmail compose body was verified unchanged. No existing drafts were edited.

## Local editor-model evidence (A1)

The new `extension/tests/browser/compatibility.spec.js` uses actual unpacked extension execution.
The models are deliberately described by browser behavior rather than branded as application mocks.

| Editor boundary / workflow | Outcome and implication | Remaining limitation |
|---|---|---|
| One-level open-shadow text input | Native insertion and Undo validated | Does not cover every web-component editor |
| Nested open-shadow text input | Reproduced visible mic that failed to start; recursive active-focus resolution fixes activation; insertion/Undo validated | Programmatic idle focus wholly inside a shared shadow host can fail to notify document listeners until mouse/keyboard interaction |
| Open-shadow rich text | Selected-range insertion and native Undo validated in tested Chromium | Other rich editors, selection APIs and browser versions require separate tests |
| Nested-shadow safe target to password | Session-bound target focus listener cancels synchronously, no upload; retry verifies cleanup | Document-level focus events alone are retargeted/suppressed; safety polling remains a fallback for DOM changes |
| Nested-shadow safe target to another supported editor | Cancels original recording; neither field receives a transcript | Does not transfer an active recording to the new editor |
| Focus between descendants of one rich editor | Recording continues, Stop inserts safely and native Undo restores the selection | New focus listener must distinguish a new editor from a descendant of the retained editor |
| Rich editor replaces nodes with identical HTML during pending response | Original range identity fails validation; writing unchanged and temporary recovery offered | Conservative refusal may increase recovery on editors that routinely rebuild DOM |
| Same-origin and cross-origin iframe editors | No content script injected in frame; entering frame cancels top-level recording | Iframe editing intentionally unsupported; no new `all_frames` scope or permissions |
| Closed shadow root | No activation/control for inaccessible editor | Intentionally unsupported; no interception of closed roots |
| Actual `Permissions-Policy: microphone=()` response header | Browser reports disabled microphone policy; extension refuses capture with a safe message and zero backend-stub calls | Not a claim about any named application's current policy or a physical permission-prompt test |
| Narrow composer beside native controls | Generic nearby-control avoidance reproduced and tested; chosen side stays stable during capture, native control remains clickable | Bounded hit testing is a heuristic. Extremely crowded layouts and closed-shadow controls can still collide; no universal placement guarantee |
| Repeated local sessions | Five insertions with native Undo and five explicit discards, alternating textarea/rich text; only five stub requests | Ten controlled sessions are a smoke test, not the proposed 60-trial human pilot |

## Performance and duration

The repeat-session test attaches numeric local stop-to-insertion timing. The response is deliberately
stubbed with a 100 ms delay and the input is synthetic. Report its samples separately in
[the Phase 3 report](PHASE_3_REPORT.md); never use them as production latency, recognition accuracy,
first-use time or pilot completion figures.

**10-second default / 30-second maximum remain unchanged.** A backend ceiling of 60 decoded seconds
does not justify a 60-second capture timer: encoding and timer overhead, cutoff frequency, latency,
correction effort and aggregate usage need evidence. See [the manual protocol](../qa/phase-3-acceptance.md)
and its optional empty metrics template. First success under one minute, 95% completion and zero
wrong-field/uncontrolled-recording events remain proposed pilot targets, not measured achievements.

## Human walkthrough follow-up — 2026-10-25

This follows the initial UI-only assessment above. In response to the guided real-microphone
Chrome/Gmail procedure, the user reported **text inserted in the message body, recording stopped,
and native Undo restored the empty body**. Record those three checks as **Passed — user reported**,
separate from agent-observed or automated evidence. The procedure uses the existing backend/xAI;
provider traffic was not independently inspected. Browser version, latency, broader speech accuracy,
additional selection/recovery/cancellation cases and other acceptance details remain unverified.

The user subsequently reported **ChatGPT text insertion, recording stopped, native Undo cleared the
composer, nothing was sent, and controls stayed visible**. Record these five checks as
**Passed — user reported**. Latency, browser version and wider editor acceptance remain unverified;
visibility does not establish every layout or accessibility scenario.

The user reports that **explicit Discard stopped recording, preserved the existing fixture text,
produced no delayed transcript or recovery notice, and sent nothing** in ChatGPT. Record these
checks as **Passed — user reported**. Active microphone-indicator release was not reported, and
network suppression cannot be inferred from UI-only cancellation observations.

The user reports that **switching tabs stopped recording, it stayed stopped on return, the existing
text was unchanged, no delayed transcript or recovery appeared, and nothing was sent** in ChatGPT.
Record these checks as **Passed — user reported**. No independent timing, microphone-track or
network inspection was performed. These cancellation scenarios are separate from ordinary
completion-rate trials.

The user reports that Gmail selected-word replacement **changed only the selected fixture word,
preserved the surrounding words, restored the original text with one native Undo, and sent
nothing**. Record these checks as **Passed — user reported**. This is normal selection insertion;
it does not validate changed-content or stale-selection recovery in the live editor.

The user reports that editing the same Gmail field during recording **preserved the changed body,
showed the recovery notice, allowed explicit Copy/paste into the empty Subject, and sent nothing**.
Record these checks as **Passed — user reported**. Changing text before Stop deliberately avoids
relying on provider response latency; it does not substitute for the separate
edit-during-pending-response timing case. Recovery expiry, clipboard denial and keyboard recovery
navigation remain unverified manually.

The user reports that **Command+Shift+Y started and stopped recording in ChatGPT, controls stayed
visible, dictated text appended without changing the original, one native Undo restored the
original fixture text, and nothing was sent**. Record these checks as **Passed — user reported**.
This exercises the actual assigned Chrome shortcut; Enter/Space activation of individual controls
and screen-reader behavior remain unverified manually.

The subsequent expiry check is recorded below as joint human/agent execution. These limited
Gmail/ChatGPT results do not establish the pilot completion target or close any release gate.

## Agent-operated follow-up — 2026-10-25

The user authorized autonomous remaining checks. These supplement, rather than replace, the
user-reported physical-microphone results above.

| Check | Method | Result / limits |
|---|---|---|
| ChatGPT microphone Enter activation, Space on Discard | L2 `live_editor_stubbed`; existing harmless fixture only | Passed: Recording appeared, Discard was visible, state returned to idle, fixture unchanged, zero active generated tracks and zero transcription messages. No real speech or provider request |
| Popup → Try dictation → practice field; inline troubleshooting | L2 `browser_ui_preflight` | Passed: practice opened, Try focused the field, Start remained idle, no microphone prompt appeared; privacy/shortcut/help guidance visible. Physical first-success timing and screen-reader output remain pending |
| Recovery after a pending-response edit, full 60-second lifetime | A1 `unpacked_synthetic`, new `recovery-acceptance.spec.js` | Passed: panel visible at 55 seconds, absent after 61 seconds; measured lifetime at least 59.9 seconds; body unchanged and Subject retained focus for typing. No advanced/fake clock |
| Tab through microphone → recovery Copy/Discard → intended editor | A1 `unpacked_synthetic`, native clipboard and keys | Initially failed: focus returned to original body instead of the more recently edited Subject. Fixed by updating only recovery's return-focus field on supported-field focus. Both regressions now pass, including explicit native paste |
| Live Gmail expiry and focus preservation | Human speech/provider setup plus L2 agent UI observation | Passed: observed live recovery, unchanged edited body, then expired announcement and absent notice; Subject retained focus and a native keypress without refocusing appended X there. No Send. A first attempt had already been copied and was excluded; the repeat was observed directly |
| Gmail enlarged idle UI | L2 actual Chrome zoom | At 200%, Gmail minimized the compose window on resize; reopening and focusing Subject showed an idle DICTOZY control within the viewport. At 400%, compose remained minimized and could not be reopened through the tested control, so extension layout was not validated. Restored original 100% zoom. Recording/processing layouts at these zooms remain pending |

For the live expiry check, the agent first attempted generated audio/fixed-response isolation, but
the browser debugging interface became unavailable after reload. That approach produced no live
Gmail expiry evidence. The user supplied a fresh spoken result through the existing backend/xAI;
the agent then observed the notice, focused Subject, waited without Copy/Discard or tab switching,
and verified expiry. At the later inspection, approximately 66 seconds had elapsed since first
observation; the exact live expiration boundary was not measured. The body's fixture text stayed
unchanged and a native X keypress, without refocusing, landed in Subject. The expiry fixture was
cleared and its extra test tab closed. Original Gmail/ChatGPT tabs were retained. No private content
or live transcript was saved in the evidence record, and no message was sent.

Final rerun: **293 passed, zero failed/skipped** (54 unit, 123 browser, 95 backend, 21 website).
Browser cases comprise 102 injected/mocked and 21 unpacked/synthetic. The real-minute test was run
with `caffeinate -i` to avoid host idle sleep; an earlier attempt encountered a host/process pause.
No product timeout or assertion was weakened. At this recovery-fix checkpoint, live 10/30-second
speech was still pending; see the follow-up below. Clipboard denial/retry remains mocked coverage,
and actual screen-reader, full editor and pilot acceptance remain open.

## Physical duration follow-up — 2026-10-25

Environment L2, ChatGPT, the unpacked branch including recovery fix `8753628`, English formatting;
`physical_mic_provider` with human speech and the existing backend/xAI route. No mocks or generated
audio were used in these trials. Evidence stores only results/timing, not audio or returned text.

| Trial | Result | Evidence / limits |
|---|---|---|
| 10-second configured limit | Passed — joint human/agent execution | Agent observed automatic Recording → Transcribing → Success, approximately 9.98s between first recording and first transcribing samples, timer reaching 10s/0s, controls visible at every recording sample and activity indicated. Preserved fixture prefix with text appended; one native Undo restored it. Polling was approximately 500ms, not exact audio duration. Physical microphone-indicator release was not separately confirmed for this run |
| First 30-second attempt | Interrupted; excluded from automatic-stop acceptance | Agent saw idle around 23s; user reported switching windows/tabs or changing focus. No full network/track trace. User confirmed starting the subsequent recording independently; later text/timer are not attributed to the interrupted run |
| Second 30-second attempt | Passed — user reported; aftermath verified by agent | User confirmed automatic stop at 30s without Stop, controls visible throughout, text inserted and microphone-use indicator off. Agent observed idle with timer 30s/0s and original fixture prefix preserved, then verified one native Undo restored the exact fixture. No continuous agent timing of this run |
| Restore preferences and fixture | Passed — agent UI observation | Saved original 10s value and English formatting verified; original composer fixture restored, recording idle. No message sent |

The 10s/30s completion checks now have limited live evidence. They do not complete the broader
human checklist or pilot and do not justify changing duration limits. Default 10s / maximum 30s
remain unchanged. At this duration-check checkpoint, full physical screen-reader, enlarged recording
layouts and other editor/pilot checks were pending. The automated total then was 293 passing tests;
those manual checks are separate, not added to that count. See the enlarged-layout follow-up below.

## Enlarged-layout follow-up — 2026-10-25

| Check | Method | Result / limits |
|---|---|---|
| ChatGPT 200% recording controls | L2 installed extension, brief microphone capture then Discard; no speech/provider completion trial | Mic/panel/timing/activity/Stop/Discard within 600×456 CSS viewport; controls visually readable. Tab reached microphone and Stop; mouse Discard preserved fixture and returned to idle |
| ChatGPT 400% recording controls | L2 actual Chrome zoom and browser-generated keyboard input | Controls within 300×228; Tab microphone → Stop → Discard, then Space, preserved fixture and returned to idle. **Partial:** panel overlaps composer content, so the broader no-editor-occlusion check remains open |
| Gmail fullscreen compose, 200% | L2 actual Chrome zoom | Idle mic within viewport. Recording attempt blocked/inconclusive after browser-control timeout and unresponsive page; AX and screenshot states conflicted. Discard attempted; cancellation/recording results unverified. No confirmed extension cause |
| Restore browser environment | L2 native Chrome UI | Original 100% zoom restored for both sites; ChatGPT original fixture intact/idle. Recovered Gmail in a fresh tab and closed stalled tab/connection. Search for the unique layout fixture in drafts returned no matches. No Send |
| 300×228 recording/recovery/clipboard error | `mocked_browser`, two new regressions | Passed panel bounds on both axes, control hit targets, keyboard navigation/focus, reduced-motion styles and live-region attributes. Actual enlarged live recovery/processing remains pending |
| VoiceOver speech | Human listening required | Pending; prepared a short handoff. Accessible names and ARIA inspection do not prove spoken announcements or countdown silence |

No network trace or physical microphone-release measurement was made for the enlarged-layout
captures. Do not infer upload suppression from UI-only Discard. The real zoom tests and the mocked
viewport tests remain separate. Full regression rerun: **295 passed, zero failed/skipped** (54 unit,
125 browser = 104 mocked + 21 unpacked/synthetic, 95 backend, 21 website). Package and whitespace
checks passed. No application source change was made for this follow-up.

## Release status

All six gates remain open: Render proxy/worker/replica/ingress verification; durable aggregate usage
protection; physical microphone and human installed-extension acceptance; full live-editor testing;
production logging/deployment validation; coordinated privacy publication. No deployment,
publication, infrastructure change, new permissions, telemetry or Phase 4 work is included.
