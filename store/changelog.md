# Dictozy Release Notes

These notes preserve the release history without placing every prior version in the Chrome Web Store sales description.

## 0.1.8

- Added a current-site toggle while retaining the global master control.
- Added exact-origin preferences so one site can be disabled without affecting others.
- Kept explicitly disabled origins in local extension storage only.
- Cancelled extension-side work and prevented late insertion when a site is disabled.
- Added a reset control for site preferences that preserves unrelated settings.

## 0.1.7

- Improved insertion in modern controlled inputs and textareas.
- Improved caret and selection handling in contenteditable fields, with transcripts inserted as plain text.
- Added safer handling when a page replaces, removes, hides, or disables the original field during transcription.
- Improved support for fields created dynamically after page load.

## 0.1.6

- Added Automatic and 25 explicit language-formatting options.
- Kept English as the default.
- Used explicit choices to guide written formatting for numbers, currencies, and units.

## 0.1.5

- Added a configurable browser shortcut for starting, stopping, or cancelling dictation.
- Added the current shortcut assignment and a link to Chrome shortcut settings in the popup.
- Applied the existing field, privacy, cancellation, and stale-focus protections to shortcut actions.

## 0.1.4

- Added clear retry and transcription-cancel controls.
- Added persistent, actionable errors with short support references.
- Improved handling for clearly silent or missing microphone input.
- Strengthened protection against late responses and focus changes.
- Expanded automated Chromium reliability tests.

## 0.1.3

- Bundled the Dictozy logo consistently for the toolbar, popup, and Chrome extensions page.

## 0.1.2

- Introduced the Dictozy name and icon.
- Reworked the popup into a production settings layout.
- Added microphone and stop icons to the page control.
- Added an enabled toggle and a 10-second default recording limit.
- Improved supported-field detection and stale-field handling.
- Updated Chrome Web Store screenshots and promotional artwork.
