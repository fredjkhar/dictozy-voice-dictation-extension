# Dictozy SEO And Store Discovery Launch Checklist

Use this checklist for the Phase 36 production-domain SEO consolidation. It does not authorize deployment, DNS changes, Search Console submission, or Store changes.

## Before Deployment

- [ ] Confirm the version shown on the public Chrome Web Store listing is healthy; do not treat a draft under review as published.
- [ ] Confirm `https://dictozy.com/` still returns `200` before deploying the pending website update.
- [ ] Preview `site/` locally at desktop and mobile widths.
- [ ] Confirm all icons, screenshots, navigation links, support links, and install links resolve.
- [ ] Confirm the title, meta description, canonical URL, Open Graph fields, Twitter card fields, and JSON-LD are present.
- [ ] Confirm the checked-in `robots.txt` is valid and names the canonical sitemap.
- [ ] Confirm `https://dictozy.com/robots.txt` names `https://dictozy.com/sitemap.xml`.
- [ ] Confirm `sitemap.xml` contains only the homepage, privacy page, and support page.
- [ ] Confirm the public pages contain no analytics scripts, tracking pixels, cookies, or user telemetry.
- [ ] Confirm the page makes no unsupported product, ranking, review, install-count, or compatibility claims.

## GitHub Pages

- [ ] Push the reviewed change only after commit approval.
- [ ] Open GitHub repository **Settings → Pages**.
- [ ] Select GitHub Actions as the Pages source.
- [ ] Use a workflow that uploads the contents of `site/` as the artifact root.
- [ ] Trigger the reviewed deployment manually.
- [ ] Confirm the Pages deployment succeeds.
- [ ] Confirm the canonical URL returns `200` over HTTPS.
- [ ] Confirm `/robots.txt`, `/sitemap.xml`, and `/assets/...` URLs return `200`.
- [ ] Confirm the homepage, privacy page, support page, and custom 404 page have no broken images, overlap, horizontal overflow, or unreadable mobile text.
- [ ] Confirm `/privacy.html` and `/support.html` return `200` before changing Store links.

## Structured Data And Sharing

- [ ] Run <https://search.google.com/test/rich-results> against the live URL.
- [ ] Confirm the JSON-LD parses as `SoftwareApplication` and matches visible content.
- [ ] Do not add an `aggregateRating` or `review` unless genuine, verifiable data can be represented in compliance with Google's guidelines.
- [ ] Record any Software App rich-result eligibility warning caused by the intentionally absent rating/review.
- [ ] Test the live URL with a social-sharing debugger and confirm the title, description, and 1280x800 image render.

## Google Search Console

- [ ] Use the verified `https://dictozy.com/` URL-prefix or `dictozy.com` domain property in Google Search Console.
- [ ] Complete ownership verification using a supported method.
- [ ] Submit `https://dictozy.com/sitemap.xml`.
- [ ] Use URL Inspection for the homepage, privacy page, and support page.
- [ ] Confirm the page is crawlable and the selected canonical matches the declared canonical.
- [ ] Request indexing after verification succeeds.
- [ ] Recheck indexed status after Google has had time to crawl the page.

## Chrome Web Store Metadata

- [ ] Record available baseline Store impressions, listing visits, installs, uninstalls, and rating metrics.
- [ ] Open extension ID `folpeencabfejhjokmldikaelonphmma` in the Developer Dashboard.
- [ ] Do not upload a new ZIP or modify an active extension draft as part of website-only work.
- [ ] Keep the reviewed short and detailed descriptions from `store/listing.md` unless they become inaccurate.
- [ ] Keep the dictation screenshot first and update only the screenshot captions.
- [ ] Keep the icon, screenshots, promo tile, category, language, package, and permissions unchanged.
- [ ] Keep Homepage set to `https://dictozy.com/`.
- [ ] Keep Privacy policy set to `https://dictozy.com/privacy.html`.
- [ ] Keep Support set to `https://dictozy.com/support.html`.
- [ ] Do not upload or modify an extension package as part of this website phase.
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
- [ ] Do not add GA4, ads.txt, or a CDN merely to satisfy an automated SEO checker; treat each as a separate product or architecture decision.
- [ ] Check HSTS from live response headers and record it as hosting/CDN work rather than adding an HTML meta tag.
