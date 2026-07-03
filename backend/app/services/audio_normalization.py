from dataclasses import dataclass
import subprocess

import imageio_ffmpeg


NORMALIZED_AUDIO_CONTENT_TYPE = "audio/wav"
NORMALIZED_AUDIO_FILENAME = "recording.wav"
NORMALIZED_AUDIO_MAX_SECONDS = 60
NORMALIZED_AUDIO_TIMEOUT_SECONDS = 20


class AudioNormalizationError(Exception):
    """Raised when uploaded audio cannot be normalized for STT."""


@dataclass(frozen=True)
class NormalizedAudio:
    audio_bytes: bytes
    filename: str
    content_type: str


def normalize_audio_for_stt(audio_bytes: bytes) -> NormalizedAudio:
    """Convert browser-recorded audio to mono 16 kHz WAV without writing it to disk."""
    command = [
        imageio_ffmpeg.get_ffmpeg_exe(),
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        "pipe:0",
        "-t",
        str(NORMALIZED_AUDIO_MAX_SECONDS),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-sample_fmt",
        "s16",
        "-f",
        "wav",
        "pipe:1",
    ]

    try:
        completed = subprocess.run(
            command,
            input=audio_bytes,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=NORMALIZED_AUDIO_TIMEOUT_SECONDS,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise AudioNormalizationError("Audio normalization failed.") from exc

    if completed.returncode != 0 or not completed.stdout:
        raise AudioNormalizationError("Audio normalization failed.")

    return NormalizedAudio(
        audio_bytes=completed.stdout,
        filename=NORMALIZED_AUDIO_FILENAME,
        content_type=NORMALIZED_AUDIO_CONTENT_TYPE,
    )
