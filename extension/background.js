importScripts("config.js");
importScripts("dictation-lifecycle.js");

const TRANSCRIBE_AUDIO_MESSAGE = "VOICE_DICTATION_TRANSCRIBE_AUDIO";
const CANCEL_TRANSCRIPTION_MESSAGE = "VOICE_DICTATION_CANCEL_TRANSCRIPTION";
const TEST_BACKEND_MESSAGE = "VOICE_DICTATION_TEST_BACKEND";
const TOGGLE_DICTATION_COMMAND = "toggle-dictation";
const TOGGLE_DICTATION_MESSAGE = "VOICE_DICTATION_TOGGLE";
const TRANSCRIBE_TIMEOUT_MS = 45000;
const HEALTH_CHECK_TIMEOUT_MS = 10000;
const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024;
const REQUEST_ID_HEADER = "X-Request-ID";
const {
  DEFAULT_BACKEND_URL,
  DEFAULT_TRANSCRIPTION_LANGUAGE,
  getHealthUrl,
  normalizeBackendUrl,
  normalizeTranscriptionLanguage,
} = globalThis.VoiceDictationConfig;
const { normalizeRequestId } = globalThis.DictozyLifecycle;
const activeTranscriptions = new Map();

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
    transcriptionLanguage: DEFAULT_TRANSCRIPTION_LANGUAGE,
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
  const requestId = normalizeRequestId(message.requestId);

  if (!requestId) {
    return {
      ok: false,
      message: "Could not create a transcription request.",
    };
  }

  if (typeof message.audioDataUrl !== "string" || message.audioDataUrl.length === 0) {
    return {
      ok: false,
      message: "No audio was recorded.",
      requestId,
    };
  }

  const audio = parseAudioDataUrl(message.audioDataUrl);

  if (!audio || audio.blob.size === 0) {
    return {
      ok: false,
      message: "Could not prepare recorded audio.",
      requestId,
    };
  }

  if (audio.blob.size > MAX_AUDIO_UPLOAD_BYTES) {
    return {
      ok: false,
      message: "Recording is too large to upload.",
      requestId,
    };
  }

  if (activeTranscriptions.has(requestId)) {
    return {
      ok: false,
      message: "This transcription request is already active.",
      requestId,
    };
  }

  const extension = audio.mimeType.includes("mp4") ? "mp4" : "webm";
  const controller = new AbortController();
  const requestContext = {
    cancelReason: "",
    controller,
  };
  activeTranscriptions.set(requestId, requestContext);
  const timeoutId = setTimeout(() => {
    requestContext.cancelReason = "timeout";
    controller.abort();
  }, TRANSCRIBE_TIMEOUT_MS);

  try {
    const settings = await getStoredSettings();
    const endpoint = normalizeBackendUrl(settings.backendUrl);
    const formData = new FormData();
    formData.append("language", normalizeTranscriptionLanguage(settings.transcriptionLanguage));
    formData.append("file", audio.blob, `recording.${extension}`);
    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
      headers: {
        [REQUEST_ID_HEADER]: requestId,
      },
      signal: controller.signal,
    });
    const responseRequestId = normalizeRequestId(response.headers.get(REQUEST_ID_HEADER)) || requestId;

    if (requestContext.cancelReason === "user") {
      return {
        ok: false,
        canceled: true,
        message: "Transcription cancelled.",
        requestId: responseRequestId,
      };
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
        requestId: responseRequestId,
      };
    }

    const data = await response.json();

    if (typeof data.transcript !== "string" || data.transcript.trim() === "") {
      return {
        ok: false,
        message: "Backend response did not include a transcript.",
        requestId: responseRequestId,
      };
    }

    return {
      ok: true,
      requestId: responseRequestId,
      transcript: data.transcript,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      const canceled = requestContext.cancelReason === "user";
      return {
        ok: false,
        canceled,
        message: canceled ? "Transcription cancelled." : "Backend transcription timed out.",
        requestId,
      };
    }

    return {
      ok: false,
      message: "Could not reach the backend.",
      requestId,
    };
  } finally {
    clearTimeout(timeoutId);

    if (activeTranscriptions.get(requestId) === requestContext) {
      activeTranscriptions.delete(requestId);
    }
  }
}

function cancelTranscription(requestIdValue) {
  const requestId = normalizeRequestId(requestIdValue);
  const requestContext = requestId ? activeTranscriptions.get(requestId) : null;

  if (!requestContext) {
    return false;
  }

  requestContext.cancelReason = "user";
  requestContext.controller.abort();
  return true;
}

async function sendToggleToActiveTab() {
  try {
    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    const tabId = tabs[0]?.id;

    if (!Number.isInteger(tabId)) {
      return false;
    }

    await chrome.tabs.sendMessage(tabId, {
      type: TOGGLE_DICTATION_MESSAGE,
    });
    return true;
  } catch (_error) {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === TEST_BACKEND_MESSAGE) {
    testBackend(message.backendUrl).then(sendResponse);
    return true;
  }

  if (message?.type === CANCEL_TRANSCRIPTION_MESSAGE) {
    sendResponse({
      ok: true,
      canceled: cancelTranscription(message.requestId),
    });
    return false;
  }

  if (message?.type !== TRANSCRIBE_AUDIO_MESSAGE) {
    return false;
  }

  transcribeAudio(message)
    .then(sendResponse)
    .catch(() => {
      sendResponse({
        ok: false,
        message: "Could not reach the backend.",
        requestId: normalizeRequestId(message.requestId),
      });
    });

  return true;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === TOGGLE_DICTATION_COMMAND) {
    void sendToggleToActiveTab();
  }
});
