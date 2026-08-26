const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const extensionDir = path.join(__dirname, "..");

function loadBackgroundUtils() {
  const sandbox = {
    Blob,
    Uint8Array,
    atob,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(extensionDir, "background-utils.js"), "utf8"),
    sandbox,
    { filename: "background-utils.js" },
  );
  return sandbox.DictozyBackgroundUtils;
}

test("accepts the browser and backend audio MIME allowlist", () => {
  const { prepareAudioDataUrl } = loadBackgroundUtils();
  const cases = [
    ["audio/webm;codecs=opus", "webm"],
    ["audio/mp4", "mp4"],
    ["audio/ogg", "ogg"],
    ["audio/wav", "wav"],
    ["audio/mpeg", "mp3"],
    ["audio/x-m4a", "m4a"],
  ];

  for (const [mimeType, extension] of cases) {
    const result = prepareAudioDataUrl(`data:${mimeType};base64,YXVkaW8=`);
    assert.equal(result.ok, true, mimeType);
    assert.equal(result.extension, extension, mimeType);
    assert.equal(result.blob.size, 5, mimeType);
  }
});

test("rejects malformed, empty, and unsupported audio data", () => {
  const { prepareAudioDataUrl } = loadBackgroundUtils();

  assert.equal(prepareAudioDataUrl("").reason, "invalid");
  assert.equal(prepareAudioDataUrl("data:text/plain;base64,YXVkaW8=").reason, "invalid");
  assert.equal(prepareAudioDataUrl("data:audio/webm;base64,").reason, "invalid");
  assert.equal(prepareAudioDataUrl("data:audio/webm;base64,not base64").reason, "invalid");
});

test("rejects oversized encoded audio before decoding", () => {
  const { MAX_AUDIO_BASE64_LENGTH, prepareAudioDataUrl } = loadBackgroundUtils();
  let decodeCalls = 0;
  const result = prepareAudioDataUrl(
    `data:audio/webm;base64,${"A".repeat(MAX_AUDIO_BASE64_LENGTH + 4)}`,
    {
      atob() {
        decodeCalls += 1;
        return "";
      },
    },
  );

  assert.equal(result.ok, false);
  assert.equal(result.reason, "too_large");
  assert.equal(decodeCalls, 0);
});
