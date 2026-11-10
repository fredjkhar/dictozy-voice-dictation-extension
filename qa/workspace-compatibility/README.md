# Website / installed-extension coexistence

The `published-0.1.14.tar.gz` file is a QA-only immutable source snapshot, not a
Store package. It contains exactly the 21 allowlisted runtime files from
`27f2171fcc7a3d0e48c7062aa2781864abf9ab47`. `provenance.json` records the archive
and individual file hashes, as well as the original submitted ZIP hash. Tests
verify these before loading the old extension. They never substitute candidate
files for an older installation, and work with a shallow CI checkout.

Run from the repository root:

```bash
npm run test:browser -- --grep 'native workspace with' --workers=1
```

November 10, 2026 local result: **3/3 passed** in bundled Chromium 149.0.7827.55.
The three modes are no extension, installed published 0.1.14, and installed
candidate. Each uses the actual website workspace and shared controller:

| Website result in each mode | Observed count |
| --- | --- |
| Native microphone capture starts | 1 |
| Website transcription POSTs | 1 |
| Transcript insertions | 1 |
| Extension transcription POSTs | 0 |

Capture calls are measured in every Chromium execution world, including the
extension's isolated world. The native microphone is Chromium's synthetic tone,
not the owner's device. Native MediaRecorder, focus and Undo are exercised.
Requests are stubbed; default-deny routing plus a DNS failure rule prevent live
backend/provider access. This does not measure recognition or production latency.

The same-origin writing frame keeps all editable controls out of the legacy
extension's top-frame scope. Direct workspace navigation, an incorrect parent
path, and nested embedding remain inactive. The installed worker's actual
`sendToggleToActiveTab` command route is invoked during ready, recording and
transcribing states; it does not create competing work or change the website
recording. DOM keyboard input for the assigned combination is checked separately.
These are automated command-route checks, not a claim of operating-system-level
shortcut delivery on every browser/platform. The website does not adopt the
extension's reserved shortcut.

Both installed extensions subsequently dictate in an unrelated supported HTTPS
field, with one extension request. The candidate official-site exclusion is
independent of the user's global and disabled-site preferences. Only the canonical
`dictozy.com` host is excluded; lookalike domains and unverified subdomains are not.
