# Refined small promotional tile

Prepared for visual review on November 7, 2026. This is new marketing artwork, not a rebuilt extension or a replacement for the historical submission evidence. It has not been uploaded to the Store.

The original tile uses the hand-drawn stroke lettering in `wordmark.svg`, whose tight `z`/`y` join differs from the approved website logo. The replacement reads the seven outlined paths directly from [the current website lockup](../../site/assets/dictozy-lockup.svg), approved in PR #10. Every path and per-letter kerning transform is retained. Only the group's fill changes to white, with one uniform scale and translation applied to the complete wordmark.

The original icon, its size and position, navy background, rings and waveforms remain unchanged. The lettering occupies a centered 164px-wide area, beginning at (138, 180), with a 14px gap below the icon. The output is an opaque RGB PNG at exactly 440 × 280.

## Artwork and review evidence

- [Original tile](../assets/0.1.14/promo-small-440x280.png), preserved unchanged.
- [Refined tile — download this PNG after approval](../assets/0.1.14/promo-small-440x280-refined.png).
- [Native-size before/after comparison](review/promo-comparison.png), each tile displayed at 440 × 280.
- [4× pixel inspection of the lettering](review/promo-lettering-detail.png). This enlarges the finished PNG for inspection; it is not a replacement export.

## Reproduce

With the repository's locked Playwright dependencies and Chromium installed:

```sh
node store/brand-0.1.14/export-promo-refined.cjs
python3 scripts/validate_store_assets.py
```

Do **not** use the historical `export.cjs` for this correction: it regenerates unrelated assets and the superseded lettering. The focused script blocks browser network requests, requires the approved input hashes, checks all seven path nodes against the source, and writes only `promo-small-440x280-refined.png`. No fonts are loaded. It reports the renderer, bounds and output checksum. Two successive renders with Playwright 1.61.1 / Chromium 149.0.7827.55 on macOS produced the same bytes; a different renderer/platform can change raster antialiasing.

| Source / output | SHA-256 |
|---|---|
| Approved website SVG | `d3fef1f2b8ca790650d2dbfc70b9592240bf786cf29554bbd04bb1f777e15c6c` |
| Original icon master | `39002a487e6b17762a75a02b98a60d03e6759953a33a95b21ac3e97bdf1c4321` |
| Original promotional tile | `fc57f14a3917af6887bdae81ab2db0c3e0949995add6d737bfe4e089c2af9e27` |
| Refined PNG, 16,841 bytes | `652ac3f3e72da17547d40104f5d73845c8f09cb83e2684f854e93d68a397d8ee` |

Base repository revision: `18597b4846785b1d1f8606e8cd025caa20d355f0`. The existing [provenance record](../assets/0.1.14/provenance.json) is unchanged: the published package remains the 45,508-byte `dictozy-v0.1.14.zip` from `27f2171fcc7a3d0e48c7062aa2781864abf9ab47`, SHA-256 `0176e85eff0cd1668d102fd3f0b49f858b0beee76d7d8b56afd303ad02042899`.

Validation covers PNG decoding/dimensions/opacity, source geometry, repeatable rendering, original artwork/package-file hashes, and the existing asset validator. Chromium previews are inspected at native size and enlarged around `z`/`y`. The [official Store image guidance](https://developer.chrome.com/docs/webstore/images#promotional-images) specifies the 440 × 280 small tile. Store acceptance is not claimed. The owner will review, then separately replace the tile manually; no package, website, policy or backend publication is part of this change.
