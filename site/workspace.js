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
  function removeSavedDraft() {
    try {
      localStorage.removeItem(storageKey);
      return true;
    } catch (_) {
      saveStatus.textContent = "Browser storage could not be cleared. Clear this site's stored data in your browser settings to remove any saved copy.";
      return false;
    }
  }
  function saveDraft() {
    if (!remember.checked || clearing) return;
    try {
      if (draft.value === "") localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, JSON.stringify({ version: 1, text: draft.value }));
      saveStatus.textContent = draft.value === "" ? "No saved draft." : "Saved in this browser.";
    } catch (_) {
      saveStatus.textContent = "Could not save this draft. Keep this page open and copy your text; browser storage may be full or unavailable.";
    }
  }
  let storedReadable = false;
  try {
    const stored = localStorage.getItem(storageKey);
    storedReadable = true;
    if (stored !== null) {
      const saved = JSON.parse(stored);
      if (!saved || saved.version !== 1 || typeof saved.text !== "string" || Object.keys(saved).some(key => !["version", "text"].includes(key))) throw new Error("Invalid draft");
      draft.value = saved.text;
      remember.checked = true;
      saveStatus.textContent = "Restored the draft you chose to remember in this browser.";
    }
  } catch (_) {
    if (storedReadable && removeSavedDraft()) {
      saveStatus.textContent = "An invalid saved draft was removed. Remembering is off.";
    } else if (!storedReadable) {
      saveStatus.textContent = "Browser storage is unavailable. Remembering is off; any previously saved copy could not be checked or removed.";
    }
  }
  draft.addEventListener("input", () => {
    copySequence += 1;
    updateCounts();
    saveDraft();
  });
  remember.addEventListener("change", (event) => {
    if (!event.isTrusted) return;
    if (remember.checked) saveDraft();
    else if (removeSavedDraft()) saveStatus.textContent = "Remembering is off. The saved copy was removed; your text remains here.";
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
  byId("confirm-clear").addEventListener("click", (event) => {
    if (!event.isTrusted) return;
    controller?.cancel();
    controller?.clearRecovery();
    copySequence += 1;
    clearing = true;
    draft.focus({ preventScroll: true });
    draft.select();
    if (!document.execCommand("delete", false)) {
      draft.value = "";
      draft.dispatchEvent(new Event("input", { bubbles: true }));
    }
    clearing = false;
    updateCounts();
    const removed = removeSavedDraft();
    if (removed) saveStatus.textContent = remember.checked ? "No saved draft." : "Remembering is off.";
    feedback.textContent = removed ? "Text cleared. No saved copy remains in this app." : "Text cleared here. The saved copy could not be removed; see the storage message below.";
    byId("clear-dialog").close();
    draft.focus({ preventScroll: true });
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
  window.addEventListener("pagehide", () => { copySequence += 1; for (const abort of activeRequests.values()) abort.abort(); });
  resizeWorkspace();
})();
