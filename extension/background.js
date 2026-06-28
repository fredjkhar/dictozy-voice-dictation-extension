importScripts("config.js");

const TRANSCRIBE_AUDIO_MESSAGE = "VOICE_DICTATION_TRANSCRIBE_AUDIO";
const TEST_BACKEND_MESSAGE = "VOICE_DICTATION_TEST_BACKEND";
const TRANSCRIBE_TIMEOUT_MS = 45000;
const HEALTH_CHECK_TIMEOUT_MS = 10000;
const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024;
const { DEFAULT_BACKEND_URL, getHealthUrl, normalizeBackendUrl } = globalThis.VoiceDictationConfig;

function parseAudioDataUrl(dataUrl) {
  const match = /^data:(audio\/[^;,]+)(?:;[^,]*)?;base64,(.+)$/i.exec(dataUrl);

  if (!match) {
    return null;
  }

  const [, mimeType, base64Audio] = match;
  const binary = atob(base64Audio);
  const audioBytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    audioBytes[index] = binary.charCodeAt(index);
  }

  return {
    blob: new Blob([audioBytes], { type: mimeType.toLowerCase() }),
    mimeType: mimeType.toLowerCase(),
  };
}

function getFriendlyBackendError(status, detail) {
  if (status === 503) {
    if (/temporarily unavailable/i.test(detail)) {
      return "Dictation is temporarily unavailable.";
    }

    return "Backend speech-to-text is not configured.";
  }

  if (status === 429) {
    return "Too many dictation requests. Try again in a moment.";
  }

  if (status === 502) {
    return "Speech-to-text failed. Please try again.";
  }

  if (status === 413) {
    return "Recording is too large.";
  }

  if (status === 400 && detail) {
    return detail;
  }

  return "Dictation request failed. Please try again.";
}

function getStoredSettings() {
  return chrome.storage.local.get({
    backendUrl: DEFAULT_BACKEND_URL,
  });
}

async function testBackend(backendUrl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(getHealthUrl(backendUrl), {
      method: "GET",
      signal: controller.signal,
    });

    if (!response.ok) {
      return { ok: false, message: `Backend health check failed (${response.status}).` };
    }

    const data = await response.json();

    if (data?.status !== "ok") {
      return { ok: false, message: "Backend returned an unexpected health response." };
    }

    return { ok: true, message: "Backend is reachable." };
  } catch (error) {
    return {
      ok: false,
      message: error?.name === "AbortError" ? "Backend health check timed out." : "Could not reach the backend.",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function transcribeAudio(message) {
  if (typeof message.audioDataUrl !== "string" || message.audioDataUrl.length === 0) {
    return {
      ok: false,
      message: "No audio was recorded.",
    };
  }

  const audio = parseAudioDataUrl(message.audioDataUrl);

  if (!audio || audio.blob.size === 0) {
    return {
      ok: false,
      message: "Could not prepare recorded audio.",
    };
  }

  if (audio.blob.size > MAX_AUDIO_UPLOAD_BYTES) {
    return {
      ok: false,
      message: "Recording is too large to upload.",
    };
  }

  const formData = new FormData();
  const extension = audio.mimeType.includes("mp4") ? "mp4" : "webm";
  formData.append("file", audio.blob, `recording.${extension}`);
  const settings = await getStoredSettings();
  const endpoint = normalizeBackendUrl(settings.backendUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, TRANSCRIBE_TIMEOUT_MS);

  let response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let detail = "";

    try {
      const errorData = await response.json();

      if (typeof errorData.detail === "string") {
        detail = errorData.detail;
      }
    } catch (_error) {
      // Keep the safe fallback message.
    }

    return {
      ok: false,
      message: getFriendlyBackendError(response.status, detail),
    };
  }

  const data = await response.json();

  if (typeof data.transcript !== "string" || data.transcript.trim() === "") {
    return {
      ok: false,
      message: "Backend response did not include a transcript.",
    };
  }

  return {
    ok: true,
    transcript: data.transcript,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === TEST_BACKEND_MESSAGE) {
    testBackend(message.backendUrl).then(sendResponse);
    return true;
  }

  if (message?.type !== TRANSCRIBE_AUDIO_MESSAGE) {
    return false;
  }

  transcribeAudio(message)
    .then(sendResponse)
    .catch((error) => {
      sendResponse({
        ok: false,
        message: error?.name === "AbortError" ? "Backend transcription timed out." : "Could not reach the backend.",
      });
    });

  return true;
});
