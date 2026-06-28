(() => {
  const TRANSCRIBE_AUDIO_MESSAGE = "VOICE_DICTATION_TRANSCRIBE_AUDIO";
  const DEFAULT_EXTENSION_ENABLED = true;
  const BUTTON_EDGE_OFFSET = 8;
  const DEFAULT_RECORDING_DURATION_MS = 10000;
  const MIN_RECORDING_DURATION_MS = 1000;
  const MAX_RECORDING_DURATION_MS = 30000;
  const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024;
  const TRANSCRIPTION_RESPONSE_TIMEOUT_MS = 55000;
  const MIC_BUTTON_ICONS = Object.freeze({
    alert: `
      <svg class="voice-dictation-mic-icon" aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 9v4"></path>
        <path d="M12 17h.01"></path>
        <path d="M10.3 4.9 2.8 18a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 4.9a2 2 0 0 0-3.4 0Z"></path>
      </svg>
    `,
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
    mic: `
      <svg class="voice-dictation-mic-icon" aria-hidden="true" viewBox="0 0 24 24">
        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
        <path d="M19 10v1a7 7 0 0 1-14 0v-1"></path>
        <path d="M12 18v4"></path>
        <path d="M8 22h8"></path>
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
      icon: "alert",
      label: "Dictation needs attention",
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
      icon: "busy",
      label: "Transcribing recording",
      status: "Transcribing",
    },
  });
  const {
    dispatchInputEvents,
    getEditableField,
    insertIntoFormField,
    isSupportedField,
  } = globalThis.FieldMicDom;

  let activeField = null;
  let activeTextRange = null;
  let micButton = null;
  let statusBubble = null;
  let mediaRecorder = null;
  let recordingStream = null;
  let recordingTimeoutId = null;
  let recordingChunks = [];
  let extensionEnabled = DEFAULT_EXTENSION_ENABLED;
  let recordingCanceled = false;

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

  function setStatusMessage(message) {
    const bubble = getStatusBubble();
    bubble.textContent = message;
    bubble.hidden = false;

    if (micButton && !micButton.hidden) {
      const buttonRect = micButton.getBoundingClientRect();
      bubble.style.top = `${Math.round(buttonRect.bottom + 6)}px`;
      bubble.style.left = `${Math.round(buttonRect.left)}px`;
    }
  }

  function setMicButtonState(state, message = "") {
    const button = getMicButton();
    const visual = MIC_BUTTON_STATES[state] || MIC_BUTTON_STATES.idle;

    button.classList.toggle("voice-dictation-mic-button--recording", state === "recording");
    button.classList.toggle("voice-dictation-mic-button--busy", state === "requesting" || state === "transcribing");
    button.classList.toggle("voice-dictation-mic-button--success", state === "success");
    button.classList.toggle("voice-dictation-mic-button--error", state === "error");
    button.disabled = state === "requesting" || state === "transcribing" || !extensionEnabled;
    setMicButtonVisual(button, state);

    if (message || visual.status) {
      setStatusMessage(message || visual.status);
      return;
    }

    if (statusBubble) {
      statusBubble.hidden = true;
    }
  }

  function flashMicButtonState(state, message) {
    setMicButtonState(state, message);
    window.setTimeout(() => {
      setMicButtonState("idle");
      updateMicButton();
    }, 1400);
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
    if (micButton?.contains(event.target)) {
      return;
    }

    if (!extensionEnabled) {
      clearActiveField();
      hideMicButton();
      return;
    }

    const field = getEditableFieldFromEvent(event);

    if (getUsableField(field)) {
      activeField = field;
      rememberTextRange();
      updateMicButton();
    } else {
      clearActiveField();
      hideMicButton();
    }
  }

  function forgetActiveFieldAfterBlur(event) {
    if (micButton?.contains(event.relatedTarget)) {
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

  function getTranscriptTargetField() {
    const focusedField = getFocusedSupportedField();

    if (focusedField) {
      return focusedField;
    }

    if (document.hasFocus?.() === false) {
      return null;
    }

    const focused = document.activeElement;
    if (activeField && getUsableField(activeField) && (focused === activeField || activeField.contains(focused))) {
      return activeField;
    }

    return null;
  }

  function insertTranscript(text) {
    const field = getTranscriptTargetField();

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

    mediaRecorder = null;
    recordingChunks = [];
  }

  function cancelRecording() {
    recordingCanceled = true;

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
      flashMicButtonState("error", "Focus a supported field");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      flashMicButtonState("error", "Recording is not available here");
      return;
    }

    activeField = field;
    field.focus();
    recordingCanceled = false;
    setMicButtonState("requesting", "Requesting microphone access");

    try {
      const recordingDurationMs = await getRecordingDurationMs();
      recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      flashMicButtonState("error", "Microphone access failed");
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

  function sendAudioToBackend(recordingBlob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
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

        resolve(result);
      }

      reader.addEventListener("error", () => {
        settle({
          ok: false,
          message: "Could not read recorded audio.",
        });
      });

      reader.addEventListener("load", () => {
        try {
          if (typeof reader.result !== "string" || !reader.result.startsWith("data:audio/")) {
            settle({
              ok: false,
              message: "Could not prepare recorded audio.",
            });
            return;
          }

          timeoutId = window.setTimeout(() => {
            settle({
              ok: false,
              message: "Transcription timed out. Try a shorter recording.",
            });
          }, TRANSCRIPTION_RESPONSE_TIMEOUT_MS);

          chrome.runtime.sendMessage(
            {
              type: TRANSCRIBE_AUDIO_MESSAGE,
              audioDataUrl: reader.result,
            },
            (response) => {
              if (chrome.runtime.lastError) {
                settle({
                  ok: false,
                  message: "Could not reach the extension background service.",
                });
                return;
              }

              settle(response || {
                ok: false,
                message: "No transcription response received.",
              });
            },
          );
        } catch (_error) {
          settle({
            ok: false,
            message: "Could not send recorded audio.",
          });
        }
      });

      reader.readAsDataURL(recordingBlob);
    });
  }

  async function finishRecording() {
    try {
      if (recordingCanceled || !extensionEnabled) {
        clearRecordingResources();
        updateMicButton();
        return;
      }

      const mimeType = mediaRecorder?.mimeType || "audio/webm";
      const recordingBlob = new Blob(recordingChunks, { type: mimeType });

      clearRecordingResources();

      if (recordingBlob.size === 0) {
        flashMicButtonState("error", "No audio captured");
        return;
      }

      if (recordingBlob.size > MAX_AUDIO_UPLOAD_BYTES) {
        flashMicButtonState("error", "Recording is too large");
        return;
      }

      setMicButtonState("transcribing", "Transcribing");

      const result = await sendAudioToBackend(recordingBlob);

      if (!extensionEnabled) {
        updateMicButton();
        return;
      }

      if (!result?.ok || typeof result.transcript !== "string") {
        flashMicButtonState("error", result?.message || "Transcription failed");
        updateMicButton();
        return;
      }

      const insertion = insertTranscript(result.transcript);
      if (!insertion.ok) {
        flashMicButtonState("error", insertion.message);
        updateMicButton();
        return;
      }

      flashMicButtonState("success", "Transcript inserted");
      updateMicButton();
    } catch (_error) {
      clearRecordingResources();
      flashMicButtonState("error", "Transcription failed");
      updateMicButton();
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
      cancelRecording();
      clearActiveField();
      hideMicButton();
      return;
    }

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
