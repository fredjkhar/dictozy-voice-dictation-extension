# Chrome Web Store Release Checklist

This checklist prepares a draft upload. It does not authorize submission or publication. For live-release monitoring after publication, use [../qa/post-publish-monitoring.md](../qa/post-publish-monitoring.md).

## Package

- [ ] Run all backend and extension checks.
- [ ] Run `node --test extension/tests/*.test.js`.
- [ ] Run `npm ci` and `npm run test:browser`; confirm all mocked Chromium workflows pass without contacting production.
- [ ] Run `python3 scripts/package_extension.py` from the repository root.
- [ ] Confirm the generated ZIP is `dist/dictozy-v0.1.6.zip` and contains `manifest.json` at its root.
- [ ] Confirm the immutable published package `dist/dictozy-v0.1.5.zip` still has SHA-256 `d4b76496760dac5cb0bd5cb7a13c6215907931b05dd46245a1adbe53c39801ce`.
- [ ] Load the generated ZIP contents as an unpacked extension and repeat the manual QA checklist.
- [ ] Confirm no source maps, environment files, raw audio, test fixtures, or unrelated repository files are included.
- [ ] Confirm all executable JavaScript is packaged locally and no remote code is used.

## Permissions

- [ ] `storage` is the only API permission.
- [ ] HTTPS page access is justified by field detection, visible microphone UI, and transcript insertion.
- [ ] Backend host access is limited to the production Render host and localhost development hosts.
- [ ] `activeTab`, `tabs`, microphone manifest permission, and broad backend `https://*/*` host access are absent.
- [ ] The `toggle-dictation` command is declared without adding an API permission.
- [ ] Password and payment fields remain excluded.

## Listing

- [ ] Use the single-purpose statement and accurate copy in `listing.md`.
- [ ] Confirm the listing name matches `Dictozy: Voice Dictation`.
- [ ] Choose Tools and English unless the release plan changes.
- [ ] Paste the short description and detailed description from `listing.md`.
- [ ] Review the product landing page in `../site/index.html`; if it is published at a stable HTTPS URL, use it as the Homepage URL.
- [ ] Upload the existing 128x128 store icon.
- [ ] Review `assets/screenshot-dictation-1280x800.png` and `assets/screenshot-settings-1280x800.png`; regenerate only if the screenshots no longer match the shipped UI.
- [ ] Confirm screenshots show Dictozy branding, microphone/stop icon controls, the language-formatting selector, the 10-second default, and no development-only controls.
- [ ] Review the required `assets/promo-small-440x280.png` tile at full size.
- [ ] Confirm visual assets accurately represent the `0.1.6` extension UI, including the popup shortcut row and language-formatting selector, before opening a Web Store draft.
- [ ] Add other assets only when they accurately represent the shipped extension.
- [ ] Do not claim real-time streaming, offline transcription, grammar correction, accounts, or other unimplemented features.
- [ ] Set Homepage and Support URLs to the public GitHub repository and issue tracker.

## Developer Dashboard Update

- [ ] Open the existing Chrome Web Store item for extension ID `folpeencabfejhjokmldikaelonphmma`.
- [ ] Package tab: upload only the reviewed `dist/dictozy-v0.1.6.zip`.
- [ ] Store Listing tab: update name, summary, detailed description, category, language, screenshots, promo tile, homepage URL, support URL, and privacy policy URL.
- [ ] Privacy practices tab: update data-use declarations, permission justifications, remote-code declaration, and Limited Use certifications.
- [ ] Distribution tab: confirm visibility, regions, and rollout settings.
- [ ] Use deferred publishing if approval should not publish automatically.
- [ ] Do not submit for review until the user explicitly approves submission.

## Privacy

- [ ] Publish `PRIVACY.md` at a stable public HTTPS URL.
- [ ] Enter that URL in the Developer Dashboard Privacy Policy field, not only in the description.
- [ ] Declare the extension's single purpose.
- [ ] Declare user-provided audio and transcripts in the applicable dashboard data categories.
- [ ] Declare that no remote code is used.
- [ ] Complete every Limited Use certification accurately.
- [ ] Review every selected data category in the Chrome Web Store privacy declaration; remove `Location` if it is selected because Dictozy does not access geolocation or intentionally process location data.
- [ ] Confirm the privacy policy, dashboard declarations, listing copy, and actual extension behavior agree.

## Production CORS And Final Extension ID

The Chrome Web Store assigns the final extension ID when the ZIP is uploaded as a new draft item. That ID may differ from the unpacked development extension ID.

1. Upload the validated ZIP as a draft, but do not submit it for review.
2. Copy the assigned extension ID from the Developer Dashboard.
3. In Render, set:

   ```text
   BACKEND_CORS_ORIGINS=chrome-extension://FINAL_EXTENSION_ID
   ```

4. During pre-release testing, both IDs may be listed as comma-separated origins:

   ```text
   BACKEND_CORS_ORIGINS=chrome-extension://FINAL_EXTENSION_ID,chrome-extension://UNPACKED_EXTENSION_ID
   ```

5. Do not include a trailing slash on either origin.
6. Redeploy Render and confirm `/health` remains healthy.
7. Confirm the final-ID build can call `/health` and `/api/transcribe`.
8. Remove the unpacked extension origin after development access is no longer needed.

## Backend-First Deployment

- [ ] Deploy the backend that accepts the optional `language` form field before distributing `0.1.6`.
- [ ] Confirm production `/health` remains healthy after deployment.
- [ ] Run one real transcription from the published `0.1.5` extension and confirm the omitted field defaults to English.
- [ ] Load the `0.1.6` package and confirm English, Automatic, and one explicit non-English language all complete successfully.
- [ ] Confirm Automatic omits xAI `language` and `format`; confirm an explicit language sends its supported code with `format=true`.
- [ ] Confirm unsupported language values return a safe `400` before xAI is called.
- [ ] Confirm malformed non-empty `TRANSCRIPTION_ENABLED` values fail backend startup instead of silently enabling transcription.

## Final QA Before Submission

- [ ] Open `https://voice-dictation-extension.onrender.com/health` and confirm the production backend returns `{"status":"ok"}`.
- [ ] Load the `0.1.6` unpacked extension in real Chrome and confirm there are no errors in `chrome://extensions`.
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
- [ ] Verify backend failure and timeout states enter a persistent retry state with a short support reference.
- [ ] Verify the transcription cancel icon returns to idle and a late response is not inserted.
- [ ] Verify retry starts a completely new recording rather than reusing failed audio.
- [ ] Verify clearly silent input shows a safe microphone-signal message where local inspection is available.
- [ ] Verify the Dictozy enabled toggle cancels active work, hides the page control, and restores an enabled control when turned back on.
- [ ] Move focus before a response completes and confirm no transcript is inserted into either the old or new field.
- [ ] Inspect extension network activity and confirm audio goes only to the configured FastAPI backend.
- [ ] Confirm the xAI key is absent from the ZIP, repository status, browser storage, and browser network requests.
- [ ] Keep the Developer Dashboard item in draft until a separate submission phase is explicitly approved.
- [ ] Do not submit for review or publish until the user explicitly approves the submission step.

## After Publication

- [ ] Confirm the public listing is visible and shows the intended name, icon, screenshots, promotional tile, support link, homepage link, and privacy policy link.
- [ ] Install the Chrome Web Store version and confirm extension ID `folpeencabfejhjokmldikaelonphmma`.
- [ ] Confirm version `0.1.6`.
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
