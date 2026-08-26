const GET_SITE_CONTEXT_MESSAGE = "VOICE_DICTATION_GET_SITE_CONTEXT";
const TOGGLE_DICTATION_COMMAND = "toggle-dictation";
const SHORTCUT_SETTINGS_URL = "chrome://extensions/shortcuts";
const DEFAULT_EXTENSION_ENABLED = true;
const DEFAULT_RECORDING_DURATION_SECONDS = 10;
const MIN_RECORDING_DURATION_SECONDS = 1;
const MAX_RECORDING_DURATION_SECONDS = 30;
const {
  DEFAULT_TRANSCRIPTION_LANGUAGE,
  TRANSCRIPTION_LANGUAGES,
  normalizeTranscriptionLanguage,
} = globalThis.VoiceDictationConfig;
const {
  DISABLED_ORIGINS_STORAGE_KEY,
  normalizeDisabledOrigins,
  normalizeOrigin,
  setOriginEnabled,
} = globalThis.DictozySitePreferences;

const enabledToggle = document.querySelector("#extensionEnabled");
const siteToggle = document.querySelector("#siteEnabled");
const siteToggleRow = document.querySelector("#siteToggleRow");
const siteDescription = document.querySelector("#siteDescription");
const siteUnavailable = document.querySelector("#siteUnavailable");
const saveSettingsButton = document.querySelector("#saveSettings");
const resetSitePreferencesButton = document.querySelector("#resetSitePreferences");
const recordingDurationInput = document.querySelector("#recordingDurationSeconds");
const transcriptionLanguageSelect = document.querySelector("#transcriptionLanguage");
const manageShortcutButton = document.querySelector("#manageShortcut");
const shortcutValue = document.querySelector("#shortcutValue");
const statusText = document.querySelector("#status");
let currentSiteOrigin = null;

function setStatus(message, tone = "neutral") {
  statusText.textContent = message;
  statusText.dataset.tone = tone;
}

function normalizeRecordingDurationSeconds(value) {
  const duration = Number(value);

  if (!Number.isFinite(duration)) {
    return DEFAULT_RECORDING_DURATION_SECONDS;
  }

  return Math.min(
    MAX_RECORDING_DURATION_SECONDS,
    Math.max(MIN_RECORDING_DURATION_SECONDS, Math.round(duration)),
  );
}

function populateLanguageOptions() {
  const options = document.createDocumentFragment();

  for (const { code, label } of TRANSCRIPTION_LANGUAGES) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = label;
    options.append(option);
  }

  transcriptionLanguageSelect.replaceChildren(options);
}

function updateSiteDescription() {
  if (!currentSiteOrigin) {
    return;
  }

  const siteLabel = new URL(currentSiteOrigin).host;
  if (!enabledToggle.checked) {
    siteDescription.textContent = `${siteLabel} - Master control is off.`;
    return;
  }

  siteDescription.textContent = siteToggle.checked
    ? `${siteLabel} - Stored only when disabled.`
    : `${siteLabel} - Disabled locally.`;
}

function showSiteUnavailable() {
  currentSiteOrigin = null;
  siteToggleRow.hidden = true;
  siteUnavailable.textContent = "Current-site control is unavailable on this page.";
  siteUnavailable.hidden = false;
}

async function getCurrentSiteContext() {
  const tabs = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  const tabId = tabs[0]?.id;

  if (!Number.isInteger(tabId)) {
    return null;
  }

  const response = await chrome.tabs.sendMessage(tabId, {
    type: GET_SITE_CONTEXT_MESSAGE,
  });
  const origin = response?.ok ? normalizeOrigin(response.origin) : null;

  return origin ? { origin } : null;
}

async function loadCurrentSite() {
  try {
    const context = await getCurrentSiteContext();

    if (!context) {
      showSiteUnavailable();
      return;
    }

    const stored = await chrome.storage.local.get({
      [DISABLED_ORIGINS_STORAGE_KEY]: [],
    });
    const disabledOrigins = normalizeDisabledOrigins(stored[DISABLED_ORIGINS_STORAGE_KEY]);

    currentSiteOrigin = context.origin;
    siteToggle.checked = !disabledOrigins.includes(currentSiteOrigin);
    siteToggleRow.hidden = false;
    siteUnavailable.hidden = true;
    updateSiteDescription();
  } catch (_error) {
    showSiteUnavailable();
  }
}

async function storeDisabledOrigins(origins) {
  if (origins.length === 0) {
    await chrome.storage.local.remove(DISABLED_ORIGINS_STORAGE_KEY);
    return;
  }

  await chrome.storage.local.set({
    [DISABLED_ORIGINS_STORAGE_KEY]: origins,
  });
}

function getExtensionCommands() {
  return new Promise((resolve, reject) => {
    try {
      chrome.commands.getAll((commands) => {
        if (chrome.runtime.lastError) {
          reject(new Error("Could not read extension shortcuts."));
          return;
        }

        resolve(Array.isArray(commands) ? commands : []);
      });
    } catch (_error) {
      reject(new Error("Could not read extension shortcuts."));
    }
  });
}

async function loadShortcut() {
  try {
    const commands = await getExtensionCommands();
    const command = commands.find(({ name }) => name === TOGGLE_DICTATION_COMMAND);
    const assignedShortcut = typeof command?.shortcut === "string" ? command.shortcut.trim() : "";

    shortcutValue.textContent = assignedShortcut || "Not assigned";
    shortcutValue.dataset.assigned = String(Boolean(assignedShortcut));
  } catch (_error) {
    shortcutValue.textContent = "Not assigned";
    shortcutValue.dataset.assigned = "false";
  }
}

async function openShortcutSettings() {
  manageShortcutButton.disabled = true;

  try {
    await chrome.tabs.create({
      url: SHORTCUT_SETTINGS_URL,
    });
  } catch (_error) {
    setStatus("Unable to open Chrome shortcut settings.", "error");
  } finally {
    manageShortcutButton.disabled = false;
  }
}

async function loadSettings() {
  const settings = await chrome.storage.local.get({
    extensionEnabled: DEFAULT_EXTENSION_ENABLED,
    recordingDurationMs: DEFAULT_RECORDING_DURATION_SECONDS * 1000,
    transcriptionLanguage: DEFAULT_TRANSCRIPTION_LANGUAGE,
  });

  enabledToggle.checked = settings.extensionEnabled !== false;
  recordingDurationInput.value = String(normalizeRecordingDurationSeconds(settings.recordingDurationMs / 1000));
  transcriptionLanguageSelect.value = normalizeTranscriptionLanguage(settings.transcriptionLanguage);
  updateSiteDescription();
  setStatus(enabledToggle.checked ? "Ready." : "Dictozy is off.", enabledToggle.checked ? "success" : "warning");
}

async function saveSettings() {
  const recordingDurationSeconds = normalizeRecordingDurationSeconds(recordingDurationInput.value);
  const transcriptionLanguage = normalizeTranscriptionLanguage(transcriptionLanguageSelect.value);

  await chrome.storage.local.set({
    extensionEnabled: enabledToggle.checked,
    recordingDurationMs: recordingDurationSeconds * 1000,
    transcriptionLanguage,
  });

  recordingDurationInput.value = String(recordingDurationSeconds);
  transcriptionLanguageSelect.value = transcriptionLanguage;
  setStatus(enabledToggle.checked ? "Settings saved." : "Dictozy is off.", enabledToggle.checked ? "success" : "warning");
}

async function toggleEnabled() {
  await chrome.storage.local.set({
    extensionEnabled: enabledToggle.checked,
  });
  updateSiteDescription();
  setStatus(enabledToggle.checked ? "Dictozy is on." : "Dictozy is off.", enabledToggle.checked ? "success" : "warning");
}

async function toggleSiteEnabled() {
  if (!currentSiteOrigin) {
    showSiteUnavailable();
    return;
  }

  siteToggle.disabled = true;

  try {
    const stored = await chrome.storage.local.get({
      [DISABLED_ORIGINS_STORAGE_KEY]: [],
    });
    const update = setOriginEnabled(
      stored[DISABLED_ORIGINS_STORAGE_KEY],
      currentSiteOrigin,
      siteToggle.checked,
    );

    if (update.limitReached) {
      siteToggle.checked = true;
      updateSiteDescription();
      setStatus("Site preference limit reached. Reset saved site preferences and try again.", "error");
      return;
    }

    await storeDisabledOrigins(update.origins);
    updateSiteDescription();
    setStatus(siteToggle.checked ? "Dictozy is enabled on this site." : "Dictozy is disabled on this site.", siteToggle.checked ? "success" : "warning");
  } catch (_error) {
    siteToggle.checked = !siteToggle.checked;
    updateSiteDescription();
    setStatus("Could not update this site preference.", "error");
  } finally {
    siteToggle.disabled = false;
  }
}

async function resetSitePreferences() {
  resetSitePreferencesButton.disabled = true;

  try {
    await chrome.storage.local.remove(DISABLED_ORIGINS_STORAGE_KEY);

    if (currentSiteOrigin) {
      siteToggle.checked = true;
      updateSiteDescription();
    }

    setStatus("Site preferences reset.", "success");
  } catch (_error) {
    setStatus("Could not reset site preferences.", "error");
  } finally {
    resetSitePreferencesButton.disabled = false;
  }
}

enabledToggle.addEventListener("change", toggleEnabled);
siteToggle.addEventListener("change", toggleSiteEnabled);
manageShortcutButton.addEventListener("click", openShortcutSettings);
saveSettingsButton.addEventListener("click", saveSettings);
resetSitePreferencesButton.addEventListener("click", resetSitePreferences);
populateLanguageOptions();
loadSettings();
loadShortcut();
loadCurrentSite();
