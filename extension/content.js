(() => {
  // Extension-specific capabilities stay in this isolated-world adapter. Page
  // code never selects the endpoint, settings or vocabulary used by background.
  const {
    DISABLED_ORIGINS_STORAGE_KEY, isOriginDisabled, isOfficialSite, normalizeOrigin,
  } = globalThis.DictozySitePreferences;
  if (isOfficialSite(window.location.href)) return;
  const TRANSCRIBE_AUDIO_MESSAGE = "VOICE_DICTATION_TRANSCRIBE_AUDIO";
  const CANCEL_TRANSCRIPTION_MESSAGE = "VOICE_DICTATION_CANCEL_TRANSCRIPTION";
  const TOGGLE_DICTATION_MESSAGE = "VOICE_DICTATION_TOGGLE";
  const GET_SITE_CONTEXT_MESSAGE = "VOICE_DICTATION_GET_SITE_CONTEXT";
  const TRANSCRIPTION_RESPONSE_TIMEOUT_MS = 55000;
  const currentOrigin = normalizeOrigin(window.location.origin);
  const isPracticePage = window.location.protocol === "chrome-extension:" &&
    window.location.host === chrome.runtime.id && window.location.pathname === "/practice.html";
  let extensionEnabled = true;
  let siteEnabled = false;

  function sendCancellationToBackground(requestId) {
    if (!requestId) {
      return;
    }

    chrome.runtime.sendMessage(
      {
        type: CANCEL_TRANSCRIPTION_MESSAGE,
        requestId,
      },
      () => {
        void chrome.runtime.lastError;
      },
    );
  }

  function sendAudioToBackend(recordingBlob, operation) {
    return new Promise((resolve) => {
      let audioDataUrl = "";
      let blobReference = recordingBlob;
      let reader = new FileReader();
      let settled = false;
      let timeoutId = null;

      function settle(result) {
        if (settled) {
          return;
        }

        settled = true;

        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }

        operation.signal?.removeEventListener("abort", handleAbort);
        blobReference = null;
        audioDataUrl = "";

        if (reader) {
          reader.onerror = null;
          reader.onload = null;
          reader.onabort = null;
          reader = null;
        }

        resolve(result);
      }

      function handleAbort() {
        if (reader?.readyState === 1) {
          reader.abort();
        }

        settle({
          ok: false,
          canceled: true,
          message: "Transcription cancelled.",
          requestId: operation.requestId,
        });
      }

      reader.onerror = () => {
        settle({
          errorCode: "invalid_audio",
          ok: false,
          message: "Could not read recorded audio.",
          requestId: operation.requestId,
        });
      };

      reader.onload = () => {
        try {
          if (typeof reader.result !== "string" || !reader.result.startsWith("data:audio/")) {
            settle({
              errorCode: "invalid_audio",
              ok: false,
              message: "Could not prepare recorded audio.",
              requestId: operation.requestId,
            });
            return;
          }

          audioDataUrl = reader.result;
          timeoutId = window.setTimeout(() => {
            sendCancellationToBackground(operation.requestId);
            settle({
              errorCode: "timeout",
              ok: false,
              message: "Transcription took too long. Check your connection and record again.",
              requestId: operation.requestId,
            });
          }, TRANSCRIPTION_RESPONSE_TIMEOUT_MS);

          chrome.runtime.sendMessage(
            {
              type: TRANSCRIBE_AUDIO_MESSAGE,
              audioDataUrl,
              requestId: operation.requestId,
            },
            (response) => {
              if (chrome.runtime.lastError) {
                settle({
                  errorCode: "extension_unavailable",
                  ok: false,
                  message: "Dictozy could not reach its background service. Reload the page and try again.",
                  requestId: operation.requestId,
                });
                return;
              }

              const validSuccess = response?.ok === true &&
                typeof response.transcript === "string" &&
                response.transcript.trim() !== "";
              const validFailure = response?.ok === false &&
                typeof response.message === "string" &&
                response.message.trim() !== "";

              settle(validSuccess || validFailure ? response : {
                errorCode: "invalid_response",
                ok: false,
                message: "Dictozy received an invalid transcription response. Please record again.",
                requestId: operation.requestId,
              });
            },
          );
          blobReference = null;
          audioDataUrl = "";
        } catch (_error) {
          settle({
            errorCode: "extension_unavailable",
            ok: false,
            message: "Dictozy could not reach its background service. Reload the page and try again.",
            requestId: operation.requestId,
          });
        }
      };

      operation.signal?.addEventListener("abort", handleAbort, { once: true });
      reader.readAsDataURL(blobReference);
    });
  }

  async function getState() {
    try {
      const settings = await chrome.storage.local.get({
        [DISABLED_ORIGINS_STORAGE_KEY]: [], extensionEnabled: true,
      });
      extensionEnabled = settings.extensionEnabled !== false;
      siteEnabled = isPracticePage || Boolean(currentOrigin) &&
        !isOriginDisabled(settings[DISABLED_ORIGINS_STORAGE_KEY], currentOrigin);
    } catch (_error) {
      extensionEnabled = true;
      siteEnabled = isPracticePage || Boolean(currentOrigin);
    }
    return { enabled: extensionEnabled && siteEnabled };
  }

  globalThis.DictozyController.mount({
    controlsHost: isPracticePage ? document.querySelector("#practiceControls") : null,
    getState,
    async getRecordingDurationMs() {
      const settings = await chrome.storage.local.get({ recordingDurationMs: 10000 });
      return settings.recordingDurationMs;
    },
    transcribe: sendAudioToBackend,
    cancelTranscription: sendCancellationToBackground,
    subscribeState(notify) {
      const listener = (changes, areaName) => {
        if (areaName !== "local" || (!changes.extensionEnabled && !changes[DISABLED_ORIGINS_STORAGE_KEY])) return;
        if (changes.extensionEnabled) extensionEnabled = changes.extensionEnabled.newValue !== false;
        if (changes[DISABLED_ORIGINS_STORAGE_KEY]) {
          siteEnabled = isPracticePage || Boolean(currentOrigin) &&
            !isOriginDisabled(changes[DISABLED_ORIGINS_STORAGE_KEY].newValue, currentOrigin);
        }
        notify({ enabled: extensionEnabled && siteEnabled });
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener?.(listener);
    },
    subscribeCommand(toggle) {
      const listener = (message, _sender, sendResponse) => {
        if (message?.type === GET_SITE_CONTEXT_MESSAGE) {
          sendResponse(currentOrigin ? { ok: true, origin: currentOrigin } : { ok: false });
          return false;
        }
        if (message?.type !== TOGGLE_DICTATION_MESSAGE) return false;
        toggle().then(sendResponse).catch(() => {
          sendResponse({ action: "ignored", ok: false, state: "error" });
        });
        return true;
      };
      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener?.(listener);
    },
  });
})();
