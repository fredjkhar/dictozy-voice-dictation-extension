# Store Visual Assets

## Final Files

- `screenshot-dictation-1280x800.png`: supported field with the actual stop icon recording state and safe sample text.
- `screenshot-settings-1280x800.png`: popup settings with English language formatting, the current keyboard shortcut, production backend URL, 10-second limit, and successful health check.
- `promo-small-440x280.png`: small promotional tile.

The deterministic HTML sources live in `../source/`. Re-render them at their exact viewport sizes after changing listing visuals.

For Dictozy `0.1.7`, these unchanged assets still match the production popup and recording UI. They show English language formatting, the current shortcut assignment, Dictozy branding, the 10-second default recording limit, microphone/stop icon controls, and no development-only text controls. Field-compatibility behavior, retry, cancellation, and transient error states are verified in QA rather than represented as permanent screenshot states.

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
