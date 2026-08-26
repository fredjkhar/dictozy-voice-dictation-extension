const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const extensionDir = path.join(__dirname, "..");

function loadConfig() {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(extensionDir, "config.js"), "utf8"),
    sandbox,
    { filename: "config.js" },
  );
  return sandbox.VoiceDictationConfig;
}

test("production transcription endpoint is fixed", () => {
  const config = loadConfig();

  assert.equal(
    config.TRANSCRIPTION_ENDPOINT,
    "https://voice-dictation-extension.onrender.com/api/transcribe",
  );
  assert.equal(Object.hasOwn(config, "DEFAULT_BACKEND_URL"), false);
  assert.equal(Object.hasOwn(config, "validateBackendUrl"), false);
  assert.equal(Object.hasOwn(config, "getHealthUrl"), false);
});

test("language formatting options match the audited allowlist", () => {
  const config = loadConfig();

  assert.equal(config.DEFAULT_TRANSCRIPTION_LANGUAGE, "en");
  assert.deepEqual(
    Array.from(config.TRANSCRIPTION_LANGUAGES, ({ code, label }) => `${code}:${label}`),
    [
      "auto:Automatic",
      "ar:Arabic",
      "cs:Czech",
      "da:Danish",
      "nl:Dutch",
      "en:English",
      "fil:Filipino",
      "fr:French",
      "de:German",
      "hi:Hindi",
      "id:Indonesian",
      "it:Italian",
      "ja:Japanese",
      "ko:Korean",
      "mk:Macedonian",
      "ms:Malay",
      "fa:Persian",
      "pl:Polish",
      "pt:Portuguese",
      "ro:Romanian",
      "ru:Russian",
      "es:Spanish",
      "sv:Swedish",
      "th:Thai",
      "tr:Turkish",
      "vi:Vietnamese",
    ],
  );
});

test("language formatting normalization is conservative", () => {
  const { normalizeTranscriptionLanguage } = loadConfig();

  assert.equal(normalizeTranscriptionLanguage(" FR "), "fr");
  assert.equal(normalizeTranscriptionLanguage("AUTO"), "auto");
  assert.equal(normalizeTranscriptionLanguage("unsupported"), "en");
  assert.equal(normalizeTranscriptionLanguage(null), "en");
});
