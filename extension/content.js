(() => {
  const INSERT_FAKE_TEXT_MESSAGE = "VOICE_DICTATION_INSERT_FAKE_TEXT";
  const TRANSCRIBE_AUDIO_MESSAGE = "VOICE_DICTATION_TRANSCRIBE_AUDIO";
  const FALLBACK_TRANSCRIPT = "This is fake dictation text.";
  const SUPPORTED_INPUT_TYPES = new Set(["", "text", "search", "email", "url", "tel"]);
  const IGNORED_INPUT_TYPES = new Set(["password", "file", "checkbox", "radio", "hidden"]);
  const PAYMENT_FIELD_PATTERN = /\b(cc-|cc_|card|credit|cvc|cvv|expiry|expiration|iban|payment)\b/i;
  const BUTTON_EDGE_OFFSET = 8;
  const MAX_RECORDING_MS = 5000;
  const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024;
  const TRANSCRIPTION_RESPONSE_TIMEOUT_MS = 55000;

  let activeField = null;
  let activeTextRange = null;
  let micButton = null;
  let statusBubble = null;
  let mediaRecorder = null;
  let recordingStream = null;
  let recordingTimeoutId = null;
  let recordingChunks = [];

  function getEditableField(target) {
    if (!(target instanceof Element)) {
      return null;
    }

    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return target;
    }

    return target.closest('[contenteditable="true"], [role="textbox"]');
  }

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

  function hasPaymentSignal(element) {
    const values = [
      element.getAttribute("autocomplete"),
      element.getAttribute("name"),
      element.getAttribute("id"),
      element.getAttribute("aria-label"),
      element.getAttribute("placeholder"),
      element.getAttribute("inputmode"),
    ];

    return values.some((value) => value && PAYMENT_FIELD_PATTERN.test(value));
  }

  function isHidden(element) {
    if (element.hidden) {
      return true;
    }

    if (element instanceof HTMLInputElement && element.type.toLowerCase() === "hidden") {
      return true;
    }

    const style = window.getComputedStyle(element);
    return style.display === "none" || style.visibility === "hidden";
  }

  function isSupportedField(element) {
    if (!element || isHidden(element) || hasPaymentSignal(element)) {
      return false;
    }

    if (element instanceof HTMLTextAreaElement) {
      return !element.disabled && !element.readOnly;
    }

    if (element instanceof HTMLInputElement) {
      const inputType = element.type.toLowerCase();

      return (
        SUPPORTED_INPUT_TYPES.has(inputType) &&
        !IGNORED_INPUT_TYPES.has(inputType) &&
        !element.disabled &&
        !element.readOnly
      );
    }

    if (element.matches('[contenteditable="true"], [role="textbox"]')) {
      return (
        element.isContentEditable &&
        element.getAttribute("aria-disabled") !== "true" &&
        element.getAttribute("aria-readonly") !== "true"
      );
    }

    return false;
  }

  function createMicButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "voice-dictation-mic-button";
    button.textContent = "Mic";
    button.title = "Record a short test clip";
    button.setAttribute("aria-label", "Record a short test clip");
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

    button.classList.toggle("voice-dictation-mic-button--recording", state === "recording");
    button.classList.toggle("voice-dictation-mic-button--success", state === "success");
    button.classList.toggle("voice-dictation-mic-button--error", state === "error");
    button.disabled = state === "requesting" || state === "transcribing";

    if (state === "requesting") {
      button.textContent = "...";
      button.title = "Requesting microphone access";
      button.setAttribute("aria-label", "Requesting microphone access");
      setStatusMessage(message || "Requesting microphone access");
      return;
    }

    if (state === "transcribing") {
      button.textContent = "...";
      button.title = "Sending recording to local backend";
      button.setAttribute("aria-label", "Sending recording to local backend");
      setStatusMessage(message || "Transcribing");
      return;
    }

    if (state === "recording") {
      button.textContent = "Stop";
      button.title = "Stop recording";
      button.setAttribute("aria-label", "Stop recording");
      setStatusMessage(message || "Recording");
      return;
    }

    button.textContent = "Mic";
    button.title = "Record a short test clip";
    button.setAttribute("aria-label", "Record a short test clip");

    if (message) {
      setStatusMessage(message);
    } else if (statusBubble) {
      statusBubble.hidden = true;
    }
  }

  function flashMicButtonState(state, message) {
    setMicButtonState(state, message);
    window.setTimeout(() => {
      setMicButtonState("idle");
    }, 1400);
  }

  function updateMicButton() {
    const field = isSupportedField(activeField) ? activeField : getCurrentEditableField();

    if (!isSupportedField(field)) {
      hideMicButton();
      return;
    }

    activeField = field;

    const rect = field.getBoundingClientRect();
    const button = getMicButton();
    const buttonSize = button.offsetWidth || 38;
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

    const field = getEditableFieldFromEvent(event);

    if (isSupportedField(field)) {
      activeField = field;
      rememberTextRange();
      updateMicButton();
    } else {
      hideMicButton();
    }
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

  function dispatchInputEvents(element) {
    element.dispatchEvent(new InputEvent("input", {
      bubbles: true,
      composed: true,
      inputType: "insertText",
    }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function setNativeFieldValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor?.set) {
      descriptor.set.call(element, value);
      return;
    }

    element.value = value;
  }

  function insertIntoFormField(element, text) {
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? element.value.length;
    const before = element.value.slice(0, start);
    const after = element.value.slice(end);
    const separator = before && !/\s$/.test(before) ? " " : "";
    const nextText = `${separator}${text}`;
    const nextPosition = start + nextText.length;

    element.dispatchEvent(new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      composed: true,
      data: nextText,
      inputType: "insertText",
    }));
    setNativeFieldValue(element, `${before}${nextText}${after}`);
    element.setSelectionRange(nextPosition, nextPosition);
    dispatchInputEvents(element);
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
        dispatchInputEvents(element);
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
    dispatchInputEvents(element);
  }

  function insertFakeText(text = FALLBACK_TRANSCRIPT) {
    const field = isSupportedField(activeField) ? activeField : getCurrentEditableField();

    if (!isSupportedField(field)) {
      return {
        ok: false,
        message: "Focus a supported text field first.",
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
      message: "Inserted fake dictation text.",
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

  function pickSupportedMimeType() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

    return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  async function startRecording() {
    const field = isSupportedField(activeField) ? activeField : getCurrentEditableField();

    if (!isSupportedField(field)) {
      flashMicButtonState("error", "Focus a supported field");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      flashMicButtonState("error", "Recording is not available here");
      return;
    }

    activeField = field;
    field.focus();
    setMicButtonState("requesting", "Requesting microphone access");

    try {
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
      }, MAX_RECORDING_MS);
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

      if (!result?.ok || typeof result.transcript !== "string") {
        flashMicButtonState("error", result?.message || "Transcription failed");
        updateMicButton();
        return;
      }

      insertFakeText(result.transcript);
      flashMicButtonState("success", "Transcript inserted");
      updateMicButton();
    } catch (_error) {
      clearRecordingResources();
      flashMicButtonState("error", "Transcription failed");
      updateMicButton();
    }
  }

  document.addEventListener("focusin", rememberActiveField, true);
  document.addEventListener("keyup", rememberActiveField, true);
  document.addEventListener("mouseup", rememberActiveField, true);
  document.addEventListener("selectionchange", rememberTextRange);
  window.addEventListener("scroll", updateMicButton, true);
  window.addEventListener("resize", updateMicButton);

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== INSERT_FAKE_TEXT_MESSAGE) {
      return false;
    }

    sendResponse(insertFakeText(message.text));
    return false;
  });
})();
