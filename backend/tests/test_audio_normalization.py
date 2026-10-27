from io import BytesIO
import math
import wave

import pytest

from app.services.audio_normalization import AudioNoSpeechError, normalize_audio_for_stt


def make_test_wav() -> bytes:
    sample_rate = 8000
    duration_seconds = 0.25
    frame_count = int(sample_rate * duration_seconds)
    buffer = BytesIO()

    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)

        for index in range(frame_count):
            value = int(12000 * math.sin(2 * math.pi * 440 * index / sample_rate))
            wav_file.writeframesraw(value.to_bytes(2, byteorder="little", signed=True))

    return buffer.getvalue()


def test_normalize_audio_for_stt_outputs_mono_16khz_wav() -> None:
    normalized = normalize_audio_for_stt(make_test_wav())

    assert normalized.filename == "recording.wav"
    assert normalized.content_type == "audio/wav"
    assert normalized.audio_bytes.startswith(b"RIFF")
    assert normalized.signal.duration_seconds > 0
    assert normalized.signal.peak_dbfs > -45

    with wave.open(BytesIO(normalized.audio_bytes), "rb") as wav_file:
        assert wav_file.getnchannels() == 1
        assert wav_file.getframerate() == 16000
        assert wav_file.getsampwidth() == 2
        assert wav_file.getnframes() > 0


def test_normalize_audio_for_stt_rejects_silent_audio() -> None:
    sample_rate = 8000
    buffer = BytesIO()

    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(b"\x00\x00" * sample_rate)

    with pytest.raises(AudioNoSpeechError):
        normalize_audio_for_stt(buffer.getvalue())


def tone_wav(seconds: float, rate: int = 16000) -> bytes:
    buffer = BytesIO()
    samples = b"".join(int(12000 * math.sin(2 * math.pi * 440 * i / rate)).to_bytes(2, "little", signed=True)
                       for i in range(round(rate * seconds)))
    with wave.open(buffer, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(samples)
    return buffer.getvalue()


@pytest.mark.parametrize("seconds", [0.25, 1.0, 60.0])
def test_decoded_duration_matches_actual_samples(seconds) -> None:
    result = normalize_audio_for_stt(tone_wav(seconds))
    assert result.signal.duration_seconds == pytest.approx(seconds, abs=1 / 16000)


@pytest.mark.parametrize("seconds", [0.01, 0.05, 0.249])
def test_short_audio_is_rejected_using_actual_samples(seconds) -> None:
    with pytest.raises(AudioNoSpeechError):
        normalize_audio_for_stt(tone_wav(seconds))


@pytest.mark.parametrize("seconds", [60.01, 65])
def test_overlong_audio_is_rejected_instead_of_silently_truncated(seconds) -> None:
    from app.services.audio_normalization import AudioNormalizationError
    with pytest.raises(AudioNormalizationError):
        normalize_audio_for_stt(tone_wav(seconds))


def test_unknown_wav_header_does_not_inflate_duration() -> None:
    from app.services.audio_normalization import analyze_wav_signal
    audio = bytearray(tone_wav(1))
    audio[4:8] = b"\xff" * 4
    data_offset = audio.index(b"data") + 4
    audio[data_offset:data_offset + 4] = b"\xff" * 4
    assert analyze_wav_signal(bytes(audio)).duration_seconds == 1


@pytest.mark.parametrize("audio", [b"", b"not audio", b"RIFF\xff\xff\xff\xffWAVE", b"#EXTM3U\nhttps://example.com/audio.wav"])
def test_malformed_audio_fails_safely(audio) -> None:
    from app.services.audio_normalization import AudioNormalizationError
    with pytest.raises(AudioNormalizationError):
        normalize_audio_for_stt(audio)


def test_incomplete_pcm_frame_is_rejected() -> None:
    from app.services.audio_normalization import analyze_wav_signal, AudioNormalizationError
    with pytest.raises(AudioNormalizationError):
        analyze_wav_signal(tone_wav(1)[:-1])


def test_unknown_length_wav_normalizes_to_a_canonical_header() -> None:
    audio = bytearray(tone_wav(1))
    audio[4:8] = b"\xff" * 4
    offset = audio.index(b"data") + 4
    audio[offset:offset + 4] = b"\xff" * 4
    result = normalize_audio_for_stt(bytes(audio))
    assert result.signal.duration_seconds == 1
    with wave.open(BytesIO(result.audio_bytes)) as wav:
        assert wav.getnframes() == 16000


@pytest.mark.parametrize(("container", "codec"), [("webm", "libopus"), ("mp3", "libmp3lame")])
def test_browser_audio_formats_still_normalize(container, codec) -> None:
    import imageio_ffmpeg
    import subprocess
    encoded = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-v", "error", "-i", "pipe:0",
                              "-c:a", codec, "-f", container, "pipe:1"], input=tone_wav(1),
                             capture_output=True, timeout=10, check=True).stdout
    result = normalize_audio_for_stt(encoded)
    assert result.signal.duration_seconds == pytest.approx(1, abs=0.15)


def test_ffmpeg_timeout_is_safe(monkeypatch) -> None:
    from app.services import audio_normalization as module
    def timeout(*args, **kwargs):
        assert kwargs["timeout"] == module.NORMALIZED_AUDIO_TIMEOUT_SECONDS
        raise module.subprocess.TimeoutExpired("ffmpeg", 20, stderr=b"private decoder detail")
    monkeypatch.setattr(module.subprocess, "run", timeout)
    with pytest.raises(module.AudioNormalizationError, match="^Audio normalization failed.$"):
        normalize_audio_for_stt(tone_wav(1))
