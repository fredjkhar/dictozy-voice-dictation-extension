# Chrome Web Store Preparation

This folder contains release-readiness material for the Chrome Web Store. It does not publish or submit the extension.

- `listing.md`: Dashboard-ready listing copy, privacy declarations, permission justifications, reviewer notes, and update guidance.
- `changelog.md`: historical release notes kept outside the main Store sales description.
- `seo-strategy.md`: search intent, listing audit, keyword guardrails, and baseline measurement plan.
- `permission-audit.md`: requested permissions, removed permissions, remaining access, and justification.
- `release-checklist.md`: packaging, dashboard, asset, CORS, and final QA checklist.
- `assets/`: final Store screenshots and promotional tile.
- `source/`: deterministic HTML used to render the final raster assets.

The privacy policy source of truth is `../PRIVACY.md`, with a first-party public rendering at `../site/privacy.html`. Keep the two aligned through `../scripts/validate_site.py` and use the public HTTPS page in the Developer Dashboard only after it returns `200`.

The public product website lives in `../site/`. Its homepage is live on GitHub Pages; Phase 32 adds first-party privacy and support pages that must be deployed and verified before their Dashboard URLs change. Follow `../docs/site-deployment.md` for the manual workflow. No extension package update is required for website-only changes.
