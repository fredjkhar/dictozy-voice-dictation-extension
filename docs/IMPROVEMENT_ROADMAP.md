# Dictozy improvement roadmap

Assessment date: 2026-10-17 (America/Toronto). Base: `a939c61` on `main`.
Working branch: `codex/phase-1-correctness-trust`.

## Scope and approval gates

Phase 0 and Phase 1 are authorized. Stop for user review after Phase 1.
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

## Phase 1 — correctness, security, trust (In progress)

| ID / priority | Problem and user impact | Components | Proposed correction | Complexity / risk / dependencies | Regression and acceptance | Status |
|---|---|---|---|---|---|---|
| P1-A / critical | Recording survives unsafe focus/hidden page; controls vanish | `extension/content.js` | Cancel requesting/recording sessions on unsafe context, visibility/page lifecycle; stop tracks immediately; bind recorder callbacks to their originating session | Medium; permission-prompt and stop-event races; retain normal shortcut stop | Unsafe focus/hidden page/control removal cause no upload; late permission/recorder events cannot affect new session | In progress |
| P1-B / critical | Pending results overwrite edits using stale offsets | `content.js`, `dom-utils.js` | Capture temporary content/selection guard; revalidate before and after page editing hooks; refuse uncertain insertion | Medium; rich-text DOM mutation and reentrant `beforeinput`; preserve caret-only movement and Undo | Textarea/input/rich-text edits, changed ranges, focus changes, delayed results never overwrite unrelated text; existing Undo tests pass | Pending |
| P1-BR / critical | Refusing insertion loses already completed speech | `content.js`, `content.css` | Minimal one-result memory-only Copy/Discard notice, no transcript in DOM, 60-second expiry; clear on new recording, disable, page exit | Medium; clipboard user gesture and lifetime; explicitly required by Phase 1 B despite broader Phase 2 recovery scope | Copy requires trusted click/key, cancellation has no recovery, expiry/discard clear memory, failed copy remains recoverable | Pending |
| P1-C / critical | Page-generated clicks reach microphone start | `content.js` | Trust-check DOM activation; keep extension commands separate | Low; distinguish native keyboard click from script click | Synthetic click/dispatch cannot request microphone; mouse/Enter/Space/shortcut work | Pending |
| P1-D / high | Keyboard focus on microphone loses editable target | `content.js` | Resolve focused extension control against retained valid target | Low; never fall back from an unrelated focused element | Enter/Space start/stop, input focus restored, excluded fields stay excluded | Pending |
| P1-E / high | Spoofable client keys and no aggregate provider budget | backend config/limits/route, Docker, deployment docs | Use server-resolved client address only; explicit trusted proxy deployment contract; atomic aggregate audio-duration reservations before provider call; single worker | Medium; trusted proxy ranges need deployment verification; memory budget resets on restart and is not a durable billing cap | Forged headers cannot change direct-client key; reservations are atomic, exhausted budget blocks provider, failures are charged conservatively; production guards cannot be disabled accidentally | Pending |
| P1-F / high | Unknown WAV frame count defeats duration checks; long audio truncated | audio normalization and tests | Measure actual decoded PCM; reject outside duration bounds; bounded decode with over-limit detection and malformed-input checks | Medium; browser container duration tolerance, ffmpeg protocols/resources | Short/valid/overlong/manipulated/malformed audio; real synthetic ffmpeg tests; provider never sees invalid audio | Pending |
| P1-G / high | Upload spooling differs from memory-only claim; request logs suppressed | backend request handling/logging, privacy docs | Bound actual body before parsing; explicitly describe temporary upload spooling and cleanup; safe structured request/latency logging | Medium; no permanent storage or new retention; no raw content in exceptions/logs | Missing/false size header cannot bypass body cap; cleanup; production logger capture excludes content/IP; safe 500s | Pending |
| P1-H / medium | Repository release state conflicts with public metadata | README, Store/QA docs, site metadata | Record verified 0.1.12 baseline; separate unpublished Phase 1 work | Low; do not imply unpublished changes are live | Metadata/asset/site validators and final diff review | Pending |

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

## Phase 2 — first use and recovery UX (Deferred; approval required)

Scope/checklist: build on P1-BR recovery; explicit recording discard; elapsed/remaining time;
restrained activity feedback; optional practice/onboarding/help; keyboard/screen-reader review.
Acceptance: explicit microphone activation only, one temporary recovery result, reliable copy and
expiry, understandable timing, functional practice, unchanged settings/shortcut behavior.
Tests: UI/state/clipboard/expiry regressions plus human keyboard, screen-reader and permission checks.
Risk: control clutter and focus changes; no permissions, persistent history or analytics expansion.
Documentation/report: update extension/manual QA/privacy as applicable; report tests and limitations.

## Phase 3 — real applications and daily reliability (Deferred; approval required)

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

Pending implementation and validation. Record file groups, test counts, focused reproductions,
manual work actually performed, untested environments, residual risks, commits, and approval gate.
