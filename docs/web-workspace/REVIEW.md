# Website writing workspace — local review

November 10, 2026. Development only; no production deployment, Store upload,
policy publication or provider charge is authorized by this work.

## Implementation and boundaries

`/try.html` offers one stable plain-text editor, the real shared microphone and
recording/recovery controls, word count, explicit Copy and confirmed Clear.
Recording remains 10 seconds by default and 1–30 seconds configurable. Stop
submits; Discard and processing Cancel invalidate pending work. Safe insertion
and native Undo use the existing field/snapshot logic. A changed draft is never
replaced by a stale result. Eligible completed recovery remains one in-memory
result for up to 60 seconds; cancellation does not create recovery.

Website duration/language choices last for this visit and are independent of
Chrome extension settings. Website vocabulary is intentionally omitted; the
extension's existing separate saving/sharing consent is unchanged. Remembering
one local draft is off by default. An existing valid saved draft records a prior
opt-in; turning the choice off removes that copy, keeping the open text. Clear
removes the current and saved draft, cancels pending work and clears recovery.
Storage and clipboard failures are reported without claiming success. No draft
text, surrounding field contents or vocabulary enters website requests.

PR #16's draft-persistence correction coordinates one local draft across tabs.
Every save/revocation takes an exclusive browser Web Lock and rereads the
authoritative consent/revision before writing. Turning remembering off or
confirming Clear removes the record and invalidates stale/queued saves without
editing any other tab's text. Conflicts pause saving; replacing another saved
version needs an explicit, nonblocking confirmation and another revision check.
Save/error feedback is visible beside the editor; repeated success messages are
not announced on every keystroke. No draft history or synchronization service is
added. [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)
coordinate cooperating same-origin tabs; storage events only update the UI.

The previous development-only record format can restore plain text, but requires
renewed consent before saving. Refresh any already-open **pre-fix** preview tabs
after preserving unsaved text: already-running old JavaScript cannot join the
new protocol. Browsers without Web Locks leave automatic saving unavailable,
while typing/copying/dictation remain usable. A failed storage deletion is
reported honestly; cross-tab revocation cannot be promised until deletion
succeeds or the owner clears site storage.

`shared/` is the canonical source of the controller, lifecycle, safe insertion,
configuration/language normalization and product panel CSS. Run
`python3 scripts/sync_shared.py` after editing it. Package and site validation
reject stale copies in `extension/` or `site/shared/`. Both artifacts serve their
own local code; neither fetches executable code from the other. The extension
adapter retains Chrome settings/messaging and the background-owned endpoint and
vocabulary consent. The website adapter uses a fixed endpoint and page settings;
no fake `chrome.*` globals, query-selected endpoints or frontend secrets exist.

## Compatibility decision

All editable workspace controls live in a same-origin frame. Published 0.1.14
injects into the top document only. A direct, unrelated-parent or nested visit
to `workspace.html` leaves the editor disabled; only the top-level first-party
`try.html` enables it. Messages carry validated height only, never draft text.
The website checks parent visibility and visible recording controls, including
while permission is pending. Scrolling the controls out of view stops capture.
The no-JavaScript fallback is an ordinary text area inside a separate frame,
with useful links and browser-native copying. There is no automatic focus.

The candidate extension excludes the exact official `dictozy.com` hostname in
the manifest and activation/command checks, without changing preferences or
global enablement. It remains active on unrelated supported sites. The website
does not claim or intercept the extension's reserved browser shortcut.

The immutable [published runtime fixture](../../qa/workspace-compatibility/README.md)
is from `27f2171fcc7a3d0e48c7062aa2781864abf9ab47`, with all 21 original
file hashes checked before use. The original 45,508-byte Store ZIP remains
identified by SHA-256
`0176e85eff0cd1668d102fd3f0b49f858b0beee76d7d8b56afd303ad02042899`.
No replacement ZIP was made. The refactor now has 22 allowlisted package files;
building them as published version 0.1.14 is deliberately blocked. A new
extension version and package require a separately approved release.

## Local preview

Worktree: `/Users/fk/.codex/worktrees/dictozy-web-workspace/voice-dictation-extension`

Branch: `codex/native-web-dictation-workspace`

Open **http://127.0.0.1:4198/try.html**. The page displays:
“Local review: transcription responses are mocked; no provider requests.”

Restart in separate persistent terminals:

```bash
cd /Users/fk/.codex/worktrees/dictozy-web-workspace/voice-dictation-extension
python3 scripts/workspace_preview.py --port 4198 --backend-port 4199
```

```bash
cd /Users/fk/.codex/worktrees/dictozy-web-workspace/voice-dictation-extension/backend
/Users/fk/Documents/Projects/voice-dictation-extension/backend/.venv/bin/python -m scripts.workspace_review --port 4199 --site-port 4198
```

The preview server binds loopback, serves only this worktree's `site/`, and
replaces the configuration response/CSP for this local review. No override is
shipped in the static artifact. The backend ignores `.env`, clears the provider
key, blocks outbound sockets and substitutes only the provider on the server;
multipart parsing, decoded audio validation and resource guards still run.
There is no public client-selectable mock mode. An ordinary static localhost
server fails closed for dictation while preserving typing/copying. Port 4197's
existing guide preview is independent and was left running.

Owner check: start and Stop for the fixed sample result, then use native Undo;
try Discard and processing Cancel; type while processing to see safe recovery;
try Copy, Clear/Keep text, and explicit draft remembering/reload/turn-off.
The local result is deterministic and says nothing about recognition accuracy.
Microphone access still requires an explicit click; automated checks used
synthetic audio, not the owner's physical microphone.

## Validation and evidence

At implementation completion: **437 automated tests passed**:

| Suite | Passed |
| --- | ---: |
| Node extension/shared unit tests | 64 |
| Chromium extension/browser workflows | 156 |
| Chromium website workflows | 47 |
| Backend pytest | 170 |

Site, shared-copy, package-input and Store-asset validators passed. No package
was built. The privacy patch applies cleanly; `PRIVACY.md` and the published
HTML article remain byte-identical to base `c14be560dfdab7ae2e10972dfe0b9ce14cacc216`.
The article SHA-256 is
`75342b0a6924e9d20889a48d4268398599d843981910c6c69f3fcdac92a5025b`.

Installed Chromium checks measured **1 capture, 1 website POST, 1 insertion and
0 extension POSTs** separately with no extension, published 0.1.14 and the
candidate extension. Native capture/MediaRecorder used Chromium fake audio;
provider responses were intercepted. Command routes were tested in the actual
extension worker, separately from DOM key events. This is not a claim of real
OS shortcut delivery on every platform. Both installed versions still dictated
on an unrelated HTTPS field. The parent-scroll cancellation check also passed.

[Local transport evidence](../../qa/workspace-compatibility/local-review-e2e.json)
additionally exercised native synthetic recording through the actual loopback
FastAPI route: 1 capture, 1 POST, HTTP 200, 1 server-side stub call and 1 insertion.
That POST was not fulfilled by Playwright. Provider egress was blocked; this is
not live xAI or production evidence.

[Browser screenshots and measurements](../review/web-workspace/validation.json)
cover empty/populated, recording, processing, recovery, Copy, Clear and settings;
320/390/768/1440 widths, 200% text and no-JavaScript typing. The workspace fits
without horizontal overflow. Workspace accessibility checks found no A/AA
violations; the existing desktop header's accessible-label/visible-text mismatch
remains outside this feature's scope. No screen-reader listening, real mobile
device, non-Chromium browser or live provider acceptance is claimed.

Figma's existing [Dictozy file](https://www.figma.com/design/vDnkAyY6fLE3AeQyrQAXmp)
was inspected and its blue/type/component direction reused. Editing was blocked
by: “You've reached the Figma MCP tool call limit for your View seat on the
Professional plan.” No seat was purchased, no unrelated design was changed,
and new editable workspace frames remain incomplete. Browser implementation
and local captures are the review source.

## Prepared privacy change and release gates

[privacy-pending.patch](privacy-pending.patch) is **not published or applied**.
It prepares matching Markdown/HTML disclosures for website recording through
Dictozy/xAI, independent settings, explicit one-draft local persistence,
clipboard actions, recovery and retention limits. The actual publication date
must be set at an authorized release; its placeholder exists only in this
non-deployed patch. The current policy retains November 1, 2026. Provider and
infrastructure retention qualifications remain intact.

The six existing release gates remain separate from this local implementation:

| Gate | Website-launch requirement / current evidence |
| --- | --- |
| Render proxy, workers, replicas and ingress | Reverify actual runtime/configuration before rollout; no live settings inspected or changed here. Retain accepted trust-none behavior unless verified proxy evidence supports another choice; shared-client limiting is a limitation. |
| Aggregate usage across restarts/instances | Existing shared process-local allowance is not a durable financial cap. Current finite credits, disabled top-up and bounded invoiced exposure must be verified and accepted before public launch; no historical balance is reused. |
| Real microphone and installed-extension acceptance | Synthetic native Chromium and immutable legacy/candidate installations passed; no physical-microphone or live-provider claim. Prior accepted manual evidence is not repeated. |
| Real editor compatibility | Native workspace typing/selection/Undo and unrelated-field extension regressions passed. Wider external editors remain unverified; no universal-compatibility claim. |
| Production logging/deployment validation | Automated safe logging/resource guards pass. Production config, exact deployed revision, minimal authorized smoke and safe cutoff remain rollout checks. |
| Coordinated privacy publication | Pending patch must be reviewed/published before activating the new data handling. No live policy change performed. |

## Staged release plan — not executed

1. Review this PR, privacy patch and abuse/spending exposure. Keep Render
   auto-deploy Off and Pages manual. Existing CI on PR/main does not deploy.
2. Under separate authorization, deploy the compatible backend first with the
   existing extension-only origin. Verify exact revision, one worker/replica,
   operational limits/logging and kill switch. Adding the website requires
   explicit `BACKEND_CORS_ORIGINS=chrome-extension://folpeencabfejhjokmldikaelonphmma,https://dictozy.com`.
   CORS is not authentication; website and extension share the same quotas.
3. Assign a new extension version, build/review/submit/publish its exclusion and
   shared-code update separately. Do not assume all old installations update.
   Keep the tested legacy frame protection regardless of rollout percentage.
4. Publish the approved privacy correction with its actual date, then enable the
   canonical website origin and manually deploy the approved `site/` artifact.
   Verify first-party embedding, explicit capture, cancellation and request
   counts. Any paid smoke needs its own authorization; this PR made none.
5. Watch aggregate request errors/latency/limits and provider spend without
   logging content. For urgent service cutoff, the existing
   `TRANSCRIPTION_ENABLED=false` stops **both** website and extension transcription.
   Removing a CORS origin alone is not a non-browser abuse cutoff. For a
   website-only recovery, restore the recorded prior static site under separate
   authorization; do not restore an unsafe backend or weaken resource guards.

No merge, auto-merge, workflow dispatch, Store change, infrastructure/billing
change or production action is part of this review handoff.
