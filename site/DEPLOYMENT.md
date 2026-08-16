# Dictozy Landing Page Deployment

The landing page is prepared for this planned GitHub Pages URL:

```text
https://fredjkhar.github.io/dictozy-voice-dictation-extension/
```

As of August 15, 2026, that URL returns `404`. Do not use it as the Chrome Web Store Homepage URL or submit it to Search Console until a deployment succeeds.

## Local Preview

From the repository root:

```bash
python3 -m http.server 8080 --directory site
```

Open `http://127.0.0.1:8080/`.

The `site/` folder is self-contained. Its HTML, stylesheet, icons, screenshots, `robots.txt`, and `sitemap.xml` can be published as one static artifact.

For a standard GitHub Pages project site, crawler rules are requested from the host root at `https://fredjkhar.github.io/robots.txt`, not from the repository subpath. The checked-in `robots.txt` becomes authoritative only if this artifact is served at a host root, such as a dedicated custom domain. As of August 15, 2026, the GitHub user-root file returns `404`, which supplies no blocking rules. Submit the project sitemap directly in Search Console regardless.

## GitHub Pages Setup

1. Push the reviewed Phase 31 commit to GitHub.
2. Open the repository on GitHub.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **GitHub Actions** as the source.
5. Add or approve a Pages workflow that uploads only the checked-in `site/` directory as the Pages artifact.
6. Run the workflow manually for the first deployment.
7. Wait for the `github-pages` environment deployment to complete.
8. Open the expected URL and confirm it returns `200` rather than `404`.

Do not use a workflow that uploads the full repository. The published artifact should contain the contents of `site/` at its root so `/`, `/robots.txt`, `/sitemap.xml`, and `/assets/...` resolve correctly.

GitHub's official custom-workflow documentation uses `actions/configure-pages`, `actions/upload-pages-artifact`, and `actions/deploy-pages`. Confirm current major versions in the official documentation before adding the workflow:

- <https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages>

When deployment is explicitly approved, this manual-only workflow is an appropriate starting point for `.github/workflows/pages.yml`:

```yaml
name: Deploy Dictozy landing page

on:
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v6
      - name: Configure Pages
        uses: actions/configure-pages@v5
      - name: Upload site artifact
        uses: actions/upload-pages-artifact@v4
        with:
          path: site
      - name: Deploy Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

The `workflow_dispatch` trigger prevents deployment on an ordinary push. Adding and running this workflow is intentionally deferred until the user approves publication.

## Post-Deployment Verification

Verify these URLs:

```text
https://fredjkhar.github.io/dictozy-voice-dictation-extension/
https://fredjkhar.github.io/dictozy-voice-dictation-extension/robots.txt
https://fredjkhar.github.io/dictozy-voice-dictation-extension/sitemap.xml
https://fredjkhar.github.io/dictozy-voice-dictation-extension/assets/icon-128.png
https://fredjkhar.github.io/dictozy-voice-dictation-extension/assets/screenshot-dictation-1280x800.png
```

Then:

1. Confirm the canonical and `og:url` match the live URL exactly.
2. Confirm the Open Graph image loads without authentication.
3. Run Google's Rich Results Test and inspect the JSON-LD.
4. Use the URL Inspection tool in Google Search Console.
5. Replace the Chrome Web Store Homepage URL with the verified landing-page URL.

## Structured-Data Limitation

The page includes truthful `SoftwareApplication` metadata and a zero-price offer because the extension is free. Google currently requires a qualifying rating or review for the Software App rich result. Dictozy does not add fabricated rating or review data, so the Rich Results Test may report that the page is not eligible for that rich result. The JSON-LD remains useful machine-readable product metadata and must stay consistent with visible page content.
