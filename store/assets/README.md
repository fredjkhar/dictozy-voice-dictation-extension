# Store Visual Assets

## Final Files

- `screenshot-dictation-1280x800.png`: supported field with the actual stop icon recording state and safe sample text.
- `screenshot-settings-1280x800.png`: popup settings with the production backend URL, 10-second limit, and successful health check.
- `promo-small-440x280.png`: small promotional tile.

The deterministic HTML sources live in `../source/`. Re-render them at their exact viewport sizes after changing listing visuals.

For the `0.1.3` Dictozy patch release, these assets should show the production popup, Dictozy branding, 10-second default recording limit, microphone/stop icon controls, and no development-only text controls.

## Rendering

Render the deterministic sources from the repository root with Chrome:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1280,800 --screenshot=store/assets/screenshot-dictation-1280x800.png file://"$PWD/store/source/dictation.html"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1280,800 --screenshot=store/assets/screenshot-settings-1280x800.png file://"$PWD/store/source/settings.html"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=440,280 --screenshot=store/assets/promo-small-440x280.png file://"$PWD/store/source/promo.html"
```

Then run:

```bash
python3 scripts/validate_store_assets.py
```

## Accuracy Rules

- Keep screenshots at `1280x800` and the small tile at `440x280`.
- Show only functionality available in the submitted extension.
- Use the actual extension icon and microphone button styling.
- Do not imply offline transcription, real-time streaming, grammar correction, accounts, or direct xAI access.
- Keep the production backend URL accurate.
- Do not include API keys, private page content, raw recordings, or personal information.
