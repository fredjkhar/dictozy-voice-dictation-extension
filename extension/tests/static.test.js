const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const extensionDir = path.join(__dirname, "..");
const rootDir = path.join(extensionDir, "..");

function readExtensionFile(name) {
  return fs.readFileSync(path.join(extensionDir, name), "utf8");
}

test("manifest is prepared for Dictozy 0.1.12 with production-only backend access", () => {
  const manifest = JSON.parse(readExtensionFile("manifest.json"));

  assert.equal(manifest.name, "Dictozy: Voice Dictation");
  assert.equal(manifest.short_name, "Dictozy");
  assert.equal(manifest.version, "0.1.12");
  assert.equal(
    manifest.description,
    "Write faster in Chrome by dictating messages, notes, searches, and form entries - no account required.",
  );
  assert.ok(manifest.description.length <= 132);
  assert.deepEqual(manifest.permissions, ["storage"]);
  assert.deepEqual(manifest.host_permissions, ["https://voice-dictation-extension.onrender.com/*"]);
  assert.deepEqual(manifest.content_scripts[0].js, [
    "dom-utils.js",
    "dictation-lifecycle.js",
    "site-preferences.js",
    "content.js",
  ]);
  assert.deepEqual(manifest.commands, {
    "toggle-dictation": {
      description: "Start, stop, or cancel Dictozy dictation",
      suggested_key: {
        default: "Ctrl+Shift+Y",
        mac: "Command+Shift+Y",
      },
    },
  });
});

test("extension and Node package versions stay aligned", () => {
  const manifest = JSON.parse(readExtensionFile("manifest.json"));
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(rootDir, "package-lock.json"), "utf8"));

  assert.equal(packageJson.version, manifest.version);
  assert.equal(packageLock.version, manifest.version);
  assert.equal(packageLock.packages[""].version, manifest.version);
});

test("production popup exposes user settings without development controls", () => {
  const popupHtml = readExtensionFile("popup.html");
  const popupJs = readExtensionFile("popup.js");

  assert.equal(/Insert Test Text|fake dictation|VOICE_DICTATION_INSERT_FAKE_TEXT/i.test(popupHtml), false);
  assert.equal(/Insert Test Text|fake dictation|VOICE_DICTATION_INSERT_FAKE_TEXT/i.test(popupJs), false);
  assert.match(popupHtml, /extensionEnabled/);
  assert.match(popupHtml, /siteEnabled/);
  assert.match(popupHtml, /Enable on this site/);
  assert.match(popupHtml, /Reset Site Preferences/);
  assert.equal(/Advanced Backend|Backend URL|Check Backend|backendUrl/.test(popupHtml), false);
  assert.equal(/VOICE_DICTATION_TEST_BACKEND|backendUrl/.test(popupJs), false);
  assert.match(popupHtml, /brand-mark/);
  assert.match(popupHtml, /shortcutValue/);
  assert.match(popupHtml, /transcriptionLanguage/);
  assert.match(popupHtml, /Language formatting/);
  assert.match(popupJs, /chrome\.commands\.getAll/);
  assert.match(popupHtml, /data-tone="neutral"/);
});

test("background pins transcription and removes the obsolete endpoint setting", () => {
  const background = readExtensionFile("background.js");
  const config = readExtensionFile("config.js");

  assert.match(background, /fetch\(TRANSCRIPTION_ENDPOINT/);
  assert.match(background, /chrome\.runtime\.onInstalled/);
  assert.match(background, /OBSOLETE_BACKEND_URL_STORAGE_KEY/);
  assert.equal(/settings\.backendUrl|message\.backendUrl|VOICE_DICTATION_TEST_BACKEND/.test(background), false);
  assert.equal(/localhost|127\.0\.0\.1/.test(config), false);
});

test("content script honors enabled storage and has no fake text message path", () => {
  const content = readExtensionFile("content.js");

  assert.equal(/VOICE_DICTATION_INSERT_FAKE_TEXT|fake dictation|insertFakeText/i.test(content), false);
  assert.match(content, /extensionEnabled/);
  assert.match(content, /chrome\.storage\.onChanged/);
  assert.match(content, /VOICE_DICTATION_TOGGLE/);
  assert.match(content, /DISABLED_ORIGINS_STORAGE_KEY/);
  assert.match(content, /VOICE_DICTATION_GET_SITE_CONTEXT/);
});

test("per-site controls remain local and add no provider or page data to transcription", () => {
  const background = readExtensionFile("background.js");
  const content = readExtensionFile("content.js");
  const popup = readExtensionFile("popup.js");
  const preferences = readExtensionFile("site-preferences.js");
  const extensionRuntime = `${background}\n${content}\n${popup}\n${preferences}`;

  assert.match(preferences, /disabledSiteOrigins/);
  assert.match(popup, /chrome\.storage\.local/);
  assert.equal(/origin\s*[:,]\s*currentOrigin/.test(content), true);
  assert.equal(/TRANSCRIBE_AUDIO_MESSAGE[\s\S]{0,500}(origin|hostname|url)\s*:/.test(content), false);
  assert.equal(extensionRuntime.includes("api.x.ai"), false);
  assert.equal(extensionRuntime.includes("XAI_API_KEY"), false);
});

test("page recording control uses icon states instead of text-only labels", () => {
  const content = readExtensionFile("content.js");
  const styles = readExtensionFile("content.css");

  assert.match(content, /MIC_BUTTON_ICONS/);
  assert.match(content, /icon: "mic"/);
  assert.match(content, /icon: "stop"/);
  assert.match(content, /icon: "retry"/);
  assert.match(content, /label: "Cancel transcription"/);
  assert.equal(/button\.textContent\s*=\s*"(Mic|Stop|\.\.\.)"/.test(content), false);
  assert.match(styles, /voice-dictation-mic-icon/);
});

test("dictation lifecycle adds cancellable request IDs without direct provider access", () => {
  const background = readExtensionFile("background.js");
  const content = readExtensionFile("content.js");
  const lifecycle = readExtensionFile("dictation-lifecycle.js");
  const directProviderEndpoint = ["api", ".x", ".ai"].join("");
  const providerKeyName = ["XAI", "API", "KEY"].join("_");

  assert.match(background, /X-Request-ID/);
  assert.match(background, /AbortController/);
  assert.match(content, /VOICE_DICTATION_CANCEL_TRANSCRIPTION/);
  assert.match(content, /createRequestId/);
  assert.match(lifecycle, /createRequestLifecycle/);
  assert.equal(`${background}\n${content}\n${lifecycle}`.includes(directProviderEndpoint), false);
  assert.equal(`${background}\n${content}\n${lifecycle}`.includes(providerKeyName), false);
});

test("default recording limit is 10 seconds", () => {
  const content = readExtensionFile("content.js");
  const popupJs = readExtensionFile("popup.js");

  assert.match(content, /DEFAULT_RECORDING_DURATION_MS\s*=\s*10000/);
  assert.match(popupJs, /DEFAULT_RECORDING_DURATION_SECONDS\s*=\s*10/);
});
