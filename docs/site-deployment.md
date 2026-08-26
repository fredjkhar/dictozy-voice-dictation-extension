# Dictozy Website Deployment

The production Dictozy website is published at:

```text
https://dictozy.com/
```

The GitHub Pages workflow remains manual. A normal push updates the repository but does not deploy `site/`; run the workflow only after the website change has been reviewed and explicitly approved.

## Local Preview

From the repository root:

```bash
python3 -m http.server 8080 --directory site
```

Open `http://127.0.0.1:8080/`.

The `site/` folder is the complete public artifact. It contains only intentional website files: HTML pages, the shared stylesheet, icons, social-sharing screenshots, `.nojekyll`, crawler files, and the Search Console verification file. Developer documentation and browser tests remain outside the deployed folder. Visible product previews use HTML and CSS versions of Dictozy's controls so they stay sharp and responsive.

Because the artifact is served from the custom-domain root, `site/robots.txt` is authoritative at `https://dictozy.com/robots.txt`. It must reference the production sitemap at `https://dictozy.com/sitemap.xml`.

## GitHub Pages Workflow

The manual workflow in `.github/workflows/pages.yml` uploads only `site/` as the Pages artifact. It uses `workflow_dispatch`, so an ordinary push does not deploy the website.

When deployment is explicitly approved:

1. Push the reviewed commit to GitHub.
2. Open the repository on GitHub.
3. Open **Actions** and select **Deploy Dictozy landing page**.
4. Run the workflow from the intended branch.
5. Wait for the `github-pages` environment deployment to complete.
6. Open every required public URL and confirm the response and rendered page.

Do not upload the full repository. The contents of `site/` must remain the artifact root so `/`, `/privacy.html`, `/support.html`, `/robots.txt`, `/sitemap.xml`, and `/assets/...` resolve correctly.

GitHub's official custom-workflow documentation describes `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages`:

- <https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages>

## Post-Deployment Verification

Confirm these pages return `200` over HTTPS:

```text
https://dictozy.com/
https://dictozy.com/privacy.html
https://dictozy.com/support.html
https://dictozy.com/robots.txt
https://dictozy.com/sitemap.xml
https://dictozy.com/google477277a037f62b85.html
```

Also verify:

1. An unknown path shows the custom `404.html` experience and remains `noindex`.
2. Canonical URLs and Open Graph URLs match each page exactly.
3. Images load, the product remains clear at mobile and desktop widths, and no horizontal overflow appears.
4. The homepage's SoftwareApplication JSON-LD parses and contains no rating or review data.
5. The Search Console verification file still contains the exact token issued by Google.
6. PageSpeed Insights is run against the live homepage, privacy page, and support page. Record real results rather than estimating them from local tests.
7. The updated sitemap is submitted in Search Console and all three indexable URLs are inspected.

## Chrome Web Store URLs

Keep the existing Store item aligned with these verified first-party destinations:

Homepage:

```text
https://dictozy.com/
```

Privacy policy:

```text
https://dictozy.com/privacy.html
```

Support:

```text
https://dictozy.com/support.html
```

This website release does not require an extension package update and must not alter the `0.1.10` Store draft under review.

## Legacy Redirect

The previous project URL is retained here only for a post-deployment redirect check:

```text
https://fredjkhar.github.io/dictozy-voice-dictation-extension/
```

It must return a permanent redirect to `https://dictozy.com/`. It must not appear in canonical, social, structured-data, robots, or sitemap declarations.

## Performance And Measurement

The site intentionally has no executable page JavaScript, external font, analytics script, tracking pixel, advertising file, or separate CDN dependency. The single small stylesheet remains render-blocking so visitors do not receive an unstyled first render. Add analytics only as a separate privacy and measurement decision with a real configuration and updated disclosures.

Displayed icons use explicit dimensions and local size variants. The 1280x800 PNG files are social-sharing images rather than visible page UI. Do not add WebP or AVIF variants unless a real rendered image shows a measurable delivery benefit and retains a compatible fallback.

## HSTS Limitation

HSTS is an HTTP response header and cannot be implemented in HTML. The current GitHub Pages deployment does not expose response-header configuration in this repository. Adding HSTS requires a reviewed hosting or CDN change. Audit every subdomain before enabling `includeSubDomains`, and leave `preload` disabled until the domain permanently satisfies preload requirements.

## Structured-Data Limitation

The homepage includes truthful `SoftwareApplication` metadata and a zero-price offer because the extension is free. Its `softwareVersion` must reflect the version visible on the public Chrome Web Store listing, not a draft under review. At the Phase 36 implementation point, the public version is `0.1.9`; update this field after `0.1.10` is actually published. Dictozy does not add fabricated ratings or reviews. Rich Results Test warnings about rating or review eligibility must be recorded rather than worked around with unsupported data.
