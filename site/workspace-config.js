"use strict";
// Production configuration is fixed. Only the loopback review server replaces this response.
globalThis.DictozyWebConfig = Object.freeze({
  endpoint: "https://voice-dictation-extension.onrender.com/api/transcribe",
  localReview: false,
});
