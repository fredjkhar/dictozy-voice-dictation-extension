const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const extensionDir = path.join(__dirname, "..");

function readExtensionFile(name) {
  return fs.readFileSync(path.join(extensionDir, name), "utf8");
}

test("manifest is prepared for Dictozy 0.1.3 without new permissions", () => {
  const manifest = JSON.parse(readExtensionFile("manifest.json"));

  assert.equal(manifest.name, "Dictozy: Voice Dictation");
  assert.equal(manifest.short_name, "Dictozy");
  assert.equal(manifest.version, "0.1.3");
  assert.deepEqual(manifest.permissions, ["storage"]);
});

test("production popup no longer exposes fake text controls", () => {
  const popupHtml = readExtensionFile("popup.html");
  const popupJs = readExtensionFile("popup.js");

  assert.equal(/Insert Test Text|fake dictation|VOICE_DICTATION_INSERT_FAKE_TEXT/i.test(popupHtml), false);
  assert.equal(/Insert Test Text|fake dictation|VOICE_DICTATION_INSERT_FAKE_TEXT/i.test(popupJs), false);
  assert.match(popupHtml, /extensionEnabled/);
  assert.match(popupHtml, /Advanced Backend/);
  assert.match(popupHtml, /brand-mark/);
  assert.match(popupHtml, /data-tone="neutral"/);
});

test("content script honors enabled storage and has no fake text message path", () => {
  const content = readExtensionFile("content.js");

  assert.equal(/VOICE_DICTATION_INSERT_FAKE_TEXT|fake dictation|insertFakeText/i.test(content), false);
  assert.match(content, /extensionEnabled/);
  assert.match(content, /chrome\.storage\.onChanged/);
});

test("page recording control uses icon states instead of text-only labels", () => {
  const content = readExtensionFile("content.js");
  const styles = readExtensionFile("content.css");

  assert.match(content, /MIC_BUTTON_ICONS/);
  assert.match(content, /icon: "mic"/);
  assert.match(content, /icon: "stop"/);
  assert.equal(/button\.textContent\s*=\s*"(Mic|Stop|\.\.\.)"/.test(content), false);
  assert.match(styles, /voice-dictation-mic-icon/);
});

test("default recording limit is 10 seconds", () => {
  const content = readExtensionFile("content.js");
  const popupJs = readExtensionFile("popup.js");

  assert.match(content, /DEFAULT_RECORDING_DURATION_MS\s*=\s*10000/);
  assert.match(popupJs, /DEFAULT_RECORDING_DURATION_SECONDS\s*=\s*10/);
});
