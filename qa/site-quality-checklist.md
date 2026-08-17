# Dictozy Website Quality Checklist

Use this checklist before and after deploying a change to the public Dictozy website. It does not authorize an extension package upload, a website deployment, or a Chrome Web Store submission.

## Automated Review

- [ ] Run `python3 scripts/validate_site.py`.
- [ ] Run `npm run test:site` and inspect the attached desktop and mobile screenshots.
- [ ] Confirm extension syntax, tests, package inputs, and Store assets still pass even though website work does not change them.
- [ ] Confirm `git status` contains no changes under `extension/` or `backend/`.
- [ ] Confirm the Search Console verification file remains byte-for-byte unchanged.
- [ ] Confirm `site/` contains no developer Markdown, browser tests, local caches, or build artifacts.

## Visual Review

- [ ] Review the homepage at `320x568`, `390x844`, `768x1024`, `1280x800`, `1440x1000`, and `1920x960`.
- [ ] Review the privacy, support, and 404 pages at mobile and desktop widths.
- [ ] Confirm the Dictozy microphone, recording state, and popup preview remain faithful to the published product and render sharply.
- [ ] Confirm the hero uses the neutral page background behind the dictation preview, with no darker green panel.
- [ ] Confirm the three-part assurance band uses the same maximum width and horizontal gutters as the main content.
- [ ] Confirm headings, body text, buttons, product previews, and footer links do not overlap or clip.
- [ ] Confirm there is no horizontal page overflow.
- [ ] Confirm the first viewport clearly shows the Dictozy name, voice-dictation offer, real product, Store action, and account reassurance.
- [ ] Confirm raster Store screenshots are not stretched into visible homepage UI; approved PNGs remain available for social metadata.

## Keyboard And Screen Reader Review

- [ ] Use only the keyboard to move through the header, main content, FAQ, install actions, and footer.
- [ ] Confirm the first Tab reveals the skip link and Enter moves focus to main content.
- [ ] Confirm every focused link and FAQ summary has a visible focus indicator.
- [ ] Confirm the page has one H1 and a logical H2/H3 hierarchy.
- [ ] Confirm header, primary navigation, main, article, section, and footer landmarks are announced meaningfully.
- [ ] Confirm informative images have descriptive alt text and decorative brand icons have empty alt text.
- [ ] Confirm the layout remains usable with reduced motion enabled and at 200% browser zoom.

## Content And Trust Review

- [ ] Compare `site/privacy.html` with `PRIVACY.md` and investigate any validator-reported critical-claim drift.
- [ ] Confirm support covers global and current-site toggles, permission, signal, shortcut, failure, backend availability, retry, cancellation, and field compatibility.
- [ ] Confirm support never asks for audio, transcripts, passwords, payment data, API keys, private page content, existing field contents, or browser storage dumps.
- [ ] Confirm no public page links to source hosting or a public issue tracker.
- [ ] Confirm no analytics, telemetry, cookies, advertising, tracking pixels, remote scripts, or remote styles were introduced.
- [ ] Confirm all product, privacy, compatibility, price, and account claims remain accurate for published version `0.1.8`.

## Live Deployment Review

- [ ] Follow `docs/site-deployment.md`; do not deploy from an unreviewed branch.
- [ ] Confirm the homepage, privacy page, and support page each return `200` over HTTPS.
- [ ] Confirm the custom 404 page appears for an unknown path and contains `noindex`.
- [ ] Confirm all internal links, images, icons, canonical URLs, social metadata, and the Chrome Web Store destination work live.
- [ ] Confirm `robots.txt`, `sitemap.xml`, and the Search Console verification file remain reachable.
- [ ] Run PageSpeed Insights for the homepage, privacy page, and support page; record real mobile and desktop findings.
- [ ] Review LCP, CLS, and interaction findings. Target LCP at or below 2.5 seconds and CLS at or below 0.1 without weakening usability.

## Search Console And Store Follow-Up

- [ ] Resubmit the sitemap after the privacy and support URLs are live.
- [ ] Run URL Inspection for the homepage, privacy page, and support page and request indexing where appropriate.
- [ ] Change the Store Privacy policy and Support URLs only after all three first-party pages return `200`.
- [ ] Do not upload an extension package. Version `0.1.8`, permissions, and extension behavior are unchanged.
- [ ] Record Search Console observations after two weeks.
- [ ] Record Search Console observations after four weeks.
- [ ] Use Search Console and Chrome Web Store aggregate reporting only; do not add website or extension analytics.
