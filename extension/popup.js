const TEST_BACKEND_MESSAGE = "VOICE_DICTATION_TEST_BACKEND";
const DEFAULT_EXTENSION_ENABLED = true;
const DEFAULT_RECORDING_DURATION_SECONDS = 10;
const MIN_RECORDING_DURATION_SECONDS = 1;
const MAX_RECORDING_DURATION_SECONDS = 30;
const { DEFAULT_BACKEND_URL, validateBackendUrl } = globalThis.VoiceDictationConfig;

const enabledToggle = document.querySelector("#extensionEnabled");
const saveSettingsButton = document.querySelector("#saveSettings");
const testBackendButton = document.querySelector("#testBackend");
const backendUrlInput = document.querySelector("#backendUrl");
const recordingDurationInput = document.querySelector("#recordingDurationSeconds");
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

async function loadSettings() {
  const settings = await chrome.storage.local.get({
    backendUrl: DEFAULT_BACKEND_URL,
    extensionEnabled: DEFAULT_EXTENSION_ENABLED,
    recordingDurationMs: DEFAULT_RECORDING_DURATION_SECONDS * 1000,
  });

  const backendUrl = validateBackendUrl(settings.backendUrl);

  enabledToggle.checked = settings.extensionEnabled !== false;
  backendUrlInput.value = backendUrl.ok ? backendUrl.url : DEFAULT_BACKEND_URL;
  recordingDurationInput.value = String(normalizeRecordingDurationSeconds(settings.recordingDurationMs / 1000));
  setStatus(enabledToggle.checked ? "Ready." : "FieldMic is off.", enabledToggle.checked ? "success" : "warning");
}

async function saveSettings() {
  const backendUrl = validateBackendUrl(backendUrlInput.value.trim());

  if (!backendUrl.ok) {
    setStatus(backendUrl.message, "error");
    backendUrlInput.focus();
    return;
  }

  const recordingDurationSeconds = normalizeRecordingDurationSeconds(recordingDurationInput.value);

  await chrome.storage.local.set({
    backendUrl: backendUrl.url,
    extensionEnabled: enabledToggle.checked,
    recordingDurationMs: recordingDurationSeconds * 1000,
  });

  backendUrlInput.value = backendUrl.url;
  recordingDurationInput.value = String(recordingDurationSeconds);
  setStatus(enabledToggle.checked ? "Settings saved." : "FieldMic is off.", enabledToggle.checked ? "success" : "warning");
}

async function toggleEnabled() {
  await chrome.storage.local.set({
    extensionEnabled: enabledToggle.checked,
  });
  setStatus(enabledToggle.checked ? "FieldMic is on." : "FieldMic is off.", enabledToggle.checked ? "success" : "warning");
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
saveSettingsButton.addEventListener("click", saveSettings);
testBackendButton.addEventListener("click", testBackend);
loadSettings();
