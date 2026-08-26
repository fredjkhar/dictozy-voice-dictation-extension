(() => {
  const TRANSCRIPTION_ENDPOINT = "https://voice-dictation-extension.onrender.com/api/transcribe";
  const DEFAULT_TRANSCRIPTION_LANGUAGE = "en";
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

  globalThis.VoiceDictationConfig = Object.freeze({
    DEFAULT_TRANSCRIPTION_LANGUAGE,
    TRANSCRIPTION_ENDPOINT,
    TRANSCRIPTION_LANGUAGES,
    normalizeTranscriptionLanguage,
  });
})();
