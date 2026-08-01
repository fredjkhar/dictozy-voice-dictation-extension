(() => {
  const DEFAULT_BACKEND_URL = "https://voice-dictation-extension.onrender.com/api/transcribe";
  const DEFAULT_TRANSCRIPTION_LANGUAGE = "en";
  const PRODUCTION_BACKEND_ORIGIN = "https://voice-dictation-extension.onrender.com";
  const TRANSCRIPTION_PATH = "/api/transcribe";
  const TRANSCRIPTION_LANGUAGES = Object.freeze([
    Object.freeze({ code: "auto", label: "Automatic" }),
    Object.freeze({ code: "ar", label: "Arabic" }),
    Object.freeze({ code: "cs", label: "Czech" }),
    Object.freeze({ code: "da", label: "Danish" }),
    Object.freeze({ code: "nl", label: "Dutch" }),
    Object.freeze({ code: "en", label: "English" }),
    Object.freeze({ code: "fil", label: "Filipino" }),
    Object.freeze({ code: "fr", label: "French" }),
    Object.freeze({ code: "de", label: "German" }),
    Object.freeze({ code: "hi", label: "Hindi" }),
    Object.freeze({ code: "id", label: "Indonesian" }),
    Object.freeze({ code: "it", label: "Italian" }),
    Object.freeze({ code: "ja", label: "Japanese" }),
    Object.freeze({ code: "ko", label: "Korean" }),
    Object.freeze({ code: "mk", label: "Macedonian" }),
    Object.freeze({ code: "ms", label: "Malay" }),
    Object.freeze({ code: "fa", label: "Persian" }),
    Object.freeze({ code: "pl", label: "Polish" }),
    Object.freeze({ code: "pt", label: "Portuguese" }),
    Object.freeze({ code: "ro", label: "Romanian" }),
    Object.freeze({ code: "ru", label: "Russian" }),
    Object.freeze({ code: "es", label: "Spanish" }),
    Object.freeze({ code: "sv", label: "Swedish" }),
    Object.freeze({ code: "th", label: "Thai" }),
    Object.freeze({ code: "tr", label: "Turkish" }),
    Object.freeze({ code: "vi", label: "Vietnamese" }),
  ]);
  const TRANSCRIPTION_LANGUAGE_CODES = new Set(TRANSCRIPTION_LANGUAGES.map(({ code }) => code));

  function normalizeTranscriptionLanguage(value) {
    if (typeof value !== "string") {
      return DEFAULT_TRANSCRIPTION_LANGUAGE;
    }

    const normalized = value.trim().toLowerCase();
    return TRANSCRIPTION_LANGUAGE_CODES.has(normalized) ? normalized : DEFAULT_TRANSCRIPTION_LANGUAGE;
  }

  function validateBackendUrl(value) {
    try {
      const url = new URL(value);
      const isLocalHttp = url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
      const isProductionBackend = url.origin === PRODUCTION_BACKEND_ORIGIN;
      const isXaiHost = url.hostname === "x.ai" || url.hostname.endsWith(".x.ai");

      if (!isLocalHttp && !isProductionBackend) {
        return { ok: false, message: "Use the production backend, or localhost for development." };
      }

      if (isXaiHost) {
        return { ok: false, message: "Use your backend URL, not an xAI URL." };
      }

      if (url.username || url.password || url.search || url.hash) {
        return { ok: false, message: "Backend URL must not include credentials, a query, or a fragment." };
      }

      if (!url.pathname.endsWith(TRANSCRIPTION_PATH)) {
        return { ok: false, message: `Backend URL must end with ${TRANSCRIPTION_PATH}.` };
      }

      return { ok: true, url: url.toString() };
    } catch (_error) {
      return { ok: false, message: "Enter a valid backend URL." };
    }
  }

  function normalizeBackendUrl(value) {
    const result = validateBackendUrl(value || DEFAULT_BACKEND_URL);
    return result.ok ? result.url : DEFAULT_BACKEND_URL;
  }

  function getHealthUrl(value) {
    const url = new URL(normalizeBackendUrl(value));
    url.pathname = url.pathname.slice(0, -TRANSCRIPTION_PATH.length) + "/health";
    return url.toString();
  }

  globalThis.VoiceDictationConfig = Object.freeze({
    DEFAULT_BACKEND_URL,
    DEFAULT_TRANSCRIPTION_LANGUAGE,
    TRANSCRIPTION_LANGUAGES,
    getHealthUrl,
    normalizeBackendUrl,
    normalizeTranscriptionLanguage,
    validateBackendUrl,
  });
})();
