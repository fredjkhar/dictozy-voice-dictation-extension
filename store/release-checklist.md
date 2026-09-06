# Chrome Web Store Release Checklist

Dictozy `0.1.11` is published, and `0.1.12` is an unreleased reliability candidate. Do not replace or alter an active Store draft. For live-release monitoring, use [../qa/post-publish-monitoring.md](../qa/post-publish-monitoring.md).

## Package

- [ ] Run all backend and extension checks.
- [ ] Run `node --test extension/tests/*.test.js`.
- [ ] Run `npm ci` and `npm run test:browser`; confirm all mocked Chromium workflows pass without contacting production.
- [ ] Run `python3 scripts/package_extension.py` from the repository root.
- [ ] Confirm the generated ZIP is `dist/dictozy-v0.1.12.zip` and contains `manifest.json` at its root.
- [ ] Confirm the immutable published package `dist/dictozy-v0.1.7.zip` still has SHA-256 `a573bd146642b7aacb0b494f2e9644b3c85d260295968ec4fa3680d3795debed`.
- [ ] Load the generated ZIP contents as an unpacked extension and repeat the manual QA checklist.
- [ ] Confirm no source maps, environment files, raw audio, test fixtures, or unrelated repository files are included.
- [ ] Confirm all executable JavaScript is packaged locally and no remote code is used.

## Permissions

- [ ] `storage` is the only API permission.
- [ ] HTTPS page access is justified by field detection, visible microphone UI, and transcript insertion.
- [ ] Backend host access is limited to the production Render host; localhost backend host access is absent.
- [ ] `activeTab`, `tabs`, microphone manifest permission, and broad backend `https://*/*` host access are absent.
- [ ] The `toggle-dictation` command is declared without adding an API permission.
- [ ] Password and payment fields remain excluded.
- [ ] Per-site controls add no API or host permissions and use only local storage plus messaging to the already-injected content script.

## Listing

- [ ] Use the single-purpose statement and accurate copy in `listing.md`.
- [ ] Confirm the listing name matches `Dictozy: Voice Dictation`.
- [ ] Choose Tools and English unless the release plan changes.
- [ ] Paste the short description and detailed description from `listing.md`.
- [ ] Review the product landing page in `../site/index.html`; if it is published at a stable HTTPS URL, use it as the Homepage URL.
- [ ] Upload the existing 128x128 store icon.
- [ ] Review `assets/screenshot-dictation-1280x800.png` and `assets/screenshot-settings-1280x800.png`; regenerate only if the screenshots no longer match the shipped UI.
- [ ] Confirm screenshots show Dictozy branding, global and current-site controls, microphone/stop icon controls, the language-formatting selector, the 10-second default, and no development-only controls.
- [ ] Review the required `assets/promo-small-440x280.png` tile at full size.
- [ ] Confirm the existing settings screenshot remains accurate for the unchanged `0.1.12` popup before opening a Web Store draft.
- [ ] Add other assets only when they accurately represent the shipped extension.
- [ ] Do not claim real-time streaming, offline transcription, grammar correction, accounts, or other unimplemented features.
- [ ] Set Homepage and Support URLs to the deployed first-party website pages documented in `listing.md`.

## Developer Dashboard Update

- [ ] Open the existing Chrome Web Store item for extension ID `folpeencabfejhjokmldikaelonphmma`.
- [ ] Upload `dist/dictozy-v0.1.12.zip` only after automated and manual QA are complete, no earlier Store draft is active, and the user explicitly approves submission.
- [ ] Store Listing tab: update only the `0.1.12` release note; keep the existing summary, detailed description, screenshots, and promotional assets.
- [ ] Keep the dictation screenshot first and retain the accurate icon, screenshots, and promo tile.
- [ ] Keep the verified first-party Homepage, Support, and Privacy Policy URLs.
- [ ] Privacy practices tab: update the storage and backend-host explanations to remove the obsolete endpoint setting and localhost backend access; retain accurate audio/transcript declarations and Limited Use certifications.
- [ ] Distribution tab: confirm visibility, regions, and rollout settings.
- [ ] Do not submit the `0.1.12` update for review until the user explicitly approves submission.

## Privacy

- [ ] Publish `PRIVACY.md` at a stable public HTTPS URL.
- [ ] Enter that URL in the Developer Dashboard Privacy Policy field, not only in the description.
- [ ] Declare the extension's single purpose.
- [ ] Declare user-provided audio and transcripts in the applicable dashboard data categories.
- [ ] Declare that no remote code is used.
- [ ] Complete every Limited Use certification accurately.
- [ ] Review every selected data category in the Chrome Web Store privacy declaration; remove `Location` if it is selected because Dictozy does not access geolocation or intentionally process location data.
- [ ] Confirm the privacy policy, dashboard declarations, listing copy, and actual extension behavior agree.

## Production CORS And Published Extension ID

The published extension ID is fixed:

```text
folpeencabfejhjokmldikaelonphmma
```

In Render, retain:

```text
BACKEND_CORS_ORIGINS=chrome-extension://folpeencabfejhjokmldikaelonphmma
```

Do not include a trailing slash or additional origins. With `APP_ENV=production`, any other CORS value must fail startup clearly.

## Backend Compatibility

- [ ] Confirm production CORS startup validation remains deployed for `0.1.12` and retains the exact published extension origin.
- [ ] Confirm production `/health` remains healthy.
- [ ] Run one real transcription, failure-recovery check, and native Undo check from the unpacked `0.1.12` release candidate before submission.

## Final QA Before Submission

- [ ] Open `https://voice-dictation-extension.onrender.com/health` and confirm the production backend returns `{"status":"ok"}`.
- [ ] Confirm the unpacked `0.1.12` release candidate has no errors in `chrome://extensions`.
- [ ] Test a normal text input, textarea, contenteditable field, and editable ARIA textbox.
- [ ] Confirm a bare non-editable ARIA textbox is ignored.
- [ ] Confirm camel-case, snake-case, kebab-case, compact, and standard `cc-*` payment fields are ignored while safe near-misses remain supported.
- [ ] Verify password, payment, readonly, disabled, hidden, file, checkbox, and radio fields are ignored.
- [ ] Verify recording starts only after clicking the microphone icon or pressing the assigned browser shortcut.
- [ ] Verify the shortcut can stop recording and cancel pending transcription without late insertion.
- [ ] Verify the popup shows the assigned shortcut, reflects remapping, shows `Not assigned` when cleared, and opens Chrome shortcut settings.
- [ ] Verify Language formatting defaults to English and lists Automatic plus the 25 supported explicit languages.
- [ ] Verify English, Automatic, and one explicit non-English selection persist after reopening the popup and complete a transcription.
- [ ] Verify repeated shortcut presses do not overlap work.
- [ ] Verify the shortcut does nothing when Dictozy is disabled or an unsupported or sensitive field is focused.
- [ ] Verify the visible click controls still start, stop, cancel, retry, and insert successfully.
- [ ] Verify a successful Render transcription inserts text and restores field focus.
- [ ] Replace selections in a normal input, textarea, and contenteditable field; confirm surrounding text remains and the caret follows the transcript.
- [ ] Move the caret within the same field while transcription is pending; confirm insertion uses the captured caret or selection.
- [ ] Insert next to existing whitespace and formatted rich text; confirm spacing is clean and surrounding markup remains intact.
- [ ] Confirm the controlled input and textarea fixtures retain text and emit one editing-event sequence.
- [ ] Add a supported field after page load and confirm only one microphone control appears.
- [ ] Replace, remove, hide, disable, or make readonly the original target during transcription; confirm no late insertion and a safe field-unavailable message.
- [ ] Confirm transcript markup is inserted as plain text in contenteditable fields.
- [ ] Verify backend failure and timeout states enter a persistent retry state with a short support reference.
- [ ] Verify denied, missing, busy, and browser-blocked microphone failures show distinct guidance without uploading or displaying a request reference.
- [ ] Verify offline, `429`, `502`, `503`, timeout, and malformed-response failures show safe guidance and return to a retry-ready state.
- [ ] Verify the transcription cancel icon returns to idle and a late response is not inserted.
- [ ] Verify retry starts a completely new recording rather than reusing failed audio.
- [ ] Verify clearly silent input shows a safe microphone-signal message where local inspection is available.
- [ ] Verify the Dictozy enabled toggle cancels active work, hides the page control, and restores an enabled control when turned back on.
- [ ] Verify supported sites are enabled by default and disabling one exact origin does not alter the global toggle or another origin.
- [ ] Verify paths, queries, and hashes share one preference while subdomains and ports remain independent.
- [ ] Disable the current site during microphone access, recording, and transcription; confirm tracks stop, requests are cancelled where practical, uploads are prevented when possible, and no late transcript is inserted.
- [ ] Verify the shortcut and click control cannot start dictation while the current site is disabled.
- [ ] Re-enable the current site, refocus a supported field, and confirm dictation returns.
- [ ] Confirm the popup contains no Advanced Backend, Backend URL, or Check Backend control.
- [ ] Reset site preferences from the normal settings panel and confirm the recording limit, language, global enabled state, and keyboard shortcut remain unchanged.
- [ ] Seed an obsolete stored `backendUrl`, update or reload through the migration path, and confirm it is removed and cannot redirect a request.
- [ ] Confirm `chrome://extensions` shows no localhost backend host access.
- [ ] Open the popup on `chrome://extensions`, the Chrome Web Store, and another restricted page; confirm the current-site control is safely unavailable and global settings remain usable.
- [ ] Move focus before a response completes and confirm no transcript is inserted into either the old or new field.
- [ ] Inspect extension network activity and confirm audio goes only to `https://voice-dictation-extension.onrender.com`.
- [ ] Confirm the xAI key is absent from the ZIP, repository status, browser storage, and browser network requests.
- [ ] Keep the metadata changes in draft until the user explicitly approves submission.

## After Publication

- [ ] Confirm the public listing is visible and shows the intended name, icon, screenshots, promotional tile, support link, homepage link, and privacy policy link.
- [ ] Install the Chrome Web Store version and confirm extension ID `folpeencabfejhjokmldikaelonphmma`.
- [ ] Confirm version `0.1.12` after the reliability release is published.
- [ ] Run the Store-installed smoke test in [../qa/post-publish-monitoring.md](../qa/post-publish-monitoring.md).
- [ ] Confirm Render CORS includes `chrome-extension://folpeencabfejhjokmldikaelonphmma`.
- [ ] Review Render logs for request IDs, status, latency, `429`, `502`, `503`, and safe logging.
- [ ] Review xAI usage and spend after the smoke test.
- [ ] Start daily first-week monitoring.

Validate the visual assets before using the checklist:

```bash
python3 scripts/validate_store_assets.py
```

## Official References

- [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare)
- [Store listing fields and assets](https://developer.chrome.com/docs/webstore/cws-dashboard-listing)
- [Privacy tab and disclosures](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Declare extension permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [Chrome Web Store review process](https://developer.chrome.com/docs/webstore/review-process)
