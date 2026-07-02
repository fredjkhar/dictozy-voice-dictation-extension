# Chrome Web Store Listing Copy

Use this file as the source of truth when updating the Chrome Web Store Developer Dashboard for Dictozy `0.1.3`.

## Dashboard Product Details

Extension name:

```text
Dictozy: Voice Dictation
```

Category:

```text
Tools
```

Language:

```text
English
```

Short description:

```text
Dictate short text into web fields with a visible mic button and secure transcription backend.
```

The short description is 91 characters. Chrome's current guidance says the item summary should be 132 characters or less.

## Detailed Description

```text
Dictozy lets you speak short text into supported web fields without leaving the page.

Focus a text field, click the visible microphone button, speak, and stop recording. Dictozy sends the recording to its secure backend for speech-to-text transcription, then inserts the returned text into the field you were using.

Why it is useful

- Write short messages, notes, searches, and form entries with your voice.
- Keep your hands on the current page instead of switching to another dictation tool.
- Start and stop recording from a clear on-page control.
- Adjust the recording limit from the extension popup.
- Turn Dictozy on or off whenever you do not want the page microphone control shown.

Privacy and control

- Recording starts only after you click the visible microphone button.
- You can stop recording immediately.
- Audio is sent over HTTPS to the Dictozy FastAPI backend for transcription.
- The backend calls xAI Speech-to-Text; the extension never calls xAI directly.
- The xAI API key stays on the backend and is never included in the extension.
- Password, payment, hidden, disabled, readonly, file, checkbox, and radio fields are ignored.
- Dictozy does not provide transcript history, advertising, sign-in accounts, payment features, or background recording.

Supported fields include normal text inputs, search/email/URL/tel inputs, textareas, contenteditable fields, and ARIA textboxes. Dictozy is designed for short dictation clips, not long-form recording.

What's new in 0.1.2

- New Dictozy name and icon.
- Cleaner popup with a production-ready settings layout.
- Microphone and stop icons for the page recording control.
- Enabled/disabled toggle in the popup.
- 10-second default recording limit.
- Improved supported-field detection and safer stale-field behavior.
- Updated Chrome Web Store screenshots and promotional tile.

What's new in 0.1.3

- Patch release to ensure the new Dictozy logo is bundled consistently in the extension toolbar, popup, and Chrome extensions page.
```

## Visual Assets

Store icon:

- `extension/icons/icon-128.png`

Screenshots:

- `store/assets/screenshot-dictation-1280x800.png`
  Caption: Dictate directly into supported text fields.
- `store/assets/screenshot-settings-1280x800.png`
  Caption: Keep Dictozy enabled, choose a recording limit, and check backend connectivity.

Small promotional tile:

- `store/assets/promo-small-440x280.png`

Do not upload assets that show unreleased features or development-only controls.

## Dashboard Links

Homepage URL:

```text
https://github.com/fredjkhar/dictozy-voice-dictation-extension
```

If the static landing page in `site/` is published through GitHub Pages later, replace the homepage URL with that public HTTPS page.

Support URL:

```text
https://github.com/fredjkhar/dictozy-voice-dictation-extension/issues
```

Privacy policy URL:

```text
https://github.com/fredjkhar/dictozy-voice-dictation-extension/blob/main/PRIVACY.md
```

Use a stable public HTTPS URL for the Privacy Policy field before submission.

## Single Purpose

Dictozy lets users dictate short text into supported web fields by recording audio only after an explicit user click, sending that audio to a backend speech-to-text service, and inserting the returned transcript into the selected field.

## Permission Justifications

`storage`:

Stores the enabled state, backend URL, and recording-duration preference locally in Chrome. No cloud synchronization is used by the extension.

Site access on HTTPS pages:

Required to detect when the user focuses a supported text field, display the microphone control beside that field, and insert the transcript back into that same field. The extension does not collect browsing history, page URLs, existing field contents, or surrounding page content.

Localhost page access:

Supports local manual QA and development with the repository's test page.

Backend host access:

Allows the Manifest V3 service worker to send user-triggered audio to `https://voice-dictation-extension.onrender.com` and to local FastAPI instances during development. The extension never calls an xAI host directly.

`activeTab` is intentionally not requested because declarative content scripts already provide the page access required by the feature.

## Privacy Dashboard Draft

Remote code:

No. All JavaScript executed by the extension is packaged in the extension ZIP. Network responses are treated as data, not executable code.

Data handled:

- User-provided audio recorded after a visible click.
- Returned transcript text.
- Extension settings stored locally.
- Focused field metadata inspected locally for compatibility and safety checks.

Data not collected or transmitted by the extension:

- Browsing history or a list of visited URLs.
- Existing webpage field contents.
- Password or payment-field contents.
- Advertising identifiers or analytics identifiers.

Dashboard guidance:

- Do not select a declaration claiming that the extension handles no user data.
- Declare the dashboard categories that cover user-provided audio, transcripts, personal communications, user-generated content, and form data as presented by the current dashboard.
- Certify that data is used only for the extension's disclosed single purpose, is not sold, is not used for advertising or lending, and is transferred only as needed to provide transcription.
- Enter the public HTTPS URL for `PRIVACY.md` in the designated Privacy Policy field.

## Reviewer Test Instructions

1. Install the submitted ZIP.
2. Open an HTTPS webpage containing a normal text input or textarea.
3. Focus the field and confirm that the microphone icon button appears.
4. Click the microphone icon and allow microphone access.
5. Speak a short phrase and click the stop icon, or wait for the recording limit.
6. Confirm that the transcription status completes and text appears in the focused field.
7. Open the popup, expand Advanced, and click Check Backend to verify the production backend health endpoint.

No test account or credentials are required. The production backend must have the submitted extension ID configured in CORS before review.

## Developer Dashboard Update Checklist

Use the Dashboard item for extension ID `folpeencabfejhjokmldikaelonphmma`.

1. Package tab: upload `dist/dictozy-v0.1.3.zip` only after rebuilding it from the reviewed source.
2. Store Listing tab: update the name, summary, detailed description, category, language, screenshots, promo tile, homepage URL, support URL, and privacy policy URL from this file.
3. Privacy practices tab: update the single-purpose statement, data-use declarations, permission justifications, remote-code declaration, and privacy policy URL.
4. Distribution tab: confirm visibility, regions, and any rollout settings before submission.
5. Submit for review only after the user explicitly approves submission.
6. Use deferred publishing if approval should not automatically publish the update.

Official references:

- Chrome Store Listing tab: <https://developer.chrome.com/docs/webstore/cws-dashboard-listing>
- Chrome Privacy practices tab: <https://developer.chrome.com/docs/webstore/cws-dashboard-privacy>
- Updating an existing item: <https://developer.chrome.com/docs/webstore/update>
