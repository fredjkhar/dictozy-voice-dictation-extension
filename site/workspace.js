"use strict";
(() => {
  const byId = (id) => document.getElementById(id);
  // The published extension injects only into the top document. Never enable this
  // editor independently, in nested frames, or under an unrelated embedding page.
  let embedded = false;
  try {
    embedded = window !== window.parent && window.parent === window.top &&
      parent.location.origin === location.origin && parent.location.pathname === "/try.html" &&
      parent.document.getElementById("writing-workspace")?.contentWindow === window;
  } catch (_) { /* Cross-origin embedding stays read-only. */ }
  if (!embedded) return;

  const draft = byId("draft");
  const remember = byId("remember-draft");
  const feedback = byId("workspace-feedback");
  const saveStatus = byId("save-status");
  const storageKey = "dictozy.web.draft.v1";
  const config = globalThis.DictozyWebConfig;
  const languageConfig = globalThis.VoiceDictationConfig;
  const activeRequests = new Map();
  let controller;
  let clearing = false;
  let clearSelection = null;
  let copySequence = 0;
  const loopback = ["127.0.0.1", "localhost"];
  let networkAllowed = false;
  try {
    const endpoint = new URL(config.endpoint);
    networkAllowed = config.localReview === true
      ? location.protocol === "http:" && loopback.includes(location.hostname) &&
        endpoint.protocol === "http:" && endpoint.hostname === location.hostname &&
        endpoint.pathname === "/api/transcribe" && !endpoint.search && !endpoint.hash && !endpoint.username && !endpoint.password
      : location.origin === "https://dictozy.com" &&
        endpoint.href === "https://voice-dictation-extension.onrender.com/api/transcribe";
  } catch (_) { /* Unknown deployment configuration cannot submit audio. */ }

  byId("workspace-guard").hidden = true;
  byId("workspace").hidden = false;
  byId("local-review").hidden = config?.localReview !== true;
  draft.disabled = false;
  for (const { code, label } of languageConfig.TRANSCRIPTION_LANGUAGES) {
    if (code !== "en") byId("language").add(new Option(label, code));
  }

  function updateCounts() {
    const words = draft.value.match(/\S+/gu)?.length || 0;
    byId("word-count").textContent = `${words} ${words === 1 ? "word" : "words"}`;
    byId("copy-text").disabled = draft.value.length === 0;
    byId("clear-text").disabled = draft.value.length === 0;
  }
  // One persisted draft; a fresh consent token also prevents delete/re-enable ABA.
  // The lock serializes the read/check/write across cooperating same-origin tabs.
  // Storage events are only a UI hint, never the authority for a write.
  const canCoordinateDraft = typeof navigator.locks?.request === "function" &&
    typeof crypto.randomUUID === "function";
  let rememberedRaw = null;
  let saveEpoch = 0;
  let pageLeaving = false;
  let cancelReplacement = null;
  function savingStatus(message) {
    // Do not reannounce identical success text on every keystroke.
    if (saveStatus.textContent !== message) saveStatus.textContent = message;
  }
  function pauseSaving(message) {
    saveEpoch += 1;
    rememberedRaw = null;
    remember.checked = false;
    savingStatus(message);
  }
  function parseSavedDraft(raw) {
    if (raw === null) return null;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved.text !== "string") throw new Error("Invalid draft");
    const keys = Object.keys(saved).sort().join(",");
    if (saved.version === 1 && keys === "text,version") return saved;
    const token = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (saved.version !== 2 || keys !== "consent,revision,text,version" ||
        !token.test(saved.consent) || !token.test(saved.revision)) throw new Error("Invalid draft");
    return saved;
  }
  function pauseForChange(raw) {
    pauseSaving(raw === null
      ? "Remembering was turned off or cleared in another tab. Your text is still here."
      : "Saving paused: another tab changed the saved draft. Your text is still here. Turn remembering on to save this tab instead.");
  }
  async function withDraftLock(action) {
    if (!canCoordinateDraft) throw new Error("Draft coordination unavailable");
    return navigator.locks.request(storageKey, { mode: "exclusive" }, action);
  }
  function writeDraft(consent) {
    const raw = JSON.stringify({ version: 2, consent, revision: crypto.randomUUID(), text: draft.value });
    localStorage.setItem(storageKey, raw);
    rememberedRaw = raw;
    remember.checked = true;
    savingStatus(draft.value === "" ? "Remembering is on. This draft is empty." : "Saved in this browser.");
  }
  function saveDraft() {
    if (!remember.checked || !rememberedRaw || clearing || pageLeaving) return;
    const epoch = saveEpoch;
    withDraftLock(() => {
      if (epoch !== saveEpoch || !remember.checked || pageLeaving) return;
      const current = localStorage.getItem(storageKey);
      if (current !== rememberedRaw) { pauseForChange(current); return; }
      const saved = parseSavedDraft(current);
      // Read the current editor in the critical section, not an old queued input.
      if (saved.text !== draft.value) writeDraft(saved.consent);
    }).catch(() => {
      if (epoch === saveEpoch && !pageLeaving) pauseSaving("Could not save this draft. Saving is paused; your text is still here. Copy it or try remembering again.");
    });
  }
  async function removeSavedDraft() {
    pauseSaving("Turning remembering off…");
    const epoch = saveEpoch;
    try {
      await withDraftLock(() => {
        // Explicit revocation is global for this one saved draft, including queued saves.
        localStorage.getItem(storageKey);
        localStorage.removeItem(storageKey);
      });
      if (epoch === saveEpoch) savingStatus("Remembering is off. The saved copy was removed; open tabs keep their text.");
      return true;
    } catch (_) {
      if (epoch === saveEpoch) savingStatus("Browser storage could not be cleared. Saving is off here, but other tabs may still save. Remove this site's stored data in browser settings.");
      return false;
    }
  }
  function confirmDraftReplacement() {
    const dialog = byId("replace-draft-dialog");
    return new Promise((resolve) => {
      function finish(accepted) {
        dialog.close();
        byId("keep-saved-draft").removeEventListener("click", keep);
        byId("replace-saved-draft").removeEventListener("click", replace);
        dialog.removeEventListener("cancel", cancel);
        cancelReplacement = null;
        if (!pageLeaving) remember.focus({ preventScroll: true });
        resolve(accepted);
      }
      const keep = () => finish(false);
      const replace = () => finish(true);
      const cancel = (event) => { event.preventDefault(); finish(false); };
      byId("keep-saved-draft").addEventListener("click", keep);
      byId("replace-saved-draft").addEventListener("click", replace);
      dialog.addEventListener("cancel", cancel);
      cancelReplacement = keep;
      dialog.showModal();
    });
  }
  async function enableRemembering() {
    const epoch = ++saveEpoch;
    rememberedRaw = null;
    try {
      const confirmedRaw = localStorage.getItem(storageKey);
      const saved = parseSavedDraft(confirmedRaw);
      if (saved && saved.text !== draft.value) {
        // Do not cover active capture/cancel controls. The HTML dialog is nonblocking,
        // so existing recovery expiry and other cleanup timers continue normally.
        if (!["idle", "success", "error"].includes(controller?.getState())) {
          pauseSaving("Saving is paused. Finish or cancel dictation before replacing the saved draft.");
          return;
        }
        // Never hold the shared lock while a person considers a confirmation.
        if (!await confirmDraftReplacement()) {
          if (epoch === saveEpoch) pauseSaving("Remembering is off. The saved draft was left unchanged.");
          return;
        }
      }
      await withDraftLock(() => {
        if (epoch !== saveEpoch || pageLeaving) return;
        const current = localStorage.getItem(storageKey);
        if (current !== confirmedRaw) { pauseForChange(current); return; }
        writeDraft(crypto.randomUUID());
      });
    } catch (_) {
      if (epoch === saveEpoch && !pageLeaving) pauseSaving("Could not save this draft. Saving is paused; your text is still here. Copy it or try remembering again.");
    }
  }
  // Restore synchronously before typing can begin; never replace text on a storage event.
  let initialRaw;
  try {
    initialRaw = localStorage.getItem(storageKey);
    const saved = parseSavedDraft(initialRaw);
    if (saved) {
      draft.value = saved.text;
      if (saved.version === 2 && canCoordinateDraft) {
        rememberedRaw = initialRaw;
        remember.checked = true;
        savingStatus("Restored the draft you chose to remember in this browser.");
      } else {
        savingStatus("Saved draft restored. Turn remembering on to save it again.");
      }
    }
  } catch (_) {
    if (initialRaw !== undefined) {
      const epoch = saveEpoch;
      withDraftLock(() => {
        if (epoch !== saveEpoch || pageLeaving || localStorage.getItem(storageKey) !== initialRaw) return false;
        localStorage.removeItem(storageKey);
        return true;
      }).then((removed) => {
        if (removed && epoch === saveEpoch) savingStatus("An invalid saved draft was removed. Remembering is off.");
      }).catch(() => {
        if (epoch === saveEpoch && canCoordinateDraft) savingStatus("Browser storage could not be cleared. Remembering is off; remove this site's stored data in browser settings.");
      });
    } else {
      savingStatus("Browser storage is unavailable. Remembering is off; any previously saved copy could not be checked or removed.");
    }
  }
  if (!canCoordinateDraft) {
    remember.disabled = true;
    savingStatus("Automatic saving is unavailable in this browser. Your text stays here; use Copy. Existing saved data can be removed in browser settings.");
  }
  window.addEventListener("storage", (event) => {
    if ((event.key !== storageKey && event.key !== null) || !rememberedRaw || !remember.checked) return;
    try {
      const current = localStorage.getItem(storageKey);
      if (current !== rememberedRaw) pauseForChange(current);
    } catch (_) {
      pauseSaving("Could not check the saved draft. Saving is paused; your text is still here.");
    }
  });
  draft.addEventListener("input", () => {
    copySequence += 1;
    updateCounts();
    saveDraft();
  });
  remember.addEventListener("change", (event) => {
    if (!event.isTrusted) return;
    if (remember.checked) enableRemembering();
    else removeSavedDraft();
  });
  byId("copy-text").addEventListener("click", async (event) => {
    if (!event.isTrusted || !draft.value) return;
    const sequence = ++copySequence;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Unavailable");
      await navigator.clipboard.writeText(draft.value);
      if (sequence === copySequence) feedback.textContent = "Text copied.";
    } catch (_) {
      if (sequence === copySequence) feedback.textContent = "Copy was unavailable. Select your text and use your browser's Copy command.";
    }
  });
  // Preserve selection before the button takes focus; cancelling never touches the editor.
  byId("clear-text").addEventListener("pointerdown", () => {
    clearSelection = [draft.selectionStart, draft.selectionEnd, draft.selectionDirection];
  });
  byId("clear-text").addEventListener("click", (event) => {
    if (!event.isTrusted || !draft.value) return;
    clearSelection = [draft.selectionStart, draft.selectionEnd, draft.selectionDirection];
    byId("clear-dialog").showModal();
  });
  function keepText() {
    byId("clear-dialog").close();
    draft.focus({ preventScroll: true });
    if (clearSelection) draft.setSelectionRange(...clearSelection);
  }
  byId("cancel-clear").addEventListener("click", keepText);
  byId("clear-dialog").addEventListener("cancel", (event) => { event.preventDefault(); keepText(); });
  byId("confirm-clear").addEventListener("click", async (event) => {
    if (!event.isTrusted) return;
    controller?.cancel();
    controller?.clearRecovery();
    copySequence += 1;
    const removal = removeSavedDraft();
    clearing = true;
    draft.focus({ preventScroll: true });
    draft.select();
    if (!document.execCommand("delete", false)) {
      draft.value = "";
      draft.dispatchEvent(new Event("input", { bubbles: true }));
    }
    clearing = false;
    updateCounts();
    feedback.textContent = "Text cleared here. Removing the saved copy…";
    byId("clear-dialog").close();
    draft.focus({ preventScroll: true });
    const sequence = copySequence;
    const removed = await removal;
    if (sequence === copySequence) feedback.textContent = removed
      ? "Text cleared. The saved copy was removed."
      : "Text cleared here. The saved copy could not be removed; see the storage message.";
  });

  async function transcribe(blob, operation) {
    if (!networkAllowed || operation.signal?.aborted) return { ok: false, canceled: true, message: "Transcription unavailable.", requestId: operation.requestId };
    const abort = new AbortController();
    activeRequests.set(operation.requestId, abort);
    const cancel = () => abort.abort();
    operation.signal?.addEventListener("abort", cancel, { once: true });
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; abort.abort(); }, 55000);
    try {
      const form = new FormData();
      const extension = blob.type.startsWith("audio/mp4") ? "mp4" : "webm";
      form.append("file", blob, `recording.${extension}`);
      form.append("language", languageConfig.normalizeTranscriptionLanguage(byId("language").value));
      // No editor content or extension preferences/vocabulary enter this request.
      const response = await fetch(config.endpoint, {
        method: "POST", body: form, signal: abort.signal, credentials: "omit", redirect: "error",
        referrerPolicy: "no-referrer", headers: { "X-Request-ID": operation.requestId },
      });
      if (!response.ok) {
        const message = response.status === 429 ? "Dictozy is busy. Please wait and try again." :
          response.status === 400 ? "Could not transcribe this clip. Check your microphone and record again." :
          "Transcription is unavailable. Please try again later.";
        return { ok: false, message, requestId: operation.requestId };
      }
      const result = await response.json();
      if (typeof result.transcript !== "string" || !result.transcript.trim()) throw new Error("Invalid response");
      return { ok: true, transcript: result.transcript, requestId: operation.requestId };
    } catch (_) {
      return { ok: false, canceled: abort.signal.aborted && !timedOut,
        message: timedOut ? "Transcription took too long. Record again when ready." : "Could not connect to Dictozy. Your text is unchanged.", requestId: operation.requestId };
    } finally {
      clearTimeout(timeout);
      operation.signal?.removeEventListener("abort", cancel);
      activeRequests.delete(operation.requestId);
    }
  }
  function resizeWorkspace() {
    parent.postMessage({ type: "dictozy-workspace-size", height: document.body.scrollHeight + 8 }, location.origin);
  }
  function isRecordingVisibleInParent() {
    try {
      const frame = parent.document.getElementById("writing-workspace");
      const button = byId("workspaceControls").querySelector(".voice-dictation-mic-button");
      if (!frame?.isConnected || parent.document.hidden || !button || button.hidden) return false;
      const outer = frame.getBoundingClientRect();
      const inner = button.getBoundingClientRect();
      const left = Math.max(0, outer.left, outer.left + inner.left);
      const top = Math.max(0, outer.top, outer.top + inner.top);
      const right = Math.min(parent.innerWidth, outer.right, outer.left + inner.right);
      const bottom = Math.min(parent.innerHeight, outer.bottom, outer.top + inner.bottom);
      return right > left && bottom > top &&
        parent.document.elementFromPoint((left + right) / 2, (top + bottom) / 2) === frame;
    } catch (_) { return false; }
  }
  controller = globalThis.DictozyController.mount({
    getState: async () => ({ enabled: networkAllowed }),
    isContextSafe: isRecordingVisibleInParent,
    getRecordingDurationMs: async () => Number(byId("duration").value),
    transcribe,
    cancelTranscription: (id) => activeRequests.get(id)?.abort(),
    field: draft, inlineControls: true, controlsHost: byId("workspaceControls"), recoveryHost: byId("workspaceRecovery"),
    onStateChange: resizeWorkspace,
  });
  if (!networkAllowed) feedback.textContent = "Dictation is unavailable in this preview. Typing and copying still work.";
  updateCounts();
  new ResizeObserver(resizeWorkspace).observe(document.body);
  window.addEventListener("pagehide", () => { pageLeaving = true; saveEpoch += 1; cancelReplacement?.(); copySequence += 1; for (const abort of activeRequests.values()) abort.abort(); });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) { pageLeaving = false; pauseSaving("Saving is paused after returning to this page. Turn remembering on to resume."); }
  });
  resizeWorkspace();
})();
