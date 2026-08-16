# Chrome Web Store Preparation

This folder contains release-readiness material for the Chrome Web Store. It does not publish or submit the extension.

- `listing.md`: Dashboard-ready listing copy, privacy declarations, permission justifications, reviewer notes, and update guidance.
- `changelog.md`: historical release notes kept outside the main Store sales description.
- `seo-strategy.md`: search intent, listing audit, keyword guardrails, and baseline measurement plan.
- `permission-audit.md`: requested permissions, removed permissions, remaining access, and justification.
- `release-checklist.md`: packaging, dashboard, asset, CORS, and final QA checklist.
- `assets/`: final Store screenshots and promotional tile.
- `source/`: deterministic HTML used to render the final raster assets.

The public privacy policy source is `../PRIVACY.md`. Host it at a stable public HTTPS URL before submission and enter that URL in the Developer Dashboard Privacy practices tab.

The product landing page lives in `../site/`. It is prepared for GitHub Pages but is not live until the deployment checklist succeeds. Keep the repository as the Chrome Web Store Homepage URL until the landing page returns `200` at its canonical HTTPS URL.
