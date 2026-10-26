# Dictozy improvement roadmap

Assessment date: 2026-10-17 (America/Toronto). Base: `a939c61` on `main`.
Current review date: 2026-10-25 (America/Toronto).
Working branch: `codex/phase-3-compatibility-reliability` (Phase 2 base: `bbdf9a2`).

## Scope and approval gates

Phase 0, Phase 1 and Phase 2 implementation are reviewed and accepted. Phase 3 is authorized.
Stop for user review after Phase 3; implementation acceptance does not establish production readiness.
Do not deploy, publish, change production configuration/secrets, or begin later phases.
Keep plain JavaScript, Manifest V3, FastAPI, backend-only xAI access, existing preferences,
shortcuts, supported fields, native Undo, and browser permissions.

Statuses: **Pending**, **In progress**, **Implemented**, **Tested**, **Blocked**, **Deferred**.
“Tested” names the validation method; it does not imply real microphone or named-site verification.

## Phase 0 — baseline (Tested)

- Clean tracked working tree; pre-existing untracked `SEO Report.pdf` is unrelated and preserved.
- Existing suites: extension unit **52/52**, mocked Chromium **59/59**, backend **50/50**,
  website Chromium **21/21**. No live transcription calls or secrets required.
- Chromium tests inject Chrome API/MediaRecorder mocks into the local QA page; they do not
  load the packaged extension or exercise native microphone permissions.
- CI runs backend pytest/dependency checks, JavaScript syntax/unit/browser tests, extension
  package validation, Store asset validation, and website validation/browser tests.
- Local extension uses the fixed production backend. Starting local FastAPI does not redirect it.
- Deployment is one Uvicorn Docker process; current concurrency/rate guards are process-local.
- Source review confirms unresolved recording visibility/activation, keyboard focus, stale
  insertion offsets, trusted-client-address, WAV duration, logging, and retention discrepancies.
- Existing protections to preserve: explicit action, sensitive-field exclusions, caret-only
  movement support, native editing transactions, cancelled/stale-response rejection, no raw
  audio history, backend-only secrets, upload/type limits, emergency cutoff, exact-origin settings.
- [Public Store listing](https://chromewebstore.google.com/detail/dictozy-voice-dictation/folpeencabfejhjokmldikaelonphmma)
  checked on this assessment date shows **0.1.12**, updated **September 7, 2026**. This verifies
  public metadata, not byte-for-byte equality with the checkout. No release is being published.

## Phase 1 — correctness, security, trust (Implementation accepted; release gates open)

| ID / priority | Problem and user impact | Components | Proposed correction | Complexity / risk / dependencies | Regression and acceptance | Status |
|---|---|---|---|---|---|---|
| P1-A / critical | Recording survives unsafe focus/hidden page; controls vanish | `extension/content.js` | Cancel requesting/recording sessions on unsafe context, visibility/page lifecycle; stop tracks immediately; bind recorder callbacks to their originating session | Medium; permission-prompt and stop-event races; retain normal shortcut stop | Unsafe focus/hidden page/control removal cause no upload; late permission/recorder events cannot affect new session | Tested locally |
| P1-B / critical | Pending results overwrite edits using stale offsets | `content.js`, `dom-utils.js` | Capture temporary content/selection guard; revalidate before and after page editing hooks; refuse uncertain insertion | Medium; rich-text DOM mutation and reentrant `beforeinput`; preserve caret-only movement and Undo | Textarea/input/rich-text edits, changed ranges, focus changes, delayed results never overwrite unrelated text; existing Undo tests pass | Tested locally |
| P1-BR / critical | Refusing insertion loses already completed speech | `content.js`, `content.css` | Minimal one-result memory-only Copy/Discard notice, no transcript in DOM, 60-second expiry; clear on new recording, disable, page exit | Medium; clipboard user gesture and lifetime; explicitly required by Phase 1 B despite broader Phase 2 recovery scope | Copy requires trusted click/key, cancellation has no recovery, expiry/discard clear memory, failed copy remains recoverable | Tested locally |
| P1-C / critical | Page-generated clicks reach microphone start | `content.js` | Trust-check DOM activation; keep extension commands separate | Low; distinguish native keyboard click from script click | Synthetic click/dispatch cannot request microphone; mouse/Enter/Space/shortcut work | Tested locally |
| P1-D / high | Keyboard focus on microphone loses editable target | `content.js` | Resolve focused extension control against retained valid target | Low; never fall back from an unrelated focused element | Enter/Space start/stop, input focus restored, excluded fields stay excluded | Tested locally |
| P1-E / high | Spoofable client keys and no aggregate provider budget | backend config/limits/route, Docker, deployment docs | Use server-resolved client address only; explicit trusted proxy deployment contract; atomic aggregate audio-duration reservations before provider call; single worker | Medium; trusted proxy ranges need deployment verification; memory budget resets on restart and is not a durable billing cap | Forged headers cannot change direct-client key; reservations are atomic, exhausted budget blocks provider, failures are charged conservatively; production guards cannot be disabled accidentally | Tested locally |
| P1-F / high | Unknown WAV frame count defeats duration checks; long audio truncated | audio normalization and tests | Measure actual decoded PCM; reject outside duration bounds; bounded decode with over-limit detection and malformed-input checks | Medium; browser container duration tolerance, ffmpeg protocols/resources | Short/valid/overlong/manipulated/malformed audio; real synthetic ffmpeg tests; provider never sees invalid audio | Tested locally |
| P1-G / high | Upload spooling differs from memory-only claim; request logs suppressed | backend request handling/logging, privacy docs | Bound actual body before parsing; explicitly describe temporary upload spooling and cleanup; safe structured request/latency logging | Medium; no permanent storage or new retention; no raw content in exceptions/logs | Missing/false size header cannot bypass body cap; cleanup; production logger capture excludes content/IP; safe 500s | Tested locally |
| P1-H / medium | Repository release state conflicts with public metadata | README, Store/QA docs, site metadata | Record verified 0.1.12 baseline; separate unpublished Phase 1 work | Low; do not imply unpublished changes are live | Metadata/asset/site validators and final diff review | Tested locally |

### Aggregate protection boundary

Use an enforceable per-running-instance audio allowance with an explicitly single-worker Docker
command; count attempted provider work without refunds. No new infrastructure, paid service,
database, or persistent user data is authorized. This reduces aggregate abuse independently of
IP quotas, but is **not** a restart-proof or multi-replica spending cap. A durable global cap
requires an approved persistent shared store or verified provider/edge hard limit. Record this
deployment dependency in the Phase 1 report; do not silently introduce infrastructure.

### Quality gate and manual acceptance

1. Add failing targeted regressions before corrections where feasible.
2. Run focused checks, then all four suites and CI-equivalent validators.
3. Review diff, permissions, retention, stale operations, event reentrancy, resource bounds.
4. Human installed-extension checks: mouse/Enter/Space/shortcut; recording then password/blank
   focus/tab switch; cancel pending microphone access; edit earlier text while response is pending;
   verify no overwrite, recovery Copy/Discard/expiry, native Undo, site/global toggles.
5. Deployment-only checks: approved ingress trust chain, one worker/replica, structured logs,
   aggregate limit, request-body bounds, real microphone/provider behavior. No production changes.

## Phase 2 — first use and recovery UX (Implementation accepted; manual gates open)

Scope/checklist: build on P1-BR recovery; explicit recording discard; elapsed/remaining time;
restrained activity feedback; optional practice/onboarding/help; keyboard/screen-reader review.
Acceptance: explicit microphone activation only, one temporary recovery result, reliable copy and
expiry, understandable timing, functional practice, unchanged settings/shortcut behavior.
Tests: UI/state/clipboard/expiry regressions plus human keyboard, screen-reader and permission checks.
Risk: control clutter and focus changes; no permissions, persistent history or analytics expansion.
Documentation/report: update extension/manual QA/privacy as applicable; report tests and limitations.

## Phase 3 — real applications and daily reliability (Tested locally; live acceptance Pending)

Scope/checklist: evaluate Gmail, Outlook, an AI chat, messaging, and notes app; select three for
deeper testing; investigate iframes, Shadow DOM, rich text, native Undo and Permissions Policy;
consider 30-second default/60-second maximum only after validated duration/lifecycle behavior.
Acceptance: dated compatibility matrix with environment, workflow, method, outcome and limitations;
never infer named-site compatibility from mocks. Pilot targets: first success within one minute,
95% completion in selected workflows, zero known wrong-field insertion or uncontrolled recording.
Tests: packaged browser/real microphone where available, targeted regressions, privacy-conscious
manual stop-to-text/correction/recovery measurements. No private speech/page-content telemetry.
Risk/dependencies: application access, real Chrome/microphone and human validation; longer clips
must respect backend bounds. Documentation/report: compatibility matrix and measured evidence.

## Phase 4 — personal productivity (Deferred; evidence and approval required)

Scope/checklist: choose vocabulary OR snippets based on Phase 3 evidence; verify xAI capabilities;
explicit local management/deletion, disclosure of transmitted vocabulary, distinctive snippet
triggers, undoable text insertion, no automatic submission.
Acceptance/tests: demonstrated user need; no accidental trigger, destructive replacement or
secret exposure; deletion/disclosure and unchanged core behavior verified.
Risk/dependencies: new locally stored user data and vocabulary transmission require explicit
scope/privacy review. Documentation/report: record evidence, chosen feature, tests and limitations.

## Phase 1 final report

Implementation is complete within the authorized local Phase 1 scope. See the detailed
[Phase 1 report](PHASE_1_REPORT.md) and [manual/deployment acceptance checklist](../qa/phase-1-acceptance.md).
All four suites pass: **53 unit + 88 browser (86 mocked, 2 unpacked MV3/synthetic microphone)
+ 95 backend + 21 website = 257 tests**, zero failures or skips; baseline was 182.

Additional validation: package/Store/site validators, JavaScript syntax (20 files), Python dependency
check, real local Uvicorn startup/health/request-ID/latency logging, and visual inspection of the
recovery notice on the local test fixture. No physical microphone, live application, xAI, production
Render, or Store-installed verification was performed. No deployment, publishing or push occurred.

| Remaining gate | Status | Dependency / acceptance |
|---|---|---|
| Physical microphone, human keyboard/screen-reader and named-app behavior | Pending | Human browser acceptance; Phase 3 contains the wider compatibility program |
| Real ingress trust, service replica count and production logs | Pending | Approved deployment access; confirm trust chain and one worker/replica |
| Durable aggregate spending protection across restarts/replicas | Deferred | Approval for a shared durable store or verified provider/edge hard cap; current cap is per running worker |
| Publish privacy revision and new extension version | Deferred | Separate release approval; do not reuse public 0.1.12 |
| Phase 2 implementation | Tested locally; accepted | 277 tests passed at closure; human/manual release acceptance remains pending |

The implementation intentionally rejects changed editor contents instead of rebasing stale offsets.
One completed transcript per page may be recovered for 60 seconds without persistent history.
Conservative refusal can increase recovery frequency in dynamic rich-text editors; this is safer
than silent replacement. Default/max recording settings remain 10/30 seconds. Source version,
manifest permissions, language settings and architecture remain unchanged.

## Phase 2 — authorized implementation (Tested locally; accepted 2026-10-25)

Authorization received after Phase 1 review. Branch: `codex/phase-2-first-use-feedback`,
starting at `9ea6918`. Before changes, all **257** Phase 1 tests passed again (53 unit,
88 browser, 95 backend, 21 website). No critical regression was found in that review.
Phase 1 implementation is accepted as the local baseline; testing and production readiness
remain incomplete. The six open gates are real Render proxy/worker/replica/ingress verification,
durable cross-restart/multi-instance usage enforcement, physical microphone/manual installed
acceptance, real editor compatibility, production logs/deployment validation, and coordinated
privacy publication. No gate is closed by the passing automated suites.

| Priority / scope | Minimum implementation | Acceptance / regression tests | Risk | Status |
|---|---|---|---|---|
| 1 / optional practice | Packaged practice page linked prominently from popup; reuse dictation engine; instructions, actual shortcut, permission/privacy/help guidance | No capture on open/Try focus action; explicit microphone activation completes practice; Undo; master toggle; safe denied permission; packaged page present | Extension-origin behavior and shortcut delivery need unpacked MV3 tests | Tested locally |
| 2 / recording feedback | Elapsed/remaining time and small activity label in existing status UI; visible Stop/Discard; reuse existing sampler | 10s default/30s cap unchanged; trusted mouse/Enter/Space; discard sends nothing; timers and resources cleared; no loss of selection | Controls must not trigger unsafe-focus cancellation or obscure Stop | Tested locally |
| 3 / recovery refinement | Explain refusal reason; keyboard focus on removal; copy/discard/expiry announcements; clear clipboard retry | One result/60s/memory only; stale copy promises cannot erase new result; no content in DOM; no editor overwrite/focus theft | Async clipboard and expiry transitions | Tested locally |
| 4 / accessibility | Separate live status from rapidly changing feedback; explicit labels, focus rings, contrast and reduced motion | Keyboard paths, accessible names, constrained viewport/reduced-motion checks; human screen reader remains pending | Avoid repetitive announcements and cursor movement | Tested locally |

Phase 2 completion requires focused and full suites, package/syntax/permission checks, visual
inspection, updated manual acceptance and a final report. Phases 3–4, production deployment,
Store publication, merging and infrastructure changes remain deferred pending separate approval.

### Phase 2 completion

The [Phase 2 implementation report](PHASE_2_REPORT.md) records all changed files, decisions,
validation methods, accessibility findings and risks. Final counts: **54 unit + 107 browser
(102 mocked, 5 unpacked MV3) + 95 backend + 21 website = 277 passing tests**, zero final failures
or skips. The 20 new cases cover practice, recording feedback, keyboard navigation and recovery.
Manifest/endpoint/backend/permissions/default duration/max duration remain unchanged. The existing
sampler and recovery mechanism were extended; no new storage, analytics or dependencies were added.

The [manual acceptance checklist](../qa/phase-2-acceptance.md) remains pending for physical speech,
real permission dialogs, OS shortcuts and screen readers. Screenshot inspection and source-palette
contrast checks were performed; these are not a complete accessibility certification. All six
Phase 1 release gates above remain open. No production readiness, deployment or publication is claimed.

Phase 2 was accepted on 2026-10-25. Phase 3 is authorized; Phase 4 remains Deferred.

## Phase 3 tracking — 2026-10-25

Baseline: verified the accepted Phase 2 commits and clean tracked tree, preserving the unrelated
untracked `SEO Report.pdf`. Unit 54, backend 95 and website 21 passed. Initial browser run:
105 passed / 2 Chromium startup timeouts before test assertions. Isolated reproduction confirmed
persistent-browser launch contention; sequential installed cases passed 10/10. Per-file execution
now keeps those cases in one worker without weakening assertions, skipping failures or extending
timeouts. Final full-suite evidence belongs in [the Phase 3 report](PHASE_3_REPORT.md).

| ID / priority | User impact and scope | Components / approach | Risk / dependencies | Acceptance and regression evidence | Status |
|---|---|---|---|---|---|
| P3-A / high | Understand useful everyday workflows | Gmail, ChatGPT, Notion as provisional priorities; Outlook and WhatsApp Web also assessed; dated [matrix](COMPATIBILITY_MATRIX.md) | Account access, app changes, browser/build identity; no customer ranking data | Separate UI preflight, local editor models and actual dictation; no named-app support claim from mocks | Tested for access/UI only; full live acceptance Pending |
| P3-B / high | Open-shadow editor cannot start despite a visible mic | `content.js`: resolve nested open-root focus; direct session focus listener and cleanup | Retargeted browser focus events; closed roots and frames stay excluded | Unpacked/native browser insertion and Undo, immediate unsafe focus cancellation, retry and unchanged surrounding content | Tested with synthetic audio/stub backend |
| P3-C / high | Native adjacent controls may be obscured | Reproduce thin composer/control geometry observed in live ChatGPT; generic placement correction | Avoid layout jitter, preserve visible Stop; no site-specific private data | Local geometry regression plus live idle-geometry recheck after local extension reload | Tested locally and in live idle UI; full capture Pending |
| P3-D / high | Repeat-session failures and latency are unmeasured | `daily-reliability.spec.js`: five insert/Undo cycles and five discards, numeric timing attachment | Synthetic device/stub does not measure speech or production latency | Correct target only; five provider-stub calls; no discarded result; cleanup between cycles | Tested locally |
| P3-E / medium | Longer phrases can hit the current limit | Review frontend 10/30s and strict decoded backend 60s ceiling | Encoding overhead, real cutoffs/latency, cost and open aggregate-budget gate | Retain 10/30 until physical-mic pilot demonstrates benefit and boundaries are validated | Deferred; evaluated, no duration change |
| P3-F / high | Need evidence without collecting private writing | [Manual protocol](../qa/phase-3-acceptance.md), optional empty metrics CSV | Human mic, screen reader, private disposable app fields | First-use, completion, recovery, cutoff and correction metrics; proposed targets clearly unmeasured | Implemented; human execution Pending |

All six Phase 1 release gates remain open. Phase 4 remains Deferred. No deployment, publication,
production configuration, permissions, persistent transcript storage or infrastructure changes.

### Phase 3 local completion

Final validation: **54 unit + 120 browser (102 mocked, 18 unpacked/synthetic) + 95 backend +
21 website = 290 passing tests**, zero final failures/skips. All package/assets/site/dependency,
changed-JavaScript syntax and whitespace checks pass. Independent review found and corrected a
same-rich-editor descendant focus regression before the final suite. Thirteen tests were added.

Live Chrome preflight detected Gmail/ChatGPT fields and verified corrected ChatGPT idle control
placement. No live audio/provider/insertion test was performed. The user chose to leave Notion,
Outlook and WhatsApp login-dependent editor tests pending. Physical microphone, human shortcut,
screen-reader and full named-editor acceptance remain Pending; no production-readiness claim.

See [Phase 3 report](PHASE_3_REPORT.md) for files, evidence, local timing limits, reproduction,
manual checklist and remaining risks. **Stop for review; complete manual Phase 3 acceptance before
considering Phase 4.**
