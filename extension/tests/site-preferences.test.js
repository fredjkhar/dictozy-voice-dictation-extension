const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadSitePreferences() {
  const sandbox = { URL };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "..", "site-preferences.js"), "utf8"),
    sandbox,
    { filename: "site-preferences.js" },
  );
  return sandbox.DictozySitePreferences;
}

test("site preferences accept only canonical HTTP and HTTPS origins", () => {
  const { normalizeOrigin } = loadSitePreferences();

  assert.equal(normalizeOrigin("https://Example.com:443"), "https://example.com");
  assert.equal(normalizeOrigin("http://localhost:8080"), "http://localhost:8080");
  assert.equal(normalizeOrigin("http://127.0.0.1:4173"), "http://127.0.0.1:4173");
  assert.equal(normalizeOrigin("https://example.com/path"), null);
  assert.equal(normalizeOrigin("https://example.com/?query=1"), null);
  assert.equal(normalizeOrigin("chrome://extensions"), null);
  assert.equal(normalizeOrigin("not an origin"), null);
});

test("site preferences are default-enabled and isolated by origin", () => {
  const { isOriginDisabled, setOriginEnabled } = loadSitePreferences();
  const disabled = setOriginEnabled([], "https://example.com", false).origins;

  assert.equal(isOriginDisabled(undefined, "https://example.com"), false);
  assert.equal(isOriginDisabled(disabled, "https://example.com"), true);
  assert.equal(isOriginDisabled(disabled, "https://app.example.com"), false);
  assert.equal(isOriginDisabled(disabled, "https://example.com:8443"), false);
  assert.equal(isOriginDisabled(disabled, "http://example.com"), false);
});

test("stored origins are normalized, deduplicated, bounded, and malformed values are ignored", () => {
  const {
    MAX_DISABLED_ORIGINS,
    normalizeDisabledOrigins,
    setOriginEnabled,
  } = loadSitePreferences();
  const candidates = [
    "https://EXAMPLE.com",
    "https://example.com",
    "https://example.com/path",
    "file:///tmp/test",
    null,
    ...Array.from({ length: MAX_DISABLED_ORIGINS + 10 }, (_, index) => `https://site-${index}.example`),
  ];
  const normalized = normalizeDisabledOrigins(candidates);

  assert.equal(normalized[0], "https://example.com");
  assert.equal(normalized.length, MAX_DISABLED_ORIGINS);
  assert.equal(normalizeDisabledOrigins("https://example.com").length, 0);

  const limitResult = setOriginEnabled(normalized, "https://another.example", false);
  assert.equal(limitResult.limitReached, true);
  assert.equal(limitResult.origins.length, MAX_DISABLED_ORIGINS);
});

test("re-enabling an origin removes only that explicit preference", () => {
  const { setOriginEnabled } = loadSitePreferences();
  const stored = ["https://example.com", "https://app.example.com"];
  const result = setOriginEnabled(stored, "https://example.com", true);

  assert.equal(result.changed, true);
  assert.deepEqual(Array.from(result.origins), ["https://app.example.com"]);
});
