importScripts("config.js");
importScripts("dictation-lifecycle.js");
importScripts("background-utils.js");

const TRANSCRIBE_AUDIO_MESSAGE = "VOICE_DICTATION_TRANSCRIBE_AUDIO";
const CANCEL_TRANSCRIPTION_MESSAGE = "VOICE_DICTATION_CANCEL_TRANSCRIPTION";
const TOGGLE_DICTATION_COMMAND = "toggle-dictation";
const TOGGLE_DICTATION_MESSAGE = "VOICE_DICTATION_TOGGLE";
const TRANSCRIBE_TIMEOUT_MS = 45000;
const REQUEST_ID_HEADER = "X-Request-ID";
const OBSOLETE_BACKEND_URL_STORAGE_KEY = "backendUrl";
const ALLOWED_MESSAGE_TYPES = new Set([
  CANCEL_TRANSCRIPTION_MESSAGE,
  TRANSCRIBE_AUDIO_MESSAGE,
]);
const TRANSCRIBE_MESSAGE_KEYS = new Set(["audioDataUrl", "requestId", "type"]);
const CANCEL_MESSAGE_KEYS = new Set(["requestId", "type"]);
const SAFE_BAD_REQUEST_DETAILS = new Set([
  "Could not process recorded audio.",
  "No speech was detected. Please check your microphone and try again.",
  "No speech was detected. Please try again.",
  "Unsupported audio file type.",
  "Unsupported transcription language.",
  "Uploaded audio file is empty.",
]);
const {
  DEFAULT_TRANSCRIPTION_LANGUAGE,
  TRANSCRIPTION_ENDPOINT,
  normalizeTranscriptionLanguage,
} = globalThis.VoiceDictationConfig;
const { normalizeRequestId } = globalThis.DictozyLifecycle;
const { prepareAudioDataUrl } = globalThis.DictozyBackgroundUtils;
const activeTranscriptions = new Map();

function hasOnlyKeys(message, allowedKeys) {
  return Boolean(
    message
    && typeof message === "object"
    && !Array.isArray(message)
    && Object.keys(message).every((key) => allowedKeys.has(key)),
  );
}

function isTrustedSender(sender) {
  return !sender?.id || sender.id === chrome.runtime.id;
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

  if (status === 400 && SAFE_BAD_REQUEST_DETAILS.has(detail)) {
    return detail;
  }

  if (status === 400) {
    return "Recorded audio could not be processed.";
  }

  return "Dictation request failed. Please try again.";
}

function getStoredSettings() {
  return chrome.storage.local.get({
    transcriptionLanguage: DEFAULT_TRANSCRIPTION_LANGUAGE,
  });
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

  if (activeTranscriptions.has(requestId)) {
    return {
      ok: false,
      message: "This transcription request is already active.",
      requestId,
    };
  }

  const audio = prepareAudioDataUrl(message.audioDataUrl);

  if (!audio.ok) {
    return {
      ok: false,
      message: audio.reason === "too_large" ? "Recording is too large to upload." : "Could not prepare recorded audio.",
      requestId,
    };
  }

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
    const formData = new FormData();
    formData.append("language", normalizeTranscriptionLanguage(settings.transcriptionLanguage));
    formData.append("file", audio.blob, `recording.${audio.extension}`);
    const response = await fetch(TRANSCRIPTION_ENDPOINT, {
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

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.remove(OBSOLETE_BACKEND_URL_STORAGE_KEY);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isTrustedSender(sender) || !ALLOWED_MESSAGE_TYPES.has(message?.type)) {
    return false;
  }

  if (message?.type === CANCEL_TRANSCRIPTION_MESSAGE) {
    if (!hasOnlyKeys(message, CANCEL_MESSAGE_KEYS) || !normalizeRequestId(message.requestId)) {
      sendResponse({
        ok: false,
        canceled: false,
        message: "Invalid transcription request.",
      });
      return false;
    }

    sendResponse({
      ok: true,
      canceled: cancelTranscription(message.requestId),
    });
    return false;
  }

  if (!hasOnlyKeys(message, TRANSCRIBE_MESSAGE_KEYS)) {
    sendResponse({
      ok: false,
      message: "Invalid transcription request.",
      requestId: normalizeRequestId(message.requestId),
    });
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
