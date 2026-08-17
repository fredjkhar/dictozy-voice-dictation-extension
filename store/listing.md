# Chrome Web Store Listing Copy

Use this file as the source of truth when updating the existing Chrome Web Store listing for published Dictozy `0.1.8`. Phase 32 changes only first-party website destinations after deployment; it does not require a new extension package or version.

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
Voice typing for Chrome: dictate short text into web fields with a visible mic and secure speech-to-text transcription.
```

The short description is 119 characters. Chrome Web Store item summaries must be 132 characters or less.

## Detailed Description

```text
Use your voice to write short messages, notes, searches, and form entries directly in Chrome.

Dictozy adds voice dictation to supported text fields. Focus a field, click the visible microphone button or use your assigned browser shortcut, speak, and stop recording. Dictozy sends the clip over HTTPS to its backend for speech-to-text transcription, then inserts the returned text where you were writing.

What you can do

- Use voice typing in normal text inputs, textareas, and supported rich-text fields.
- Start and stop recording from a clear microphone control beside the field.
- Start, stop, or cancel dictation with a configurable browser shortcut.
- Cancel a pending transcription and record again after a failure.
- Preserve the intended caret or selection in supported modern forms.
- Choose Automatic or one of 25 explicit language-formatting options.
- Adjust the recording limit from the extension popup.
- Turn the extension off globally or disable it only for the current website.

Privacy and control

- Recording begins only after you click the microphone button or use the assigned shortcut.
- You can stop recording immediately.
- Audio is sent to the Dictozy backend only for transcription.
- The backend calls xAI Speech-to-Text; the extension never calls xAI directly.
- The xAI API key remains on the backend and is never included in the extension.
- Password, payment, hidden, disabled, readonly, file, checkbox, and radio fields are ignored.
- Sites are enabled by default. Only exact origins you explicitly disable are stored locally, and those preferences are never sent to the backend.
- The extension does not provide transcript history, advertising, sign-in accounts, payments, or background recording.

Supported fields include text, search, email, URL, and telephone inputs; textareas; contenteditable fields; and ARIA textboxes that are actually editable. Bare non-editable ARIA textbox roles are ignored.

The product is designed for short dictation clips rather than long-form recording. Language formatting is a provider formatting hint, not a promise of improved recognition. English is selected by default, while Automatic leaves provider language and formatting selection unset.

What's new in 0.1.9

- Keeps insertion anchored to the caret or selection captured when recording starts.
- Preserves surrounding rich-text formatting while inserting transcript text as plain text.
- Avoids duplicated spaces around inserted transcripts.
- Continues to reject late insertion if focus moves or the original field becomes unavailable.
```

Historical release notes are preserved in [changelog.md](changelog.md), not repeated in the sales description.

## Visual Assets

Recommended order:

1. `assets/screenshot-dictation-1280x800.png`
   Caption: `Use voice typing directly in supported Chrome text fields.`
2. `assets/screenshot-settings-1280x800.png`
   Caption: `Control Dictozy globally or for the current site, then adjust language, shortcut, and recording settings.`

Store icon:

- `extension/icons/icon-128.png`

Small promotional tile:

- `assets/promo-small-440x280.png`

The current assets accurately represent published `0.1.8`; Phase 31 does not regenerate them.

## Dashboard Links

Homepage URL:

```text
https://fredjkhar.github.io/dictozy-voice-dictation-extension/
```

The Homepage URL is already live. Reconfirm it returns `200` when the Phase 32 privacy and support pages are deployed.

Support URL:

```text
https://fredjkhar.github.io/dictozy-voice-dictation-extension/support.html
```

Privacy policy URL:

```text
https://fredjkhar.github.io/dictozy-voice-dictation-extension/privacy.html
```

Use the first-party privacy and support URLs only after the Phase 32 website is deployed and all three public pages return `200`. The URL update does not require a new package; version `0.1.8`, permissions, and extension behavior remain unchanged.

## Single Purpose

```text
Dictozy lets users dictate short text into supported web fields by recording audio only after an explicit microphone-button click or assigned browser shortcut, sending that audio to a backend speech-to-text service, and inserting the returned transcript into the selected field.
```

## Permission Justifications

`storage`:

```text
Stores the enabled state, backend URL, recording-duration preference, language-formatting preference, and exact origins the user explicitly disables locally in Chrome. No cloud synchronization is used by the extension.
```

Site access on HTTPS pages:

```text
Required to detect when the user focuses a supported text field, display the microphone control beside that field, insert the transcript back into that same field, and enforce the user's local exact-origin preference. The extension does not collect browsing history, transmit page URLs, or send existing field contents or surrounding page content.
```

Localhost page access:

```text
Supports local manual QA and development with the repository's test page.
```

Backend host access:

```text
Allows the Manifest V3 service worker to send user-triggered audio to https://voice-dictation-extension.onrender.com and to local FastAPI instances during development. The extension never calls an xAI host directly.
```

`activeTab` is intentionally not requested because declarative content scripts already provide the page access required by the feature.

## Privacy Dashboard Draft

Remote code:

```text
No. All JavaScript executed by the extension is packaged in the extension ZIP. Network responses are treated as data, not executable code.
```

Data handled:

- User-provided audio recorded after a visible click or assigned shortcut.
- Returned transcript text.
- Extension settings stored locally, including the selected language-formatting preference.
- Exact origins the user explicitly disables, stored only in local extension storage.
- The selected language code sent with a user-triggered audio request.
- Focused field metadata inspected locally for compatibility and safety checks.

Data not collected or transmitted by the extension:

- Browsing history or a list of visited URLs.
- Site preferences, origins, URLs, or hostnames sent to the backend or xAI.
- Existing webpage field contents.
- Password or payment-field contents.
- Advertising identifiers or analytics identifiers.

Dashboard selections require manual review rather than copy/paste:

- Do not select a declaration claiming that the extension handles no user data.
- Declare the current Dashboard categories that cover user-provided audio, transcripts, personal communications, user-generated content, and form data.
- Certify that data is used only for the disclosed single purpose, is not sold, is not used for advertising or lending, and is transferred only as needed to provide transcription.
- Keep the privacy policy URL and Limited Use certifications current.

## Reviewer Test Instructions

```text
1. Install Dictozy from the Chrome Web Store.
2. Open an HTTPS page containing a normal text input or textarea.
3. Focus the field and confirm that the microphone icon appears.
4. Click the microphone icon or press the assigned browser shortcut, then allow microphone access.
5. Speak a short phrase and stop recording with the stop icon, the shortcut, or the recording limit.
6. Confirm the transcription completes and text appears in the focused field.
7. Open the popup and confirm the global and current-site controls are enabled.
8. Turn off Enable on this site, refocus the field, and confirm the microphone control stays hidden and the shortcut is ignored.
9. Re-enable the site and confirm the microphone control returns after refocusing the field.
10. Expand Advanced, use Check Backend, then reset site preferences and confirm unrelated settings remain unchanged.

No test account or credentials are required.
```

## Website URL Dashboard Update

Use the existing Dashboard item for extension ID `folpeencabfejhjokmldikaelonphmma`.

Fields to change:

1. Store Listing: replace the summary and detailed description with the copy above.
2. Store Listing: use the revised screenshot captions and keep the dictation screenshot first.
3. Homepage: keep the verified GitHub Pages URL.
4. Privacy policy and Support: use the first-party website URLs only after both new pages are deployed and return `200`.
5. Privacy practices: review the existing selections for consistency; behavior and data handling did not change.

Fields and assets that remain unchanged:

- Extension name, category, and language.
- Published `0.1.8` package and permissions.
- Store icon, both screenshot files, and promotional tile.
- Published support and privacy policy destinations until the first-party replacements are verified.
- Distribution settings unless the publisher intentionally changes them.

Do not upload a new package, change the version, or submit the metadata update until the user explicitly approves it.

## Official References

- [Creating a great listing page](https://developer.chrome.com/docs/webstore/best-listing)
- [Chrome Web Store discovery](https://developer.chrome.com/docs/webstore/discovery)
- [Listing requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements)
- [Spam policy FAQ](https://developer.chrome.com/docs/webstore/program-policies/spam-faq)
