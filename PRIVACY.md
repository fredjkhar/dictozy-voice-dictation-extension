# Privacy Policy

Prepared update: October 17, 2026. Publish with the approved Phase 1 release; the live policy is unchanged until deployment.

Dictozy: Voice Dictation helps you dictate short text into supported web fields. Recording starts only when you click the visible microphone button or press the assigned browser shortcut, and the returned transcript is inserted into the field you selected.

## Data Handled

Dictozy handles the following data only to provide voice dictation:

- Audio recorded after the user clicks the visible microphone button or presses the assigned browser shortcut.
- The transcript returned from the speech-to-text service.
- The enabled state, recording-duration preference, language-formatting preference, and origins the user explicitly disables stored locally with `chrome.storage.local`.
- Page field information inspected locally to determine whether the focused field is supported. The extension does not transmit the page URL, browsing history, existing field contents, or surrounding page content to the backend.

Sites are enabled by default. Dictozy stores an exact origin only when the user explicitly disables that origin. It does not retain a record for each site visited, and it does not use site preferences as browsing history. Dictozy does not activate on password or payment fields. It does not record automatically and does not record in the background.

## How Data Is Used

Recorded audio is sent to the fixed Dictozy production backend solely to generate a transcript. The selected language-formatting code is sent with that user-triggered audio request. For an explicit language, the backend passes the code to xAI Speech-to-Text to guide written formatting such as numbers, currencies, and units. In Automatic mode, the backend omits the provider language and formatting parameters. The backend receives the transcript and returns it to the extension, which inserts it into the user-selected field.

Site preferences, origins, URLs, and hostnames are not sent to Dictozy's backend, xAI, or an analytics service.

Data is not used for advertising, profiling, credit decisions, or sale to third parties.

## Data Sharing

Audio, any selected explicit language code, and resulting transcript data are processed by:

- The Dictozy FastAPI backend hosted on Render.
- xAI, which provides the Speech-to-Text service.

Render receives the user's connection IP address. xAI receives the backend's connection IP address; application code does not forward the user's IP to xAI. Providers may process technical request metadata under their respective policies. The extension does not request or collect GPS coordinates or precise device location. No other third party receives audio or transcripts through the extension's application flow.

## Storage And Retention

The extension stores the enabled state, recording-duration preference, language-formatting preference, and exact origins the user explicitly disables in Chrome local extension storage. Site preferences are not synchronized to a backend and are not used for analytics, advertising, profiling, or browsing-history collection. These settings remain until the user changes or resets them, clears extension data, or removes the extension.

The extension and backend application code do not intentionally persist raw audio or transcripts as history. The server's upload parser may temporarily spool files larger than 1 MiB to operating-system temporary storage. These files are closed and removed at request completion, including handled errors; abrupt infrastructure termination follows the hosting platform's temporary-storage lifecycle. Audio normalization and transcription handling use memory, and the application does not create an audio archive. Infrastructure and service providers may retain operational data according to their own policies.

The extension temporarily compares the selected field's contents in memory to avoid overwriting intervening edits. Those contents are not transmitted or saved. If a completed transcript cannot be inserted safely, the page may keep one result in memory for up to 60 seconds with explicit Copy and Discard controls. The recovery notice does not display the transcript. Copy, Discard, expiry, a new recording, disabling Dictozy, hiding the tab, or leaving the page clears the result. Deliberately cancelled work is not recoverable. Copy places text on the system clipboard at the user's request; clipboard retention is controlled by the operating system and user.

The backend keeps temporary client-address rate-limit counters and aggregate usage counters in memory. Application request logs contain a bounded request identifier, method, route category, status and latency, not audio, transcripts, field contents or client IP addresses. Hosting-provider logs are governed separately.

## Security

Production audio requests use HTTPS. The xAI API key is stored only in backend environment variables and is never included in extension code. Browser permissions are limited to storage, supported webpage access required for dictation, and the fixed Dictozy production backend host.

## User Controls

Recording begins only after the user clicks the microphone button or presses the assigned browser shortcut. The user can stop recording immediately with the visible control or shortcut. Users may turn Dictozy off globally, disable or re-enable the current supported site, reset all site preferences without changing unrelated settings, remap or remove the shortcut in Chrome, choose language formatting, change the recording limit, or clear extension data in Chrome.

## Limited Use

The use of information received from Google APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Changes And Contact

This policy will be updated if the extension's data handling changes. Questions or privacy requests can be submitted through Dictozy's first-party support page:

https://dictozy.com/support.html
