# Support Triage

Use this guide for post-publish support reports. Keep user privacy first: never ask for raw audio, transcript text, passwords, payment details, API keys, or private page content.

## Intake Fields

Ask for only the information needed to reproduce or route the issue:

- Chrome version.
- Operating system.
- Extension version from `chrome://extensions`.
- Whether the extension was installed from the Chrome Web Store or loaded unpacked.
- Website or app category where the issue occurred, if the user can share it.
- Field type if known: input, textarea, contenteditable, or ARIA textbox.
- What the user clicked and what happened next.
- Safe screenshot of the UI state, if useful.
- Request ID, if the UI/backend surfaced one or the maintainer can find it from timing.

Do not ask for:

- Raw recordings.
- Transcript contents.
- Existing field contents.
- API keys.
- Browser storage dumps.
- Private account data.

## Severity

Severity 1:

- Suspected API key exposure.
- Audio or transcript appears in logs.
- Extension appears to send requests directly to xAI.
- Unexpected xAI spend spike or suspected abuse.
- Published extension cannot transcribe for most users.

Immediate response:

- Check Render logs and xAI usage.
- Consider `TRANSCRIPTION_ENABLED=false`.
- Create or update a GitHub issue with safe details only.

Severity 2:

- Repeated transcription failures for some users.
- CORS failure for the published extension ID.
- Backend health is up but transcription returns `502` or `503`.
- Extension gets stuck on Transcribing.
- Supported fields fail on common sites.

Response:

- Reproduce with the Store-installed extension.
- Check `/health`, Render logs, and xAI usage.
- Collect request ID, status code, and timing.
- Track fix or mitigation in GitHub.

Severity 3:

- Listing copy issue.
- Screenshot or support link issue.
- Minor visual polish.
- One-off unsupported field behavior.

Response:

- Confirm whether the report is accurate.
- Update docs/listing or create a future hardening issue.

## Common Reports

Microphone button does not appear:

- Confirm Dictozy is enabled in the popup.
- Reload the page after installing or updating the extension.
- Confirm the field is supported and not password, payment, hidden, disabled, readonly, file, checkbox, or radio.
- Confirm the page is HTTPS or local development.

Recording does not start:

- Confirm the user clicked the visible microphone button.
- Check Chrome microphone permission for the site.
- Try another supported field on an HTTPS page.

Transcribing does not finish:

- Check production `/health`.
- Check Render logs for `request_id`, `429`, `502`, `503`, and latency.
- Confirm xAI usage/credits/provider status.
- Ask whether retrying a short phrase works.

Transcript appears in the wrong place:

- Ask whether focus moved before transcription finished.
- Ask for field type and reproduction steps.
- Reproduce on the local QA page before changing code.

## Safe Maintainer Response Template

```text
Thanks for the report. Please do not share raw audio, transcript text, passwords, payment details, or private page content.

Can you share:
- Chrome version and operating system
- Dictozy version from chrome://extensions
- Whether this was installed from the Chrome Web Store
- The type of field you were using, if known
- A safe screenshot of the Dictozy status message, if available
- The approximate time of the failed attempt and any request ID you can safely provide
```

## Issue Routing

- Product feature requests go in the feature request template.
- Reliability, QA, privacy, security, and post-publish follow-up go in the hardening template.
- Reproducible user-facing failures go in the bug template.
- Potential secrets, private data, or abuse incidents should be handled carefully before public issue details are added.
