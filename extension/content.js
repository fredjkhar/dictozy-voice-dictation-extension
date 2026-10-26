(() => {
  const TRANSCRIBE_AUDIO_MESSAGE = "VOICE_DICTATION_TRANSCRIBE_AUDIO";
  const CANCEL_TRANSCRIPTION_MESSAGE = "VOICE_DICTATION_CANCEL_TRANSCRIPTION";
  const TOGGLE_DICTATION_MESSAGE = "VOICE_DICTATION_TOGGLE";
  const GET_SITE_CONTEXT_MESSAGE = "VOICE_DICTATION_GET_SITE_CONTEXT";
  const DEFAULT_EXTENSION_ENABLED = true;
  const BUTTON_EDGE_OFFSET = 8;
  const DEFAULT_RECORDING_DURATION_MS = 10000;
  const MIN_RECORDING_DURATION_MS = 1000;
  const MAX_RECORDING_DURATION_MS = 30000;
  const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024;
  const TRANSCRIPTION_RESPONSE_TIMEOUT_MS = 55000;
  const RECOVERY_LIFETIME_MS = 60000;
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
    processing: {
      icon: "busy",
      label: "Preparing transcription",
      status: "Preparing transcription",
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
    captureFormFieldSelection,
    dispatchBeforeInputEvent,
    dispatchChangeEvent,
    dispatchInputEvents,
    executeNativeTextInsertion,
    getEditableField,
    insertIntoFormField,
    isSupportedField,
    prepareInsertionText,
  } = globalThis.DictozyDom;
  const {
    addRequestReference,
    createMicrophoneSignalMonitor,
    createRequestId,
    createRequestLifecycle,
    getMicrophoneAccessFailure,
  } = globalThis.DictozyLifecycle;
  const {
    DISABLED_ORIGINS_STORAGE_KEY,
    isOriginDisabled,
    normalizeOrigin,
  } = globalThis.DictozySitePreferences;

  let activeField = null;
  let activeTextRange = null;
  let micButton = null;
  let micButtonPlacement = null;
  let statusBubble = null;
  let statusMessageElement = null;
  let statusDismissButton = null;
  let statusIsStandalone = false;
  let recordingFeedback = null;
  let timingLabel = null;
  let activityLabel = null;
  let recordingStartedAt = 0;
  let recordingLimitMs = DEFAULT_RECORDING_DURATION_MS;
  let mediaRecorder = null;
  let recordingStream = null;
  let recordingSignalMonitor = null;
  let recordingSignalResult = null;
  let recordingTimeoutId = null;
  let recordingSafetyIntervalId = null;
  let removeTrackListeners = null;
  let removeRecordingFocusListener = null;
  let recordingAttempt = 0;
  let recordingTargetField = null;
  let recordingTargetSelection = null;
  let transientStateTimeoutId = null;
  let recordingChunks = [];
  let extensionEnabled = DEFAULT_EXTENSION_ENABLED;
  let siteEnabled = false;
  let settingsLoaded = false;
  let recordingCanceled = false;
  let currentMicButtonState = "idle";
  let transcriptionTargetField = null;
  let transcriptionTargetSelection = null;
  let recovery = null;
  let recoveryElement = null;
  let recoveryTimeoutId = null;
  let announcementElement = null;
  const requestLifecycle = createRequestLifecycle();
  const currentOrigin = normalizeOrigin(window.location.origin);
  const isPracticePage = window.location.protocol === "chrome-extension:" &&
    window.location.host === chrome.runtime.id && window.location.pathname === "/practice.html";

  function isDictationEnabled() {
    return settingsLoaded && extensionEnabled && siteEnabled;
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
    let focused = document.activeElement;

    if (micButton?.contains(focused) || statusBubble?.contains(focused)) {
      return getUsableField(activeField);
    }

    // Focus is retargeted at each shadow host. Follow the active chain just as
    // composedPath() does for field events, including nested open roots.
    while (focused?.shadowRoot?.activeElement) {
      focused = focused.shadowRoot.activeElement;
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

    button.addEventListener("click", (event) => {
      if (event.isTrusted) void handleDictationToggle();
    });

    (isPracticePage && document.querySelector("#practiceControls") || document.documentElement).append(button);
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
    bubble.setAttribute("role", "group");
    bubble.setAttribute("aria-label", "Dictation controls");
    bubble.hidden = true;

    statusMessageElement = document.createElement("span");
    statusMessageElement.className = "voice-dictation-status__message";
    statusMessageElement.setAttribute("role", "status");
    statusMessageElement.setAttribute("aria-live", "polite");
    statusMessageElement.setAttribute("aria-atomic", "true");

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

    recordingFeedback = document.createElement("div");
    recordingFeedback.className = "voice-dictation-feedback";
    recordingFeedback.hidden = true;
    timingLabel = document.createElement("span");
    timingLabel.className = "voice-dictation-timing";
    timingLabel.setAttribute("aria-live", "off");
    activityLabel = document.createElement("span");
    activityLabel.className = "voice-dictation-activity";
    activityLabel.setAttribute("aria-live", "off");
    for (const [label, action] of [["Stop recording", stopRecording], ["Discard recording", discardRecording]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "voice-dictation-feedback__button";
      button.textContent = label === "Stop recording" ? "Stop" : "Discard";
      button.setAttribute("aria-label", label);
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", (event) => {
        if (event.isTrusted && currentMicButtonState === "recording") action();
      });
      recordingFeedback.append(button);
    }
    recordingFeedback.prepend(timingLabel, activityLabel);
    bubble.append(statusMessageElement, statusDismissButton, recordingFeedback);
    (isPracticePage && document.querySelector("#practiceControls") || document.documentElement).append(bubble);
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

  function hideMicButton({ forceStatus = false } = {}) {
    if (recordingTargetField) cancelRecording();
    if (micButton) {
      micButton.hidden = true;
    }

    if (statusBubble && (forceStatus || !statusIsStandalone)) {
      statusBubble.hidden = true;
    }
  }

  function positionStatusBubble() {
    if (!statusBubble || statusBubble.hidden || !micButton) return;
    const rect = micButton.getBoundingClientRect();
    const { width, height } = statusBubble.getBoundingClientRect();
    const top = rect.bottom + height + 6 <= window.innerHeight - BUTTON_EDGE_OFFSET
      ? rect.bottom + 6 : Math.max(BUTTON_EDGE_OFFSET, rect.top - height - 6);
    const clamp = ([left, top]) => ({
      left: Math.floor(Math.max(BUTTON_EDGE_OFFSET, Math.min(left, window.innerWidth - width - BUTTON_EDGE_OFFSET))),
      top: Math.floor(Math.max(BUTTON_EDGE_OFFSET, Math.min(top, window.innerHeight - height - BUTTON_EDGE_OFFSET))),
    });
    let position = clamp([rect.left, top]);
    if (currentMicButtonState === "recording" && recordingTargetField) {
      const editor = recordingTargetField.getBoundingClientRect();
      const clears = (point, bounds) => point.left + width + 6 <= bounds.left ||
        point.left >= bounds.right + 6 || point.top + height + 6 <= bounds.top ||
        point.top >= bounds.bottom + 6;
      // Check the final, viewport-clamped rectangles. At high zoom, anchoring
      // only to the mic can put the entire panel over the retained editor.
      const candidates = [
        [parseFloat(statusBubble.style.left), parseFloat(statusBubble.style.top)],
        [rect.left, top], [rect.right + 6, rect.top], [rect.left - width - 6, rect.top],
        ...[editor.left, editor.right - width, BUTTON_EDGE_OFFSET,
          window.innerWidth - width - BUTTON_EDGE_OFFSET].flatMap(left => [
          [left, editor.top - height - 6], [left, editor.bottom + 6],
        ]),
        [editor.left - width - 6, editor.top], [editor.right + 6, editor.top],
      ].filter(point => point.every(Number.isFinite)).map(clamp);
      // Retain a valid position across timer updates. If the editor fills the
      // viewport, prioritize keeping the mic and explicit controls reachable.
      position = candidates.find(point => clears(point, rect) && clears(point, editor)) ||
        candidates.find(point => clears(point, rect)) || position;
    }
    statusBubble.style.top = `${position.top}px`;
    statusBubble.style.left = `${position.left}px`;
    statusBubble.style.right = "auto";
  }

  function updateRecordingFeedback() {
    if (!recordingFeedback) return;
    recordingFeedback.hidden = false;
    const elapsed = Math.min(recordingLimitMs, Math.max(0, performance.now() - recordingStartedAt));
    const text = `${Math.floor(elapsed / 1000)}s elapsed · ${Math.ceil((recordingLimitMs - elapsed) / 1000)}s left`;
    if (timingLabel.textContent !== text) timingLabel.textContent = text;
    const activity = recordingSignalMonitor?.getActivity?.();
    const label = activity == null ? "Activity unavailable" : activity ? "Mic activity" : "Quiet";
    if (activityLabel.textContent !== label) activityLabel.textContent = label;
    if (activityLabel.dataset.active !== String(activity === true)) {
      activityLabel.dataset.active = String(activity === true);
    }
    positionStatusBubble();
  }

  function handleRecordingTab(event) {
    if (!event.isTrusted || event.defaultPrevented || event.key !== "Tab" ||
        event.ctrlKey || event.altKey || event.metaKey || currentMicButtonState !== "recording" ||
        !isRecordingContextSafe() || !hasVisibleRecordingControl()) return;
    // Controls are appended outside the site's editor. While recording, make
    // them reachable without crossing unrelated fields (which safely cancels).
    // Honor editor-owned Tab handlers, and never trap focus in these controls.
    if (!event.shiftKey && getEditableFieldFromEvent(event) === recordingTargetField) {
      event.preventDefault();
      micButton.focus();
    } else if (event.shiftKey && micButton.contains(event.target)) {
      event.preventDefault();
      recordingTargetField.focus();
    }
  }

  function discardRecording() {
    const field = getUsableField(recordingTargetField);
    // Restore focus before removing keyboard-focused controls, without restoring
    // an old range or changing the user's current selection.
    field?.focus();
    cancelRecording();
    flashMicButtonState("idle", "Recording discarded");
    updateMicButton();
  }

  function setStatusMessage(message, { dismissible = false, standalone = false } = {}) {
    const bubble = getStatusBubble();
    statusIsStandalone = standalone;
    statusMessageElement.textContent = message;
    statusDismissButton.hidden = !dismissible;
    bubble.classList.toggle("voice-dictation-status--recording", currentMicButtonState === "recording");
    bubble.hidden = false;

    if (standalone) {
      bubble.style.top = "16px";
      bubble.style.right = "16px";
      bubble.style.left = "auto";
    } else if (micButton && !micButton.hidden) {
      positionStatusBubble();
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
    button.classList.toggle("voice-dictation-mic-button--busy", state === "requesting" || state === "processing");
    button.classList.toggle("voice-dictation-mic-button--transcribing", state === "transcribing");
    button.classList.toggle("voice-dictation-mic-button--success", state === "success");
    button.classList.toggle("voice-dictation-mic-button--error", state === "error");
    button.disabled = state === "requesting" || state === "processing" || !isDictationEnabled();
    setMicButtonVisual(button, state);

    if (recordingFeedback) recordingFeedback.hidden = state !== "recording";

    if (message || visual.status) {
      setStatusMessage(message || visual.status, { dismissible });
      return;
    }

    statusIsStandalone = false;
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

  function showStandaloneErrorState(message, requestId = "") {
    clearTransientStateTimeout();
    setMicButtonState("error", addRequestReference(message, requestId), { dismissible: true });
    micButton.hidden = true;
    setStatusMessage(addRequestReference(message, requestId), {
      dismissible: true,
      standalone: true,
    });
  }

  function showFieldFailureState(message, requestId = "") {
    if (getFocusedSupportedField()) {
      showErrorState(message, requestId);
      return;
    }

    showStandaloneErrorState(message, requestId);
  }

  function dismissErrorState() {
    if (currentMicButtonState !== "error") {
      return;
    }

    statusIsStandalone = false;
    setMicButtonState("idle");
    updateMicButton();
  }

  function clearActiveField() {
    activeField = null;
    activeTextRange = null;
    micButtonPlacement = null;
  }

  function getUsableField(field) {
    return isSupportedField(field) ? field : null;
  }

  function getFocusedSupportedField() {
    return getUsableField(getCurrentEditableField());
  }

  function isRecordingContextSafe() {
    return !document.hidden && document.hasFocus?.() !== false && getUsableField(recordingTargetField) &&
      getFocusedSupportedField() === recordingTargetField;
  }

  function hasVisibleRecordingControl() {
    if (!micButton?.isConnected || micButton.hidden || !micButton.getClientRects().length) return false;
    if (micButton.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false) return false;
    const style = window.getComputedStyle(micButton);
    const rect = micButton.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return style.display !== "none" && style.visibility === "visible" && Number(style.opacity) > 0 &&
      (hit === micButton || micButton.contains(hit));
  }

  function announce(message) {
    if (!announcementElement?.isConnected) {
      announcementElement = document.createElement("div");
      announcementElement.className = "voice-dictation-announcement";
      announcementElement.setAttribute("role", "status");
      announcementElement.setAttribute("aria-live", "polite");
      announcementElement.setAttribute("aria-atomic", "true");
      document.documentElement.append(announcementElement);
    }
    announcementElement.textContent = message;
  }

  function clearRecovery(message = "") {
    const restoreFocus = recoveryElement?.contains(document.activeElement);
    const returnFocus = recovery?.returnFocus;
    if (recoveryTimeoutId) window.clearTimeout(recoveryTimeoutId);
    recoveryTimeoutId = null;
    if (recovery) recovery.text = "";
    recovery = null;
    recoveryElement?.remove();
    recoveryElement = null;
    // Only return focus if its control was removed. Never move a typing user's caret.
    if (restoreFocus && !document.hidden && document.hasFocus?.() !== false && getUsableField(returnFocus)) {
      returnFocus.focus();
    }
    if (message) announce(message);
  }

  function offerRecovery(text, reason) {
    clearRecovery();
    if (!isDictationEnabled() || document.hidden) return;
    announce("");
    recovery = { text, expiresAt: Date.now() + RECOVERY_LIFETIME_MS, returnFocus: getFocusedSupportedField(), copying: false };
    const panel = document.createElement("section");
    panel.className = "voice-dictation-recovery";
    panel.setAttribute("aria-label", "Transcript recovery");
    const message = document.createElement("span");
    message.textContent = `${reason} Copy within 60 seconds or discard. The transcript is not shown here.`;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy transcript";
    copy.setAttribute("aria-label", "Copy transcript");
    copy.addEventListener("click", async (event) => {
      if (!event.isTrusted || !recovery || recovery.copying) return;
      if (Date.now() >= recovery.expiresAt) { clearRecovery("Transcript expired. Record again when ready."); return; }
      const pending = recovery;
      pending.copying = true;
      copy.setAttribute("aria-disabled", "true");
      copy.textContent = "Copying…";
      try {
        await navigator.clipboard.writeText(pending.text);
        if (recovery === pending) clearRecovery("Transcript copied. Paste it where you want.");
      } catch (_error) {
        if (recovery === pending) {
          pending.copying = false;
          copy.setAttribute("aria-disabled", "false");
          copy.textContent = "Copy transcript";
          message.textContent = "Clipboard unavailable. Keep this page active and try Copy again before the transcript expires. Nothing was inserted.";
          announce(message.textContent);
        }
      }
    });
    const discard = document.createElement("button");
    discard.type = "button";
    discard.textContent = "Discard transcript";
    discard.addEventListener("click", (event) => { if (event.isTrusted) clearRecovery("Transcript discarded."); });
    panel.addEventListener("focusin", (event) => {
      if (recovery && getUsableField(event.relatedTarget)) recovery.returnFocus = event.relatedTarget;
    });
    panel.append(message, copy, discard);
    recoveryElement = panel;
    document.documentElement.append(panel);
    if (statusBubble) statusBubble.hidden = true;
    announce(message.textContent);
    recoveryTimeoutId = window.setTimeout(() => clearRecovery("Transcript expired. Record again when ready."), RECOVERY_LIFETIME_MS);
  }

  function handlePageHidden() {
    if (!document.hidden) { updateMicButton(); return; }
    handlePageExit();
  }

  function handlePageExit() {
    clearRecovery();
    if (announcementElement) announcementElement.textContent = "";
    clearTransientStateTimeout();
    cancelActiveWork();
    clearActiveField();
    hideMicButton({ forceStatus: true });
  }

  function reconcileTrackedFields(mutations = []) {
    if (recordingTargetField && (!isRecordingContextSafe() || !hasVisibleRecordingControl())) {
      cancelRecording();
    }
    const onlyDictozyMutations = mutations.length > 0 && mutations.every(({ target }) => (
      target === micButton ||
      target === statusBubble ||
      micButton?.contains(target) ||
      statusBubble?.contains(target)
    ));

    if (!isDictationEnabled() || onlyDictozyMutations) {
      return;
    }

    const operationTarget = recordingTargetField || transcriptionTargetField;
    if (operationTarget && !getUsableField(operationTarget)) {
      cancelActiveWork();
      clearActiveField();
      hideMicButton({ forceStatus: true });
      showStandaloneErrorState("The original field is no longer available. Record again in a supported field.");
      return;
    }

    if (activeField && !getUsableField(activeField)) {
      clearActiveField();
      hideMicButton();
    }
  }

  function overlapsPageControl(left, top, size) {
    const offsets = [2, size / 2, size - 2];
    for (const x of offsets) {
      for (const y of offsets) {
        for (const element of document.elementsFromPoint(left + x, top + y)) {
          if (micButton?.contains(element) || statusBubble?.contains(element) || recoveryElement?.contains(element)) continue;
          if (element.closest('button, input, textarea, select, iframe, a[href], summary, [role="button"], [role="textbox"], [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])')) return true;
        }
      }
    }
    return false;
  }

  function updateMicButton() {
    if (!isDictationEnabled()) {
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
    const maxLeft = Math.max(BUTTON_EDGE_OFFSET, window.innerWidth - buttonSize - BUTTON_EDGE_OFFSET);
    const clampLeft = (left) => Math.max(BUTTON_EDGE_OFFSET, Math.min(maxLeft, left));
    const candidates = [
      { side: "right", left: preferredLeft, top },
      { side: "left", left: fallbackLeft, top },
      { side: "above", left: clampLeft(rect.right - buttonSize), top: rect.top - buttonSize - BUTTON_EDGE_OFFSET },
      { side: "below", left: clampLeft(rect.right - buttonSize), top: rect.bottom + BUTTON_EDGE_OFFSET },
    ];
    const activeWork = recordingTargetField || transcriptionTargetField;
    // Keep the chosen side through an active session; toolbar changes must not
    // make the Stop control jump. A bounded hit test avoids scanning the page.
    let placement = activeWork === field && micButtonPlacement?.field === field
      ? candidates.find(({ side }) => side === micButtonPlacement.side)
      : candidates.find(({ left, top: candidateTop }) => left >= BUTTON_EDGE_OFFSET && left <= maxLeft &&
          candidateTop >= BUTTON_EDGE_OFFSET && candidateTop + buttonSize + BUTTON_EDGE_OFFSET <= window.innerHeight &&
          !overlapsPageControl(left, candidateTop, buttonSize));
    placement ||= candidates[preferredLeft <= maxLeft ? 0 : 1];
    micButtonPlacement = { field, side: placement.side };
    button.style.top = `${Math.round(Math.max(BUTTON_EDGE_OFFSET, Math.min(window.innerHeight - buttonSize - BUTTON_EDGE_OFFSET, placement.top)))}px`;
    button.style.left = `${Math.round(clampLeft(placement.left))}px`;
    button.hidden = false;

    if (statusBubble && !statusBubble.hidden) {
      statusIsStandalone = false;
      positionStatusBubble();
    }
  }

  function rememberActiveField(event) {
    if (micButton?.contains(event.target) || statusBubble?.contains(event.target)) {
      return;
    }

    if (!isDictationEnabled()) {
      clearActiveField();
      hideMicButton();
      return;
    }

    const field = getEditableFieldFromEvent(event);

    if (recordingTargetField && field !== recordingTargetField) cancelRecording();

    if (getUsableField(field)) {
      if (field !== activeField && currentMicButtonState === "error") {
        setMicButtonState("idle");
      }

      activeField = field;
      // Recovery controls may be reached through the microphone by Tab. Keep
      // the last supported field, even when focus enters the panel indirectly.
      if (recovery) recovery.returnFocus = field;
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
      if (recordingTargetField && !isRecordingContextSafe()) cancelRecording();
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

  function isRangeInsideField(element, range) {
    return Boolean(
      range &&
      element.contains(range.startContainer) &&
      element.contains(range.endContainer)
    );
  }

  function getRichTextInsertionRange(element, capturedSelection = null) {
    if (capturedSelection?.kind === "rich-text") {
      return isRangeInsideField(element, capturedSelection.range)
        ? capturedSelection.range.cloneRange()
        : null;
    }

    const selection = window.getSelection();

    if (selection?.rangeCount) {
      const range = selection.getRangeAt(0);

      if (isRangeInsideField(element, range)) {
        return range.cloneRange();
      }
    }

    if (isRangeInsideField(element, activeTextRange)) {
      return activeTextRange.cloneRange();
    }

    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    return range;
  }

  function captureFieldSelection(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return Object.freeze({
        kind: "form",
        ...captureFormFieldSelection(element),
      });
    }

    const range = getRichTextInsertionRange(element);
    return range ? Object.freeze({
      kind: "rich-text", range, html: element.innerHTML,
      startContainer: range.startContainer, startOffset: range.startOffset,
      endContainer: range.endContainer, endOffset: range.endOffset,
    }) : null;
  }

  function isCapturedSelectionCurrent(element, captured) {
    if (!captured) return false;
    if (captured.kind === "form") return element.value === captured.value;
    const { range } = captured;
    return element.innerHTML === captured.html && isRangeInsideField(element, range) &&
      range.startContainer === captured.startContainer && range.startOffset === captured.startOffset &&
      range.endContainer === captured.endContainer && range.endOffset === captured.endOffset;
  }

  function getTextBeforeRange(element, range) {
    const precedingRange = range.cloneRange();
    precedingRange.selectNodeContents(element);

    try {
      precedingRange.setEnd(range.startContainer, range.startOffset);
      return precedingRange.toString();
    } catch (_error) {
      return "";
    }
  }

  function getTextAfterRange(element, range) {
    const followingRange = range.cloneRange();
    followingRange.selectNodeContents(element);

    try {
      followingRange.setStart(range.endContainer, range.endOffset);
      return followingRange.toString();
    } catch (_error) {
      return "";
    }
  }

  function insertIntoRichTextField(element, text, capturedSelection = null) {
    const insertionRange = getRichTextInsertionRange(element, capturedSelection);

    if (!insertionRange) {
      return false;
    }

    element.focus();
    const selection = window.getSelection();
    if (!selection) {
      return false;
    }

    selection.removeAllRanges();
    selection.addRange(insertionRange);

    const range = selection.getRangeAt(0);
    const textBeforeRange = getTextBeforeRange(element, range);
    const textAfterRange = getTextAfterRange(element, range);
    const insertedText = prepareInsertionText(text, textBeforeRange, textAfterRange);

    if (!insertedText) {
      return false;
    }

    if (!dispatchBeforeInputEvent(element, insertedText)) {
      return false;
    }

    if (!isRangeInsideField(element, insertionRange) ||
        !isCapturedSelectionCurrent(element, capturedSelection) ||
        getTranscriptTargetField(element) !== element) {
      return false;
    }

    selection.removeAllRanges();
    selection.addRange(insertionRange);

    const previousHtml = element.innerHTML;
    const nativeInsertion = executeNativeTextInsertion(element, insertedText);
    const nativeInsertionChangedContent = element.innerHTML !== previousHtml;

    if (nativeInsertion.succeeded || nativeInsertionChangedContent) {
      if (selection.rangeCount && isRangeInsideField(element, selection.getRangeAt(0))) {
        activeTextRange = selection.getRangeAt(0).cloneRange();
      }

      if (!nativeInsertion.changeDispatched) {
        dispatchChangeEvent(element);
      }
      return true;
    }

    if (!selection.rangeCount || !isRangeInsideField(element, selection.getRangeAt(0))) {
      return false;
    }

    const fallbackRange = selection.getRangeAt(0);
    const textNode = document.createTextNode(insertedText);

    fallbackRange.deleteContents();
    fallbackRange.insertNode(textNode);
    fallbackRange.setStartAfter(textNode);
    fallbackRange.collapse(true);

    selection.removeAllRanges();
    selection.addRange(fallbackRange);
    activeTextRange = fallbackRange.cloneRange();
    dispatchInputEvents(element, insertedText);
    return true;
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

  function insertTranscript(text, expectedField, capturedSelection = null) {
    const field = getTranscriptTargetField(expectedField);

    if (!field) {
      return {
        ok: false,
        message: "Focus moved before insertion. Your writing was not replaced.",
      };
    }

    if (!isCapturedSelectionCurrent(field, capturedSelection)) {
      return { ok: false, message: "The field changed. Your existing text was not modified." };
    }

    activeField = field;
    field.focus();

    try {
      const inserted = field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
        ? insertIntoFormField(field, text, capturedSelection, () => getTranscriptTargetField(field) === field)
        : insertIntoRichTextField(
          field,
          text,
          capturedSelection?.kind === "rich-text" ? capturedSelection : null,
        );

      if (!inserted) {
        return {
          ok: false,
          message: "Could not insert the transcript. The editor could not accept it safely.",
        };
      }
    } catch (_error) {
      return {
        ok: false,
        message: "Could not insert the transcript. The editor could not accept it safely.",
      };
    }

    return {
      ok: true,
      message: "Transcript inserted.",
    };
  }

  function clearRecordingResources() {
    if (recordingSafetyIntervalId) window.clearInterval(recordingSafetyIntervalId);
    recordingSafetyIntervalId = null;
    if (recordingFeedback) recordingFeedback.hidden = true;
    recordingStartedAt = 0;
    removeTrackListeners?.();
    removeTrackListeners = null;
    removeRecordingFocusListener?.();
    removeRecordingFocusListener = null;
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
    recordingSignalResult = null;
    recordingChunks = [];
  }

  function cancelRecording() {
    recordingAttempt += 1;
    recordingCanceled = true;
    recordingTargetField = null;
    recordingTargetSelection = null;

    if (recordingTimeoutId) {
      window.clearTimeout(recordingTimeoutId);
      recordingTimeoutId = null;
    }

    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      try {
        mediaRecorder.stop();
      } catch (_error) {
        // Tracks still need to stop even if the recorder rejects stop().
      }
    }

    // Do not wait for an asynchronous stop event to release the microphone.
    clearRecordingResources();

    setMicButtonState("idle");
    if (!getFocusedSupportedField()) {
      clearActiveField();
      hideMicButton();
    }
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
    transcriptionTargetSelection = null;

    if (!operation) {
      return;
    }

    sendCancellationToBackground(operation.requestId);
    setMicButtonState("idle");

    if (announce && isDictationEnabled()) {
      flashMicButtonState("idle", "Transcription cancelled");
    }
  }

  function cancelActiveWork({ announce = false } = {}) {
    cancelRecording();
    cancelTranscription({ announce });
  }

  async function handleDictationToggle() {
    if (!isDictationEnabled()) {
      return {
        action: "ignored",
        ok: false,
        state: "disabled",
      };
    }

    if (currentMicButtonState === "requesting") {
      cancelRecording();
      flashMicButtonState("idle", "Microphone request cancelled");
      return {
        action: "cancel-microphone",
        ok: true,
        state: "idle",
      };
    }

    if (mediaRecorder?.state === "recording") {
      stopRecording();
      return {
        action: "stop-recording",
        ok: true,
        state: "processing",
      };
    }

    if (currentMicButtonState === "processing") {
      return {
        action: "ignored",
        ok: false,
        state: "processing",
      };
    }

    if (currentMicButtonState === "transcribing") {
      cancelTranscription();
      return {
        action: "cancel-transcription",
        ok: true,
        state: "idle",
      };
    }

    if (!getFocusedSupportedField()) {
      return {
        action: "ignored",
        ok: false,
        state: currentMicButtonState,
      };
    }

    await startRecording();
    return {
      action: currentMicButtonState === "recording" ? "start-recording" : "ignored",
      ok: currentMicButtonState === "recording",
      state: currentMicButtonState,
    };
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

  function isMicrophoneBlockedByPage() {
    if (window.isSecureContext !== true) {
      return true;
    }

    const permissionsPolicy = document.permissionsPolicy || document.featurePolicy;

    try {
      return typeof permissionsPolicy?.allowsFeature === "function" && !permissionsPolicy.allowsFeature("microphone");
    } catch (_error) {
      return false;
    }
  }

  async function startRecording() {
    if (!isDictationEnabled() || document.hidden) {
      hideMicButton();
      return;
    }

    const field = getFocusedSupportedField();

    if (!field) {
      showErrorState("Focus a supported field.");
      return;
    }

    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined" ||
      isMicrophoneBlockedByPage()
    ) {
      showErrorState(getMicrophoneAccessFailure(null, { blocked: true }).message);
      return;
    }

    clearTransientStateTimeout();
    clearRecovery();
    recordingAttempt += 1;
    const attempt = recordingAttempt;
    activeField = field;
    field.focus();
    recordingCanceled = false;
    recordingTargetField = field;
    recordingTargetSelection = captureFieldSelection(field);
    // Document focus events can be suppressed when both fields share a shadow
    // host. Listen on this recording target so unsafe focus ends capture now.
    const handleRecordingFocusOut = (event) => {
      if (attempt !== recordingAttempt || micButton?.contains(event.relatedTarget) ||
          statusBubble?.contains(event.relatedTarget) ||
          getUsableField(getEditableField(event.relatedTarget)) === field) return;
      cancelRecording();
    };
    field.addEventListener("focusout", handleRecordingFocusOut);
    removeRecordingFocusListener = () => field.removeEventListener("focusout", handleRecordingFocusOut);
    transcriptionTargetField = null;
    transcriptionTargetSelection = null;
    setMicButtonState("idle");
    setMicButtonState("requesting", "Requesting microphone access");

    try {
      const recordingDurationMs = await getRecordingDurationMs();

      if (!isDictationEnabled() || attempt !== recordingAttempt || !isRecordingContextSafe()) {
        if (attempt === recordingAttempt) cancelRecording();
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      if (!isDictationEnabled() || attempt !== recordingAttempt || !isRecordingContextSafe()) {
        stream.getTracks().forEach((track) => track.stop());
        if (attempt === recordingAttempt) cancelRecording();
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
      const recorder = new MediaRecorder(recordingStream, options);
      mediaRecorder = recorder;

      recorder.addEventListener("dataavailable", (event) => {
        if (attempt === recordingAttempt && recorder === mediaRecorder && event.data.size > 0) {
          recordingChunks.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        if (attempt === recordingAttempt && recorder === mediaRecorder) void finishRecording();
      }, { once: true });
      recorder.addEventListener("error", () => {
        if (attempt !== recordingAttempt || recorder !== mediaRecorder) return;
        cancelRecording();
        showErrorState("Recording failed. Check your microphone and try again.");
      }, { once: true });
      recorder.start();
      recordingStartedAt = performance.now();
      recordingLimitMs = recordingDurationMs;
      setMicButtonState("recording", "Recording");
      updateRecordingFeedback();

      const handleTrackEnded = () => {
        if (attempt === recordingAttempt && recorder === mediaRecorder) {
          cancelRecording();
          showErrorState("Microphone stopped. Check your input and record again.");
        }
      };
      const tracks = stream.getTracks();
      tracks.forEach((track) => track.addEventListener?.("ended", handleTrackEnded));
      removeTrackListeners = () => tracks.forEach((track) => track.removeEventListener?.("ended", handleTrackEnded));
      // Covers CSS/layout changes that don't generate DOM mutations. Hidden-page
      // and focus transitions use immediate event-driven cancellation above.
      recordingSafetyIntervalId = window.setInterval(() => {
        if (!isRecordingContextSafe() || !hasVisibleRecordingControl()) cancelRecording();
        else if (currentMicButtonState === "recording") updateRecordingFeedback();
      }, 100);

      recordingTimeoutId = window.setTimeout(() => {
        stopRecording();
      }, recordingDurationMs);
    } catch (error) {
      if (attempt !== recordingAttempt) return;
      clearRecordingResources();

      if (isDictationEnabled() && attempt === recordingAttempt) {
        recordingTargetField = null;
        recordingTargetSelection = null;
        const failure = getMicrophoneAccessFailure(error, {
          blocked: isMicrophoneBlockedByPage(),
        });
        showErrorState(failure.message);
      }
    }
  }

  function stopRecording() {
    if (recordingTargetField && !isRecordingContextSafe()) {
      cancelRecording();
      return;
    }
    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      clearRecordingResources();
      setMicButtonState("idle");
      return;
    }

    // Disabling a keyboard-focused button moves browser focus to the page body.
    // Restore the original editor first, so completion still has a safe target.
    recordingTargetField?.focus();
    setMicButtonState("processing", "Preparing transcription");
    // A duration timer must not clear a normal stop while its final data event
    // is still queued by the browser.
    if (recordingTimeoutId) window.clearTimeout(recordingTimeoutId);
    recordingTimeoutId = null;

    try {
      // Signal inspection checks track availability. Snapshot it before stopping
      // tracks immediately; inspecting an intentionally ended track looks silent.
      recordingSignalResult = recordingSignalMonitor?.getResult() || "unknown";
      mediaRecorder.stop();
      recordingStream?.getTracks().forEach((track) => track.stop());
    } catch (_error) {
      clearRecordingResources();
      recordingTargetField = null;
      recordingTargetSelection = null;
      showErrorState("Could not stop recording. Try again.");
    }
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

  async function finishRecording() {
    let operation = null;
    let recordingBlob = null;

    try {
      if (recordingCanceled || !isDictationEnabled()) {
        clearRecordingResources();
        updateMicButton();
        return;
      }

      const signalResult = recordingSignalResult || recordingSignalMonitor?.getResult() || "unknown";
      const mimeType = mediaRecorder?.mimeType || "audio/webm";
      const targetField = getTranscriptTargetField(recordingTargetField);
      const targetSelection = recordingTargetSelection;
      recordingBlob = new Blob(recordingChunks, { type: mimeType });
      recordingTargetField = null;
      recordingTargetSelection = null;

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
        showFieldFailureState("Focus moved before transcription. Record again in a supported field.");
        return;
      }

      transcriptionTargetField = targetField;
      transcriptionTargetSelection = targetSelection;
      operation = requestLifecycle.begin(createRequestId());
      setMicButtonState("transcribing", "Transcribing");

      const result = await sendAudioToBackend(recordingBlob, operation);
      recordingBlob = null;

      if (!requestLifecycle.isCurrent(operation)) {
        return;
      }

      requestLifecycle.complete(operation);
      const expectedField = transcriptionTargetField;
      const expectedSelection = transcriptionTargetSelection;
      transcriptionTargetField = null;
      transcriptionTargetSelection = null;

      if (!isDictationEnabled()) {
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

      const insertion = insertTranscript(result.transcript, expectedField, expectedSelection);
      if (!insertion.ok) {
        showFieldFailureState(insertion.message, result.requestId || operation.requestId);
        offerRecovery(result.transcript, insertion.message);
        return;
      }

      flashMicButtonState("success", "Transcript inserted");
      updateMicButton();
    } catch (_error) {
      clearRecordingResources();
      recordingBlob = null;
      recordingTargetField = null;
      recordingTargetSelection = null;

      if (operation && !requestLifecycle.isCurrent(operation)) {
        return;
      }

      if (operation) {
        requestLifecycle.complete(operation);
      }

      transcriptionTargetField = null;
      transcriptionTargetSelection = null;

      if (!isDictationEnabled()) {
        updateMicButton();
        return;
      }

      showErrorState("Transcription failed.", operation?.requestId || "");
    }
  }

  async function loadExtensionState() {
    try {
      const settings = await chrome.storage.local.get({
        [DISABLED_ORIGINS_STORAGE_KEY]: [],
        extensionEnabled: DEFAULT_EXTENSION_ENABLED,
      });

      extensionEnabled = settings.extensionEnabled !== false;
      siteEnabled = isPracticePage || Boolean(currentOrigin) && !isOriginDisabled(
        settings[DISABLED_ORIGINS_STORAGE_KEY],
        currentOrigin,
      );
    } catch (_error) {
      extensionEnabled = DEFAULT_EXTENSION_ENABLED;
      siteEnabled = isPracticePage || Boolean(currentOrigin);
    }

    settingsLoaded = true;

    if (!isDictationEnabled()) {
      clearActiveField();
      hideMicButton({ forceStatus: true });
      return;
    }

    updateMicButton();
  }

  function handleStorageChanges(changes, areaName) {
    if (
      areaName !== "local" ||
      (!changes.extensionEnabled && !changes[DISABLED_ORIGINS_STORAGE_KEY])
    ) {
      return;
    }

    const wasEnabled = isDictationEnabled();

    if (changes.extensionEnabled) {
      extensionEnabled = changes.extensionEnabled.newValue !== false;
    }

    if (changes[DISABLED_ORIGINS_STORAGE_KEY]) {
      siteEnabled = isPracticePage || Boolean(currentOrigin) && !isOriginDisabled(
        changes[DISABLED_ORIGINS_STORAGE_KEY].newValue,
        currentOrigin,
      );
    }

    const enabled = isDictationEnabled();

    if (enabled === wasEnabled) {
      return;
    }

    if (!enabled) {
      clearRecovery();
      clearTransientStateTimeout();
      cancelActiveWork();
      clearActiveField();
      hideMicButton({ forceStatus: true });
      return;
    }

    setMicButtonState("idle");
    updateMicButton();
  }

  function handleRuntimeMessage(message, _sender, sendResponse) {
    if (message?.type === GET_SITE_CONTEXT_MESSAGE) {
      sendResponse(currentOrigin ? { ok: true, origin: currentOrigin } : { ok: false });
      return false;
    }

    if (message?.type !== TOGGLE_DICTATION_MESSAGE) {
      return false;
    }

    handleDictationToggle()
      .then(sendResponse)
      .catch(() => {
        sendResponse({
          action: "ignored",
          ok: false,
          state: "error",
        });
      });
    return true;
  }

  document.addEventListener("focusin", rememberActiveField, true);
  document.addEventListener("focusout", forgetActiveFieldAfterBlur, true);
  document.addEventListener("keyup", rememberActiveField, true);
  document.addEventListener("keydown", handleRecordingTab);
  document.addEventListener("mouseup", rememberActiveField, true);
  document.addEventListener("selectionchange", rememberTextRange);
  window.addEventListener("scroll", updateMicButton, true);
  window.addEventListener("resize", updateMicButton);
  document.addEventListener("visibilitychange", handlePageHidden);
  window.addEventListener("pagehide", handlePageExit);
  window.addEventListener("pageshow", updateMicButton);
  window.addEventListener("blur", () => { if (mediaRecorder) cancelRecording(); });
  chrome.runtime.onMessage.addListener(handleRuntimeMessage);
  chrome.storage.onChanged.addListener(handleStorageChanges);

  const fieldObserver = new MutationObserver(reconcileTrackedFields);
  fieldObserver.observe(document.documentElement, {
    attributeFilter: [
      "aria-disabled",
      "aria-hidden",
      "aria-label",
      "aria-readonly",
      "autocomplete",
      "class",
      "contenteditable",
      "disabled",
      "hidden",
      "id",
      "inputmode",
      "name",
      "placeholder",
      "readonly",
      "style",
      "type",
    ],
    attributes: true,
    childList: true,
    subtree: true,
  });

  announce("");
  loadExtensionState();
})();
