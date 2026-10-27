# Dictozy 0.1.13 — review-only release candidate

Prepared after the approved backend rollout on October 26, 2026 (America/Toronto).
This is the current candidate checklist. The 0.1.12 directions in `release-checklist.md`
are historical and MUST NOT be used to upload this changed extension as 0.1.12.

## Scope and identity

- Proposed version: **0.1.13**, not submitted, approved by the Store, or published.
- Source base and deployed backend: `c8fda6c7d4884297275e1c34eb418fc1c18714f9`.
- Preparation changes only version metadata, its existing static expectations, release tooling and documentation.
- All packaged runtime bytes other than the manifest version must match the accepted source.
- Existing permissions, shortcuts, 10/30-second limits, safe insertion, Undo, cancellation and memory-only recovery remain unchanged.
- No merge to `main`, backend deployment, Store upload, billing change or public website change is authorized by preparation.
- The public Store listing was observed at 0.1.12. The developer dashboard required Google sign-in;
  unused-version and active-draft status remain UNVERIFIED. Check them before any upload and do not overwrite a draft.

## Backend evidence already obtained — do not repeat paid tests

The approved Render deploy `dep-dbg0udmk1f9s73b0qqqg` went live at
2026-10-27T02:41:29Z, using the exact accepted SHA above. The service remains
`srv-d8mr1eurnols73d01c8g`, one instance, Docker's explicit one-worker command,
auto-deploy Off, configured branch `main`. The older `main` must not be manually deployed.

Saved configuration: `FORWARDED_ALLOW_IPS` explicitly empty (trust no forwarded headers),
`TRANSCRIBE_AUDIO_BUDGET_SECONDS=3600`, window `86400`, unchanged production-only CORS.
This temporary proxy choice can group users under the same rate quota. The process-local
allowance resets on restart; it is NOT a durable financial cap.

The owner confirmed a $5 prepaid xAI balance, automatic top-up Off, invoiced allowance $0,
and no other applications sharing the credits. These are owner-confirmed billing facts,
not an independent account inspection or a measured post-smoke remaining balance.

Health returned 200. Exactly two authorized public-audio transcription requests returned
200 and nonempty transcripts, with no further requests required for preparation:

| Request | Request ID | Application latency |
|---|---|---:|
| Legacy file + language | `dc2472db71344ee4a74a413583c41467` | 542.07 ms |
| Same file + language + keyterm | `3eb5a4ea981441238e1cfac50422c05e` | 701.44 ms |

Their inspected application log entries contained request ID, route, status and latency,
not audio, transcript or vocabulary content. These two observations are not a latency
benchmark or evidence of improved recognition accuracy.

## Candidate validation and artifacts

Keep the lean testing policy. Run the existing full automated suite once against the
final candidate, not after each metadata edit. The prior accepted baseline was 381 tests:
60 unit, 150 browser, 150 backend, 21 website. Record actual current CI results; do not
claim that baseline was rerun until CI completes. No new human pilot or broad app tests.

CI checks out the exact PR head. After the three existing test jobs succeed, its review
job runs `python3 scripts/build_release_review.py`. That job creates a new review output,
verifies the 20-file package allowlist and every ZIP byte against source, checks that runtime
matches the accepted base except version, and emits SHA-256 plus source provenance.
It uploads only a GitHub Actions review artifact, never to the Chrome Web Store.

The outer Actions ZIP is a review bundle. **Only the inner `dictozy-v0.1.13.zip` is an
extension package.** Keep prior published archives immutable. Reproduce from a clean Git
checkout with the accepted base available; the builder refuses to overwrite existing output.

## Prepared release note (not yet public)

### What's new in 0.1.13

Safer recording and text insertion, temporary Copy/Discard recovery when a completed
transcript cannot be inserted safely, a first-use practice flow, clearer recording feedback,
and keyboard/accessibility refinements. Optional personal vocabulary lets you maintain
names and technical terms locally and separately enable sharing as transcription hints.
Sharing is off by default; saving terms does not enable it. No new browser permissions,
accounts, transcript history, automatic rewriting or spoken snippets are introduced.
Vocabulary hints do not guarantee improved accuracy. Support claims remain limited to the
actual documented workflows; Outlook, Notion and WhatsApp are not newly certified.

## Privacy, listing and publication coordination

Prepared `PRIVACY.md` and `site/privacy.html` travel in the review bundle, not the extension
ZIP. Before approved publication, reconcile both and remove preparation-only banners as
appropriate for an effective policy. Disclose temporary multipart-file spooling, provider
processing, one-result/60-second in-memory recovery, and local vocabulary with separate opt-in.
Do not promise infrastructure/provider zero retention or memory-only upload processing.
The already-deployed backend's temporary-spooling disclosure should not wait unnecessarily
for Store review; publishing that policy still requires the approved website change.

Preserve the published extension ID and first-party homepage/support/privacy URLs. Review
Dashboard data declarations against actual behavior, including optional personal vocabulary.
The public listing currently includes Location: review the applicable dashboard definition
against transport IP handling; do not automatically remove it solely because GPS is unused.
Do not certify data categories without inspecting the actual declaration form.

Review/regenerate popup and recording screenshots against the shipped UI before submission;
the old settings artwork must not be assumed current after vocabulary/onboarding additions.
No screenshot refresh or live-dashboard declaration check is asserted by the package validators.
Keep site `softwareVersion` at the last observed published version until publication is confirmed.

## Six tracked gates — evidence-bounded status

| Gate | Current scope/status |
|---|---|
| Proxy/runtime/replica/ingress | Runtime and one-instance deployment verified; explicit trust-none interim accepted. Upstream proxy identity/edge limits remain unknown, not claimed as verified. |
| Aggregate usage protection | Local allowance deployed; provider spending settings owner-confirmed as above. No durable shared store added. |
| Physical microphone/installed package | Existing scoped Gmail/ChatGPT evidence retained. No repeated broad manual acceptance required; final published-package identity smoke remains separate. |
| Wider editor compatibility | Optional follow-up; untested apps remain unverified. |
| Production deployment/logging | Approved SHA live; health, two provider paths and their safe application logs verified. |
| Privacy publication | OPEN: prepared files remain unpublished; Dashboard declarations and coordinated public policy must be resolved before publication. |

## Publication hold and safe operations

Do not upload, submit for review, publish, enable auto-publish, merge, or turn Render auto-deploy
back on during preparation. Request separate release approval after the candidate checks,
version/draft status, accurate assets and privacy coordination are complete. Do not make an
availability promise based only on a green health endpoint.

For a safety/cost incident, the approved cutoff is `TRANSCRIPTION_ENABLED=false` applied with
a standard deployment and safe 503 verification. Render Restart is not a substitute for
applying saved environment changes. In-flight provider calls can finish. The old `c1f2487`
backend is not a security-equivalent rollback; do not restore it without explicit risk acceptance.
Extension rollback needs an approved higher corrective version, not a promised immediate downgrade.
