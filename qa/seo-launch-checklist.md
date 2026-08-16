# Dictozy SEO And Store Discovery Launch Checklist

Use this checklist for the Phase 31 landing-page and Chrome Web Store metadata update. It does not authorize deployment or Store submission.

## Before Deployment

- [ ] Confirm published extension version `0.1.8` is healthy.
- [ ] Confirm `https://fredjkhar.github.io/dictozy-voice-dictation-extension/` is still treated as planned until it returns `200`.
- [ ] Preview `site/` locally at desktop and mobile widths.
- [ ] Confirm all icons, screenshots, navigation links, support links, and install links resolve.
- [ ] Confirm the title, meta description, canonical URL, Open Graph fields, Twitter card fields, and JSON-LD are present.
- [ ] Confirm the checked-in `robots.txt` is valid and names the canonical sitemap.
- [ ] Remember that a standard GitHub Pages project site uses the host-root `https://fredjkhar.github.io/robots.txt`; the project-subpath file is authoritative only when the artifact is served at a host root.
- [ ] Confirm `sitemap.xml` contains only the intended canonical page.
- [ ] Confirm the page contains no analytics scripts, tracking pixels, cookies, or user telemetry.
- [ ] Confirm the page makes no unsupported product, ranking, review, install-count, or compatibility claims.

## GitHub Pages

- [ ] Push the reviewed change only after commit approval.
- [ ] Open GitHub repository **Settings → Pages**.
- [ ] Select GitHub Actions as the Pages source.
- [ ] Use a workflow that uploads the contents of `site/` as the artifact root.
- [ ] Trigger the first deployment manually.
- [ ] Confirm the Pages deployment succeeds.
- [ ] Confirm the canonical URL returns `200` over HTTPS.
- [ ] Confirm `/robots.txt`, `/sitemap.xml`, and `/assets/...` URLs return `200`.
- [ ] Confirm the rendered page has no broken images, overlap, horizontal overflow, or unreadable mobile text.

## Structured Data And Sharing

- [ ] Run <https://search.google.com/test/rich-results> against the live URL.
- [ ] Confirm the JSON-LD parses as `SoftwareApplication` and matches visible content.
- [ ] Do not add an `aggregateRating` or `review` unless genuine, verifiable data can be represented in compliance with Google's guidelines.
- [ ] Record any Software App rich-result eligibility warning caused by the intentionally absent rating/review.
- [ ] Test the live URL with a social-sharing debugger and confirm the title, description, and 1280x800 image render.

## Google Search Console

- [ ] Add the deployed HTTPS URL as a URL-prefix property in Google Search Console.
- [ ] Complete ownership verification using a supported method.
- [ ] Submit `https://fredjkhar.github.io/dictozy-voice-dictation-extension/sitemap.xml`.
- [ ] Use URL Inspection for the canonical landing page.
- [ ] Confirm the page is crawlable and the selected canonical matches the declared canonical.
- [ ] Request indexing after verification succeeds.
- [ ] Recheck indexed status after Google has had time to crawl the page.

## Chrome Web Store Metadata

- [ ] Record available baseline Store impressions, listing visits, installs, uninstalls, and rating metrics.
- [ ] Open extension ID `folpeencabfejhjokmldikaelonphmma` in the Developer Dashboard.
- [ ] Do not upload a new ZIP or change version `0.1.8`.
- [ ] Paste the Phase 31 short and detailed descriptions from `store/listing.md`.
- [ ] Keep the dictation screenshot first and update only the screenshot captions.
- [ ] Keep the icon, screenshots, promo tile, support URL, privacy URL, category, language, package, and permissions unchanged.
- [ ] Keep the repository as Homepage URL until the landing page is live and verified.
- [ ] After deployment verification, change Homepage URL to the canonical landing page.
- [ ] Review Privacy practices for consistency; do not claim that no user data is handled.
- [ ] Keep the metadata update in draft until explicit submission approval.

## Measurement

Baseline date: `____________`

Landing-page deployment date: `____________`

Store metadata publication date: `____________`

- [ ] Record available Store and Search Console metrics at baseline.
- [ ] Review the same metrics after two weeks.
- [ ] Review the same metrics after four weeks.
- [ ] Compare changes cautiously; do not claim causation from a small sample or a simultaneous product event.
- [ ] Use Search Console and Web Store aggregate reporting only. Do not add extension analytics or browsing telemetry.
