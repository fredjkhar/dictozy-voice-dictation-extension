(() => {
  const STORAGE_KEY = "personalVocabulary";
  const MAX_TERMS = 100;
  const MAX_TERM_CHARACTERS = 50;
  const INVALID_MESSAGE = "Use up to 100 words or short phrases, each 1–50 characters, without control characters.";

  function validateVocabularyTerms(value) {
    if (!Array.isArray(value) || value.length > MAX_TERMS) {
      return { ok: false, message: INVALID_MESSAGE };
    }
    const terms = [];
    const seen = new Set();
    for (const entry of value) {
      if (typeof entry !== "string" || /[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(entry)) {
        return { ok: false, message: INVALID_MESSAGE };
      }
      const term = entry.trim().normalize("NFC");
      if (!term || Array.from(term).length > MAX_TERM_CHARACTERS) {
        return { ok: false, message: INVALID_MESSAGE };
      }
      const identity = term.toLowerCase();
      if (!seen.has(identity)) {
        seen.add(identity);
        terms.push(term);
      }
    }
    return { ok: true, terms };
  }

  function normalizeVocabularySettings(value) {
    const validated = validateVocabularyTerms(value?.terms);
    // Corrupt/legacy storage never grants consent or sends a partial vocabulary.
    if (!validated.ok) return { enabled: false, terms: [] };
    return { enabled: value.enabled === true, terms: validated.terms };
  }

  globalThis.DictozyVocabulary = Object.freeze({
    STORAGE_KEY,
    MAX_TERMS,
    MAX_TERM_CHARACTERS,
    validateVocabularyTerms,
    normalizeVocabularySettings,
  });
})();
