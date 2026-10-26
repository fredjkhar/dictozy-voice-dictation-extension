const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "vocabulary.js"), "utf8"), context);
const { validateVocabularyTerms, normalizeVocabularySettings } = context.DictozyVocabulary;
const plain = (value) => JSON.parse(JSON.stringify(value));

test("vocabulary trims, normalizes Unicode and deduplicates without rewriting terms", () => {
  const result = plain(validateVocabularyTerms(["  Dictozy  ", "dictozy", "Cafe\u0301", "Café", "Ada Lovelace", "😀".repeat(50)]));
  assert.deepEqual(result, { ok: true, terms: ["Dictozy", "Café", "Ada Lovelace", "😀".repeat(50)] });
  assert.equal(validateVocabularyTerms(Array.from({ length: 100 }, (_, index) => `Term ${index}`)).ok, true);
});

test("vocabulary rejects malformed, excessive and unsafe entries with value-free errors", () => {
  const invalid = [null, {}, "private-term", [null], [42], [""], ["   "], ["a".repeat(51)],
    ["😀".repeat(51)], ["private\nterm"], ["\tprivate"], ["private\u0085"], ["private\ud800"], Array(101).fill("same")];
  for (const value of invalid) {
    const result = validateVocabularyTerms(value);
    assert.equal(result.ok, false);
    assert.equal(result.message.includes("private"), false);
    assert.equal(Object.hasOwn(result, "terms"), false);
  }
});

test("vocabulary settings require explicit boolean consent and fail closed on corrupt storage", () => {
  for (const value of [undefined, null, {}, { enabled: true }, { enabled: true, terms: ["too long".repeat(20)] }]) {
    assert.deepEqual(plain(normalizeVocabularySettings(value)), { enabled: false, terms: [] });
  }
  for (const enabled of [undefined, false, "true", 1]) {
    assert.deepEqual(plain(normalizeVocabularySettings({ enabled, terms: ["Private term"] })), { enabled: false, terms: ["Private term"] });
  }
  assert.deepEqual(plain(normalizeVocabularySettings({ enabled: true, terms: ["Private term"] })), { enabled: true, terms: ["Private term"] });
});
