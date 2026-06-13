# Chrome Web Store Release Checklist

This checklist prepares a draft upload. It does not authorize submission or publication.

## Package

- [ ] Run all backend and extension checks.
- [ ] Run `python3 scripts/package_extension.py` from the repository root.
- [ ] Confirm the generated ZIP is under `dist/` and contains `manifest.json` at its root.
- [ ] Load the generated ZIP contents as an unpacked extension and repeat the manual QA checklist.
- [ ] Confirm no source maps, environment files, raw audio, test fixtures, or unrelated repository files are included.
- [ ] Confirm all executable JavaScript is packaged locally and no remote code is used.

## Permissions

- [ ] `storage` is the only API permission.
- [ ] HTTPS page access is justified by field detection, visible Mic UI, and transcript insertion.
- [ ] Backend host access is limited to the production Render host and localhost development hosts.
- [ ] `activeTab`, `tabs`, microphone manifest permission, and broad backend `https://*/*` host access are absent.
- [ ] Password and payment fields remain excluded.

## Listing

- [ ] Use the single-purpose statement and accurate copy in `listing.md`.
- [ ] Choose Productivity and English unless the release plan changes.
- [ ] Upload the existing 128x128 store icon.
- [ ] Review `assets/screenshot-dictation-1280x800.png` and `assets/screenshot-settings-1280x800.png` at full size.
- [ ] Review the required `assets/promo-small-440x280.png` tile at full size.
- [ ] Add other assets only when they accurately represent the shipped extension.
- [ ] Do not claim real-time streaming, offline transcription, grammar correction, accounts, or other unimplemented features.
- [ ] Set Homepage and Support URLs to the public GitHub repository and issue tracker.

## Privacy

- [ ] Publish `PRIVACY.md` at a stable public HTTPS URL.
- [ ] Enter that URL in the Developer Dashboard Privacy Policy field, not only in the description.
- [ ] Declare the extension's single purpose.
- [ ] Declare user-provided audio and transcripts in the applicable dashboard data categories.
- [ ] Declare that no remote code is used.
- [ ] Complete every Limited Use certification accurately.
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

## Final QA Before Submission

- [ ] Test a normal text input, textarea, contenteditable field, and role textbox.
- [ ] Verify password, payment, readonly, disabled, hidden, file, checkbox, and radio fields are ignored.
- [ ] Verify recording starts only after clicking Mic and can be stopped immediately.
- [ ] Verify a successful Render transcription inserts text and restores field focus.
- [ ] Verify backend failure and timeout states recover without remaining stuck on Transcribing.
- [ ] Inspect extension network activity and confirm audio goes only to the configured FastAPI backend.
- [ ] Confirm the xAI key is absent from the ZIP, repository status, browser storage, and browser network requests.
- [ ] Keep the Developer Dashboard item in draft until a separate submission phase is explicitly approved.

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
