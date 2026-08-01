AUTOMATIC_TRANSCRIPTION_LANGUAGE = "auto"
DEFAULT_TRANSCRIPTION_LANGUAGE = "en"
SUPPORTED_TRANSCRIPTION_LANGUAGES = frozenset(
    {
        "ar",
        "cs",
        "da",
        "de",
        "en",
        "es",
        "fa",
        "fil",
        "fr",
        "hi",
        "id",
        "it",
        "ja",
        "ko",
        "mk",
        "ms",
        "nl",
        "pl",
        "pt",
        "ro",
        "ru",
        "sv",
        "th",
        "tr",
        "vi",
    }
)


class UnsupportedTranscriptionLanguageError(ValueError):
    """Raised when a transcription language is outside the audited allowlist."""


def normalize_transcription_language(value: str | None) -> str | None:
    candidate = DEFAULT_TRANSCRIPTION_LANGUAGE if value is None else value

    if not isinstance(candidate, str):
        raise UnsupportedTranscriptionLanguageError

    normalized = candidate.strip().lower()

    if normalized == AUTOMATIC_TRANSCRIPTION_LANGUAGE:
        return None

    if normalized not in SUPPORTED_TRANSCRIPTION_LANGUAGES:
        raise UnsupportedTranscriptionLanguageError

    return normalized
