# Dictozy Discovery And SEO Strategy

Date: August 15, 2026

This document separates observed product facts from recommendations. It does not claim keyword search volume or guaranteed ranking outcomes.

## Primary Search Intent

People looking for a lightweight way to speak short text into fields they are already using in Chrome.

Primary phrase:

- Voice dictation

Relevant secondary phrases:

- Voice typing
- Speech to text
- Dictate into text fields
- Chrome voice dictation
- Browser dictation

These phrases should appear only where they describe the shipped experience naturally. They are not a list to repeat throughout Store metadata.

## Target Audience

- People writing short messages, notes, searches, and form entries in Chrome.
- People who prefer speaking a short phrase to typing it.
- People who want a visible start/stop control and clear recording behavior.
- People who need per-site control instead of an always-visible dictation control.

## Problems Solved

- Reduces context switching to a separate speech-to-text tool.
- Inserts a returned transcript into the field where the user was writing.
- Provides click and keyboard controls for short dictation.
- Keeps the provider key out of the browser extension.
- Lets users disable the extension globally or on one exact origin.

## Search Phrases To Avoid

Do not target phrases that imply functionality Dictozy does not provide:

- Offline voice typing
- Real-time or streaming transcription
- Unlimited or long-form recording
- Grammar correction or writing assistant
- Meeting transcription
- Transcript history or note storage
- Firefox, Safari, Edge, mobile, Android, or iOS dictation
- Free xAI API access
- Dictation for named websites without verified compatibility

Do not use competitor names, unrelated brands, regional keyword lists, or repetitive keyword variants.

## Observed Listing Audit

Strengths:

- The name is distinctive and states the core function.
- The listing accurately explains explicit recording, backend transcription, and sensitive-field exclusions.
- Screenshots show the shipped dictation and settings workflows.
- Privacy and permission explanations agree with extension behavior.

Weaknesses before Phase 31:

- The summary did not lead with common user language such as voice typing.
- The detailed description included release notes from six older versions.
- The opening copy explained the workflow but could state the user outcome more directly.
- Screenshot captions were accurate but the first did not explicitly describe the voice-typing outcome.

## Observed Landing-Page Audit

Strengths:

- Product imagery and installation action appear in the first viewport.
- The page is static, responsive, and readable without JavaScript.
- Privacy and data flow are explained accurately.

Gaps before Phase 31:

- The planned GitHub Pages URL was not live.
- Canonical, Open Graph, Twitter card, and structured-data metadata were absent.
- Icons and screenshots were loaded from outside `site/`, preventing a self-contained Pages artifact.
- There was no sitemap, robots file, or Search Console launch checklist.
- Compatibility and product limitations were spread across paragraphs rather than presented as a scannable section.

## Recommendations

1. Keep `Dictozy: Voice Dictation`; do not stuff the title with phrases.
2. Use the summary to state the Chrome voice-typing outcome in plain language.
3. Keep the description concise: overview, short feature list, privacy, compatibility, and current release notes.
4. Keep the real dictation screenshot first and settings second.
5. Publish the landing page at one stable HTTPS URL before using it as the Store Homepage URL.
6. Measure Store and Search Console outcomes without adding extension telemetry.

Chrome states that Store search uses listing metadata and that discovery also considers quality signals such as ratings and downloads relative to uninstalls. Metadata improvements should therefore be evaluated alongside product reliability and user experience, not as a standalone ranking guarantee.

## Baseline Measurement

Record values immediately before the metadata change:

- Chrome Web Store listing impressions or equivalent visibility metric available in the Dashboard.
- Listing visits.
- Installs.
- Uninstalls or retention-related metrics exposed by the Dashboard.
- Current rating count and score, if present.
- Search Console indexed status after the landing page launches.
- Search Console impressions, clicks, click-through rate, and observed queries.

Review the same measurements after two weeks and four weeks. Annotate the publication dates for the landing page and Store metadata so changes are not attributed to the wrong event.

## Guardrails

- No invented keyword-volume figures.
- No ranking guarantees.
- No fake ratings, reviews, testimonials, install counts, or badges.
- No more than natural, contextual use of a phrase; investigate any exact phrase repeated more than five times.
- No analytics, cookies, tracking pixels, or extension telemetry in this phase.
- Listing, privacy declarations, screenshots, and actual behavior must remain consistent.

## Official Sources

- [Creating a great listing page](https://developer.chrome.com/docs/webstore/best-listing)
- [Discovery on the Chrome Web Store](https://developer.chrome.com/docs/webstore/discovery)
- [Chrome Web Store listing requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements)
- [Chrome Web Store spam policy FAQ](https://developer.chrome.com/docs/webstore/program-policies/spam-faq)
- [Google Search developer guide](https://developers.google.com/search/docs/fundamentals/get-started-developers)
- [SoftwareApplication structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app)
