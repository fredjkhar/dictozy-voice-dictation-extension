# Privacy Policy

Effective date: August 13, 2026

Dictozy: Voice Dictation helps you dictate short text into supported web fields. Recording starts only when you click the visible microphone button, and the returned transcript is inserted into the field you selected.

## Data Handled

Dictozy handles the following data only to provide voice dictation:

- Audio recorded after the user clicks the visible microphone button.
- The transcript returned from the speech-to-text service.
- The enabled state, backend URL, recording-duration preference, language-formatting preference, and origins the user explicitly disables stored locally with `chrome.storage.local`.
- Page field information inspected locally to determine whether the focused field is supported. The extension does not transmit the page URL, browsing history, existing field contents, or surrounding page content to the backend.

Sites are enabled by default. Dictozy stores an exact origin only when the user explicitly disables that origin. It does not retain a record for each site visited, and it does not use site preferences as browsing history. Dictozy does not activate on password or payment fields. It does not record automatically and does not record in the background.

## How Data Is Used

Recorded audio is sent to the configured FastAPI backend solely to generate a transcript. The selected language-formatting code is sent with that user-triggered audio request. For an explicit language, the backend passes the code to xAI Speech-to-Text to guide written formatting such as numbers, currencies, and units. In Automatic mode, the backend omits the provider language and formatting parameters. The backend receives the transcript and returns it to the extension, which inserts it into the user-selected field.

The Advanced Check Backend control sends a health-check request without audio or page content. Site preferences, origins, URLs, and hostnames are not sent to Dictozy's backend, xAI, or an analytics service.

Data is not used for advertising, profiling, credit decisions, or sale to third parties.

## Data Sharing

Audio, any selected explicit language code, and resulting transcript data are processed by:

- The Dictozy FastAPI backend hosted on Render.
- xAI, which provides the Speech-to-Text service.

Render and xAI receive the user's IP address and may process other technical request metadata as part of normal network requests under their respective policies. The extension does not request or collect GPS coordinates or precise device location. No other third party receives audio or transcripts through the extension's application flow.

## Storage And Retention

The extension stores the enabled state, backend URL, recording-duration preference, language-formatting preference, and exact origins the user explicitly disables in Chrome local extension storage. Site preferences are not synchronized to a backend and are not used for analytics, advertising, profiling, or browsing-history collection. These settings remain until the user changes or resets them, clears extension data, or removes the extension.

The extension and backend application code do not intentionally persist raw audio or transcripts. Audio and transcripts are held in memory only as needed to complete a transcription request. Infrastructure and service providers may retain operational data according to their own policies.

## Security

Production audio requests use HTTPS. The xAI API key is stored only in backend environment variables and is never included in extension code. Browser permissions are limited to storage, supported webpage access required for dictation, and the configured backend hosts.

## User Controls

Recording begins only after the user clicks the microphone button or presses the assigned browser shortcut. The user can stop recording immediately with the visible control or shortcut. Users may turn Dictozy off globally, disable or re-enable the current supported site, reset all site preferences without changing unrelated settings, remap or remove the shortcut in Chrome, choose language formatting, change the recording limit, or clear extension data in Chrome.

## Limited Use

The use of information received from Google APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Changes And Contact

This policy will be updated if the extension's data handling changes. Questions or privacy requests can be submitted through the project's public issue tracker:

https://github.com/fredjkhar/dictozy-voice-dictation-extension/issues
