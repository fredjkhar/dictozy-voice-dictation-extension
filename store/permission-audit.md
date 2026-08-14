# Extension Permission Audit

Audit date: August 13, 2026

This audit explains why Dictozy `0.1.8` needs each requested permission. It is written for Chrome Web Store review and for future maintainers.

## API Permissions

`storage`: retained.

Required to save the enabled state, backend URL, recording-duration preference, language-formatting preference, and exact origins the user explicitly disables in `chrome.storage.local`. Site preferences are not synchronized or sent to the backend.

`activeTab`: removed.

The popup can query the active tab ID and message an already-injected content script without this permission. The content script returns only the page's normalized HTTP/HTTPS origin so the popup can apply a local current-site preference; the popup does not inspect the full tab URL.

No `tabs`, `scripting`, `identity`, `notifications`, `cookies`, clipboard, downloads, history, geolocation, or manifest microphone permission is requested.

## Keyboard Command

The manifest declares one standard, browser-scoped `toggle-dictation` command. A command declaration is not an API permission. The service worker queries only the active tab ID and sends a toggle message to the content script already injected by the manifest. It does not inspect or log the tab URL, title, page content, or field content.

The command does not require `tabs`, `activeTab`, or `scripting`. Chrome users may remap or remove the shortcut in `chrome://extensions/shortcuts`; the popup reads the current assignment with `chrome.commands.getAll()`.

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

HTTPS page access remains broad because the extension's single purpose is to detect supported fields, display a visible microphone control, and insert the returned transcript on websites selected by the user. Reducing this to a fixed website list would prevent the core cross-site dictation behavior. Users can disable any exact origin from the popup. The content script excludes sensitive and unsupported fields and does not send origins, page URLs, site preferences, existing field contents, or surrounding page content to the backend.

## Microphone Access

No manifest microphone permission is requested. Microphone access is initiated through `navigator.mediaDevices.getUserMedia` only after the user clicks the visible microphone button or presses the assigned browser shortcut. Both are explicit user actions, and Chrome retains its normal permission prompt and site controls.

## Remote Code

No remote code is loaded or executed. The popup scripts, content scripts, lifecycle helper, site-preference helper, service worker, and shared configuration are all packaged in the extension ZIP. Backend responses contain health data, errors, or transcript text only.
