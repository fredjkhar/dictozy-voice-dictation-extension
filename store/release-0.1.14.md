# 0.1.14 brand refresh · published

On November 3, 2026, the [public Chrome Web Store listing](https://chromewebstore.google.com/detail/dictozy-voice-dictation/folpeencabfejhjokmldikaelonphmma) showed version **0.1.14**, the blue-interface and icon release notes, and **dictozy.support@gmail.com**. The listing showed the blue D/microphone icon, the recording screenshot first (2s elapsed, 8s left, Quiet, Stop and Discard), and the settings and personal vocabulary screenshot second. The Store displayed **Updated November 3, 2026**. It gave no exact publication time.

## Candidate and capture · November 2, 2026

Before upload, the authenticated Store package page for Dictozy: Voice Dictation (folpeencabfejhjokmldikaelonphmma) showed 0.1.13 in both Draft and Published on November 2, 2026, with status “Published - public”. Those slots showed no 0.1.14 package. Later that day, the submitted 0.1.14 update was recorded as “Pending review” with automatic publication off. The published 0.1.13 ZIP keeps its original source and hash in the [0.1.13 release record](release-0.1.13.md).

Package and capture source: `27f2171fcc7a3d0e48c7062aa2781864abf9ab47`. The original submitted package `dictozy-v0.1.14.zip` contains 21 allowlisted files, 45,508 bytes, SHA-256 `0176e85eff0cd1668d102fd3f0b49f858b0beee76d7d8b56afd303ad02042899`. Every ZIP entry matched its Git blob. The manifest differs from 0.1.13 only in its version. The extracted popup stylesheet is the additional packaged file. Existing preference keys, permissions, shortcuts, recording, insertion, recovery and backend implementation are preserved. The popup uses a neutral tone for the idle “Ready” status.

The [editable mark, wordmarks and toolbar-size proof](brand-0.1.14/README.md) are the common export source. [Review the Store artwork](assets/0.1.14/), the [files and hashes](assets/0.1.14/provenance.json) and the [Store image specifications](https://developer.chrome.com/docs/webstore/images). The suggested Store order is recording first and settings second. The two settings views show the same real action popup at different scroll/expansion states. Store icon and 128px extension icon are byte-identical.

Original capture and packaging commands, using Node and the repository's locked Playwright Chromium:

```sh
npm ci
npx playwright install chromium
node store/source/0.1.14/capture.cjs dist/capture-0.1.14
python3 scripts/package_extension.py --output-dir dist/review-0.1.14
python3 scripts/validate_store_assets.py
```

Capture requires a display for the native popup. The fixture opens the installed action with Chrome's popup API, photographs it at browser-selected size and expands its vocabulary section. The two harmless sample terms are seeded into a temporary profile with sharing off. A loopback notebook field exercises the real content script and native MediaRecorder using Chromium's synthetic device. The script discards the recording, blocks external name resolution and page HTTPS, and verifies zero service-worker fetches. The screenshots include the genuine live timer and loopback port, which can vary between runs. No sample audio is retained.

Focused validation covered the real popup, keyboard focus/scrolling, the separation between saving and sharing vocabulary, recording controls, the compact recording layout, cancellation, Undo and recovery. The complete local extension run passed all 60 Node tests and 151 Chromium workflows. Two automated axe A/AA scans of the native popup (collapsed and expanded) reported zero violations.

## Website synchronization

The modernized website and six-step guide [went live on November 2](https://github.com/fredjkhar/dictozy-voice-dictation-extension/actions/runs/41566346843), ahead of the extension, using the then-public 0.1.13 version and images. On November 3 the live homepage still showed 0.1.13. This PR updates the homepage badge and structured data and points the homepage and support page to the original 0.1.14 captures. Merge and manual Pages deployment are pending separate approval. No new extension package or backend release is needed.
