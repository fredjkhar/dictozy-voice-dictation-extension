# Dictozy Website Deployment

The existing Dictozy homepage is published at:

```text
https://fredjkhar.github.io/dictozy-voice-dictation-extension/
```

The pending website update adds first-party privacy and support pages but does not deploy them automatically. The Pages workflow remains manual, and Store URLs must not change until all public pages have been deployed and verified.

## Local Preview

From the repository root:

```bash
python3 -m http.server 8080 --directory site
```

Open `http://127.0.0.1:8080/`.

The `site/` folder is the complete public artifact. It contains only intentional website files: HTML pages, the shared stylesheet, icons, social-sharing screenshots, `.nojekyll`, crawler files, and the Search Console verification file. Developer documentation and browser tests remain outside the deployed folder. Visible product previews use HTML and CSS versions of Dictozy's controls so they stay sharp and responsive.

For a standard GitHub Pages project site, crawler rules are requested from the host root at `https://fredjkhar.github.io/robots.txt`, not from the repository subpath. The checked-in `site/robots.txt` becomes authoritative only if the artifact is served at a host root, such as a dedicated custom domain. Submit the project sitemap directly in Search Console regardless.

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
https://fredjkhar.github.io/dictozy-voice-dictation-extension/
https://fredjkhar.github.io/dictozy-voice-dictation-extension/privacy.html
https://fredjkhar.github.io/dictozy-voice-dictation-extension/support.html
https://fredjkhar.github.io/dictozy-voice-dictation-extension/robots.txt
https://fredjkhar.github.io/dictozy-voice-dictation-extension/sitemap.xml
https://fredjkhar.github.io/dictozy-voice-dictation-extension/google477277a037f62b85.html
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

Only after the homepage, privacy page, and support page all return `200`, update the existing Store item to:

Homepage:

```text
https://fredjkhar.github.io/dictozy-voice-dictation-extension/
```

Privacy policy:

```text
https://fredjkhar.github.io/dictozy-voice-dictation-extension/privacy.html
```

Support:

```text
https://fredjkhar.github.io/dictozy-voice-dictation-extension/support.html
```

This website release does not require an extension package update. Version `0.1.8`, extension permissions, and extension behavior remain unchanged.

## Structured-Data Limitation

The homepage includes truthful `SoftwareApplication` metadata and a zero-price offer because the extension is free. Dictozy does not add fabricated ratings or reviews. Rich Results Test warnings about rating or review eligibility must be recorded rather than worked around with unsupported data.
