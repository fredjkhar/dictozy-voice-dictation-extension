# 0.1.14 brand refresh · review candidate

The authenticated Store package page for Dictozy: Voice Dictation (folpeencabfejhjokmldikaelonphmma) showed 0.1.13 in both Draft and Published on November 2, 2026, with status “Published - public”. Those slots showed no 0.1.14 package. Google has not validated or reserved the proposed version. The published 0.1.13 ZIP keeps its original source and hash in the [0.1.13 release record](release-0.1.13.md).

## Candidate and capture

Package and capture source: `27f2171fcc7a3d0e48c7062aa2781864abf9ab47`. The local review package `dictozy-v0.1.14.zip` contains 21 allowlisted files, 45,508 bytes, SHA-256 `0176e85eff0cd1668d102fd3f0b49f858b0beee76d7d8b56afd303ad02042899`. Every ZIP entry matched its Git blob. The manifest differs from 0.1.13 only in its version. The extracted popup stylesheet is the additional packaged file. Existing preference keys, permissions, shortcuts, recording, insertion, recovery and backend implementation are preserved. The popup uses a neutral tone for the idle “Ready” status.

The [editable mark, wordmarks and toolbar-size proof](brand-0.1.14/README.md) are the common export source. [Review the Store artwork](assets/0.1.14/), the [files and hashes](assets/0.1.14/provenance.json) and the [Store image specifications](https://developer.chrome.com/docs/webstore/images). The suggested Store order is recording first and settings second. The two settings views show the same real action popup at different scroll/expansion states. Store icon and 128px extension icon are byte-identical.

To reproduce from this branch with Node and the repository's locked Playwright Chromium:

```sh
npm ci
npx playwright install chromium
node store/source/0.1.14/capture.cjs dist/capture-0.1.14
python3 scripts/package_extension.py --output-dir dist/review-0.1.14
python3 scripts/validate_store_assets.py
```

Capture requires a display for the native popup. The fixture opens the installed action with Chrome's popup API, photographs it at browser-selected size and expands its vocabulary section. The two harmless sample terms are seeded into a temporary profile with sharing off. A loopback notebook field exercises the real content script and native MediaRecorder using Chromium's synthetic device. The script discards the recording, blocks external name resolution and page HTTPS, and verifies zero service-worker fetches. The screenshots include the genuine live timer and loopback port, which can vary between runs. No sample audio is retained.

## Review and release order

1. Review the extension PR, SVG/toolbar proof, screenshots, Store icon/promo and independently prepared website PR #4. The website version remains at the verified public 0.1.13.
2. Under separate authorization, recheck the existing item/draft, upload the verified 0.1.14 ZIP, replace the artwork and set the public support contact to **dictozy.support@gmail.com**. Keep the existing support URL. Save and verify the draft. Submission and publication each require authorization.
3. Verify the public Store version, branding, artwork and support details after publication. Then synchronize the redesigned website's public version assertions and confirm its prepared captures still match the published product.
4. Merge and deploy the website only under separate authorization. No backend release is needed for the visual update.

Focused validation covered the real popup, keyboard focus/scrolling, the separation between saving and sharing vocabulary, recording controls, the compact recording layout, cancellation, Undo and recovery. The complete local extension run passed all 60 Node tests and 151 Chromium workflows. Two automated axe A/AA scans of the native popup (collapsed and expanded) reported zero violations.
