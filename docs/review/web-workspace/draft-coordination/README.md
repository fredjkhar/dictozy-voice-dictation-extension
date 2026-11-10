# Cross-tab draft coordination review

Captured November 10, 2026 from implementation
`be51c88271f92c65ac2500ff7883865f655f294a`. `provenance.json` records source and
image hashes. Earlier workspace captures remain preserved in the parent directory.

- `saved-status-390.webp`: saving feedback remains visible beside the editor
  while Settings is collapsed, at 390 × 844 CSS pixels.
- `conflict-paused-390.webp`: another tab's update pauses saving without replacing
  this tab's text; the explanation remains visible outside Settings.
- `replace-confirmation-1440.webp`: the nonblocking replacement dialog at
  1440 × 1000. Keep saved draft receives initial focus. Escape closes the dialog,
  restores Remember focus and preserves the unsaved editor text.

Native Chromium localStorage and Web Locks were exercised with two pages in one
browser context. No microphone, backend or provider requests were made. Both
page/frame layouts had no horizontal overflow; there were no page errors or
unexpected network requests. The three images were visually inspected for
readability, clipping and control placement.

Reproduce with the loopback preview on port 4198:

```sh
node qa/capture-draft-coordination.cjs
```

The script uses the existing Playwright and local Python/Pillow tools, blocks
non-preview traffic, and writes only this review evidence outside `site/`.
