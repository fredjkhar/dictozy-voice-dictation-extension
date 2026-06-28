# Privacy Policy

Effective date: June 13, 2026

FieldMic: Voice Dictation converts a short microphone recording into text and inserts the returned transcript into a text field selected by the user.

## Data Handled

The extension handles the following data only to provide voice dictation:

- Audio recorded after the user clicks the visible microphone button.
- The transcript returned from the speech-to-text service.
- The enabled state, backend URL, and recording-duration preference stored locally with `chrome.storage.local`.
- Page field information inspected locally to determine whether the focused field is supported. The extension does not transmit the page URL, browsing history, existing field contents, or surrounding page content to the backend.

The extension does not activate on password or payment fields and does not record automatically or in the background.

## How Data Is Used

Recorded audio is sent to the configured FastAPI backend solely to generate a transcript. The backend sends that audio to xAI Speech-to-Text, receives the transcript, and returns it to the extension. The extension inserts the transcript into the user-selected field.

The Advanced Check Backend control sends a health-check request without audio or page content.

Data is not used for advertising, profiling, credit decisions, or sale to third parties.

## Data Sharing

Audio and resulting transcript data are processed by:

- The Voice Dictation FastAPI backend hosted on Render.
- xAI, which provides the Speech-to-Text service.

Render and xAI receive the user's IP address and may process other technical request metadata as part of normal network requests under their respective policies. The extension does not request or collect GPS coordinates or precise device location. No other third party receives audio or transcripts through the extension's application flow.

## Storage And Retention

The extension stores only the backend URL and recording-duration preference in Chrome local extension storage. These settings remain until the user changes them, clears extension data, or removes the extension.

The extension and backend application code do not intentionally persist raw audio or transcripts. Audio and transcripts are held in memory only as needed to complete a transcription request. Infrastructure and service providers may retain operational data according to their own policies.

## Security

Production audio requests use HTTPS. The xAI API key is stored only in backend environment variables and is never included in extension code. Browser permissions are limited to storage, supported webpage access required for dictation, and the configured backend hosts.

## User Controls

Recording begins only after the user clicks the microphone button. The user can stop recording immediately. Users may clear locally stored settings by removing the extension or clearing its extension data in Chrome.

## Limited Use

The use of information received from Google APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Changes And Contact

This policy will be updated if the extension's data handling changes. Questions or privacy requests can be submitted through the project's public issue tracker:

https://github.com/fredjkhar/voice-dictation-extension/issues
