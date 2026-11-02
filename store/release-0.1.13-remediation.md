# 0.1.13 candidate remediation addendum

This addendum supersedes the initial preparation statement that only the manifest version
changed in the packaged runtime. There is now one bounded CSS correction as described below.
All JavaScript, backend logic, permissions, recording limits and privacy/data flows are unchanged.

## Observed failure

GitHub Actions run 40446868723 tested candidate 794e1747402a4679928a4492c8bbe6d4739b73bc.
60 unit, 150 backend and 21 website tests passed. Browser tests: 149 passed, one failed
on both the initial attempt and its existing retry. No tests were removed or relaxed.

The existing test `recording panel avoids a bottom composer at 300x228 through timer updates
and resize` observed a 96.78125px-high recording panel overlapping its retained editor.
In a separate local Chromium layout probe, widening the activity text reproduced that exact
panel height; constraining the visual activity label restored 81.1875px height. This probe
is layout evidence, not a real microphone or live-app test.

## Minimal correction

Only in the existing compact-height media query, the activity label now uses min-width:0,
white-space:nowrap, overflow:hidden, and text-overflow:ellipsis. Full activity text remains in
the DOM; recording state, timer and Stop/Discard controls are unchanged. This prevents wider
system fonts from adding a line that defeats the compact positioning geometry.

The unchanged original regression must pass in the final candidate run. The release builder
accepts only this exact appended CSS block in addition to the manifest version change; all
other packaged runtime bytes must still match c8fda6c. Package creation remains gated by the
existing complete automated suites. Do not present the earlier 381 baseline as the result of
the failed run, or claim the corrected run passed before its actual completion.

No main merge, production change, paid transcription call, browser permission, Store upload,
publication, or additional human test was performed for this correction.
