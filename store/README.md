# Chrome Web Store Preparation

This folder contains release-readiness material for the Chrome Web Store. It does not publish or submit the extension.

- `listing.md`: historical 0.1.12 listing copy, declarations, permission justifications and reviewer notes; current release evidence is in `release-0.1.14.md`.
- `changelog.md`: historical release notes kept outside the main Store sales description.
- `seo-strategy.md`: search intent, listing audit, keyword guardrails, and baseline measurement plan.
- `permission-audit.md`: requested permissions, removed permissions, remaining access, and justification.
- `release-checklist.md`: packaging, dashboard, asset, CORS, and final QA checklist.
- `assets/`: versioned Store artwork and preserved historical assets; see `assets/README.md` before selecting files.
- `source/`: historical rendering sources and the 0.1.14 extension-capture script.

The privacy policy source of truth is `../PRIVACY.md`, with a first-party public rendering at `../site/privacy.html`. Keep the two aligned through `../scripts/validate_site.py` and use the public HTTPS page in the Developer Dashboard only after it returns `200`.

The public product website lives in `../site/`. Its homepage, interactive guide, privacy and support pages are live on GitHub Pages. Follow `../docs/site-deployment.md` for the manual workflow. No extension package update is required for website-only changes.
