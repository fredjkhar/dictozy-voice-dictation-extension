# Extension Permission Audit

Audit date: June 13, 2026

## API Permissions

`storage`: retained.

Required to save the enabled state, backend URL, and recording-duration preference in `chrome.storage.local`.

`activeTab`: removed.

The popup can query the active tab and message an already-injected content script without this permission. Keeping it would not enable a required capability.

No `tabs`, `scripting`, `identity`, `notifications`, `cookies`, clipboard, downloads, history, geolocation, or manifest microphone permission is requested.

## Backend Host Permissions

Retained:

- `https://voice-dictation-extension.onrender.com/*`
- `http://127.0.0.1/*`
- `http://localhost/*`

The production Render origin is required for health and transcription requests from the Manifest V3 service worker. Local origins are retained for the documented self-hosted development workflow.

Removed:

- `https://*/*` from `host_permissions`

The extension no longer has service-worker network permission for arbitrary HTTPS backends. Popup validation accepts only the production Render origin or local development hosts, matching the manifest.

## Page Access

Content scripts run on:

- HTTPS webpages.
- Localhost and `127.0.0.1` HTTP pages used for local QA.

Remote HTTP webpages were removed from the content-script scope because microphone recording requires a secure context and the production feature targets HTTPS pages.

HTTPS page access remains broad because the extension's single purpose is to detect supported fields, display a visible Mic control, and insert the returned transcript on websites selected by the user. Reducing this to a fixed website list would prevent the core cross-site dictation behavior. The content script excludes sensitive and unsupported fields and does not send page URLs, existing field contents, or surrounding page content to the backend.

## Microphone Access

No manifest microphone permission is requested. Microphone access is initiated through `navigator.mediaDevices.getUserMedia` only after the user clicks the visible microphone button, allowing Chrome to provide its normal permission prompt and site controls.

## Remote Code

No remote code is loaded or executed. The popup scripts, content script, service worker, and shared configuration are all packaged in the extension ZIP. Backend responses contain health data, errors, or transcript text only.
