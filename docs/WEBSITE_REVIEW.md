# Website review · November 2, 2026

Preview the branch locally with `python3 -m http.server 4174 --bind 127.0.0.1 --directory site`. Open the homepage at `http://127.0.0.1:4174/` and follow **Explore the interactive guide**. Run `python3 scripts/validate_site.py` and `npm run test:site` after installing the locked development dependencies and Playwright Chromium. Use loopback for review. The production pages retain their indexable metadata.

## Search and accessibility checks

| Check | Result and evidence |
|---|---|
| Discovery and snippets | **Pass, local.** Four indexable pages have unique titles and descriptions, visible headings, navigable HTML links, self-canonicals, and production-domain social metadata. The validator checks sitemap membership, fragment targets, verification bytes, and robots. [Search Essentials](https://developers.google.com/search/docs/essentials) · [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) |
| Static rendering and errors | **Pass, local.** The instructions and six named steps are in the original HTML. JavaScript enhances sample controls. Existing URLs are retained. A nested missing URL returns HTTP 404 on the local server, and the custom body’s root-relative links/assets resolve under that URL in a browser fixture. [JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) |
| Structured data | **Pass, local.** Homepage softwareVersion, install URL and free-access fields describe the visible product. FAQ and HowTo rich results are retired, so instructional content uses ordinary HTML. No rating/review fields were added. [Structured data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) · [Google Search feature changes](https://developers.google.com/search/updates) |
| Privacy and permissions | **Pass, local.** Normalized policy-article text matches the released HTML, and the effective date and existing section links are preserved. The simulation requests no audio or transcription; its Copy demonstration stays inside the page. |
| Keyboard, reflow and accessibility | **Pass in the tested Chromium workflows.** Reviewed desktop (1440×960), tablet (768×1024) and mobile (360×800) renders. Tests cover keyboard focus, reduced motion, disabled JavaScript, and horizontal overflow at six viewport widths from 320 to 1920 CSS px. At 200% root text size, 28 page/state/viewport combinations reflowed without horizontal overflow. The tablet recovery layout was corrected after visual inspection. |
| Automated accessibility scan | **Pass for tested rules.** axe-core 4.14.0 reported zero WCAG A/AA rule violations in 20 page/state combinations at 390 and 1440 CSS px, including active recording, recovery and enabled vocabulary. For layered backgrounds flagged by axe, the diagram labels have at least 4.86:1 contrast against the darkest grid intersections and guide text at least 5.80:1 against the darkest dot. White primary-button text on royal blue is 5.17:1. Human screen-reader output and full WCAG conformance are unverified. |
| Live indexing, rich results and field Core Web Vitals | **Unknown.** Search Console and indexing requests were outside this review. Field INP and population-level LCP/CLS were not measured. |

## Lab comparison

Local Lighthouse 12.8.2 in headless Chrome 156. Both snapshots use the same Python static server configuration on loopback, one cold navigation per preset, simulated throttling, the default mobile preset or `--preset=desktop`, and uncompressed HTTP responses. Before is the frozen site at `f682d1021c77fe64ffb12882099a52f9ad136241`. A single run per preset does not establish a performance trend. The targets are LCP ≤2.5 s, CLS ≤0.1 and field INP ≤200 ms.

| Page | Preset | Performance | Accessibility | Best practices | SEO | LCP | CLS | Transfer |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Homepage before | Mobile | 100 | 100 | 96 | 100 | 1.1 s | 0 | 46 KiB |
| Homepage before | Desktop | 100 | 100 | 100 | 100 | 0.3 s | 0 | 46 KiB |
| Homepage after | Mobile | 100 | 100 | 100 | 100 | 0.9 s | 0 | 48 KiB |
| Homepage after | Desktop | 100 | 100 | 100 | 100 | 0.2 s | 0 | 48 KiB |
| Guide | Mobile | 100 | 100 | 100 | 92 | 1.3 s | 0 | 60 KiB |

The guide’s Lighthouse SEO deduction came from its frame-scoped robots.txt request. Chrome’s protocol returned a CSP violation for that fetch under `connect-src 'none'`. A direct GET of the unchanged robots.txt returned 200 with the production sitemap and crawl allowance. The privacy restriction stays in place.

The validator and all 32 website browser tests passed. Homepage executable JavaScript remains 0 bytes. The guide script is 10,140 bytes (2,913 bytes with gzip level 9), under the 100 KB compressed budget. Shared CSS is 16.8 KiB raw and 4.6 KiB gzipped; guide-only CSS adds 10.7 KiB raw and 2.9 KiB gzipped. The real recording screenshot is a lazy-loaded 10.8 KiB WebP. The 119 KiB social card is metadata-only and does not download during either navigation.

## Design and asset provenance

The editable [Figma file](https://www.figma.com/design/vDnkAyY6fLE3AeQyrQAXmp) contains the [design system](https://www.figma.com/design/vDnkAyY6fLE3AeQyrQAXmp?node-id=3-2), [desktop home](https://www.figma.com/design/vDnkAyY6fLE3AeQyrQAXmp?node-id=4-7), [mobile home](https://www.figma.com/design/vDnkAyY6fLE3AeQyrQAXmp?node-id=4-124), [desktop recovery](https://www.figma.com/design/vDnkAyY6fLE3AeQyrQAXmp?node-id=5-44), [mobile recording](https://www.figma.com/design/vDnkAyY6fLE3AeQyrQAXmp?node-id=5-116), [vocabulary consent states](https://www.figma.com/design/vDnkAyY6fLE3AeQyrQAXmp?node-id=5-170), and a [reading-page template](https://www.figma.com/design/vDnkAyY6fLE3AeQyrQAXmp?node-id=5-204). Reusable components include the [CTA](https://www.figma.com/design/vDnkAyY6fLE3AeQyrQAXmp?node-id=3-18), [navigation](https://www.figma.com/design/vDnkAyY6fLE3AeQyrQAXmp?node-id=3-26), [guide step](https://www.figma.com/design/vDnkAyY6fLE3AeQyrQAXmp?node-id=3-42) and [feedback panel](https://www.figma.com/design/vDnkAyY6fLE3AeQyrQAXmp?node-id=3-44).

The CSS custom properties at the top of `site/styles.css` map the Figma palette, type hierarchy, spacing, corner radii and elevation into the site. The 1200px and 390px compositions guided the layout. The browser version reflows between them, uses locally available system fonts and keeps the complete support and privacy text. The illustrated microphone and waveform use CSS perspective and inline SVG. Both cards flatten for reduced motion. The scene has no animation loop or pointer tracking.

The product screenshot is a lossless crop of the **already published** 0.1.13 recording image from the Store preparation. It shows the actual extension in a staged writing field with synthetic audio. Its original control colours and labels are intact. The separate social card is a 1200 × 630 PNG of the conceptual illustration, headline and original logo. Neither asset is evidence of additional browser compatibility.

To review the interactions, open `/guide.html#record` and start the sample, then try Discard or Stop. Visit `#recover` to change a sample draft and use the practice clipboard, and `#vocabulary` to compare saving locally with enabling sharing. With JavaScript disabled, all six instructions remain in the HTML. Pages publication requires its existing manual dispatch.
