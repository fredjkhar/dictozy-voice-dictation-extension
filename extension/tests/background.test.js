const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const extensionDir = path.join(__dirname, "..");
const TRANSCRIBE_MESSAGE = "VOICE_DICTATION_TRANSCRIBE_AUDIO";
const CANCEL_MESSAGE = "VOICE_DICTATION_CANCEL_TRANSCRIPTION";
const TOGGLE_COMMAND = "toggle-dictation";
const TOGGLE_MESSAGE = "VOICE_DICTATION_TOGGLE";
const AUDIO_DATA_URL = "data:audio/webm;base64,YXVkaW8=";

function createBackground({
  fetchImpl = async () => {
    throw new Error("Unexpected fetch");
  },
  tabMessageError = null,
  tabs = [],
  useFakeTimers = false,
} = {}) {
  let commandListener = null;
  let messageListener = null;
  let nextTimerId = 1;
  const tabMessageCalls = [];
  const tabQueries = [];
  const timers = new Map();
  const sandbox = {
    AbortController,
    Blob,
    FormData,
    Headers,
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
        onMessage: {
          addListener(listener) {
            messageListener = listener;
          },
        },
      },
      storage: {
        local: {
          get: async (defaults) => defaults,
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
    fetch: fetchImpl,
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

  function dispatch(message) {
    return new Promise((resolve) => {
      messageListener(message, {}, resolve);
    });
  }

  async function dispatchCommand(command) {
    commandListener(command);
    await new Promise((resolve) => setImmediate(resolve));
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
    runTimer,
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

test("background sends and returns the request ID header", async () => {
  let receivedHeaders = null;
  const background = createBackground({
    fetchImpl: async (_url, options) => {
      receivedHeaders = options.headers;
      return new Response(JSON.stringify({ transcript: "Hello from Dictozy" }), {
        headers: {
          "Content-Type": "application/json",
          "X-Request-ID": "server-request-1234",
        },
        status: 200,
      });
    },
  });

  const result = await background.dispatch({
    audioDataUrl: AUDIO_DATA_URL,
    requestId: "client-request-1234",
    type: TRANSCRIBE_MESSAGE,
  });

  assert.equal(receivedHeaders["X-Request-ID"], "client-request-1234");
  assert.equal(result.ok, true);
  assert.equal(result.requestId, "server-request-1234");
  assert.equal(result.transcript, "Hello from Dictozy");
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
  assert.equal(result.message, "Speech-to-text failed. Please try again.");
  assert.equal(JSON.stringify(result).includes("private provider response body"), false);
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
  assert.equal(result.message, "Backend transcription timed out.");
  assert.equal(result.requestId, "timeout-request-1234");
});
