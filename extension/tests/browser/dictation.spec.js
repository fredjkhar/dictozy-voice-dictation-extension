const { expect, test } = require("@playwright/test");

const MIC_BUTTON = ".voice-dictation-mic-button";
const STATUS_MESSAGE = ".voice-dictation-status__message";

async function installChromeMocks(page) {
  await page.addInitScript(() => {
    const DEFAULT_SHORTCUT = "Ctrl+Shift+Y";
    const SHORTCUT_KEY = "dictozy-playwright-shortcut";
    const STORAGE_KEY = "dictozy-playwright-storage";
    const runtimeListeners = [];
    const storageListeners = [];
    const pendingResponses = new Map();
    const pendingMicrophones = [];
    const defaultStorage = {
      backendUrl: "https://voice-dictation-extension.onrender.com/api/transcribe",
      extensionEnabled: true,
      recordingDurationMs: 10000,
      transcriptionLanguage: "en",
    };
    let responseQueue = [];

    function readStorage() {
      try {
        return {
          ...defaultStorage,
          ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"),
        };
      } catch (_error) {
        return { ...defaultStorage };
      }
    }

    async function setStorage(values) {
      const previous = readStorage();
      const next = { ...previous, ...values };
      const changes = {};

      for (const [key, value] of Object.entries(values)) {
        changes[key] = {
          newValue: value,
          oldValue: previous[key],
        };
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      for (const listener of storageListeners) {
        listener(changes, "local");
      }
    }

    function createMicrophoneStream() {
      const track = {
        muted: false,
        readyState: "live",
        stop() {
          if (this.readyState !== "ended") {
            this.readyState = "ended";
            testState.trackStops += 1;
          }
        },
      };

      return {
        getAudioTracks: () => [track],
        getTracks: () => [track],
      };
    }

    const testState = {
      cancellations: [],
      createdTabs: [],
      deferMicrophone: false,
      recordingStarts: 0,
      requests: [],
      trackStops: 0,
      dispatchRuntimeMessage(message) {
        return new Promise((resolve) => {
          for (const listener of runtimeListeners) {
            const keepChannelOpen = listener(message, {}, resolve);

            if (keepChannelOpen === true) {
              return;
            }
          }

          resolve(undefined);
        });
      },
      queueResponse(response, options = {}) {
        responseQueue.push({
          defer: options.defer === true,
          delay: options.delay || 0,
          response,
        });
      },
      resolveRequest(requestId, response) {
        const callback = pendingResponses.get(requestId);

        if (!callback) {
          throw new Error(`No pending request for ${requestId}`);
        }

        pendingResponses.delete(requestId);
        queueMicrotask(() => callback(response));
      },
      resolveMicrophone() {
        const resolve = pendingMicrophones.shift();

        if (!resolve) {
          throw new Error("No pending microphone request");
        }

        resolve(createMicrophoneStream());
      },
      setShortcut(shortcut) {
        localStorage.setItem(SHORTCUT_KEY, shortcut);
      },
      setStorage,
      shortcut() {
        const storedShortcut = localStorage.getItem(SHORTCUT_KEY);
        return storedShortcut === null ? DEFAULT_SHORTCUT : storedShortcut;
      },
      storage: readStorage,
    };
    window.__dictozyTest = testState;

    const runtime = {
      lastError: null,
      onMessage: {
        addListener(listener) {
          runtimeListeners.push(listener);
        },
      },
      sendMessage(message, callback) {
        if (message?.type === "VOICE_DICTATION_CANCEL_TRANSCRIPTION") {
          testState.cancellations.push(message.requestId);
          callback?.({ canceled: true, ok: true });
          return undefined;
        }

        if (message?.type === "VOICE_DICTATION_TRANSCRIBE_AUDIO") {
          testState.requests.push({
            audioDataUrl: message.audioDataUrl,
            requestId: message.requestId,
            transcriptionLanguage: readStorage().transcriptionLanguage,
          });
          const plan = responseQueue.shift() || {
            defer: false,
            delay: 0,
            response: { ok: true, transcript: "Default transcript" },
          };
          const response = {
            requestId: message.requestId,
            ...plan.response,
          };

          if (plan.defer) {
            pendingResponses.set(message.requestId, callback);
          } else {
            setTimeout(() => callback(response), plan.delay);
          }

          return undefined;
        }

        const response = { message: "Backend is reachable.", ok: true };
        if (callback) {
          callback(response);
          return undefined;
        }

        return Promise.resolve(response);
      },
    };

    window.chrome = {
      commands: {
        getAll(callback) {
          callback([
            {
              description: "Start, stop, or cancel Dictozy dictation",
              name: "toggle-dictation",
              shortcut: testState.shortcut(),
            },
          ]);
        },
      },
      runtime,
      storage: {
        local: {
          async get(defaults) {
            return { ...defaults, ...readStorage() };
          },
          set: setStorage,
        },
        onChanged: {
          addListener(listener) {
            storageListeners.push(listener);
          },
        },
      },
      tabs: {
        async create(createProperties) {
          testState.createdTabs.push(createProperties);
          return { id: testState.createdTabs.length };
        },
      },
    };

    class FakeMediaRecorder {
      static isTypeSupported(type) {
        return type.startsWith("audio/webm");
      }

      constructor(stream, options = {}) {
        this.listeners = new Map();
        this.mimeType = options.mimeType || "audio/webm";
        this.state = "inactive";
        this.stream = stream;
      }

      addEventListener(type, listener, options = {}) {
        const listeners = this.listeners.get(type) || [];
        listeners.push({ listener, once: options.once === true });
        this.listeners.set(type, listeners);
      }

      dispatch(type, event = {}) {
        const listeners = this.listeners.get(type) || [];
        this.listeners.set(type, listeners.filter(({ once }) => !once));
        for (const { listener } of listeners) {
          listener.call(this, event);
        }
      }

      start() {
        this.state = "recording";
        testState.recordingStarts += 1;
        this.recordingNumber = testState.recordingStarts;
      }

      stop() {
        if (this.state === "inactive") {
          return;
        }

        this.state = "inactive";
        queueMicrotask(() => {
          const data = new Blob([`recording-${this.recordingNumber}`], { type: this.mimeType });
          this.dispatch("dataavailable", { data });
          this.dispatch("stop");
        });
      }
    }

    window.MediaRecorder = FakeMediaRecorder;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia() {
          if (testState.deferMicrophone) {
            return new Promise((resolve) => {
              pendingMicrophones.push(resolve);
            });
          }

          return Promise.resolve(createMicrophoneStream());
        },
      },
    });

    try {
      Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined });
      Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: undefined });
    } catch (_error) {
      // The production helper falls back to an unknown signal result if the fake stream is unsupported.
    }
  });
}

async function loadContentScript(page, initialStorage = null) {
  await page.goto("/qa/manual-test-page.html");

  if (initialStorage) {
    await page.evaluate((values) => window.__dictozyTest.setStorage(values), initialStorage);
  }

  await page.addStyleTag({ url: "/extension/content.css" });
  await page.addScriptTag({ url: "/extension/dom-utils.js" });
  await page.addScriptTag({ url: "/extension/dictation-lifecycle.js" });
  await page.addScriptTag({ url: "/extension/content.js" });
}

async function focusFirstTextField(page) {
  const field = page.locator('input[type="text"]').first();
  await field.focus();
  await expect(page.locator(MIC_BUTTON)).toBeVisible();
  return field;
}

async function recordAndStop(page) {
  await page.locator(MIC_BUTTON).click();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
  await page.locator(MIC_BUTTON).click();
}

async function waitForRequestCount(page, count) {
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.requests.length)).toBe(count);
}

function invokeShortcut(page) {
  return page.evaluate(() => window.__dictozyTest.dispatchRuntimeMessage({
    type: "VOICE_DICTATION_TOGGLE",
  }));
}

test.beforeEach(async ({ page }) => {
  await installChromeMocks(page);
});

test("shows the control only for supported fields", async ({ page }) => {
  await loadContentScript(page);
  await focusFirstTextField(page);

  await page.locator('input[type="password"]').focus();
  await expect(page.locator(MIC_BUTTON)).toBeHidden();

  await page.locator('input[autocomplete="cc-number"]').focus();
  await expect(page.locator(MIC_BUTTON)).toBeHidden();

  await page.locator("textarea").focus();
  await expect(page.locator(MIC_BUTTON)).toBeVisible();
});

test("excludes common payment metadata without blocking safe near-misses", async ({ page }) => {
  await loadContentScript(page);
  await focusFirstTextField(page);

  const paymentSelectors = [
    'input[autocomplete="cc-number"]',
    'input[name="cardNumber"]',
    "#card_number",
    'input[name="creditCardNumber"]',
    "#paymentCard",
    'input[aria-label="cardholderName"]',
  ];

  for (const selector of paymentSelectors) {
    await page.locator(selector).focus();
    await expect(page.locator(MIC_BUTTON)).toBeHidden();
    const shortcutResult = await invokeShortcut(page);
    expect(shortcutResult.ok).toBe(false);
  }

  const safeNearMiss = page.locator('input[name="postcardMessage"]');
  await safeNearMiss.focus();
  await expect(page.locator(MIC_BUTTON)).toBeVisible();
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({ ok: true, transcript: "Postcard note" });
  });
  await recordAndStop(page);
  await expect(safeNearMiss).toHaveValue("Postcard note");
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.recordingStarts)).toBe(1);
});

test("supports editable ARIA textboxes and ignores bare role textboxes", async ({ page }) => {
  await loadContentScript(page);
  const editableAriaTextbox = page.locator('[role="textbox"][contenteditable="true"]');
  await editableAriaTextbox.focus();
  await expect(page.locator(MIC_BUTTON)).toBeVisible();
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({ ok: true, transcript: "ARIA transcript" });
  });
  await recordAndStop(page);
  await expect(editableAriaTextbox).toContainText("ARIA transcript");

  const bareAriaTextbox = page.locator('[role="textbox"]:not([contenteditable])');
  await bareAriaTextbox.focus();
  await expect(page.locator(MIC_BUTTON)).toBeHidden();
  const shortcutResult = await invokeShortcut(page);
  expect(shortcutResult.ok).toBe(false);
});

test("preserves insertion into nested contenteditable fields", async ({ page }) => {
  await loadContentScript(page);
  const nestedEditor = page.locator('div[contenteditable="true"]', {
    hasText: "Nested paragraph editor",
  });
  await nestedEditor.focus();
  await expect(page.locator(MIC_BUTTON)).toBeVisible();
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({ ok: true, transcript: "Nested transcript" });
  });
  await recordAndStop(page);
  await expect(nestedEditor).toContainText("Nested transcript");
});

test("records only after a click, stops, and inserts a successful transcript", async ({ page }) => {
  await loadContentScript(page);
  const field = await focusFirstTextField(page);

  await expect.poll(() => page.evaluate(() => window.__dictozyTest.recordingStarts)).toBe(0);
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({ ok: true, transcript: "Hello from the browser test" });
  });

  await recordAndStop(page);
  await expect(field).toHaveValue("Hello from the browser test");

  const request = await page.evaluate(() => window.__dictozyTest.requests[0]);
  expect(request.requestId).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
  expect(request.audioDataUrl).toMatch(/^data:audio\/webm(?:;[^,]+)?;base64,/);
  expect(request.transcriptionLanguage).toBe("en");
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.trackStops)).toBe(1);
});

test("shortcut starts, stops, and completes one recording", async ({ page }) => {
  await loadContentScript(page);
  const field = await focusFirstTextField(page);
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({ ok: true, transcript: "Shortcut transcript" });
  });

  const started = await invokeShortcut(page);
  expect(started.action).toBe("start-recording");
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");

  const stopped = await invokeShortcut(page);
  expect(stopped.action).toBe("stop-recording");
  await expect(field).toHaveValue("Shortcut transcript");
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.recordingStarts)).toBe(1);
  await waitForRequestCount(page, 1);
});

test("repeated shortcut events do not overlap recording work", async ({ page }) => {
  await loadContentScript(page);
  await focusFirstTextField(page);
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({ ok: true, transcript: "Single request" });
  });

  await invokeShortcut(page);
  const results = await page.evaluate(() => Promise.all([
    window.__dictozyTest.dispatchRuntimeMessage({ type: "VOICE_DICTATION_TOGGLE" }),
    window.__dictozyTest.dispatchRuntimeMessage({ type: "VOICE_DICTATION_TOGGLE" }),
  ]));

  expect(results[0].action).toBe("stop-recording");
  expect(results[1]).toEqual({
    action: "ignored",
    ok: false,
    state: "processing",
  });
  await waitForRequestCount(page, 1);
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.recordingStarts)).toBe(1);
});

test("shortcut cancels pending microphone access without starting a recording", async ({ page }) => {
  await loadContentScript(page);
  await focusFirstTextField(page);
  await page.evaluate(() => {
    window.__dictozyTest.deferMicrophone = true;
    window.__pendingShortcut = window.__dictozyTest.dispatchRuntimeMessage({
      type: "VOICE_DICTATION_TOGGLE",
    });
  });
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "requesting");

  const canceled = await invokeShortcut(page);
  expect(canceled.action).toBe("cancel-microphone");
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "idle");
  await page.evaluate(() => window.__dictozyTest.resolveMicrophone());
  await page.evaluate(() => window.__pendingShortcut);

  await expect.poll(() => page.evaluate(() => window.__dictozyTest.recordingStarts)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.trackStops)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);
});

test("shortcut cancels transcription and rejects a late response", async ({ page }) => {
  await loadContentScript(page);
  const field = await focusFirstTextField(page);
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({}, { defer: true });
  });

  await invokeShortcut(page);
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
  await invokeShortcut(page);
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "transcribing");
  await waitForRequestCount(page, 1);
  const requestId = await page.evaluate(() => window.__dictozyTest.requests[0].requestId);

  const canceled = await invokeShortcut(page);
  expect(canceled.action).toBe("cancel-transcription");
  await page.evaluate((id) => {
    window.__dictozyTest.resolveRequest(id, {
      ok: true,
      requestId: id,
      transcript: "Late shortcut result",
    });
  }, requestId);

  await expect(field).toHaveValue("");
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.cancellations.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.recordingStarts)).toBe(1);
});

test("shortcut ignores disabled, unsupported, and sensitive fields", async ({ page }) => {
  await loadContentScript(page);

  await page.locator("body").click({ position: { x: 2, y: 2 } });
  const unsupportedResult = await invokeShortcut(page);
  expect(unsupportedResult.ok).toBe(false);
  await expect(page.locator(MIC_BUTTON)).toHaveCount(0);

  await page.locator('input[type="password"]').focus();
  const sensitiveResult = await invokeShortcut(page);
  expect(sensitiveResult.ok).toBe(false);
  await expect(page.locator(MIC_BUTTON)).toHaveCount(0);

  await page.locator('input[type="text"]').first().focus();
  await page.evaluate(() => window.__dictozyTest.setStorage({ extensionEnabled: false }));
  const disabledResult = await invokeShortcut(page);
  expect(disabledResult.state).toBe("disabled");

  await expect.poll(() => page.evaluate(() => window.__dictozyTest.recordingStarts)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);
});

test("cancels transcription and ignores a late successful response", async ({ page }) => {
  await loadContentScript(page);
  const field = await focusFirstTextField(page);
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({}, { defer: true });
  });

  await recordAndStop(page);
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "transcribing");
  await waitForRequestCount(page, 1);
  const requestId = await page.evaluate(() => window.__dictozyTest.requests[0].requestId);

  await page.locator(MIC_BUTTON).click();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "idle");
  await page.evaluate((id) => {
    window.__dictozyTest.resolveRequest(id, {
      ok: true,
      requestId: id,
      transcript: "This late text must not be inserted",
    });
  }, requestId);

  await expect(field).toHaveValue("");
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.cancellations.length)).toBe(1);
});

test("keeps errors visible and retries with fresh audio and request identity", async ({ page }) => {
  await loadContentScript(page);
  const field = await focusFirstTextField(page);
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({
      message: "Speech-to-text failed. Please try again.",
      ok: false,
      requestId: "backend-error-1234",
    });
    window.__dictozyTest.queueResponse({ ok: true, transcript: "Retry succeeded" });
  });

  await recordAndStop(page);
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "error");
  await expect(page.locator(STATUS_MESSAGE)).toContainText("Reference: backende.");
  await expect(page.locator(STATUS_MESSAGE)).not.toContainText("backend-error-1234");
  await page.waitForTimeout(1600);
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "error");

  await page.locator(MIC_BUTTON).click();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
  await page.locator(MIC_BUTTON).click();
  await expect(field).toHaveValue("Retry succeeded");

  const requests = await page.evaluate(() => window.__dictozyTest.requests);
  expect(requests).toHaveLength(2);
  expect(requests[1].requestId).not.toBe(requests[0].requestId);
  expect(requests[1].audioDataUrl).not.toBe(requests[0].audioDataUrl);
});

test("recovers from a transcription timeout with an actionable reference", async ({ page }) => {
  await loadContentScript(page);
  await page.clock.install();
  await focusFirstTextField(page);
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({}, { defer: true });
  });

  await recordAndStop(page);
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "transcribing");
  await waitForRequestCount(page, 1);
  await page.clock.fastForward(55001);

  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "error");
  await expect(page.locator(STATUS_MESSAGE)).toContainText("Transcription timed out.");
  await expect(page.locator(STATUS_MESSAGE)).toContainText("Reference:");
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.cancellations.length)).toBe(1);
});

test("rejects clearly silent microphone input without uploading it", async ({ page }) => {
  await loadContentScript(page);
  await page.evaluate(() => {
    class SilentAudioContext {
      constructor() {
        this.state = "running";
      }

      createAnalyser() {
        return {
          disconnect() {},
          getFloatTimeDomainData(buffer) {
            buffer.fill(0);
          },
          set fftSize(_value) {},
        };
      }

      createMediaStreamSource() {
        return {
          connect() {},
          disconnect() {},
        };
      }

      async close() {
        this.state = "closed";
      }

      async resume() {}
    }

    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: SilentAudioContext,
    });
  });
  await focusFirstTextField(page);

  await page.locator(MIC_BUTTON).click();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
  await page.waitForTimeout(150);
  await page.locator(MIC_BUTTON).click();

  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "error");
  await expect(page.locator(STATUS_MESSAGE)).toContainText("No microphone signal was detected.");
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);
});

test("disabling Dictozy cancels recording and pending transcription", async ({ page }) => {
  await loadContentScript(page);
  const field = await focusFirstTextField(page);

  await page.locator(MIC_BUTTON).click();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
  await page.evaluate(() => window.__dictozyTest.setStorage({ extensionEnabled: false }));
  await expect(page.locator(MIC_BUTTON)).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.trackStops)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);

  await page.evaluate(() => window.__dictozyTest.setStorage({ extensionEnabled: true }));
  await expect(page.locator(MIC_BUTTON)).toBeVisible();
  await expect(page.locator(MIC_BUTTON)).toBeEnabled();
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({}, { defer: true });
  });
  await recordAndStop(page);
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "transcribing");
  await waitForRequestCount(page, 1);
  const requestId = await page.evaluate(() => window.__dictozyTest.requests[0].requestId);

  await page.evaluate(() => window.__dictozyTest.setStorage({ extensionEnabled: false }));
  await expect(page.locator(MIC_BUTTON)).toBeHidden();
  await page.evaluate((id) => {
    window.__dictozyTest.resolveRequest(id, {
      ok: true,
      requestId: id,
      transcript: "Disabled result",
    });
  }, requestId);
  await expect(field).toHaveValue("");
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.cancellations.includes(window.__dictozyTest.requests[0].requestId))).toBe(true);
});

test("does not insert when focus moves before a pending response", async ({ page }) => {
  await loadContentScript(page);
  const firstField = await focusFirstTextField(page);
  const secondField = page.locator('input[type="search"]');
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({}, { defer: true });
  });

  await recordAndStop(page);
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "transcribing");
  await waitForRequestCount(page, 1);
  const requestId = await page.evaluate(() => window.__dictozyTest.requests[0].requestId);
  await secondField.focus();
  await page.evaluate((id) => {
    window.__dictozyTest.resolveRequest(id, {
      ok: true,
      requestId: id,
      transcript: "Wrong field text",
    });
  }, requestId);

  await expect(firstField).toHaveValue("");
  await expect(secondField).toHaveValue("");
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "error");
  await expect(page.locator(STATUS_MESSAGE)).toContainText("Focus moved before insertion.");
});

test("popup settings persist after reload", async ({ page }) => {
  await page.goto("/extension/popup.html");
  await expect(page.locator("#status")).toHaveText("Ready.");

  await page.locator("summary").click();
  await page.locator("#extensionEnabled").uncheck();
  await page.locator("#backendUrl").fill("http://localhost:9000/api/transcribe");
  await page.locator("#recordingDurationSeconds").fill("14");
  await page.locator("#transcriptionLanguage").selectOption("fr");
  await page.locator("#saveSettings").click();
  await expect(page.locator("#status")).toHaveText("Dictozy is off.");

  await page.reload();
  await expect(page.locator("#extensionEnabled")).not.toBeChecked();
  await expect(page.locator("#backendUrl")).toHaveValue("http://localhost:9000/api/transcribe");
  await expect(page.locator("#recordingDurationSeconds")).toHaveValue("14");
  await expect(page.locator("#transcriptionLanguage")).toHaveValue("fr");
  await expect(page.locator("#status")).toHaveText("Dictozy is off.");
});

test("popup defaults to English and persists Automatic formatting", async ({ page }) => {
  await page.goto("/extension/popup.html");
  await expect(page.locator("#transcriptionLanguage")).toHaveValue("en");

  await page.locator("#transcriptionLanguage").selectOption("auto");
  await page.locator("#saveSettings").click();
  await page.reload();

  await expect(page.locator("#transcriptionLanguage")).toHaveValue("auto");
});

test("recording requests carry the selected backend language", async ({ page }) => {
  await loadContentScript(page, { transcriptionLanguage: "fr" });
  const field = await focusFirstTextField(page);

  await recordAndStop(page);
  await expect(field).toHaveValue("Default transcript");

  const request = await page.evaluate(() => window.__dictozyTest.requests[0]);
  expect(request.transcriptionLanguage).toBe("fr");
});

test("popup shows assigned and unassigned shortcut states and opens Chrome settings", async ({ page }) => {
  await page.goto("/extension/popup.html");
  await expect(page.locator("#shortcutValue")).toHaveText("Ctrl+Shift+Y");
  await expect(page.locator("#shortcutValue")).toHaveAttribute("data-assigned", "true");

  await page.evaluate(() => window.__dictozyTest.setShortcut(""));
  await page.reload();
  await expect(page.locator("#shortcutValue")).toHaveText("Not assigned");
  await expect(page.locator("#shortcutValue")).toHaveAttribute("data-assigned", "false");

  await page.locator("#manageShortcut").click();
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.createdTabs[0]?.url)).toBe(
    "chrome://extensions/shortcuts",
  );
});
