from dataclasses import dataclass
import logging
import math
import subprocess
import wave
from io import BytesIO

import imageio_ffmpeg


NORMALIZED_AUDIO_CONTENT_TYPE = "audio/wav"
NORMALIZED_AUDIO_FILENAME = "recording.wav"
NORMALIZED_AUDIO_MAX_SECONDS = 60
NORMALIZED_AUDIO_TIMEOUT_SECONDS = 20
SPEECH_FILTER_CHAIN = "highpass=f=80,lowpass=f=7600,dynaudnorm=f=150:g=15:p=0.95"
MIN_AUDIO_DURATION_SECONDS = 0.25
MIN_AUDIO_PEAK_DBFS = -45.0
MIN_AUDIO_RMS_DBFS = -55.0

logger = logging.getLogger(__name__)


class AudioNormalizationError(Exception):
    """Raised when uploaded audio cannot be normalized for STT."""


class AudioNoSpeechError(AudioNormalizationError):
    """Raised when uploaded audio has no detectable speech signal."""


@dataclass(frozen=True)
class AudioSignal:
    duration_seconds: float
    rms_dbfs: float
    peak_dbfs: float


@dataclass(frozen=True)
class NormalizedAudio:
    audio_bytes: bytes
    filename: str
    content_type: str
    signal: AudioSignal


def amplitude_to_dbfs(value: float) -> float:
    if value <= 0:
        return -120.0

    return 20 * math.log10(min(1.0, value))


def analyze_wav_signal(audio_bytes: bytes) -> AudioSignal:
    try:
        with wave.open(BytesIO(audio_bytes), "rb") as wav_file:
            channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            frame_rate = wav_file.getframerate()
            frame_count = wav_file.getnframes()
            frames = wav_file.readframes(frame_count)
    except (EOFError, wave.Error) as exc:
        raise AudioNormalizationError("Audio normalization failed.") from exc

    if channels <= 0 or sample_width != 2 or frame_rate <= 0 or frame_count <= 0 or not frames:
        raise AudioNormalizationError("Audio normalization failed.")

    sample_count = len(frames) // sample_width
    if sample_count == 0:
        raise AudioNormalizationError("Audio normalization failed.")

    peak = 0
    square_sum = 0
    for index in range(0, len(frames) - 1, sample_width):
        sample = int.from_bytes(frames[index:index + sample_width], byteorder="little", signed=True)
        absolute_sample = abs(sample)
        peak = max(peak, absolute_sample)
        square_sum += sample * sample

    max_amplitude = float(2 ** ((8 * sample_width) - 1))
    rms = math.sqrt(square_sum / sample_count)
    duration_seconds = frame_count / float(frame_rate)

    return AudioSignal(
        duration_seconds=duration_seconds,
        rms_dbfs=amplitude_to_dbfs(rms / max_amplitude),
        peak_dbfs=amplitude_to_dbfs(peak / max_amplitude),
    )


def has_detectable_speech_signal(signal: AudioSignal) -> bool:
    if signal.duration_seconds < MIN_AUDIO_DURATION_SECONDS:
        return False

    return signal.peak_dbfs >= MIN_AUDIO_PEAK_DBFS or signal.rms_dbfs >= MIN_AUDIO_RMS_DBFS


def run_ffmpeg_wav_conversion(audio_bytes: bytes, *, audio_filter: str | None = None) -> bytes:
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
    ]

    if audio_filter:
        command.extend(["-af", audio_filter])

    command.extend(["-f", "wav", "pipe:1"])

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

    return completed.stdout


def normalize_audio_for_stt(audio_bytes: bytes) -> NormalizedAudio:
    """Convert browser-recorded audio to mono 16 kHz WAV without writing it to disk."""
    base_wav = run_ffmpeg_wav_conversion(audio_bytes)
    signal = analyze_wav_signal(base_wav)

    if not has_detectable_speech_signal(signal):
        logger.warning(
            "Uploaded audio had no detectable speech signal. duration=%.2f rms_dbfs=%.1f peak_dbfs=%.1f",
            signal.duration_seconds,
            signal.rms_dbfs,
            signal.peak_dbfs,
        )
        raise AudioNoSpeechError("Uploaded audio had no detectable speech signal.")

    enhanced_wav = run_ffmpeg_wav_conversion(base_wav, audio_filter=SPEECH_FILTER_CHAIN)

    return NormalizedAudio(
        audio_bytes=enhanced_wav,
        filename=NORMALIZED_AUDIO_FILENAME,
        content_type=NORMALIZED_AUDIO_CONTENT_TYPE,
        signal=signal,
    )
