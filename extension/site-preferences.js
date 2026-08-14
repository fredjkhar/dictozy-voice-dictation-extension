(() => {
  const DISABLED_ORIGINS_STORAGE_KEY = "disabledSiteOrigins";
  const MAX_DISABLED_ORIGINS = 250;

  function normalizeOrigin(value) {
    if (typeof value !== "string" || value.length > 2048) {
      return null;
    }

    try {
      const url = new URL(value.trim());

      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        url.origin === "null"
      ) {
        return null;
      }

      return url.origin;
    } catch (_error) {
      return null;
    }
  }

  function normalizeDisabledOrigins(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    const normalized = [];
    const seen = new Set();

    for (const candidate of value) {
      const origin = normalizeOrigin(candidate);

      if (!origin || seen.has(origin)) {
        continue;
      }

      seen.add(origin);
      normalized.push(origin);

      if (normalized.length >= MAX_DISABLED_ORIGINS) {
        break;
      }
    }

    return normalized;
  }

  function isOriginDisabled(value, originValue) {
    const origin = normalizeOrigin(originValue);
    return Boolean(origin && normalizeDisabledOrigins(value).includes(origin));
  }

  function setOriginEnabled(value, originValue, enabled) {
    const origin = normalizeOrigin(originValue);

    if (!origin) {
      return { changed: false, limitReached: false, origins: normalizeDisabledOrigins(value) };
    }

    const origins = normalizeDisabledOrigins(value);
    const existingIndex = origins.indexOf(origin);

    if (enabled) {
      if (existingIndex === -1) {
        return { changed: false, limitReached: false, origins };
      }

      origins.splice(existingIndex, 1);
      return { changed: true, limitReached: false, origins };
    }

    if (existingIndex !== -1) {
      return { changed: false, limitReached: false, origins };
    }

    if (origins.length >= MAX_DISABLED_ORIGINS) {
      return { changed: false, limitReached: true, origins };
    }

    origins.push(origin);
    return { changed: true, limitReached: false, origins };
  }

  globalThis.DictozySitePreferences = Object.freeze({
    DISABLED_ORIGINS_STORAGE_KEY,
    MAX_DISABLED_ORIGINS,
    isOriginDisabled,
    normalizeDisabledOrigins,
    normalizeOrigin,
    setOriginEnabled,
  });
})();
