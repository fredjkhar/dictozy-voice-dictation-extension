const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const extensionDir = path.join(__dirname, "..");
const EXTENSION_ID = "test-extension-id";
const TRANSCRIBE_MESSAGE = "VOICE_DICTATION_TRANSCRIBE_AUDIO";
const CANCEL_MESSAGE = "VOICE_DICTATION_CANCEL_TRANSCRIPTION";
const TOGGLE_COMMAND = "toggle-dictation";
const TOGGLE_MESSAGE = "VOICE_DICTATION_TOGGLE";
const AUDIO_DATA_URL = "data:audio/webm;base64,YXVkaW8=";
const TRANSCRIPTION_ENDPOINT = "https://voice-dictation-extension.onrender.com/api/transcribe";

function createBackground({
  fetchImpl = async () => {
    throw new Error("Unexpected fetch");
  },
  online = true,
  storageValues = {},
  tabMessageError = null,
  tabs = [],
  useFakeTimers = false,
} = {}) {
  let commandListener = null;
  let installedListener = null;
  let messageListener = null;
  let nextTimerId = 1;
  const fetchCalls = [];
  const removedStorageKeys = [];
  const tabMessageCalls = [];
  const tabQueries = [];
  const timers = new Map();
  const sandbox = {
    AbortController,
    Blob,
    FormData,
    Headers,
    navigator: { onLine: online },
    Promise,
    Response,
    Uint8Array,
    atob,
    chrome: {
      commands: {
        onCommand: {
          addListener(listener) {
            commandListener = listener;
          },
        },
      },
      runtime: {
        id: EXTENSION_ID,
        onInstalled: {
          addListener(listener) {
            installedListener = listener;
          },
        },
        onMessage: {
          addListener(listener) {
            messageListener = listener;
          },
        },
      },
      storage: {
        local: {
          get: async (defaults) => ({
            ...defaults,
            ...storageValues,
          }),
          async remove(key) {
            removedStorageKeys.push(key);
            delete storageValues[key];
          },
        },
      },
      tabs: {
        async query(queryInfo) {
          tabQueries.push(queryInfo);
          return tabs;
        },
        async sendMessage(tabId, message) {
          tabMessageCalls.push({ message, tabId });

          if (tabMessageError) {
            throw tabMessageError;
          }

          return { ok: true };
        },
      },
    },
    clearTimeout(timerId) {
      if (useFakeTimers) {
        timers.delete(timerId);
      } else {
        clearTimeout(timerId);
      }
    },
    fetch(url, options) {
      fetchCalls.push({ options, url });
      return fetchImpl(url, options);
    },
    setTimeout(callback, delay) {
      if (!useFakeTimers) {
        return setTimeout(callback, delay);
      }

      const timerId = nextTimerId;
      nextTimerId += 1;
      timers.set(timerId, { callback, delay });
      return timerId;
    },
  };
  const context = vm.createContext(sandbox);
  sandbox.globalThis = sandbox;
  sandbox.importScripts = (...names) => {
    for (const name of names) {
      const source = fs.readFileSync(path.join(extensionDir, name), "utf8");
      vm.runInContext(source, context, { filename: name });
    }
  };

  const source = fs.readFileSync(path.join(extensionDir, "background.js"), "utf8");
  vm.runInContext(source, context, { filename: "background.js" });

  function dispatch(message, sender = { id: EXTENSION_ID }) {
    return new Promise((resolve) => {
      let responded = false;
      const keepChannelOpen = messageListener(message, sender, (response) => {
        responded = true;
        resolve(response);
      });

      if (!responded && keepChannelOpen !== true) {
        resolve(undefined);
      }
    });
  }

  async function dispatchCommand(command) {
    commandListener(command);
    await new Promise((resolve) => setImmediate(resolve));
  }

  async function dispatchInstalled(details = { reason: "update" }) {
    installedListener(details);
    await Promise.resolve();
  }

  function runTimer(delay) {
    const timerEntry = [...timers.entries()].find(([, timer]) => timer.delay === delay);
    assert.ok(timerEntry, `Expected a ${delay}ms timer`);
    timers.delete(timerEntry[0]);
    timerEntry[1].callback();
  }

  return {
    dispatch,
    dispatchCommand,
    dispatchInstalled,
    fetchCalls,
    removedStorageKeys,
    runTimer,
    storageValues,
    tabMessageCalls,
    tabQueries,
  };
}

test("background routes the toggle command to only the active tab ID", async () => {
  const background = createBackground({
    tabs: [{ id: 42, title: "Must not be read", url: "https://private.example" }],
  });

  await background.dispatchCommand(TOGGLE_COMMAND);

  assert.equal(background.tabQueries.length, 1);
  assert.equal(background.tabQueries[0].active, true);
  assert.equal(background.tabQueries[0].lastFocusedWindow, true);
  assert.equal(background.tabMessageCalls.length, 1);
  assert.equal(background.tabMessageCalls[0].tabId, 42);
  assert.equal(background.tabMessageCalls[0].message.type, TOGGLE_MESSAGE);
});

test("background safely ignores missing, restricted, and unrelated command targets", async () => {
  const missingTab = createBackground();
  await missingTab.dispatchCommand(TOGGLE_COMMAND);
  assert.equal(missingTab.tabMessageCalls.length, 0);

  const restrictedTab = createBackground({
    tabMessageError: new Error("Receiving end does not exist"),
    tabs: [{ id: 7 }],
  });
  await restrictedTab.dispatchCommand(TOGGLE_COMMAND);
  assert.equal(restrictedTab.tabMessageCalls.length, 1);

  const unrelatedCommand = createBackground({ tabs: [{ id: 9 }] });
  await unrelatedCommand.dispatchCommand("unrelated-command");
  assert.equal(unrelatedCommand.tabQueries.length, 0);
  assert.equal(unrelatedCommand.tabMessageCalls.length, 0);
});

test("background pins the endpoint and sends and returns the request ID header", async () => {
  let receivedHeaders = null;
  let receivedLanguage = null;
  let multipartFields = [];
  const storageValues = {
    backendUrl: "http://localhost:9000/api/transcribe",
  };
  const background = createBackground({
    fetchImpl: async (_url, options) => {
      receivedHeaders = options.headers;
      receivedLanguage = options.body.get("language");
      multipartFields = [...options.body.keys()];
      return new Response(JSON.stringify({ transcript: "Hello from Dictozy" }), {
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": "server-request-1234",
        },
        status: 200,
      });
    },
    storageValues,
  });

  const result = await background.dispatch({
    audioDataUrl: AUDIO_DATA_URL,
    requestId: "client-request-1234",
    type: TRANSCRIBE_MESSAGE,
  });

  assert.equal(background.fetchCalls[0].url, TRANSCRIPTION_ENDPOINT);
  assert.equal(receivedHeaders["X-Request-ID"], "client-request-1234");
  assert.equal(receivedLanguage, "en");
  assert.deepEqual(multipartFields, ["language", "file"]);
  assert.equal(result.ok, true);
  assert.equal(result.requestId, "server-request-1234");
  assert.equal(result.transcript, "Hello from Dictozy");
});

test("background sends explicit and automatic language values only to the backend", async () => {
  async function getSubmittedLanguage(transcriptionLanguage) {
    let submittedLanguage = null;
    const background = createBackground({
      fetchImpl: async (_url, options) => {
        submittedLanguage = options.body.get("language");
        return new Response(JSON.stringify({ transcript: "Language transcript" }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
      storageValues: { transcriptionLanguage },
    });

    const result = await background.dispatch({
      audioDataUrl: AUDIO_DATA_URL,
      requestId: `language-${transcriptionLanguage}-1234`,
      type: TRANSCRIBE_MESSAGE,
    });

    assert.equal(result.ok, true);
    return submittedLanguage;
  }

  assert.equal(await getSubmittedLanguage("fr"), "fr");
  assert.equal(await getSubmittedLanguage("auto"), "auto");
  assert.equal(await getSubmittedLanguage("unsupported"), "en");
});

test("provider failures remain safe and do not expose upstream details", async () => {
  const background = createBackground({
    fetchImpl: async () => new Response(JSON.stringify({ detail: "private provider response body" }), {
      headers: { "Content-Type": "application/json" },
      status: 502,
    }),
  });

  const result = await background.dispatch({
    audioDataUrl: AUDIO_DATA_URL,
    requestId: "provider-error-1234",
    type: TRANSCRIBE_MESSAGE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "provider_failure");
  assert.equal(result.message, "Speech-to-text is temporarily unavailable. Please record again.");
  assert.equal(JSON.stringify(result).includes("private provider response body"), false);
});

test("maps overload and temporary service failures to actionable safe responses", async () => {
  const cases = [
    {
      errorCode: "rate_limited",
      message: "Dictozy is busy right now. Wait a moment and record again.",
      status: 429,
    },
    {
      errorCode: "provider_failure",
      message: "Speech-to-text is temporarily unavailable. Please record again.",
      status: 502,
    },
    {
      errorCode: "service_unavailable",
      message: "Dictation is temporarily unavailable. Please try again later.",
      status: 503,
    },
  ];

  for (const expected of cases) {
    const background = createBackground({
      fetchImpl: async () => new Response(JSON.stringify({ detail: "private upstream detail" }), {
        headers: { "Content-Type": "application/json" },
        status: expected.status,
      }),
    });
    const result = await background.dispatch({
      audioDataUrl: AUDIO_DATA_URL,
      requestId: `status-${expected.status}-request`,
      type: TRANSCRIBE_MESSAGE,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, expected.errorCode);
    assert.equal(result.message, expected.message);
    assert.equal(JSON.stringify(result).includes("private upstream detail"), false);
  }
});

test("unknown backend details remain generic", async () => {
  const background = createBackground({
    fetchImpl: async () => new Response(JSON.stringify({ detail: "private validation detail" }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    }),
  });

  const result = await background.dispatch({
    audioDataUrl: AUDIO_DATA_URL,
    requestId: "bad-request-1234",
    type: TRANSCRIBE_MESSAGE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "invalid_audio");
  assert.equal(result.message, "Recorded audio could not be processed.");
  assert.equal(JSON.stringify(result).includes("private validation detail"), false);
});

test("distinguishes clearly offline requests from other network failures", async () => {
  const offlineBackground = createBackground({
    fetchImpl: async () => {
      throw new TypeError("private offline detail");
    },
    online: false,
  });
  const offlineResult = await offlineBackground.dispatch({
    audioDataUrl: AUDIO_DATA_URL,
    requestId: "offline-request-1234",
    type: TRANSCRIBE_MESSAGE,
  });

  assert.equal(offlineResult.errorCode, "offline");
  assert.equal(offlineResult.message, "You appear to be offline. Reconnect and record again.");
  assert.equal(JSON.stringify(offlineResult).includes("private offline detail"), false);

  const networkBackground = createBackground({
    fetchImpl: async () => {
      throw new TypeError("private network detail");
    },
  });
  const networkResult = await networkBackground.dispatch({
    audioDataUrl: AUDIO_DATA_URL,
    requestId: "network-request-1234",
    type: TRANSCRIBE_MESSAGE,
  });

  assert.equal(networkResult.errorCode, "network_unavailable");
  assert.equal(
    networkResult.message,
    "Dictozy could not reach the transcription service. Check your connection and try again.",
  );
  assert.equal(JSON.stringify(networkResult).includes("private network detail"), false);
});

test("treats missing and malformed successful responses as invalid responses", async () => {
  const responses = [
    null,
    new Response("not-json", { status: 200 }),
    new Response(JSON.stringify({ duration: 1, text: "" }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }),
    new Response(JSON.stringify({ transcript: "   " }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    }),
  ];

  for (const [index, response] of responses.entries()) {
    const background = createBackground({ fetchImpl: async () => response });
    const result = await background.dispatch({
      audioDataUrl: AUDIO_DATA_URL,
      requestId: `invalid-response-${index}-1234`,
      type: TRANSCRIBE_MESSAGE,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "invalid_response");
    assert.equal(result.message, "Dictozy received an invalid transcription response. Please record again.");
    assert.equal(result.requestId, `invalid-response-${index}-1234`);
  }
});

test("background cancellation aborts the active request", async () => {
  const background = createBackground({
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      const rejectAsAborted = () => reject(new DOMException("Aborted", "AbortError"));

      if (options.signal.aborted) {
        rejectAsAborted();
        return;
      }

      options.signal.addEventListener("abort", rejectAsAborted, { once: true });
    }),
  });
  const pendingResult = background.dispatch({
    audioDataUrl: AUDIO_DATA_URL,
    requestId: "cancel-request-1234",
    type: TRANSCRIBE_MESSAGE,
  });
  const cancellation = await background.dispatch({
    requestId: "cancel-request-1234",
    type: CANCEL_MESSAGE,
  });

  assert.equal(cancellation.ok, true);
  assert.equal(cancellation.canceled, true);

  const result = await pendingResult;
  assert.equal(result.ok, false);
  assert.equal(result.canceled, true);
  assert.equal(result.errorCode, "canceled");
  assert.equal(result.message, "Transcription cancelled.");
  assert.equal(result.requestId, "cancel-request-1234");
});

test("background timeout aborts and safely recovers", async () => {
  const background = createBackground({
    fetchImpl: async (_url, options) => new Promise((_resolve, reject) => {
      const rejectAsAborted = () => reject(new DOMException("Aborted", "AbortError"));

      if (options.signal.aborted) {
        rejectAsAborted();
        return;
      }

      options.signal.addEventListener("abort", rejectAsAborted, { once: true });
    }),
    useFakeTimers: true,
  });
  const pendingResult = background.dispatch({
    audioDataUrl: AUDIO_DATA_URL,
    requestId: "timeout-request-1234",
    type: TRANSCRIBE_MESSAGE,
  });

  await Promise.resolve();
  background.runTimer(45000);

  const result = await pendingResult;
  assert.equal(result.ok, false);
  assert.equal(result.canceled, false);
  assert.equal(result.errorCode, "timeout");
  assert.equal(result.message, "Transcription took too long. Check your connection and record again.");
  assert.equal(result.requestId, "timeout-request-1234");
});

test("messages cannot override the endpoint", async () => {
  const background = createBackground();
  const result = await background.dispatch({
    audioDataUrl: AUDIO_DATA_URL,
    backendUrl: "https://example.com/api/transcribe",
    requestId: "override-request-1234",
    type: TRANSCRIBE_MESSAGE,
  });

  assert.equal(result.ok, false);
  assert.equal(result.message, "Invalid transcription request.");
  assert.equal(background.fetchCalls.length, 0);
});

test("malformed, untrusted, and unknown messages are rejected safely", async () => {
  const background = createBackground();
  const malformedResult = await background.dispatch({
    requestId: "short",
    type: CANCEL_MESSAGE,
  });
  const untrustedResult = await background.dispatch(
    {
      audioDataUrl: AUDIO_DATA_URL,
      requestId: "untrusted-request-1234",
      type: TRANSCRIBE_MESSAGE,
    },
    { id: "another-extension" },
  );
  const unknownResult = await background.dispatch({ type: "UNKNOWN_MESSAGE" });

  assert.equal(malformedResult.ok, false);
  assert.equal(malformedResult.canceled, false);
  assert.equal(untrustedResult, undefined);
  assert.equal(unknownResult, undefined);
  assert.equal(background.fetchCalls.length, 0);
});

test("extension updates remove the obsolete backend URL setting", async () => {
  const storageValues = { backendUrl: "http://localhost:9000/api/transcribe" };
  const background = createBackground({ storageValues });

  await background.dispatchInstalled();

  assert.deepEqual(background.removedStorageKeys, ["backendUrl"]);
  assert.equal(Object.hasOwn(background.storageValues, "backendUrl"), false);
});
