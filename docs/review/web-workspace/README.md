# Native workspace review evidence

Captured November 10, 2026 from implementation commit `3a5bfbf90bd4ae76944381c51c819b8fed95f9cb`.
`validation.json` records source and screenshot SHA-256 values.

- Chromium 149.0.7827.55, DPR 1; desktop 1440×1000, tablet 768×1024, phones 390×844 and 320×844.
- Actual Chromium microphone/MediaRecorder APIs used a synthetic device. Transcription responses were fixed browser-intercepted samples. No physical microphone, external requests or provider calls.
- Fourteen lossless WebP screenshots cover empty/populated drafts, recording, processing, recovery, Copy feedback, Clear confirmation, settings, 200% text and ordinary typing without JavaScript.
- Root and embedded documents had no horizontal overflow in the captured layouts. Recording Stop/Discard stayed visible at 390px; the 768px navigation retained the added Try it link without wrapping.
- Twenty-six axe 4.14 A/AA scans found no workspace violations. The pre-existing desktop header accessible-name/visible-label mismatch on `.header-install` remains recorded, unchanged. Automated checks do not establish full WCAG conformance or screen-reader acceptance.
- No page errors or unexpected external requests. Shared recording controls retain the circular microphone, existing glyphs and state colors.

Reproduce with the local review server running on 4198:

```sh
node qa/capture-workspace.cjs
```

The script uses the existing Playwright dependency and local Python/Pillow for lossless image encoding. Set `DICTOZY_AXE_PATH` to an already available `axe.min.js` to repeat the optional scans. No package installation or remote script download occurs. The script blocks non-loopback traffic and supplies its own fixed transcript responses; backend validation is covered separately by the local review integration tests.
