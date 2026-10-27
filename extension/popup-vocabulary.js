(() => {
  const { STORAGE_KEY, normalizeVocabularySettings, validateVocabularyTerms } = globalThis.DictozyVocabulary;
  const editor = document.querySelector("#vocabularyTerms");
  const enabled = document.querySelector("#vocabularyEnabled");
  const save = document.querySelector("#saveVocabulary");
  const clear = document.querySelector("#clearVocabulary");
  const status = document.querySelector("#vocabularyStatus");
  const controls = [editor, enabled, save, clear];
  let saved = normalizeVocabularySettings(undefined);
  let loaded = false;
  let busy = false;

  function setStatus(message, tone = "neutral") {
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function updateControls() {
    controls.forEach((control) => { control.disabled = busy || !loaded; });
    enabled.checked = saved.enabled;
  }

  async function readSaved() {
    const stored = await chrome.storage.local.get({ [STORAGE_KEY]: null });
    return normalizeVocabularySettings(stored[STORAGE_KEY]);
  }

  async function load() {
    try {
      saved = await readSaved();
      editor.value = saved.terms.join("\n");
      loaded = true;
      setStatus(saved.enabled ? "Vocabulary assistance is on for saved terms." : "Vocabulary assistance is off.");
    } catch (_error) {
      // Unknown stored consent must never become a writable, implicitly enabled state.
      setStatus("Could not load saved vocabulary. Its setting is unknown; close and reopen this popup.", "error");
    }
    updateControls();
  }

  async function mutate(action, event) {
    if (!event.isTrusted || busy || !loaded) {
      enabled.checked = saved.enabled;
      return;
    }
    const requestedEnabled = enabled.checked;
    const validation = action === "save"
      ? validateVocabularyTerms(editor.value.split(/\r?\n/).filter((line) => line.trim() !== ""))
      : null;
    if (validation && !validation.ok) {
      setStatus("Use up to 100 words or phrases, each at most 50 characters, without control characters. Changes were not saved.", "error");
      return;
    }

    busy = true;
    updateControls();
    try {
      if (action === "clear") {
        await chrome.storage.local.remove(STORAGE_KEY);
        saved = normalizeVocabularySettings(undefined);
        editor.value = "";
        setStatus("Vocabulary cleared. Assistance is off for future requests.", "success");
      } else {
        // Read the other property immediately before the single-object write.
        // Editing words never grants consent; toggling never saves an unsaved draft.
        saved = await readSaved();
        const next = {
          enabled: action === "toggle" ? requestedEnabled : saved.enabled,
          terms: action === "save" ? validation.terms : saved.terms,
        };
        await chrome.storage.local.set({ [STORAGE_KEY]: next });
        saved = next;
        if (action === "save") editor.value = saved.terms.join("\n");
        setStatus(action === "save"
          ? (saved.enabled ? "Vocabulary saved. Assistance remains on for saved terms." : "Vocabulary saved locally. Assistance remains off.")
          : (saved.enabled ? "Vocabulary assistance is on for saved terms." : "Vocabulary assistance is off for future requests."), "success");
      }
    } catch (_error) {
      // Keep unsaved editor text, restore the last verified toggle, and do not
      // expose provider/storage exception details or vocabulary in a status.
      setStatus("Could not update vocabulary. Changes were not confirmed; reopen this popup to check.", "error");
    } finally {
      busy = false;
      updateControls();
    }
  }

  save.addEventListener("click", (event) => { void mutate("save", event); });
  clear.addEventListener("click", (event) => { void mutate("clear", event); });
  enabled.addEventListener("click", (event) => {
    // A programmatic checkbox click may produce a trusted change event as its
    // default action. Gate the originating click, including native keyboard use.
    if (!event.isTrusted) { event.preventDefault(); return; }
    void mutate("toggle", event);
  });
  void load();
})();
