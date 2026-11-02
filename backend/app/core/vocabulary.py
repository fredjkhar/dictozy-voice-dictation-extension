"""Validate request-scoped vocabulary without retaining or logging its contents."""

import json
import unicodedata

from starlette.datastructures import FormData


MAX_VOCABULARY_TERMS = 100
MAX_VOCABULARY_TERM_LENGTH = 50
MAX_VOCABULARY_JSON_LENGTH = 64_000
# JavaScript String.trim whitespace, excluding controls rejected below. Python's
# default strip differs for U+FEFF, so keep the extension and server consistent.
VOCABULARY_WHITESPACE = " \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff"


class InvalidVocabularyError(ValueError):
    """Raised without including the submitted vocabulary in the error."""


def normalize_vocabulary(value: object) -> list[str]:
    if not isinstance(value, list) or len(value) > MAX_VOCABULARY_TERMS:
        raise InvalidVocabularyError

    terms = []
    seen = set()
    for raw_term in value:
        if not isinstance(raw_term, str):
            raise InvalidVocabularyError
        # Check before trimming: controls must not silently become valid terms.
        if any(ord(char) < 0x20 or 0x7F <= ord(char) <= 0x9F or 0xD800 <= ord(char) <= 0xDFFF
               for char in raw_term):
            raise InvalidVocabularyError
        term = unicodedata.normalize("NFC", raw_term.strip(VOCABULARY_WHITESPACE))
        if not term or len(term) > MAX_VOCABULARY_TERM_LENGTH:
            raise InvalidVocabularyError
        key = term.lower()
        if key not in seen:
            seen.add(key)
            terms.append(term)
    return terms


def vocabulary_from_form(form: FormData) -> list[str]:
    flags = form.getlist("vocabulary_enabled")
    if not flags:
        return []
    if len(flags) != 1 or not isinstance(flags[0], str) or flags[0] not in {"true", "false"}:
        raise InvalidVocabularyError
    if flags[0] == "false":
        return []

    values = form.getlist("vocabulary")
    if len(values) != 1 or not isinstance(values[0], str):
        raise InvalidVocabularyError
    if len(values[0]) > MAX_VOCABULARY_JSON_LENGTH:
        raise InvalidVocabularyError
    try:
        value = json.loads(values[0])
    except (ValueError, RecursionError):
        raise InvalidVocabularyError from None
    return normalize_vocabulary(value)
