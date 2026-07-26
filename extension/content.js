(() => {
  const TRANSCRIBE_AUDIO_MESSAGE = "VOICE_DICTATION_TRANSCRIBE_AUDIO";
  const CANCEL_TRANSCRIPTION_MESSAGE = "VOICE_DICTATION_CANCEL_TRANSCRIPTION";
  const DEFAULT_EXTENSION_ENABLED = true;
  const BUTTON_EDGE_OFFSET = 8;
  const DEFAULT_RECORDING_DURATION_MS = 10000;
  const MIN_RECORDING_DURATION_MS = 1000;
  const MAX_RECORDING_DURATION_MS = 30000;
  const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024;
  const TRANSCRIPTION_RESPONSE_TIMEOUT_MS = 55000;
  const MIC_BUTTON_ICONS = Object.freeze({
    busy: `
      <svg class="voice-dictation-mic-icon voice-dictation-mic-icon--spin" aria-hidden="true" viewBox="0 0 24 24">
        <path d="M21 12a9 9 0 1 1-6.2-8.6"></path>
      </svg>
    `,
    check: `
      <svg class="voice-dictation-mic-icon" aria-hidden="true" viewBox="0 0 24 24">
        <path d="M20 6 9 17l-5-5"></path>
      </svg>
    `,
    close: `
      <svg class="voice-dictation-mic-icon" aria-hidden="true" viewBox="0 0 24 24">
        <path d="M18 6 6 18"></path>
        <path d="m6 6 12 12"></path>
      </svg>
    `,
    mic: `
      <svg class="voice-dictation-mic-icon" aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
        <path d="M19 10v1a7 7 0 0 1-14 0v-1"></path>
        <path d="M12 18v4"></path>
        <path d="M8 22h8"></path>
      </svg>
    `,
    retry: `
      <svg class="voice-dictation-mic-icon" aria-hidden="true" viewBox="0 0 24 24">
        <path d="M20 7v5h-5"></path>
        <path d="M4 17v-5h5"></path>
        <path d="M6.1 9a7 7 0 0 1 11.7-2.6L20 12"></path>
        <path d="m4 12 2.2 5.6A7 7 0 0 0 18 15"></path>
      </svg>
    `,
    stop: `
      <svg class="voice-dictation-mic-icon voice-dictation-mic-icon--filled" aria-hidden="true" viewBox="0 0 24 24">
        <rect x="6" y="6" width="12" height="12" rx="2"></rect>
      </svg>
    `,
  });
  const MIC_BUTTON_STATES = Object.freeze({
    error: {
      icon: "retry",
      label: "Record again",
      status: "Dictation needs attention",
    },
    idle: {
      icon: "mic",
      label: "Start dictation",
      status: "",
    },
    recording: {
      icon: "stop",
      label: "Stop dictation",
      status: "Recording",
    },
    requesting: {
      icon: "busy",
      label: "Requesting microphone access",
      status: "Requesting microphone access",
    },
    success: {
      icon: "check",
      label: "Transcript inserted",
      status: "Transcript inserted",
    },
    transcribing: {
      icon: "close",
      label: "Cancel transcription",
      status: "Transcribing",
    },
  });
  const {
    dispatchInputEvents,
    getEditableField,
    insertIntoFormField,
    isSupportedField,
  } = globalThis.DictozyDom;
  const {
    addRequestReference,
    createMicrophoneSignalMonitor,
    createRequestId,
    createRequestLifecycle,
  } = globalThis.DictozyLifecycle;

  let activeField = null;
  let activeTextRange = null;
  let micButton = null;
  let statusBubble = null;
  let statusMessageElement = null;
  let statusDismissButton = null;
  let mediaRecorder = null;
  let recordingStream = null;
  let recordingSignalMonitor = null;
  let recordingTimeoutId = null;
  let recordingAttempt = 0;
  let recordingTargetField = null;
  let transientStateTimeoutId = null;
  let recordingChunks = [];
  let extensionEnabled = DEFAULT_EXTENSION_ENABLED;
  let recordingCanceled = false;
  let currentMicButtonState = "idle";
  let transcriptionTargetField = null;
  const requestLifecycle = createRequestLifecycle();

  function getEditableFieldFromEvent(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];

    for (const target of path) {
      const field = getEditableField(target);

      if (field) {
        return field;
      }
    }

    return getEditableField(event.target);
  }

  function getCurrentEditableField() {
    const focused = document.activeElement;

    if (focused?.shadowRoot?.activeElement) {
      return getEditableField(focused.shadowRoot.activeElement);
    }

    return getEditableField(focused);
  }

  function createMicButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "voice-dictation-mic-button";
    setMicButtonVisual(button, "idle");
    button.hidden = true;

    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });

    button.addEventListener("click", async () => {
      if (mediaRecorder?.state === "recording") {
        stopRecording();
        return;
      }

      if (currentMicButtonState === "transcribing") {
        cancelTranscription();
        return;
      }

      await startRecording();
    });

    document.documentElement.append(button);
    return button;
  }

  function setMicButtonVisual(button, state) {
    const visual = MIC_BUTTON_STATES[state] || MIC_BUTTON_STATES.idle;

    button.dataset.state = state;
    button.innerHTML = MIC_BUTTON_ICONS[visual.icon] || MIC_BUTTON_ICONS.mic;
    button.title = visual.label;
    button.setAttribute("aria-label", visual.label);
  }

  function createStatusBubble() {
    const bubble = document.createElement("div");
    bubble.className = "voice-dictation-status";
    bubble.setAttribute("role", "status");
    bubble.setAttribute("aria-live", "polite");
    bubble.hidden = true;

    statusMessageElement = document.createElement("span");
    statusMessageElement.className = "voice-dictation-status__message";

    statusDismissButton = document.createElement("button");
    statusDismissButton.type = "button";
    statusDismissButton.className = "voice-dictation-status__dismiss";
    statusDismissButton.innerHTML = MIC_BUTTON_ICONS.close;
    statusDismissButton.title = "Dismiss message";
    statusDismissButton.setAttribute("aria-label", "Dismiss dictation message");
    statusDismissButton.hidden = true;
    statusDismissButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    statusDismissButton.addEventListener("click", dismissErrorState);

    bubble.append(statusMessageElement, statusDismissButton);
    document.documentElement.append(bubble);
    return bubble;
  }

  function getMicButton() {
    if (!micButton || !document.documentElement.contains(micButton)) {
      micButton = createMicButton();
    }

    return micButton;
  }

  function getStatusBubble() {
    if (!statusBubble || !document.documentElement.contains(statusBubble)) {
      statusBubble = createStatusBubble();
    }

    return statusBubble;
  }

  function hideMicButton() {
    if (micButton) {
      micButton.hidden = true;
    }

    if (statusBubble) {
      statusBubble.hidden = true;
    }
  }

  function setStatusMessage(message, { dismissible = false } = {}) {
    const bubble = getStatusBubble();
    statusMessageElement.textContent = message;
    statusDismissButton.hidden = !dismissible;
    bubble.hidden = false;

    if (micButton && !micButton.hidden) {
      const buttonRect = micButton.getBoundingClientRect();
      bubble.style.top = `${Math.round(buttonRect.bottom + 6)}px`;
      bubble.style.left = `${Math.round(buttonRect.left)}px`;
    }
  }

  function clearTransientStateTimeout() {
    if (transientStateTimeoutId) {
      window.clearTimeout(transientStateTimeoutId);
      transientStateTimeoutId = null;
    }
  }

  function setMicButtonState(state, message = "", { dismissible = false } = {}) {
    const button = getMicButton();
    const visual = MIC_BUTTON_STATES[state] || MIC_BUTTON_STATES.idle;

    currentMicButtonState = state;
    button.classList.toggle("voice-dictation-mic-button--recording", state === "recording");
    button.classList.toggle("voice-dictation-mic-button--busy", state === "requesting");
    button.classList.toggle("voice-dictation-mic-button--transcribing", state === "transcribing");
    button.classList.toggle("voice-dictation-mic-button--success", state === "success");
    button.classList.toggle("voice-dictation-mic-button--error", state === "error");
    button.disabled = state === "requesting" || !extensionEnabled;
    setMicButtonVisual(button, state);

    if (message || visual.status) {
      setStatusMessage(message || visual.status, { dismissible });
      return;
    }

    if (statusBubble) {
      statusBubble.hidden = true;
    }
  }

  function flashMicButtonState(state, message) {
    clearTransientStateTimeout();
    setMicButtonState(state, message);
    transientStateTimeoutId = window.setTimeout(() => {
      transientStateTimeoutId = null;
      setMicButtonState("idle");
      updateMicButton();
    }, 1400);
  }

  function showErrorState(message, requestId = "") {
    clearTransientStateTimeout();
    setMicButtonState("error", addRequestReference(message, requestId), { dismissible: true });
    updateMicButton();
  }

  function dismissErrorState() {
    if (currentMicButtonState !== "error") {
      return;
    }

    setMicButtonState("idle");
    updateMicButton();
  }

  function clearActiveField() {
    activeField = null;
    activeTextRange = null;
  }

  function getUsableField(field) {
    return isSupportedField(field) ? field : null;
  }

  function getFocusedSupportedField() {
    return getUsableField(getCurrentEditableField());
  }

  function updateMicButton() {
    if (!extensionEnabled) {
      hideMicButton();
      return;
    }

    const field = getUsableField(activeField) || getFocusedSupportedField();

    if (!field) {
      clearActiveField();
      hideMicButton();
      return;
    }

    activeField = field;

    const rect = field.getBoundingClientRect();
    const button = getMicButton();
    const buttonSize = button.offsetWidth || 42;
    const top = Math.max(
      BUTTON_EDGE_OFFSET,
      Math.min(window.innerHeight - buttonSize - BUTTON_EDGE_OFFSET, rect.top + rect.height / 2 - buttonSize / 2),
    );
    const preferredLeft = rect.right + BUTTON_EDGE_OFFSET;
    const fallbackLeft = rect.left - buttonSize - BUTTON_EDGE_OFFSET;
    const left = preferredLeft + buttonSize + BUTTON_EDGE_OFFSET <= window.innerWidth
      ? preferredLeft
      : Math.max(BUTTON_EDGE_OFFSET, fallbackLeft);

    button.style.top = `${Math.round(top)}px`;
    button.style.left = `${Math.round(left)}px`;
    button.hidden = false;

    if (statusBubble && !statusBubble.hidden) {
      statusBubble.style.top = `${Math.round(top + buttonSize + 6)}px`;
      statusBubble.style.left = `${Math.round(left)}px`;
    }
  }

  function rememberActiveField(event) {
    if (micButton?.contains(event.target) || statusBubble?.contains(event.target)) {
      return;
    }

    if (!extensionEnabled) {
      clearActiveField();
      hideMicButton();
      return;
    }

    const field = getEditableFieldFromEvent(event);

    if (getUsableField(field)) {
      if (field !== activeField && currentMicButtonState === "error") {
        setMicButtonState("idle");
      }

      activeField = field;
      rememberTextRange();
      updateMicButton();
    } else {
      clearActiveField();
      hideMicButton();
    }
  }

  function forgetActiveFieldAfterBlur(event) {
    if (micButton?.contains(event.relatedTarget) || statusBubble?.contains(event.relatedTarget)) {
      return;
    }

    window.setTimeout(() => {
      if (!getFocusedSupportedField()) {
        clearActiveField();
        hideMicButton();
      }
    }, 0);
  }

  function rememberTextRange() {
    if (!activeField || activeField instanceof HTMLInputElement || activeField instanceof HTMLTextAreaElement) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (activeField.contains(range.commonAncestorContainer)) {
      activeTextRange = range.cloneRange();
    }
  }

  function getRichTextInsertionRange(element) {
    if (activeTextRange && element.contains(activeTextRange.commonAncestorContainer)) {
      return activeTextRange.cloneRange();
    }

    const selection = window.getSelection();

    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);

      if (element.contains(range.commonAncestorContainer)) {
        return range.cloneRange();
      }
    }

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    return range;
  }

  function insertIntoRichTextField(element, text) {
    element.focus();

    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    selection.removeAllRanges();
    selection.addRange(getRichTextInsertionRange(element));

    const range = selection.getRangeAt(0);
    const prefix = range.collapsed && range.startOffset > 0 ? " " : "";
    const insertedText = `${prefix}${text}`;
    const beforeInputEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      composed: true,
      data: insertedText,
      inputType: "insertText",
    });

    if (!element.dispatchEvent(beforeInputEvent)) {
      return;
    }

    if (document.queryCommandSupported?.("insertText")) {
      selection.removeAllRanges();
      selection.addRange(range);

      if (document.execCommand("insertText", false, insertedText)) {
        rememberTextRange();
        dispatchInputEvents(element, insertedText);
        return;
      }
    }

    const textNode = document.createTextNode(`${prefix}${text}`);

    range.deleteContents();
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);

    selection.removeAllRanges();
    selection.addRange(range);
    activeTextRange = range.cloneRange();
    dispatchInputEvents(element, insertedText);
  }

  function getTranscriptTargetField(expectedField) {
    const focusedField = getFocusedSupportedField();

    if (!expectedField || document.hasFocus?.() === false) {
      return null;
    }

    if (getUsableField(expectedField) && focusedField === expectedField) {
      return expectedField;
    }

    return null;
  }

  function insertTranscript(text, expectedField) {
    const field = getTranscriptTargetField(expectedField);

    if (!field) {
      return {
        ok: false,
        message: "Focus moved before insertion. Try again.",
      };
    }

    activeField = field;
    field.focus();

    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      insertIntoFormField(field, text);
    } else {
      insertIntoRichTextField(field, text);
    }

    return {
      ok: true,
      message: "Transcript inserted.",
    };
  }

  function clearRecordingResources() {
    if (recordingTimeoutId) {
      window.clearTimeout(recordingTimeoutId);
      recordingTimeoutId = null;
    }

    if (recordingStream) {
      recordingStream.getTracks().forEach((track) => track.stop());
      recordingStream = null;
    }

    if (recordingSignalMonitor) {
      void recordingSignalMonitor.stop();
      recordingSignalMonitor = null;
    }

    mediaRecorder = null;
    recordingChunks = [];
  }

  function cancelRecording() {
    recordingAttempt += 1;
    recordingCanceled = true;
    recordingTargetField = null;

    if (recordingTimeoutId) {
      window.clearTimeout(recordingTimeoutId);
      recordingTimeoutId = null;
    }

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      try {
        mediaRecorder.stop();
      } catch (_error) {
        clearRecordingResources();
      }
    } else {
      clearRecordingResources();
    }

    setMicButtonState("idle");
  }

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

  function cancelTranscription({ announce = true } = {}) {
    const operation = requestLifecycle.cancel();
    transcriptionTargetField = null;

    if (!operation) {
      return;
    }

    sendCancellationToBackground(operation.requestId);
    setMicButtonState("idle");

    if (announce && extensionEnabled) {
      flashMicButtonState("idle", "Transcription cancelled");
    }
  }

  function cancelActiveWork({ announce = false } = {}) {
    cancelRecording();
    cancelTranscription({ announce });
  }

  function pickSupportedMimeType() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  async function getRecordingDurationMs() {
    const settings = await chrome.storage.local.get({
      recordingDurationMs: DEFAULT_RECORDING_DURATION_MS,
    });
    const duration = Number(settings.recordingDurationMs);

    if (!Number.isFinite(duration)) {
      return DEFAULT_RECORDING_DURATION_MS;
    }

    return Math.min(MAX_RECORDING_DURATION_MS, Math.max(MIN_RECORDING_DURATION_MS, Math.round(duration)));
  }

  async function startRecording() {
    if (!extensionEnabled) {
      hideMicButton();
      return;
    }

    const field = getFocusedSupportedField();

    if (!field) {
      showErrorState("Focus a supported field.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      showErrorState("Recording is not available here.");
      return;
    }

    clearTransientStateTimeout();
    recordingAttempt += 1;
    const attempt = recordingAttempt;
    activeField = field;
    field.focus();
    recordingCanceled = false;
    recordingTargetField = field;
    transcriptionTargetField = null;
    setMicButtonState("idle");
    setMicButtonState("requesting", "Requesting microphone access");

    try {
      const recordingDurationMs = await getRecordingDurationMs();

      if (!extensionEnabled || attempt !== recordingAttempt) {
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (!extensionEnabled || attempt !== recordingAttempt) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      recordingStream = stream;
      recordingSignalMonitor = createMicrophoneSignalMonitor(recordingStream);
      const mimeType = pickSupportedMimeType();
      const options = {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 64000,
      };

      recordingChunks = [];
      mediaRecorder = new MediaRecorder(recordingStream, options);

      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          recordingChunks.push(event.data);
        }
      });

      mediaRecorder.addEventListener("stop", finishRecording, { once: true });
      mediaRecorder.start();
      setMicButtonState("recording", "Recording");

      recordingTimeoutId = window.setTimeout(() => {
        stopRecording();
      }, recordingDurationMs);
    } catch (_error) {
      clearRecordingResources();

      if (extensionEnabled && attempt === recordingAttempt) {
        recordingTargetField = null;
        showErrorState("Microphone access failed. Check Chrome microphone access and try again.");
      }
    }
  }

  function stopRecording() {
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      clearRecordingResources();
      setMicButtonState("idle");
      return;
    }

    mediaRecorder.stop();
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
          ok: false,
          message: "Could not read recorded audio.",
          requestId: operation.requestId,
        });
      };

      reader.onload = () => {
        try {
          if (typeof reader.result !== "string" || !reader.result.startsWith("data:audio/")) {
            settle({
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
              ok: false,
              message: "Transcription timed out. Try a shorter recording.",
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
                  ok: false,
                  message: "Could not reach the extension background service.",
                  requestId: operation.requestId,
                });
                return;
              }

              settle(response || {
                ok: false,
                message: "No transcription response received.",
                requestId: operation.requestId,
              });
            },
          );
          blobReference = null;
          audioDataUrl = "";
        } catch (_error) {
          settle({
            ok: false,
            message: "Could not send recorded audio.",
            requestId: operation.requestId,
          });
        }
      };

      operation.signal?.addEventListener("abort", handleAbort, { once: true });
      reader.readAsDataURL(blobReference);
    });
  }

  async function finishRecording() {
    let operation = null;
    let recordingBlob = null;

    try {
      if (recordingCanceled || !extensionEnabled) {
        clearRecordingResources();
        updateMicButton();
        return;
      }

      const signalResult = recordingSignalMonitor?.getResult() || "unknown";
      const mimeType = mediaRecorder?.mimeType || "audio/webm";
      const targetField = getTranscriptTargetField(recordingTargetField);
      recordingBlob = new Blob(recordingChunks, { type: mimeType });
      recordingTargetField = null;

      clearRecordingResources();

      if (recordingBlob.size === 0) {
        showErrorState("No audio was captured. Check your microphone and try again.");
        return;
      }

      if (signalResult === "silent") {
        recordingBlob = null;
        showErrorState("No microphone signal was detected. Check your input and try again.");
        return;
      }

      if (recordingBlob.size > MAX_AUDIO_UPLOAD_BYTES) {
        recordingBlob = null;
        showErrorState("Recording is too large. Try a shorter recording.");
        return;
      }

      if (!targetField) {
        recordingBlob = null;
        showErrorState("Focus moved before transcription. Record again in a supported field.");
        return;
      }

      transcriptionTargetField = targetField;
      operation = requestLifecycle.begin(createRequestId());
      setMicButtonState("transcribing", "Transcribing");

      const result = await sendAudioToBackend(recordingBlob, operation);
      recordingBlob = null;

      if (!requestLifecycle.isCurrent(operation)) {
        return;
      }

      requestLifecycle.complete(operation);
      const expectedField = transcriptionTargetField;
      transcriptionTargetField = null;

      if (!extensionEnabled) {
        updateMicButton();
        return;
      }

      if (result?.canceled) {
        flashMicButtonState("idle", "Transcription cancelled");
        return;
      }

      if (!result?.ok || typeof result.transcript !== "string") {
        showErrorState(result?.message || "Transcription failed.", result?.requestId || operation.requestId);
        return;
      }

      const insertion = insertTranscript(result.transcript, expectedField);
      if (!insertion.ok) {
        showErrorState(insertion.message, result.requestId || operation.requestId);
        return;
      }

      flashMicButtonState("success", "Transcript inserted");
      updateMicButton();
    } catch (_error) {
      clearRecordingResources();
      recordingBlob = null;

      if (operation && !requestLifecycle.isCurrent(operation)) {
        return;
      }

      if (operation) {
        requestLifecycle.complete(operation);
      }

      transcriptionTargetField = null;
      showErrorState("Transcription failed.", operation?.requestId || "");
    }
  }

  async function loadExtensionState() {
    try {
      const settings = await chrome.storage.local.get({
        extensionEnabled: DEFAULT_EXTENSION_ENABLED,
      });

      extensionEnabled = settings.extensionEnabled !== false;
    } catch (_error) {
      extensionEnabled = DEFAULT_EXTENSION_ENABLED;
    }

    if (!extensionEnabled) {
      clearActiveField();
      hideMicButton();
      return;
    }

    updateMicButton();
  }

  function handleStorageChanges(changes, areaName) {
    if (areaName !== "local" || !changes.extensionEnabled) {
      return;
    }

    extensionEnabled = changes.extensionEnabled.newValue !== false;

    if (!extensionEnabled) {
      clearTransientStateTimeout();
      cancelActiveWork();
      clearActiveField();
      hideMicButton();
      return;
    }

    setMicButtonState("idle");
    updateMicButton();
  }

  document.addEventListener("focusin", rememberActiveField, true);
  document.addEventListener("focusout", forgetActiveFieldAfterBlur, true);
  document.addEventListener("keyup", rememberActiveField, true);
  document.addEventListener("mouseup", rememberActiveField, true);
  document.addEventListener("selectionchange", rememberTextRange);
  window.addEventListener("scroll", updateMicButton, true);
  window.addEventListener("resize", updateMicButton);
  chrome.storage.onChanged.addListener(handleStorageChanges);

  loadExtensionState();
})();
