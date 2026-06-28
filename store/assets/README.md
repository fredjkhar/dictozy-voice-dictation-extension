# Store Visual Assets

## Final Files

- `screenshot-dictation-1280x800.png`: supported field with the actual Mic success styling and an inserted transcript.
- `screenshot-settings-1280x800.png`: popup settings with the production backend URL, 10-second limit, and successful health check.
- `promo-small-440x280.png`: small promotional tile.
- `source/promo-illustration.png`: generated illustration used as the promo background.

The deterministic HTML sources live in `../source/`. Re-render them at their exact viewport sizes after changing listing visuals.

For the `0.1.2` FieldMic release, regenerate these screenshots during Phase 21B so the listing shows the production popup instead of the earlier backend settings view.

## Accuracy Rules

- Keep screenshots at `1280x800` and the small tile at `440x280`.
- Show only functionality available in the submitted extension.
- Use the actual extension icon and microphone button styling.
- Do not imply offline transcription, real-time streaming, grammar correction, accounts, or direct xAI access.
- Keep the production backend URL accurate.
- Do not include API keys, private page content, raw recordings, or personal information.

## Generated Illustration

The promo background was created with the built-in image-generation tool using this production prompt:

> Create a polished, simple Chrome Web Store promotional background representing voice dictation into a web text field. Use a professional teal and navy productivity-software palette, a modern microphone, a subtle audio waveform moving toward a clean browser text field, and one restrained coral recording accent. Use premium flat 3D illustration with clear geometry at thumbnail size. Include no words, letters, logos, people, watermark, or claims. Communicate speech-to-text only, not text-to-speech, and fill the entire canvas.

Exact product text and branding were added deterministically in `../source/promo.html` rather than generated into the image.
