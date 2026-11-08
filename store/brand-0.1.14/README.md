# Dictozy identity

The original editable sources are [mark.svg](mark.svg) and [wordmark.svg](wordmark.svg). The approved website lettering is now in [dictozy-lockup.svg](../../site/assets/dictozy-lockup.svg); the [refined promotional tile](promo-refined.md) reuses those exact outlines. The D’s white upright doubles as the microphone capsule. A sky-blue pickup arc sits inside the letter. The master uses simple vector shapes without fonts, scripts, metadata, embedded images or external references.

| Colour | Application |
|---|---|
| Royal blue `#2563EB` | Icon tile and primary actions |
| Deep navy `#0B1220` | Dark artwork background |
| Ink `#0F172A` | Wordmark on light backgrounds and primary text |
| White `#FFFFFF` | Letter and wordmark on dark backgrounds |
| Sky `#7DD3FC` | Microphone pickup detail |

The historical [light](lockup-light.svg) and [dark](lockup-dark.svg) lockups each have a 264 × 64 viewBox. Their lettering predates the approved website refinement; do not copy these lockups over the current website logo. Use SVGs at their original aspect ratio and give a linked logo the accessible name “Dictozy”. The website uses the 32px export for its favicon and the 256px export for its touch icon.

The original `node store/brand-0.1.14/export.cjs` command regenerates the extension icons, old lockups, [toolbar proof](toolbar-proof.png), [Store icon](../assets/0.1.14/icon-128.png) and [original promotional tile](../assets/0.1.14/promo-small-440x280.png). Preserve those historical outputs. For the refined tile only, use `node store/brand-0.1.14/export-promo-refined.cjs` with the repository’s locked Playwright dependencies and Chromium. It leaves unrelated assets unchanged.

The 16, 32 and 48px releases were inspected at 1× on light and dark surfaces. The 128px PNG in the manifest is also the prepared Store icon. Its visible 96 × 96 artwork has 16 transparent pixels on every side. The small promotional PNG is 440 × 280. The separate recording/settings captures use the Store’s preferred 1280 × 800 screenshot size. [Chrome Web Store image guidance](https://developer.chrome.com/docs/webstore/images)

| Export | SHA-256 |
|---|---|
| Icon master | `39002a487e6b17762a75a02b98a60d03e6759953a33a95b21ac3e97bdf1c4321` |
| Store icon | `dacbea173712f1d173b13db4ec944eb0ddfd1fdaba86984108e6063263582bc6` |
| Small promo | `fc57f14a3917af6887bdae81ab2db0c3e0949995add6d737bfe4e089c2af9e27` |

The existing [Figma design](https://www.figma.com/design/vDnkAyY6fLE3AeQyrQAXmp) supplied the blue/light visual system. Figma declined the new edit session’s first file inspection due to its View-seat tool limit. The SVG files above are the editable masters for this refresh.
