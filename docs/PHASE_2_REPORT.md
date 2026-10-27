# Phase 2 implementation report

Date: 2026-10-17. Branch: `codex/phase-2-first-use-feedback`. Base: `9ea6918`.

**Implemented and tested locally; awaiting review. Not production-ready. Phase 3 has not begun.**

## Baseline and readiness

Before introducing features, the Phase 1 commits were verified on the current branch and all
257 tests were rerun successfully: 53 unit, 88 browser, 95 backend and 21 website. No new critical
regression was found in that baseline review. The unrelated untracked `SEO Report.pdf` was preserved.

| Dimension | Status |
|---|---|
| Phase 1 implementation | Accepted local baseline; protections retained |
| Phase 2 implementation | Complete within authorized scope |
| Automated validation | Passed, with methods and limitations below |
| Human microphone/screen-reader/editor acceptance | Pending |
| Production readiness | Not established; all six release gates remain open |

## Implemented improvements and decisions

### Optional first-use practice

- Added **Try dictation** prominently to the popup. It opens a bundled extension page only on
  explicit request; no install-time tab, onboarding flag, account or analytics is introduced.
- The practice page contains a labeled textarea, three short steps, the actual assigned shortcut,
  shortcut settings, microphone guidance, concise audio/privacy information and expandable help.
- Its Try action focuses the practice field without requesting microphone access. The existing
  microphone control or assigned shortcut then starts recording explicitly. No content is submitted
  to a website automatically. The practice page uses the existing backend transcription path.
- Reused `content.js` and the same lifecycle/insertion protections. Only this extension's exact
  `practice.html` page is recognized as a practice context; it respects the global master toggle.
  It does not create a synthetic site preference or broaden content-script matches.
- Practice controls sit immediately after the field in DOM tab order. No separate recording engine,
  additional permission, host scope or background worker was needed.

### Compact recording feedback and explicit discard

- The existing status bubble now shows elapsed and remaining seconds, a small dot with a current
  activity label, and text **Stop** / **Discard** buttons. Idle/recording/processing/success/error
  retain their existing icons, accessible labels and states; success/error colors were darkened.
- Timing starts when capture actually begins and uses monotonic elapsed time. The existing 100 ms
  safety loop updates feedback; timing text changes only at second boundaries. Activity reuses the
  existing sampler and sample buffer, retaining the cumulative silence check separately. No second
  audio stream, analyser, animation loop or persistent signal data was introduced.
- Unknown activity inspection displays “Activity unavailable”; quiet input displays “Quiet.” This
  is microphone-level feedback, not a claim that speech or its content has been recognized.
- Stop uses the established stop/transcribe flow. Discard immediately cancels and releases capture,
  leaves writing/selection intact, does not upload and does not create recovery. Both accept trusted
  mouse and keyboard activation and reject synthetic page clicks.
- Default recording remains **10 seconds**, maximum **30 seconds**. Existing automatic stop and
  unsafe-focus/hidden-page/session safeguards remain in force.

### Recovery refinement

- Extended the existing one-result, memory-only recovery rather than creating another history or
  recovery subsystem. The lifetime remains **60 seconds**.
- The notice explains the insertion refusal and offers Copy/Discard without showing the transcript.
  The redundant nearby error bubble is hidden while this notice is displayed.
- Copy gives a “Copying…” state, prevents duplicate concurrent copy attempts, reports a useful
  clipboard failure with retry guidance and announces success. Discard and expiry are announced.
- Removing a keyboard-focused recovery control returns focus to the last usable field. Expiry
  does not move focus when a user is already typing elsewhere. No saved range is reapplied merely
  for focus restoration. Recovery never automatically pastes or replaces writing.
- A late clipboard completion cannot clear or overwrite a newer recovery result. An already-started
  browser clipboard write cannot be revoked by Discard/expiry; its eventual contents remain under
  the user's clipboard control. This limitation is documented in the manual checklist.

### Accessibility and navigation

- Live state messages are separate from the timer and activity text (`aria-live="off"`), so ticks
  are available to read on demand without continuous status announcements. Recovery outcomes use
  a separate polite, atomic announcement region established before interaction.
- During recording, an unmodified Tab from the editor reaches the microphone's Stop icon, then the
  text Stop and Discard controls. Shift+Tab from that icon returns to the editor. This resolves the
  ordinary-page problem of reaching another field and cancelling before controls can be reached.
  The handler is inactive outside recording, ignores synthetic/modifier keys and honors earlier
  editor handlers that prevent Tab. It does not trap focus or change the selected text.
- The ordinary-page Tab problem was reproduced with a failing regression before this correction.
  Actual keyboard sequences are tested in both injected-page and unpacked-extension workflows.
- Added/retained explicit button names, visible focus, constrained overlay widths and positioning,
  reduced-motion handling, readable practice text and no horizontal practice-page overflow at 360 px.
- Source-palette foreground/background contrast was calculated for the core states and guidance:
  idle 5.47:1, recording 4.83:1, processing 5.17:1, success 5.48:1, error 7.09:1, status 17.74:1,
  activity 11.95:1, practice secondary text 7.18:1 and links 7.19:1. This is not a complete WCAG audit
  or a guarantee against arbitrary host-page CSS. Actual screen-reader validation remains pending.

## Tests and evidence

Environment: macOS 15.6.1, Node 22.13.1, Python 3.14.7, Playwright 1.61.1,
bundled Chromium 149.0.7827.55. Provider credentials were disabled for backend tests.

| Suite | Phase 2 baseline | Final | Added | Method |
|---|---:|---:|---:|---|
| Extension unit | 53 | 54 | 1 | Node; recent activity versus cumulative signal and cleanup |
| Mocked browser workflows | 86 | 102 | 16 | Chromium DOM; injected Chrome/media/provider APIs |
| Unpacked MV3 integration | 2 | 5 | 3 | Actual extension/Chrome APIs; synthetic microphone, stubbed backend |
| Backend | 95 | 95 | 0 | Existing Phase 1 suite; no backend changes |
| Website | 21 | 21 | 0 | Existing local website Chromium suite |
| **Total** | **257** | **277** | **20** | **All passed; zero final failures or skips** |

The 16 new mocked workflows cover elapsed/remaining time, Enter/Space discard, synthetic control
rejection, Copy/Discard/expiry focus and explanations, expiry without focus theft, the 30-second
cap, selected-text Stop/Undo in textarea and rich text, late clipboard completion, narrow/reduced
motion layout, optional/revisitable popup practice and real Tab/Shift+Tab behavior with editor handlers.

The three new unpacked-extension cases cover:

1. Popup → practice → explicit microphone activation → native transcription completion/Undo, using
   actual Tab/Enter/Space. A wrapper counts calls while delegating to native `getUserMedia`: opening
   and Try produce zero requests, activating the microphone produces one.
2. Master toggle and the existing background shortcut-command routing function on the practice page.
   This is not physical OS hotkey validation; that remains a manual check.
3. Practice permission-denial guidance and narrow layout. This case explicitly stubs `getUserMedia`
   to reject, rather than claiming that a human Chrome permission dialog was tested.

All original Phase 1 tests remain in place. The additional rich-text test explicitly selects actual
text rather than fixture indentation; the native keyboard test follows the preserved editor focus
on recording start. Existing security, insertion, cancellation, preferences, shortcut and Undo
assertions were not removed or weakened.

Additional checks passed: 21 JavaScript syntax checks, manifest JSON, extension package-input
validation, Store asset validation, website validation, Python dependency graph and final whitespace/
diff checks. Packaging ran in `--check-only` mode; no release ZIP or Store submission was produced.
The manifest, config endpoint, background routing, DOM insertion utility, site-preference module
and entire backend are unchanged from Phase 1. CI now syntax-checks the new practice script.

Visual inspection was performed on generated screenshots of the actual packaged practice page
at desktop/narrow widths and local fixture recording/recovery overlays at 320 px, including
reduced-motion styling. A font inheritance issue and host box-sizing dependency were corrected.
No human physical-microphone, screen-reader, live-editor or production acceptance test was performed.

## Files changed

Created:

- `extension/practice.html`, `extension/practice.css`, `extension/practice.js`: optional practice UI and guidance.
- `docs/PHASE_2_REPORT.md`: this report.
- `qa/phase-2-acceptance.md`: concise installed-extension checklist and reproducible local commands.

Modified:

- `extension/content.js`: feedback, Stop/Discard, recording-only keyboard path, recovery focus/announcements and exact practice-page context.
- `extension/content.css`: compact feedback, overlay sizing, state contrast, focus and reduced motion.
- `extension/dictation-lifecycle.js`: expose recent activity from the existing sampler.
- `extension/popup.html`, `extension/popup.js`: explicit practice entry and focus-ring contrast.
- `extension/tests/browser/dictation.spec.js`, `extension/tests/browser/installed-extension.spec.js`,
  `extension/tests/dictation-lifecycle.test.js`: regression and integration coverage.
- `scripts/package_extension.py`: include/validate packaged practice assets and scripts.
- `.github/workflows/ci.yml`: new practice-script syntax check.
- `docs/IMPROVEMENT_ROADMAP.md`, `README.md`, `extension/README.md`, `store/changelog.md`: scope,
  tested behavior, unresolved gates and unpublished status.

`SEO Report.pdf` remains untouched and untracked. No secrets, infrastructure, deployed privacy
page, source version or production branch were modified. No push, merge, deployment or publication occurred.

## Remaining limitations and risks

- Physical microphone recognition, actual permission prompts and OS shortcut assignment must be
  tested by a person. Synthetic Chromium audio and stubbed provider output establish mechanism,
  not speech accuracy or stop-to-text performance.
- Screen-reader announcement timing and high-zoom behavior need the human checklist. UI on arbitrary
  pages may be affected by site styles or keyboard handlers; editor-owned Tab behavior is honored
  when its handler prevents the event before this listener runs.
- The practice page intentionally exercises the real configured backend when used manually. An
  unpacked local extension is not automatically redirected to local FastAPI. Non-sensitive practice
  speech is transmitted after explicit recording; there is no offline transcription mode.
- Clipboard policy may prevent Copy. Recovery expires and is cleared on hiding/leaving the page,
  new recording or disable. It is deliberately not permanent history. A browser clipboard operation
  already started can finish after the recovery panel is cleared.
- No claim of Gmail, Outlook, AI chat, messaging or notes-app compatibility is made. Those workflows,
  iframe/Shadow DOM issues, real latency and longer-duration evaluation belong to Phase 3.

## Six Phase 1 release gates — all still open

1. Actual Render proxy, worker, replica and ingress configuration verification.
2. Aggregate backend usage protection across restarts and multiple instances.
3. Real microphone and installed-extension manual acceptance testing.
4. Real-world editor compatibility testing.
5. Production logging and deployment validation.
6. Coordinated publication of the revised privacy disclosures.

Phase 1's in-memory aggregate allowance still resets with a process and multiplies across instances.
No infrastructure or provider billing configuration was introduced to change that behavior.
Implementation completeness and passing automated tests must not be substituted for these gates.

## Reviewable commits

- `773e552` — Phase 2 baseline, authorized scope and unresolved release gates.
- `dad6802` — optional practice, recording/recovery accessibility and regression coverage.
- Final documentation commit — completed roadmap, this report and manual acceptance guide.

All changes remain on the dedicated local branch.

## Local use, review and next step

Load/reload `extension/` in Chrome Developer mode, then open **Try dictation** from its popup.
Use [the Phase 2 manual checklist](../qa/phase-2-acceptance.md) for keyboard, physical microphone,
clipboard, screen-reader and lifecycle acceptance, with isolated automated commands listed there.

Review this report and complete the relevant manual checks. **Phase 3 is deferred until explicit
approval.** The next development scope, if approved, is measured real-editor compatibility and
reliability; recording duration changes and productivity features remain deferred. Production
release, infrastructure and Store publication require separate authorization.
