# Phase 3 final summary

Date: **2026-10-26** (America/Toronto). Branch: `codex/phase-3-compatibility-reliability`.
Final product revision: `87fcc00`; this closeout adds tests and documentation only.

**Subsequent development:** the user authorized Phase 4 optional personal vocabulary after this
closeout. Its implementation and test results are in the [Phase 4 report](PHASE_4_REPORT.md).
Phase 4 approval statements below describe the historical Phase 3 closeout; release gates stay open.

**Acceptance update — 2026-10-26:** the user accepts Phase 3 as locally implemented and
automated-test validated. The [lean testing policy](../AGENTS.md#lean-testing-and-autonomous-decisions)
now applies. Notion/Outlook/WhatsApp, extensive layouts and the human pilot are optional follow-ups
unless a specific release requirement or observed critical defect makes them necessary. They do
not block continued development. All six release gates remain open; Phase 4 implementation has
not begun at that point. See the [current Phase 4 status](PHASE_4_REPORT.md).

**Phase 3 local implementation and available validation are complete. Broader live compatibility
and pilot validation remain pending. This does not establish production readiness.** The user
previously chose to leave login-dependent editor tests pending. All six release gates remain open;
Phase 4 has not begun. Nothing was deployed, published, merged to production or changed in infrastructure.

This is the current consolidated result. The [implementation report](PHASE_3_REPORT.md) and
[compatibility matrix](COMPATIBILITY_MATRIX.md) retain the chronological evidence, including earlier
pending and inconclusive attempts. Those earlier statuses do not supersede this summary.

## Improvements delivered across Phase 3

- Fixed nested open-shadow editor activation and prompt cancellation when recording focus becomes
  unsafe, while preserving movement within the same rich editor.
- Reduced collisions with adjacent native page controls and corrected the recording panel covering
  the ChatGPT composer at 400% zoom. Placement is bounded and generic, with no application-specific selectors.
- Corrected recovery dismissal/expiry focus so a user's newly selected field is respected.
- Stabilized screen-reader announcements with one persistent polite status region, no spoken
  countdown, clearer repeated Copy outcomes, and keyboard error Dismiss returning to the current field.
  Announcements stay out of supported editable-body content, including observed body/html
  editability transitions. Document-wide `designMode` support was not added.
- Added unpacked-extension compatibility and repeated-session checks, a dated application matrix,
  and a content-free manual pilot protocol. Preserved plain JavaScript, MV3, FastAPI, backend-only
  xAI, permissions, settings, shortcuts, native Undo, and one-result memory-only 60-second recovery.
- Retained the **10-second default and 30-second maximum**. Longer recording remains deferred;
  the backend's 60-second validation ceiling alone does not justify a longer capture timer.

The closeout adds four compact-layout cases, strengthens compact recovery expiry, and exercises
native Undo → Redo → Undo on every successful repeated-session insertion. No new runtime changes
or blocking product regression were found during this final validation.

## Final automated results

| Suite | Passed | Evidence type |
|---|---:|---|
| Extension unit | 54 | Isolated JavaScript |
| Extension browser | 144 | 123 mocked workflows; 21 actual unpacked MV3 cases with synthetic audio and stubbed backend |
| Backend | 95 | Local validation/security/provider-mock tests, including generated decoded audio |
| Website | 21 | Local browser tests |
| **Total** | **314** | **Zero failures or skips** |

One final risk-focused review of `f04643c` reused existing coverage: **21 lifecycle/DOM unit tests,
29 browser tests (26 mocked, 3 unpacked/synthetic), and 31 backend tests passed; zero failures**.
It covered explicit activation, unsafe/hidden-page cancellation, late callbacks/permission,
microphone cleanup, changed-field/beforeinput protection, focus-safe recovery, Undo/Redo, accessible
status/error focus, trusted proxy boundaries, upload/PCM/resource limits, atomic budgets and safe
logging. No new critical defect or coverage gap justified runtime changes or additional tests.
No personal-account interaction or manual participation was requested. The unchanged 314-test
baseline above was reused; it was not rerun for this documentation-only policy update.

All four suites were rerun during closeout. The full 144-case browser run includes the four new
compact-layout cases. The subsequent test-only Undo/Redo enhancement passed its focused native
repeated-session case; that case was already counted, so the total remains 314. No runtime code
changed after the full runs. Browser and website suites ran sequentially to avoid shared-server conflicts.

Package check-only, Store asset validation, static-site validation, Python dependency checks and
final whitespace validation passed. No tests were deleted, weakened or skipped to obtain these results.

New closeout coverage checks 600×456 and 300×228 CSS viewports through Preparing, Transcribing,
success and long microphone-error states: panel bounds, reachable controls, keyboard Stop/Dismiss,
selection preservation, safe insertion/Undo and private-text exclusion from status announcements.
Recovery expiry now also checks compact bounds and an explicitly focused control. These are
**viewport simulations with mocked media/provider**, not actual Chrome zoom or third-party app tests.

The unpacked repeated-session test completes five selected-range insertions (three textarea, two
rich text) and five discards. Native Undo/Redo preserves surrounding text, rich formatting, focus
and unrelated fields. Its latest five local samples had **111 ms median / 118 ms nearest-rank p95**
with a deliberate **100 ms backend stub delay**. These are harness timings, not provider latency,
speech accuracy, a service-level estimate or the proposed human pilot.

## Real and human-assisted validation

| Check | Result and limits |
|---|---|
| Gmail speech, body insertion and Undo | Passed — user reported real microphone workflow; empty body restored. Additional selected-word replacement and changed-content recovery/Copy (edit before Stop) passed with surrounding text preserved and nothing sent. The latter is not a post-Stop pending-response test. |
| ChatGPT speech, insertion and Undo | Passed — user reported real microphone workflow; composer restored, controls visible and nothing submitted. The Command+Shift+Y start/stop workflow preserved original text and native Undo. Explicit Discard and tab-switch cancellation also passed without delayed insertion or recovery. |
| 10- and 30-second limits | Passed within observed/user-reported scope. The interrupted first 30-second attempt is excluded; the user's separate uninterrupted recording stopped automatically with visible controls, inserted text and microphone indicator off. Original 10-second preference restored. |
| Actual Chrome 400% recording layout | Passed in the tested ChatGPT composer after the placement fix: panel clear of editable text, Stop/Discard visible and keyboard reachable, Discard preserved the fixture. This brief capture was not speech/provider testing or a universal layout guarantee. |
| VoiceOver recording controls | Passed — human heard clear Start/Recording/Stop/Discard and discarded status in installed ChatGPT, without repeated countdown speech. |
| VoiceOver response/recovery states | Passed — human heard Transcribing/success, microphone-error guidance and Dismiss focus return, recovery reason, Copy failure/retry success, Discard and real 60-second expiry. These trials used current source in a local Chrome fixture with simulated media/provider/clipboard; they do not prove real clipboard/provider behavior. |
| Final installed-source recheck | Passed — correct extension reload verified; brief native Chrome capture/Discard returned to idle, removed the recording indicator and preserved fixture/focus. Timeout/setup attempts were excluded. No new recognition or upload-suppression claim. |
| Gmail enlarged layout closeout retry | Inconclusive — Chrome 200% and fullscreen disposable compose were reached, then native control became unreliable before microphone activation. No capture or layout pass is claimed. Zoom was restored to 100%; only the new recipientless fixture draft was discarded, with Gmail's deletion notice observed, and its temporary tab closed. |

The verified live environment was macOS 15.6.1, Chrome 156.0.8078.47 arm64 and unpacked DICTOZY
0.1.12 from this repository; VoiceOver 10 (964.12.11). Manifest version alone does not identify
the checked-out build. Earlier trials used earlier Phase 3 revisions; final source reload evidence
is separately identified above. Inaudible/unclear VoiceOver trials and automation timeouts are
excluded from passes. VoiceOver remains off. No email, chat message or prompt was sent.

## Remaining acceptance and risk

| Item | Status / reason |
|---|---|
| Notion, Outlook and WhatsApp Web editors | **Deferred — optional**: authenticated test editors/device linking unavailable; no personal-account access requested. Compatibility remains unverified. |
| Wider Gmail/ChatGPT variants and layouts | **Deferred — optional**: additional live post-Stop edits, compose variants and enlarged recording/response/recovery layouts. Reuse existing real and automated results; escalate an observed critical defect. |
| Broader accessibility/device coverage | **Deferred — optional**: other screen readers, browsers/devices and first-use combinations. Scoped VoiceOver passes do not certify everything; a serious observed accessibility regression remains actionable. |
| First-use and daily reliability pilot | **Deferred — optional**: novice timing, provider latency, correction effort, ordinary recovery/cutoff frequency and the proposed 60-trial pilot remain unmeasured. No 95% completion or under-one-minute achievement is claimed. |
| Longer duration | **Deferred** pending pilot evidence, encoding boundary checks and aggregate cost protection. No 60-second option was added. |

Closed shadow roots and iframe editing remain unsupported. Extremely crowded or viewport-filling
editors may leave no wholly clear panel position; the fallback prioritizes reachable recording
controls. Editors that rebuild content while transcription is pending can trigger conservative
recovery. Actual human dictation used the configured backend; this did not validate production
deployment, security controls or logs. UI cancellation checks alone do not prove network suppression.

### Six release gates — all open

1. **Pending:** verify actual Render proxy, worker, replica and ingress configuration.
2. **Deferred:** enforce aggregate usage protection across restarts and instances; current allowance
   is process-local. An approved durable shared mechanism or verified provider/edge cap is required.
3. **Pending:** complete physical microphone and installed-extension acceptance across the remaining
   scenarios; scoped passes above do not close this broader gate.
4. **Pending:** complete real-world editor compatibility, including unavailable applications/variants.
5. **Pending:** production logging and deployment validation.
6. **Deferred:** coordinated publication of revised privacy disclosures under separate release approval.

## Files and reproduction

Closeout files: `extension/tests/browser/dictation.spec.js`,
`extension/tests/browser/daily-reliability.spec.js`, this summary, `docs/PHASE_3_REPORT.md`,
`docs/COMPATIBILITY_MATRIX.md`, `docs/IMPROVEMENT_ROADMAP.md`, and `qa/phase-3-acceptance.md`.
Earlier runtime/file changes and their rationale are listed in the implementation report.
The unrelated untracked `SEO Report.pdf` is preserved.

Run from the repository root, with installed project dependencies:

```bash
npm test
npm run test:browser
PYTHON_DOTENV_DISABLED=1 PYTHONDONTWRITEBYTECODE=1 XAI_API_KEY='' APP_ENV=local backend/.venv/bin/python -m pytest -q -p no:cacheprovider
npm run test:site
python3 scripts/package_extension.py --check-only
python3 scripts/validate_store_assets.py
python3 scripts/validate_site.py
backend/.venv/bin/python -m pip check
git diff --check
```

For manual UI inspection, serve the repository with
`python3 -m http.server 4173 --bind 127.0.0.1`, load/reload `extension/` unpacked and open
`http://127.0.0.1:4173/qa/manual-test-page.html`. **Starting local FastAPI does not redirect the
extension's fixed production backend.** Automated tests stub it; manual dictation requires the
approved transcription environment and non-sensitive fixture speech.

Optional follow-up checklist, when justified and feasible without routine user participation:

- Use fresh private drafts/composers with no recipients; verify insertion, selection, Undo/Redo,
  keyboard Stop/Discard and no Send in Notion/Outlook/WhatsApp and remaining Gmail/ChatGPT variants.
- Recheck Gmail 200%/400% recording controls and actual enlarged processing/error/recovery states;
  restore zoom and remove only test content afterward.
- Run the [content-free pilot](../qa/phase-3-acceptance.md) and record counts/timings in the empty
  template; keep deliberate cancellation/recovery checks separate from ordinary trials.

Operational/privacy release gates remain mandatory and separate from those optional checks.
Close them only with supporting evidence and the required approval for production actions.

**Recommended next step:** review the small personal-vocabulary proposal in the roadmap. Phase 3
is ready for the next approved development phase; optional external checks do not block it.
Phase 4 implementation still needs scope/privacy approval. Production release requires all
applicable critical gates, a complete automated run and explicit release approval.
