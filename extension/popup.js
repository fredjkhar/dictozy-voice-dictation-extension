const INSERT_FAKE_TEXT_MESSAGE = "VOICE_DICTATION_INSERT_FAKE_TEXT";
const FAKE_TRANSCRIPT = "This is fake dictation text.";
const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000/api/transcribe";
const DEFAULT_RECORDING_DURATION_SECONDS = 5;
const MIN_RECORDING_DURATION_SECONDS = 1;
const MAX_RECORDING_DURATION_SECONDS = 30;

const insertButton = document.querySelector("#insertFakeText");
const saveSettingsButton = document.querySelector("#saveSettings");
const backendUrlInput = document.querySelector("#backendUrl");
const recordingDurationInput = document.querySelector("#recordingDurationSeconds");
const statusText = document.querySelector("#status");

function setStatus(message) {
  statusText.textContent = message;
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function normalizeBackendUrl(value) {
  try {
    const url = new URL(value || DEFAULT_BACKEND_URL);
    const isLocalHttp = url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
    const isHttps = url.protocol === "https:";
    const isXaiHost = url.hostname === "x.ai" || url.hostname.endsWith(".x.ai");

    if ((!isLocalHttp && !isHttps) || isXaiHost) {
      return DEFAULT_BACKEND_URL;
    }

    return url.toString();
  } catch (_error) {
    return DEFAULT_BACKEND_URL;
  }
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
    recordingDurationMs: DEFAULT_RECORDING_DURATION_SECONDS * 1000,
  });

  backendUrlInput.value = normalizeBackendUrl(settings.backendUrl);
  recordingDurationInput.value = String(normalizeRecordingDurationSeconds(settings.recordingDurationMs / 1000));
}

async function saveSettings() {
  const backendUrl = normalizeBackendUrl(backendUrlInput.value);
  const recordingDurationSeconds = normalizeRecordingDurationSeconds(recordingDurationInput.value);

  await chrome.storage.local.set({
    backendUrl,
    recordingDurationMs: recordingDurationSeconds * 1000,
  });

  backendUrlInput.value = backendUrl;
  recordingDurationInput.value = String(recordingDurationSeconds);
  setStatus("Settings saved.");
}

async function insertFakeText() {
  insertButton.disabled = true;
  setStatus("Checking active field...");

  try {
    const tab = await getActiveTab();

    if (!tab?.id) {
      setStatus("No active tab found.");
      insertButton.disabled = false;
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      {
        type: INSERT_FAKE_TEXT_MESSAGE,
        text: FAKE_TRANSCRIPT,
      },
      (response) => {
        insertButton.disabled = false;

        if (chrome.runtime.lastError) {
          setStatus("Open or reload a normal web page first.");
          return;
        }

        setStatus(response?.message || "Unable to insert test text.");
      },
    );
  } catch (_error) {
    insertButton.disabled = false;
    setStatus("Unable to reach the active tab.");
  }
}

insertButton.addEventListener("click", insertFakeText);
saveSettingsButton.addEventListener("click", saveSettings);
loadSettings();
