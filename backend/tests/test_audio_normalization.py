from io import BytesIO
import math
import wave

from app.services.audio_normalization import normalize_audio_for_stt


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

    with wave.open(BytesIO(normalized.audio_bytes), "rb") as wav_file:
        assert wav_file.getnchannels() == 1
        assert wav_file.getframerate() == 16000
        assert wav_file.getsampwidth() == 2
        assert wav_file.getnframes() > 0
