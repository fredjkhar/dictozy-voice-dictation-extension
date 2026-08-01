const TEST_BACKEND_MESSAGE = "VOICE_DICTATION_TEST_BACKEND";
const TOGGLE_DICTATION_COMMAND = "toggle-dictation";
const SHORTCUT_SETTINGS_URL = "chrome://extensions/shortcuts";
const DEFAULT_EXTENSION_ENABLED = true;
const DEFAULT_RECORDING_DURATION_SECONDS = 10;
const MIN_RECORDING_DURATION_SECONDS = 1;
const MAX_RECORDING_DURATION_SECONDS = 30;
const {
  DEFAULT_BACKEND_URL,
  DEFAULT_TRANSCRIPTION_LANGUAGE,
  TRANSCRIPTION_LANGUAGES,
  normalizeTranscriptionLanguage,
  validateBackendUrl,
} = globalThis.VoiceDictationConfig;

const enabledToggle = document.querySelector("#extensionEnabled");
const saveSettingsButton = document.querySelector("#saveSettings");
const testBackendButton = document.querySelector("#testBackend");
const backendUrlInput = document.querySelector("#backendUrl");
const recordingDurationInput = document.querySelector("#recordingDurationSeconds");
const transcriptionLanguageSelect = document.querySelector("#transcriptionLanguage");
const manageShortcutButton = document.querySelector("#manageShortcut");
const shortcutValue = document.querySelector("#shortcutValue");
const statusText = document.querySelector("#status");

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
    backendUrl: DEFAULT_BACKEND_URL,
    extensionEnabled: DEFAULT_EXTENSION_ENABLED,
    recordingDurationMs: DEFAULT_RECORDING_DURATION_SECONDS * 1000,
    transcriptionLanguage: DEFAULT_TRANSCRIPTION_LANGUAGE,
  });

  const backendUrl = validateBackendUrl(settings.backendUrl);

  enabledToggle.checked = settings.extensionEnabled !== false;
  backendUrlInput.value = backendUrl.ok ? backendUrl.url : DEFAULT_BACKEND_URL;
  recordingDurationInput.value = String(normalizeRecordingDurationSeconds(settings.recordingDurationMs / 1000));
  transcriptionLanguageSelect.value = normalizeTranscriptionLanguage(settings.transcriptionLanguage);
  setStatus(enabledToggle.checked ? "Ready." : "Dictozy is off.", enabledToggle.checked ? "success" : "warning");
}

async function saveSettings() {
  const backendUrl = validateBackendUrl(backendUrlInput.value.trim());

  if (!backendUrl.ok) {
    setStatus(backendUrl.message, "error");
    backendUrlInput.focus();
    return;
  }

  const recordingDurationSeconds = normalizeRecordingDurationSeconds(recordingDurationInput.value);
  const transcriptionLanguage = normalizeTranscriptionLanguage(transcriptionLanguageSelect.value);

  await chrome.storage.local.set({
    backendUrl: backendUrl.url,
    extensionEnabled: enabledToggle.checked,
    recordingDurationMs: recordingDurationSeconds * 1000,
    transcriptionLanguage,
  });

  backendUrlInput.value = backendUrl.url;
  recordingDurationInput.value = String(recordingDurationSeconds);
  transcriptionLanguageSelect.value = transcriptionLanguage;
  setStatus(enabledToggle.checked ? "Settings saved." : "Dictozy is off.", enabledToggle.checked ? "success" : "warning");
}

async function toggleEnabled() {
  await chrome.storage.local.set({
    extensionEnabled: enabledToggle.checked,
  });
  setStatus(enabledToggle.checked ? "Dictozy is on." : "Dictozy is off.", enabledToggle.checked ? "success" : "warning");
}

async function testBackend() {
  const backendUrl = validateBackendUrl(backendUrlInput.value.trim());

  if (!backendUrl.ok) {
    setStatus(backendUrl.message, "error");
    backendUrlInput.focus();
    return;
  }

  testBackendButton.disabled = true;
  setStatus("Checking backend...");

  try {
    const response = await chrome.runtime.sendMessage({
      type: TEST_BACKEND_MESSAGE,
      backendUrl: backendUrl.url,
    });

    setStatus(response?.message || "Backend check failed.", response?.ok ? "success" : "error");
  } catch (_error) {
    setStatus("Unable to check the backend.", "error");
  } finally {
    testBackendButton.disabled = false;
  }
}

enabledToggle.addEventListener("change", toggleEnabled);
manageShortcutButton.addEventListener("click", openShortcutSettings);
saveSettingsButton.addEventListener("click", saveSettings);
testBackendButton.addEventListener("click", testBackend);
populateLanguageOptions();
loadSettings();
loadShortcut();
