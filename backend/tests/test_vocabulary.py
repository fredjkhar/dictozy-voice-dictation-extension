import json

import pytest
from starlette.datastructures import FormData

from app.core import vocabulary
from app.core.vocabulary import InvalidVocabularyError, normalize_vocabulary, vocabulary_from_form


def test_normalization_deduplicates_nfc_and_lowercase_preserving_first_spelling() -> None:
    assert normalize_vocabulary(["  Cafe\u0301  ", "CAFÉ", "Café", "Dictozy", "dictozy", "Straße", "STRASSE"]) == [
        "Café", "Dictozy", "Straße", "STRASSE",
    ]


def test_unicode_lengths_are_codepoints_after_normalization() -> None:
    assert normalize_vocabulary(["😀" * 50, "e\u0301" * 50]) == ["😀" * 50, "é" * 50]
    with pytest.raises(InvalidVocabularyError):
        normalize_vocabulary(["😀" * 51])


def test_unicode_whitespace_matches_extension_trim_behavior() -> None:
    assert normalize_vocabulary(["\ufeff\u00a0 term\u2003\ufeff", " term "]) == ["term"]


def test_raw_term_count_is_bounded_before_deduplication() -> None:
    assert len(normalize_vocabulary([f"term {index}" for index in range(100)])) == 100
    with pytest.raises(InvalidVocabularyError):
        normalize_vocabulary(["duplicate"] * 101)


@pytest.mark.parametrize("value", [None, {}, "term", [3], [True], [None], [[]], [""], ["\u00a0  "]])
def test_invalid_vocabulary_shapes_and_empty_terms_are_rejected(value) -> None:
    with pytest.raises(InvalidVocabularyError):
        normalize_vocabulary(value)


@pytest.mark.parametrize("term", ["\tterm", "term\n", "term\x00", "term\x7f", "term\x85", "term\x9f", "\ud800", "\udfff"])
def test_controls_and_surrogates_are_rejected_before_trimming(term) -> None:
    with pytest.raises(InvalidVocabularyError):
        normalize_vocabulary([term])


def test_oversized_json_is_rejected_before_parsing(monkeypatch) -> None:
    def must_not_parse(_value):
        raise AssertionError("Oversized vocabulary must not reach the JSON parser")
    monkeypatch.setattr(vocabulary.json, "loads", must_not_parse)
    with pytest.raises(InvalidVocabularyError):
        vocabulary_from_form(FormData({"vocabulary_enabled": "true", "vocabulary": " " * 64_001}))


def test_json_length_boundary_is_accepted() -> None:
    text = json.dumps(["term"]).ljust(64_000)
    assert vocabulary_from_form(FormData({"vocabulary_enabled": "true", "vocabulary": text})) == ["term"]


def test_deeply_nested_json_fails_without_exposing_content() -> None:
    with pytest.raises(InvalidVocabularyError) as caught:
        vocabulary_from_form(FormData({"vocabulary_enabled": "true", "vocabulary": "[" * 2000 + "]" * 2000}))
    assert str(caught.value) == ""
