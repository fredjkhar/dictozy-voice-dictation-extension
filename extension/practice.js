(() => {
  const tryButton = document.querySelector("#tryDictation");
  const availability = document.querySelector("#practiceAvailability");
  const shortcut = document.querySelector("#shortcutValue");

  function updateEnabled(enabled) {
    tryButton.disabled = !enabled;
    availability.textContent = enabled
      ? "Ready when you are. Try dictation focuses the field without recording."
      : "Dictozy is off. Turn it on in the extension popup, then return here.";
  }

  tryButton.addEventListener("click", (event) => {
    if (event.isTrusted) document.querySelector("#practiceField").focus();
  });
  document.querySelector("#manageShortcut").addEventListener("click", async (event) => {
    if (!event.isTrusted) return;
    try {
      await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    } catch (_error) {
      availability.textContent = "Open chrome://extensions/shortcuts to manage your shortcut.";
    }
  });
  chrome.commands.getAll((commands) => {
    shortcut.textContent = chrome.runtime.lastError ? "Unavailable" :
      commands.find(({ name }) => name === "toggle-dictation")?.shortcut || "Not assigned";
  });
  chrome.storage.local.get({ extensionEnabled: true }).then(
    (settings) => updateEnabled(settings.extensionEnabled !== false),
    () => { availability.textContent = "Could not read settings. Reopen this page from the popup."; },
  );
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.extensionEnabled) updateEnabled(changes.extensionEnabled.newValue !== false);
  });
})();
