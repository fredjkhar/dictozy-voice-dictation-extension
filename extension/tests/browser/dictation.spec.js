const { expect, test } = require("@playwright/test");

const MIC_BUTTON = ".voice-dictation-mic-button";
const STATUS_MESSAGE = ".voice-dictation-status__message";

async function installChromeMocks(page) {
  await page.addInitScript(() => {
    const DEFAULT_SHORTCUT = "Ctrl+Shift+Y";
    const SHORTCUT_KEY = "dictozy-playwright-shortcut";
    const SITE_CONTEXT_KEY = "dictozy-playwright-site-context";
    const SITE_UNAVAILABLE_KEY = "dictozy-playwright-site-unavailable";
    const STORAGE_KEY = "dictozy-playwright-storage";
    const runtimeListeners = [];
    const storageListeners = [];
    const pendingResponses = new Map();
    const pendingMicrophones = [];
    const microphoneErrorNames = [];
    const recorderErrorNames = [];
    const defaultStorage = {
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

    async function removeStorage(keys) {
      const previous = readStorage();
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      const changes = {};

      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (Object.hasOwn(stored, key)) {
          delete stored[key];
          changes[key] = {
            newValue: undefined,
            oldValue: previous[key],
          };
        }
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      if (Object.keys(changes).length > 0) {
        for (const listener of storageListeners) {
          listener(changes, "local");
        }
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
      microphoneRequests: 0,
      deferRecorderStop: false,
      pendingStops: [],
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
      queueMicrophoneError(errorName) {
        microphoneErrorNames.push(errorName);
      },
      queueRecorderError(errorName) {
        recorderErrorNames.push(errorName);
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
      setSiteContext(origin) {
        localStorage.setItem(SITE_CONTEXT_KEY, origin);
        localStorage.removeItem(SITE_UNAVAILABLE_KEY);
      },
      setSiteUnavailable(unavailable = true) {
        if (unavailable) {
          localStorage.setItem(SITE_UNAVAILABLE_KEY, "true");
        } else {
          localStorage.removeItem(SITE_UNAVAILABLE_KEY);
        }
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
      getURL: (path) => `chrome-extension://test-extension/${path}`,
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
            messageKeys: Object.keys(message).sort(),
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
          remove: removeStorage,
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
        async query() {
          return [{ id: 1 }];
        },
        async sendMessage(_tabId, message) {
          if (message?.type !== "VOICE_DICTATION_GET_SITE_CONTEXT") {
            return undefined;
          }

          if (localStorage.getItem(SITE_UNAVAILABLE_KEY) === "true") {
            throw new Error("Receiving end does not exist");
          }

          return {
            ok: true,
            origin: localStorage.getItem(SITE_CONTEXT_KEY) || "https://example.com",
          };
        },
      },
    };

    class FakeMediaRecorder {
      static isTypeSupported(type) {
        return type.startsWith("audio/webm");
      }

      constructor(stream, options = {}) {
        const errorName = recorderErrorNames.shift();

        if (errorName) {
          throw new DOMException("private recorder detail", errorName);
        }

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
        const finish = () => {
          const data = new Blob([`recording-${this.recordingNumber}`], { type: this.mimeType });
          this.dispatch("dataavailable", { data });
          this.dispatch("stop");
        };
        if (testState.deferRecorderStop) {
          testState.pendingStops.push(finish);
        } else {
          queueMicrotask(finish);
        }
      }
    }

    window.MediaRecorder = FakeMediaRecorder;
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia() {
          testState.microphoneRequests += 1;
          const errorName = microphoneErrorNames.shift();

          if (errorName) {
            return Promise.reject(new DOMException("private microphone detail", errorName));
          }

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
  await page.addScriptTag({ url: "/extension/site-preferences.js" });
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

async function undoLastEdit(page) {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z");
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

  await page.locator("#plainTextarea").focus();
  await expect(page.locator(MIC_BUTTON)).toBeVisible();
});

const microphoneFailureCases = [
  {
    errorName: "NotAllowedError",
    message: "Microphone access is blocked. Allow it in your browser's site settings, then try again.",
  },
  {
    errorName: "NotFoundError",
    message: "No microphone was found. Connect or enable a microphone, then try again.",
  },
  {
    errorName: "DevicesNotFoundError",
    message: "No microphone was found. Connect or enable a microphone, then try again.",
  },
  {
    errorName: "NotReadableError",
    message: "The microphone is unavailable or in use by another app. Close other recording apps and try again.",
  },
  {
    errorName: "TrackStartError",
    message: "The microphone is unavailable or in use by another app. Close other recording apps and try again.",
  },
  {
    errorName: "AbortError",
    message: "The microphone is unavailable or in use by another app. Close other recording apps and try again.",
  },
  {
    errorName: "SecurityError",
    message: "Recording is not available on this page. Open a regular HTTPS page and try again.",
  },
  {
    errorName: "UnknownError",
    message: "Could not start the microphone. Check your browser's microphone settings and try again.",
  },
];

for (const { errorName, message } of microphoneFailureCases) {
  test(`shows safe retry guidance for ${errorName} microphone failures`, async ({ page }) => {
    await loadContentScript(page);
    await focusFirstTextField(page);
    await page.evaluate((name) => window.__dictozyTest.queueMicrophoneError(name), errorName);

    await page.locator(MIC_BUTTON).click();

    await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "error");
    await expect(page.locator(STATUS_MESSAGE)).toHaveText(message);
    await expect(page.locator(STATUS_MESSAGE)).not.toContainText("Reference:");
    await expect.poll(() => page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);
    await expect.poll(() => page.evaluate(() => window.__dictozyTest.recordingStarts)).toBe(0);
  });
}

test("shows blocked-page guidance when the microphone API is unavailable", async ({ page }) => {
  await loadContentScript(page);
  await focusFirstTextField(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
  });

  await page.locator(MIC_BUTTON).click();

  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "error");
  await expect(page.locator(STATUS_MESSAGE)).toHaveText(
    "Recording is not available on this page. Open a regular HTTPS page and try again.",
  );
  await expect(page.locator(STATUS_MESSAGE)).not.toContainText("Reference:");
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);
});

test("shows blocked-page guidance when Permissions Policy denies microphone access", async ({ page }) => {
  await loadContentScript(page);
  await focusFirstTextField(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "permissionsPolicy", {
      configurable: true,
      value: {
        allowsFeature(feature) {
          return feature !== "microphone";
        },
      },
    });
  });

  await page.locator(MIC_BUTTON).click();

  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "error");
  await expect(page.locator(STATUS_MESSAGE)).toHaveText(
    "Recording is not available on this page. Open a regular HTTPS page and try again.",
  );
  await expect(page.locator(STATUS_MESSAGE)).not.toContainText("Reference:");
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.recordingStarts)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);
});

test("retries microphone access with fresh audio after a local failure", async ({ page }) => {
  await loadContentScript(page);
  const field = await focusFirstTextField(page);
  await page.evaluate(() => {
    window.__dictozyTest.queueMicrophoneError("NotAllowedError");
    window.__dictozyTest.queueResponse({ ok: true, transcript: "Microphone retry succeeded" });
  });

  await page.locator(MIC_BUTTON).click();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "error");
  await page.locator(MIC_BUTTON).click();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
  await page.locator(MIC_BUTTON).click();

  await expect(field).toHaveValue("Microphone retry succeeded");
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.recordingStarts)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.requests.length)).toBe(1);
});

test("releases the microphone when recorder initialization fails", async ({ page }) => {
  await loadContentScript(page);
  await focusFirstTextField(page);
  await page.evaluate(() => window.__dictozyTest.queueRecorderError("NotReadableError"));

  await page.locator(MIC_BUTTON).click();

  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "error");
  await expect(page.locator(STATUS_MESSAGE)).toHaveText(
    "The microphone is unavailable or in use by another app. Close other recording apps and try again.",
  );
  await expect(page.locator(STATUS_MESSAGE)).not.toContainText("Reference:");
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.trackStops)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);
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
  const nestedEditor = page.locator("#nestedEditor");
  await nestedEditor.focus();
  await page.evaluate(() => {
    window.__nestedEvents = [];
    const editor = document.querySelector("#nestedEditor");
    const textNode = editor.querySelector("p").firstChild;
    const range = document.createRange();
    range.setStart(textNode, textNode.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    for (const eventType of ["beforeinput", "input", "change"]) {
      editor.addEventListener(eventType, () => window.__nestedEvents.push(eventType));
    }
  });
  await expect(page.locator(MIC_BUTTON)).toBeVisible();
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({ ok: true, transcript: "Nested transcript" });
  });
  await recordAndStop(page);
  await expect(nestedEditor).toContainText("Nested transcript");
  await expect.poll(() => page.evaluate(() => window.__nestedEvents)).toEqual([
    "beforeinput",
    "input",
    "change",
  ]);
  expect(await nestedEditor.textContent()).toMatch(/Nested transcript(?!.*Nested transcript)/);
});

test("preserves input text, replaces only the selection, and restores the caret", async ({ page }) => {
  await loadContentScript(page);
  const field = page.locator("#plainTextInput");
  await field.fill("Hello old text");
  await field.focus();
  await page.evaluate(() => {
    const input = document.querySelector("#plainTextInput");
    input.setSelectionRange(6, 9);
    window.__formInsertionEvents = [];
    for (const eventType of ["beforeinput", "input", "change"]) {
      input.addEventListener(eventType, () => window.__formInsertionEvents.push(eventType));
    }
    window.__dictozyTest.queueResponse({ ok: true, transcript: "new" });
  });

  await recordAndStop(page);

  await expect(field).toHaveValue("Hello new text");
  expect(await field.evaluate((input) => [input.selectionStart, input.selectionEnd])).toEqual([9, 9]);
  expect(await field.evaluate((input) => document.activeElement === input)).toBe(true);
  expect(await page.evaluate(() => window.__formInsertionEvents)).toEqual([
    "beforeinput",
    "input",
    "change",
  ]);
});

test("native undo restores selected input text and reports historyUndo", async ({ page }) => {
  await loadContentScript(page);
  const field = page.locator("#plainTextInput");
  await field.evaluate((input) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor.set.call(input, "Hello old text");
    input.focus();
    input.setSelectionRange(6, 9);
    window.__nativeUndoEvents = [];
    for (const eventType of ["beforeinput", "input", "change"]) {
      input.addEventListener(eventType, (event) => {
        window.__nativeUndoEvents.push({
          inputType: event.inputType || null,
          type: event.type,
        });
      });
    }
    window.__dictozyTest.queueResponse({ ok: true, transcript: "new" });
  });

  await recordAndStop(page);
  await expect(field).toHaveValue("Hello new text");
  await undoLastEdit(page);

  await expect(field).toHaveValue("Hello old text");
  expect(await field.evaluate((input) => [input.selectionStart, input.selectionEnd])).toEqual([6, 9]);
  expect(await page.evaluate(() => window.__nativeUndoEvents)).toEqual([
    { inputType: "insertText", type: "beforeinput" },
    { inputType: "insertText", type: "input" },
    { inputType: null, type: "change" },
    { inputType: "historyUndo", type: "beforeinput" },
    { inputType: "historyUndo", type: "input" },
  ]);
});

test("appends to a textarea and places the caret after the transcript", async ({ page }) => {
  await loadContentScript(page);
  const field = page.locator("#plainTextarea");
  await field.fill("Existing text");
  await field.focus();
  await field.evaluate((textarea) => textarea.setSelectionRange(textarea.value.length, textarea.value.length));
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({ ok: true, transcript: "continued" });
  });

  await recordAndStop(page);

  await expect(field).toHaveValue("Existing text continued");
  expect(await field.evaluate((textarea) => textarea.selectionStart)).toBe(23);
});

test("native undo restores textarea content", async ({ page }) => {
  await loadContentScript(page);
  const field = page.locator("#plainTextarea");
  await field.evaluate((textarea) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    descriptor.set.call(textarea, "Existing text");
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    window.__dictozyTest.queueResponse({ ok: true, transcript: "continued" });
  });

  await recordAndStop(page);
  await expect(field).toHaveValue("Existing text continued");
  await undoLastEdit(page);

  await expect(field).toHaveValue("Existing text");
  expect(await field.evaluate((textarea) => [textarea.selectionStart, textarea.selectionEnd])).toEqual([13, 13]);
});

test("updates a framework-like controlled input through native events after rerender", async ({ page }) => {
  await loadContentScript(page);
  const field = page.locator("#controlledInput");
  await field.evaluate((input) => {
    const nativeDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    nativeDescriptor.set.call(input, "Controlled");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
  await page.evaluate(() => {
    const input = document.querySelector("#controlledInput");
    const nativeDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    window.__controlledPageSetterCalls = 0;
    window.__controlledInsertionEvents = [];

    Object.defineProperty(input, "value", {
      configurable: true,
      get() {
        return nativeDescriptor.get.call(this);
      },
      set(value) {
        window.__controlledPageSetterCalls += 1;
        nativeDescriptor.set.call(this, value);
      },
    });

    for (const eventType of ["beforeinput", "input", "change"]) {
      input.addEventListener(eventType, () => window.__controlledInsertionEvents.push(eventType));
    }

    input.addEventListener("input", () => {
      const replacement = input.cloneNode(true);
      nativeDescriptor.set.call(replacement, input.value);
      input.replaceWith(replacement);
      replacement.focus();
      replacement.setSelectionRange(replacement.value.length, replacement.value.length);
    }, { once: true });

    window.__dictozyTest.queueResponse({ ok: true, transcript: "update" });
  });

  await recordAndStop(page);

  await expect(page.locator("#controlledInput")).toHaveValue("Controlled update");
  expect(await page.evaluate(() => window.__controlledPageSetterCalls)).toBe(0);
  expect(await page.evaluate(() => window.__controlledInsertionEvents)).toEqual([
    "beforeinput",
    "input",
    "change",
  ]);
  await expect(page.locator(MIC_BUTTON)).toHaveCount(1);
});

test("native undo updates a stable controlled-field model", async ({ page }) => {
  await loadContentScript(page);
  const field = page.locator("#controlledInput");
  await field.evaluate((input) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor.set.call(input, "Controlled");
    window.__controlledModel = input.value;
    window.__controlledUndoInputTypes = [];
    input.addEventListener("input", (event) => {
      window.__controlledModel = input.value;
      window.__controlledUndoInputTypes.push(event.inputType);
      queueMicrotask(() => descriptor.set.call(input, window.__controlledModel));
    });
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    window.__dictozyTest.queueResponse({ ok: true, transcript: "update" });
  });

  await recordAndStop(page);
  await expect(field).toHaveValue("Controlled update");
  expect(await page.evaluate(() => window.__controlledModel)).toBe("Controlled update");
  await undoLastEdit(page);

  await expect(field).toHaveValue("Controlled");
  expect(await page.evaluate(() => window.__controlledModel)).toBe("Controlled");
  expect(await page.evaluate(() => window.__controlledUndoInputTypes)).toEqual([
    "insertText",
    "historyUndo",
  ]);
});

test("inserts plain text at a contenteditable caret exactly once", async ({ page }) => {
  await loadContentScript(page);
  const editor = page.locator("#plainEditor");
  await editor.evaluate((element) => {
    element.textContent = "Hello world";
    element.focus();
    const range = document.createRange();
    range.setStart(element.firstChild, 5);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    window.__richInsertionEvents = [];
    for (const eventType of ["beforeinput", "input", "change"]) {
      element.addEventListener(eventType, () => window.__richInsertionEvents.push(eventType));
    }
    window.__dictozyTest.queueResponse({ ok: true, transcript: "dictated" });
  });

  await recordAndStop(page);

  await expect(editor).toHaveText("Hello dictated world");
  expect(await page.evaluate(() => window.__richInsertionEvents)).toEqual([
    "beforeinput",
    "input",
    "change",
  ]);
  expect(await editor.evaluate((element) => {
    const selection = window.getSelection();
    const preceding = document.createRange();
    preceding.selectNodeContents(element);
    preceding.setEnd(selection.anchorNode, selection.anchorOffset);
    return preceding.toString();
  })).toBe("Hello dictated");
});

test("replaces a contenteditable selection with plain text", async ({ page }) => {
  await loadContentScript(page);
  const editor = page.locator("#plainEditor");
  await editor.evaluate((element) => {
    element.textContent = "Hello old text";
    element.focus();
    const range = document.createRange();
    range.setStart(element.firstChild, 6);
    range.setEnd(element.firstChild, 9);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    window.__dictozyTest.queueResponse({ ok: true, transcript: "<strong>new</strong>" });
  });

  await recordAndStop(page);

  await expect(editor).toHaveText("Hello <strong>new</strong> text");
  await expect(editor.locator("strong")).toHaveCount(0);
});

test("native undo restores a replaced contenteditable selection", async ({ page }) => {
  await loadContentScript(page);
  const editor = page.locator("#plainEditor");
  await editor.evaluate((element) => {
    element.textContent = "Hello old text";
    element.focus();
    const range = document.createRange();
    range.setStart(element.firstChild, 6);
    range.setEnd(element.firstChild, 9);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    window.__dictozyTest.queueResponse({ ok: true, transcript: "new" });
  });

  await recordAndStop(page);
  await expect(editor).toHaveText("Hello new text");
  await undoLastEdit(page);

  await expect(editor).toHaveText("Hello old text");
  expect(await editor.evaluate(() => window.getSelection().toString())).toBe("old");
});

test("native undo restores nested rich-text markup", async ({ page }) => {
  await loadContentScript(page);
  const editor = page.locator("#nestedEditor");
  const initialHtml = "<p>Hello <strong>bold</strong> tail</p>";
  await editor.evaluate((element) => {
    element.innerHTML = "<p>Hello <strong>bold</strong> tail</p>";
    element.focus();
    const textNode = element.querySelector("p").firstChild;
    const range = document.createRange();
    range.setStart(textNode, textNode.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    window.__richUndoInputTypes = [];
    element.addEventListener("input", (event) => {
      window.__richUndoInputTypes.push(event.inputType);
    });
    window.__dictozyTest.queueResponse({ ok: true, transcript: "clear" });
  });

  await recordAndStop(page);
  await expect(editor).toContainText("Hello clear bold tail");
  await expect(editor.locator("strong")).toHaveText("bold");
  await undoLastEdit(page);

  expect(await editor.evaluate((element) => element.innerHTML)).toBe(initialHtml);
  expect(await page.evaluate(() => window.__richUndoInputTypes)).toEqual([
    "insertText",
    "historyUndo",
  ]);
});

test("native undo works in an editable ARIA textbox", async ({ page }) => {
  await loadContentScript(page);
  const editor = page.locator('[role="textbox"][contenteditable="true"]');
  await editor.evaluate((element) => {
    element.textContent = "ARIA text";
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    window.__dictozyTest.queueResponse({ ok: true, transcript: "added" });
  });

  await recordAndStop(page);
  await expect(editor).toHaveText("ARIA text added");
  await undoLastEdit(page);

  await expect(editor).toHaveText("ARIA text");
});

test("keeps a captured form caret while transcription is pending", async ({ page }) => {
  await loadContentScript(page);
  const field = page.locator("#plainTextInput");
  await field.fill("Alpha Beta");
  await field.focus();
  await field.evaluate((input) => input.setSelectionRange(5, 5));
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({}, { defer: true });
  });

  await recordAndStop(page);
  await waitForRequestCount(page, 1);
  const requestId = await page.evaluate(() => window.__dictozyTest.requests[0].requestId);
  await field.evaluate((input) => input.setSelectionRange(input.value.length, input.value.length));
  await page.evaluate((id) => {
    window.__dictozyTest.resolveRequest(id, {
      ok: true,
      requestId: id,
      transcript: "dictated",
    });
  }, requestId);

  await expect(field).toHaveValue("Alpha dictated Beta");
  expect(await field.evaluate((input) => [input.selectionStart, input.selectionEnd])).toEqual([14, 14]);
  expect(await field.evaluate((input) => document.activeElement === input)).toBe(true);
});

test("keeps the captured rich-text caret and surrounding markup", async ({ page }) => {
  await loadContentScript(page);
  const editor = page.locator("#nestedEditor");
  await editor.evaluate((element) => {
    element.innerHTML = "<p>Hello<strong>bold</strong> tail</p>";
    element.focus();
    const range = document.createRange();
    range.setStart(element.querySelector("p").firstChild, 5);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    window.__dictozyTest.queueResponse({}, { defer: true });
  });

  await recordAndStop(page);
  await waitForRequestCount(page, 1);
  const requestId = await page.evaluate(() => window.__dictozyTest.requests[0].requestId);
  await editor.evaluate((element) => {
    const tail = element.querySelector("p").lastChild;
    const range = document.createRange();
    range.setStart(tail, tail.length);
    range.collapse(true);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.evaluate((id) => {
    window.__dictozyTest.resolveRequest(id, {
      ok: true,
      requestId: id,
      transcript: "clear",
    });
  }, requestId);

  await expect(editor).toHaveText("Hello clear bold tail");
  await expect(editor.locator("strong")).toHaveText("bold");
  expect(await editor.evaluate((element) => {
    const selection = window.getSelection();
    const preceding = document.createRange();
    preceding.selectNodeContents(element);
    preceding.setEnd(selection.anchorNode, selection.anchorOffset);
    return preceding.toString().replaceAll("\u00a0", " ");
  })).toBe("Hello clear ");
});

test("supports fields created after the content script loads without duplicate controls", async ({ page }) => {
  await loadContentScript(page);
  await page.locator("#addDynamicField").click();
  const field = page.locator("#dynamicTextInput");
  await field.focus();
  await expect(page.locator(MIC_BUTTON)).toBeVisible();
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({ ok: true, transcript: "Dynamic transcript" });
  });

  await recordAndStop(page);

  await expect(field).toHaveValue("Dynamic transcript");
  await expect(page.locator(MIC_BUTTON)).toHaveCount(1);
});

test("same-origin SPA navigation keeps one default-enabled control", async ({ page }) => {
  await loadContentScript(page);
  await focusFirstTextField(page);

  await page.evaluate(() => {
    history.pushState({}, "", "/qa/another-path?view=compact#editor");
  });
  await page.locator("#plainTextarea").focus();

  await expect(page.locator(MIC_BUTTON)).toBeVisible();
  await expect(page.locator(MIC_BUTTON)).toHaveCount(1);
});

test("cancels safely when a transcription field is replaced", async ({ page }) => {
  await loadContentScript(page);
  await page.locator("#addDynamicField").click();
  const field = page.locator("#dynamicTextInput");
  await field.focus();
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({}, { defer: true });
  });
  await recordAndStop(page);
  await waitForRequestCount(page, 1);

  await page.locator("#replaceDynamicField").click();

  await expect(page.locator("#dynamicTextInput")).toHaveValue("");
  await expect(page.locator(MIC_BUTTON)).toBeHidden();
  await expect(page.locator(STATUS_MESSAGE)).toContainText("The original field is no longer available.");
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.cancellations.length)).toBe(1);
});

test("cancels safely when the active field becomes readonly", async ({ page }) => {
  await loadContentScript(page);
  const field = await focusFirstTextField(page);
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({}, { defer: true });
  });
  await recordAndStop(page);
  await waitForRequestCount(page, 1);

  await field.evaluate((input) => {
    input.readOnly = true;
  });

  await expect(field).toHaveValue("");
  await expect(page.locator(MIC_BUTTON)).toBeHidden();
  await expect(page.locator(STATUS_MESSAGE)).toContainText("The original field is no longer available.");
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.cancellations.length)).toBe(1);
});

test("shows a safe error when a page cancels transcript insertion", async ({ page }) => {
  await loadContentScript(page);
  const field = await focusFirstTextField(page);
  await field.evaluate((input) => {
    input.addEventListener("beforeinput", (event) => event.preventDefault(), { once: true });
    window.__dictozyTest.queueResponse({ ok: true, transcript: "Blocked transcript" });
  });

  await recordAndStop(page);

  await expect(field).toHaveValue("");
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "error");
  await expect(page.locator(STATUS_MESSAGE)).toContainText("Could not insert the transcript.");
  await expect(page.locator(STATUS_MESSAGE)).not.toContainText("Blocked transcript");
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
      errorCode: "provider_failure",
      message: "Speech-to-text is temporarily unavailable. Please record again.",
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

test("rejects a malformed background response with a safe request reference", async ({ page }) => {
  await loadContentScript(page);
  const field = await focusFirstTextField(page);
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({ ok: true });
  });

  await recordAndStop(page);

  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "error");
  await expect(page.locator(STATUS_MESSAGE)).toContainText(
    "Dictozy received an invalid transcription response. Please record again.",
  );
  await expect(page.locator(STATUS_MESSAGE)).toContainText("Reference:");
  await expect(field).toHaveValue("");
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
  await expect(page.locator(STATUS_MESSAGE)).toContainText(
    "Transcription took too long. Check your connection and record again.",
  );
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

test("a disabled site hides controls, ignores shortcuts, and can be re-enabled", async ({ page }) => {
  await loadContentScript(page, {
    disabledSiteOrigins: ["http://127.0.0.1:4173"],
  });
  const field = page.locator('input[type="text"]').first();
  await field.focus();

  await expect(page.locator(MIC_BUTTON)).toBeHidden();
  expect(await invokeShortcut(page)).toMatchObject({
    ok: false,
    state: "disabled",
  });
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.recordingStarts)).toBe(0);

  await page.evaluate(() => window.__dictozyTest.setStorage({ disabledSiteOrigins: [] }));
  await expect(page.locator(MIC_BUTTON)).toBeVisible();
  await recordAndStop(page);
  await expect(field).toHaveValue("Default transcript");
});

test("global off overrides a default-enabled site without changing its preference", async ({ page }) => {
  await loadContentScript(page, {
    disabledSiteOrigins: [],
    extensionEnabled: false,
  });
  await page.locator('input[type="text"]').first().focus();

  await expect(page.locator(MIC_BUTTON)).toBeHidden();
  expect(await invokeShortcut(page)).toMatchObject({ ok: false, state: "disabled" });
  expect(await page.evaluate(() => window.__dictozyTest.storage().disabledSiteOrigins)).toEqual([]);
});

test("disabling a site during microphone access stops the late stream without upload", async ({ page }) => {
  await loadContentScript(page);
  await focusFirstTextField(page);
  await page.evaluate(() => {
    window.__dictozyTest.deferMicrophone = true;
  });

  await page.locator(MIC_BUTTON).click();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "requesting");
  await page.evaluate(() => window.__dictozyTest.setStorage({
    disabledSiteOrigins: ["http://127.0.0.1:4173"],
  }));
  await expect(page.locator(MIC_BUTTON)).toBeHidden();
  await page.evaluate(() => window.__dictozyTest.resolveMicrophone());

  await expect.poll(() => page.evaluate(() => window.__dictozyTest.trackStops)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);
});

test("disabling a site cancels recording and rejects a late transcription", async ({ page }) => {
  await loadContentScript(page);
  const field = await focusFirstTextField(page);

  await page.locator(MIC_BUTTON).click();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
  await page.evaluate(() => window.__dictozyTest.setStorage({
    disabledSiteOrigins: ["http://127.0.0.1:4173"],
  }));
  await expect(page.locator(MIC_BUTTON)).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.trackStops)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);

  await page.evaluate(() => window.__dictozyTest.setStorage({ disabledSiteOrigins: [] }));
  await expect(page.locator(MIC_BUTTON)).toBeVisible();
  await page.evaluate(() => window.__dictozyTest.queueResponse({}, { defer: true }));
  await recordAndStop(page);
  await waitForRequestCount(page, 1);
  const requestId = await page.evaluate(() => window.__dictozyTest.requests[0].requestId);

  await page.evaluate(() => window.__dictozyTest.setStorage({
    disabledSiteOrigins: ["http://127.0.0.1:4173"],
  }));
  await expect(page.locator(MIC_BUTTON)).toBeHidden();
  await page.evaluate((id) => window.__dictozyTest.resolveRequest(id, {
    ok: true,
    requestId: id,
    transcript: "Late site result",
  }), requestId);

  await expect(field).toHaveValue("");
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.cancellations.length)).toBe(1);
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

  await page.locator("#extensionEnabled").uncheck();
  await page.locator("#recordingDurationSeconds").fill("14");
  await page.locator("#transcriptionLanguage").selectOption("fr");
  await page.locator("#saveSettings").click();
  await expect(page.locator("#status")).toHaveText("Dictozy is off.");

  await page.reload();
  await expect(page.locator("#extensionEnabled")).not.toBeChecked();
  await expect(page.locator("#recordingDurationSeconds")).toHaveValue("14");
  await expect(page.locator("#transcriptionLanguage")).toHaveValue("fr");
  await expect(page.locator("#status")).toHaveText("Dictozy is off.");
});

test("popup stores only an explicitly disabled current origin and preserves global state", async ({ page }) => {
  await page.goto("/extension/popup.html");
  await expect(page.locator("#siteToggleRow")).toBeVisible();
  await expect(page.locator("#siteEnabled")).toBeChecked();
  await expect(page.locator("#siteDescription")).toContainText("example.com");

  await page.locator("#siteEnabled").uncheck();
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.storage().disabledSiteOrigins)).toEqual([
    "https://example.com",
  ]);
  expect(await page.evaluate(() => window.__dictozyTest.storage().extensionEnabled)).toBe(true);

  await page.reload();
  await expect(page.locator("#siteEnabled")).not.toBeChecked();
  await page.locator("#siteEnabled").check();
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.storage().disabledSiteOrigins)).toBeUndefined();
});

test("reset removes only site preferences", async ({ page }) => {
  await page.goto("/qa/manual-test-page.html");
  await page.evaluate(() => window.__dictozyTest.setStorage({
    disabledSiteOrigins: ["https://example.com", "https://app.example.com"],
    extensionEnabled: false,
    recordingDurationMs: 14000,
    transcriptionLanguage: "fr",
  }));
  await page.goto("/extension/popup.html");
  await page.locator("#resetSitePreferences").click();
  await expect(page.locator("#status")).toHaveText("Site preferences reset.");

  const settings = await page.evaluate(() => window.__dictozyTest.storage());
  expect(settings.disabledSiteOrigins).toBeUndefined();
  expect(settings.extensionEnabled).toBe(false);
  expect(settings.recordingDurationMs).toBe(14000);
  expect(settings.transcriptionLanguage).toBe("fr");
});

test("popup omits backend configuration and keeps site reset available", async ({ page }) => {
  await page.goto("/extension/popup.html");

  await expect(page.getByText("Advanced Backend", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Backend URL", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Check Backend", { exact: true })).toHaveCount(0);
  await expect(page.locator("#backendUrl")).toHaveCount(0);
  await expect(page.locator("#resetSitePreferences")).toBeVisible();
});

test("popup keeps global settings usable when the current page is inaccessible", async ({ page }) => {
  await page.goto("/qa/manual-test-page.html");
  await page.evaluate(() => window.__dictozyTest.setSiteUnavailable());
  await page.goto("/extension/popup.html");

  await expect(page.locator("#siteToggleRow")).toBeHidden();
  await expect(page.locator("#siteUnavailable")).toBeVisible();
  await expect(page.locator("#siteUnavailable")).toHaveText("Current-site control is unavailable on this page.");
  await expect(page.locator("#extensionEnabled")).toBeEnabled();
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
  expect(request.messageKeys).toEqual(["audioDataUrl", "requestId", "type"]);
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

// Phase 1: these exercise real DOM events but mocked Chrome/media/provider APIs.
test("rejects synthetic microphone activation before requesting permission", async ({ page }) => {
  await loadContentScript(page);
  await focusFirstTextField(page);
  for (const method of ["click", "dispatch"]) {
    await page.locator(MIC_BUTTON).evaluate((button, method) => {
      if (method === "click") button.click();
      else button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }, method);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    expect(await page.evaluate(() => window.__dictozyTest.microphoneRequests)).toBe(0);
  }
  expect(await page.evaluate(() => window.__dictozyTest.recordingStarts)).toBe(0);
});

for (const key of ["Enter", "Space"]) {
  test(`microphone supports native ${key} activation`, async ({ page }) => {
    await loadContentScript(page);
    const field = await focusFirstTextField(page);
    await page.locator(MIC_BUTTON).focus();
    await page.keyboard.press(key);
    await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
    await page.locator(MIC_BUTTON).focus();
    await page.keyboard.press(key);
    await expect(field).toHaveValue("Default transcript");
    await expect(field).toBeFocused();
    await undoLastEdit(page);
    await expect(field).toHaveValue("");
  });
}

for (const reason of ["password", "blank", "hidden", "pagehide", "removed-control", "hidden-control"]) {
  test(`discards recording immediately on ${reason}`, async ({ page }) => {
    await loadContentScript(page);
    await focusFirstTextField(page);
    await page.locator(MIC_BUTTON).click();
    await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
    await page.evaluate((reason) => {
      if (reason === "password") document.querySelector('input[type="password"]').focus();
      if (reason === "blank") document.activeElement.blur();
      if (reason === "hidden") {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
      }
      if (reason === "pagehide") window.dispatchEvent(new Event("pagehide"));
      if (reason === "removed-control") document.querySelector(".voice-dictation-mic-button").remove();
      if (reason === "hidden-control") document.querySelector(".voice-dictation-mic-button").style.display = "none";
    }, reason);
    await expect.poll(() => page.evaluate(() => window.__dictozyTest.trackStops)).toBe(1);
    expect(await page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);
    await expect(page.getByRole("button", { name: "Copy transcript", exact: true })).toHaveCount(0);
  });
}

test("late permission after hidden page stops the stream without capture", async ({ page }) => {
  await loadContentScript(page);
  await focusFirstTextField(page);
  await page.evaluate(() => { window.__dictozyTest.deferMicrophone = true; });
  await page.locator(MIC_BUTTON).click();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "requesting");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.__dictozyTest.resolveMicrophone();
  });
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.trackStops)).toBe(1);
  expect(await page.evaluate(() => window.__dictozyTest.recordingStarts)).toBe(0);
  expect(await page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);
});

test("cancelled recorder events cannot stop or upload a newer recording", async ({ page }) => {
  await loadContentScript(page);
  const field = await focusFirstTextField(page);
  await page.evaluate(() => { window.__dictozyTest.deferRecorderStop = true; });
  await page.locator(MIC_BUTTON).click();
  await page.locator('input[type="password"]').focus();
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.trackStops)).toBe(1);
  await field.focus();
  await page.locator(MIC_BUTTON).click();
  await page.evaluate(() => {
    window.__dictozyTest.pendingStops.splice(0).forEach((finish) => finish());
    window.__dictozyTest.deferRecorderStop = false;
  });
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
  expect(await page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);
  expect(await page.evaluate(() => window.__dictozyTest.trackStops)).toBe(1);
  await page.locator(MIC_BUTTON).click();
  await expect(field).toHaveValue("Default transcript");
  const audio = await page.evaluate(() => window.__dictozyTest.requests[0].audioDataUrl);
  expect(Buffer.from(audio.split(",")[1], "base64").toString()).toBe("recording-2");
});

async function resolveLatestTranscript(page, transcript = "private dictated result") {
  await page.evaluate((transcript) => {
    const id = window.__dictozyTest.requests.at(-1).requestId;
    window.__dictozyTest.resolveRequest(id, { ok: true, requestId: id, transcript });
  }, transcript);
}

for (const selector of ["#plainTextInput", "textarea", "#nestedEditor"]) {
  test(`preserves edits and offers private temporary recovery in ${selector}`, async ({ page }) => {
    await loadContentScript(page);
    const field = page.locator(selector).first();
    await field.fill("Alpha Beta");
    await field.evaluate((element) => {
      element.focus();
      if ("value" in element) element.setSelectionRange(6, 10);
      else {
        const range = document.createRange();
        range.setStart(element.firstChild, 6);
        range.setEnd(element.firstChild, 10);
        window.getSelection().removeAllRanges();
        window.getSelection().addRange(range);
      }
      window.__dictozyTest.queueResponse({}, { defer: true });
      window.__copied = [];
      Object.defineProperty(navigator, "clipboard", {
        configurable: true, value: { writeText: async (text) => window.__copied.push(text) },
      });
    });
    await recordAndStop(page);
    await waitForRequestCount(page, 1);
    await field.evaluate((element) => {
      // No input event: script/framework changes must also be detected.
      if ("value" in element) element.value = "Dear Alpha Beta";
      else element.innerHTML = "<strong>Dear Alpha Beta</strong>";
    });
    await resolveLatestTranscript(page);
    const copy = page.getByRole("button", { name: "Copy transcript", exact: true });
    await expect(copy).toBeVisible();
    expect(await field.evaluate((el) => "value" in el ? el.value : el.textContent)).toBe("Dear Alpha Beta");
    expect(await page.locator("html").innerHTML()).not.toContain("private dictated result");
    await copy.evaluate((button) => button.click());
    expect(await page.evaluate(() => window.__copied)).toEqual([]);
    await copy.click();
    expect(await page.evaluate(() => window.__copied)).toEqual(["private dictated result"]);
    await expect(copy).toHaveCount(0);
  });
}

for (const selector of ["#plainTextInput", "#nestedEditor"]) {
  test(`does not overwrite changes made by beforeinput in ${selector}`, async ({ page }) => {
    await loadContentScript(page);
    const field = page.locator(selector);
    await field.fill("Original");
    await field.evaluate((el) => el.addEventListener("beforeinput", () => {
      if ("value" in el) el.value = "User edit";
      else el.textContent = "User edit";
    }, { once: true }));
    await recordAndStop(page);
    await expect(page.getByRole("button", { name: "Copy transcript", exact: true })).toBeVisible();
    expect(await field.evaluate((el) => "value" in el ? el.value : el.textContent)).toBe("User edit");
  });
}

for (const action of ["discard", "expire", "disable", "pagehide", "new-recording"]) {
  test(`recovery clears on ${action}`, async ({ page }) => {
    if (action === "expire") await page.clock.install();
    await loadContentScript(page);
    const field = await focusFirstTextField(page);
    await page.evaluate(() => window.__dictozyTest.queueResponse({}, { defer: true }));
    await recordAndStop(page);
    await waitForRequestCount(page, 1);
    await page.locator('input[type="search"]').focus();
    await resolveLatestTranscript(page);
    const copy = page.getByRole("button", { name: "Copy transcript", exact: true });
    await expect(copy).toBeVisible();
    if (action === "discard") await page.getByRole("button", { name: "Discard transcript", exact: true }).click();
    if (action === "expire") {
      await page.clock.fastForward(61000);
    }
    if (action === "disable") await page.evaluate(() => window.__dictozyTest.setStorage({ extensionEnabled: false }));
    if (action === "pagehide") await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    if (action === "new-recording") {
      await field.focus();
      await page.locator(MIC_BUTTON).click();
      await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
    }
    await expect(copy).toHaveCount(0);
  });
}

for (const target of ["readonly", "removed", "other-field"]) {
  test(`beforeinput ${target} cannot redirect insertion`, async ({ page }) => {
    await loadContentScript(page);
    const field = await focusFirstTextField(page);
    await field.fill("Original");
    await field.evaluate((el, target) => el.addEventListener("beforeinput", () => {
      if (target === "readonly") el.readOnly = true;
      if (target === "removed") el.remove();
      if (target === "other-field") document.querySelector('input[type="search"]').focus();
    }, { once: true }), target);
    await recordAndStop(page);
    await expect(page.getByRole("button", { name: "Copy transcript", exact: true })).toBeVisible();
    if (target !== "removed") await expect(field).toHaveValue("Original");
    await expect(page.locator('input[type="search"]')).toHaveValue("");
  });
}

test("failed clipboard copy can retry without displaying private content", async ({ page }, testInfo) => {
  await loadContentScript(page);
  await focusFirstTextField(page);
  await page.evaluate(() => window.__dictozyTest.queueResponse({}, { defer: true }));
  await recordAndStop(page);
  await waitForRequestCount(page, 1);
  await page.locator('input[type="search"]').focus();
  await resolveLatestTranscript(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true,
      value: { writeText: async () => { throw new Error("private error"); } } });
  });
  const copy = page.getByRole("button", { name: "Copy transcript", exact: true });
  await copy.click();
  await expect(page.getByRole("region", { name: "Transcript recovery" })).toContainText("Clipboard unavailable");
  await page.screenshot({ path: testInfo.outputPath("recovery.png") });
  await expect(copy).toBeVisible();
  await page.evaluate(() => {
    navigator.clipboard.writeText = async (text) => { window.__copied = text; };
  });
  await copy.focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.__copied)).toBe("private dictated result");
  await expect(copy).toHaveCount(0);
});

test("normal stop survives the duration deadline while browser completion is delayed", async ({ page }) => {
  await loadContentScript(page);
  await page.clock.install();
  const field = await focusFirstTextField(page);
  await page.evaluate(() => { window.__dictozyTest.deferRecorderStop = true; });
  await page.locator(MIC_BUTTON).click();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
  await page.locator(MIC_BUTTON).click();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "processing");
  expect(await page.evaluate(() => window.__dictozyTest.trackStops)).toBe(1);
  await page.clock.fastForward(10001);
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "processing");
  await page.evaluate(() => window.__dictozyTest.pendingStops.splice(0).forEach((finish) => finish()));
  await expect(field).toHaveValue("Default transcript");
  expect(await page.evaluate(() => window.__dictozyTest.requests.length)).toBe(1);
});

test("late microphone permission cannot start recording in an unfocused window", async ({ page }) => {
  await loadContentScript(page);
  await focusFirstTextField(page);
  await page.evaluate(() => { window.__dictozyTest.deferMicrophone = true; });
  await page.locator(MIC_BUTTON).click();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "requesting");
  await page.evaluate(() => {
    document.hasFocus = () => false;
    window.dispatchEvent(new Event("blur"));
    window.__dictozyTest.resolveMicrophone();
  });
  await expect.poll(() => page.evaluate(() => window.__dictozyTest.trackStops)).toBe(1);
  expect(await page.evaluate(() => window.__dictozyTest.recordingStarts)).toBe(0);
  expect(await page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);
});

// Phase 2: recording feedback and safe interaction with the retained field.
test("recording shows elapsed and remaining time without announcing each tick", async ({ page }) => {
  await loadContentScript(page);
  await page.clock.install();
  await focusFirstTextField(page);
  await page.locator(MIC_BUTTON).click();
  const timing = page.locator(".voice-dictation-timing");
  await expect(timing).toHaveText("0s elapsed · 10s left");
  await expect(timing).toHaveAttribute("aria-live", "off");
  await page.clock.fastForward(3100);
  await expect(timing).toHaveText("3s elapsed · 7s left");
  await expect(page.locator(STATUS_MESSAGE)).toHaveText("Recording");
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(timing).toBeHidden();
  await expect(page.locator('input[type="text"]').first()).toHaveValue("Default transcript");
});

for (const key of ["Enter", "Space"]) {
  test(`recording Discard supports ${key} without uploading or moving the selection`, async ({ page }) => {
    await loadContentScript(page);
    const field = await focusFirstTextField(page);
    await field.fill("Alpha Beta");
    await field.evaluate((element) => element.setSelectionRange(6, 10));
    await page.locator(MIC_BUTTON).click();
    const discard = page.getByRole("button", { name: "Discard recording", exact: true });
    await discard.focus();
    await page.keyboard.press(key);
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("Alpha Beta");
    expect(await field.evaluate((element) => [element.selectionStart, element.selectionEnd])).toEqual([6, 10]);
    expect(await page.evaluate(() => window.__dictozyTest.trackStops)).toBe(1);
    expect(await page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);
    await expect(page.getByRole("button", { name: "Copy transcript", exact: true })).toHaveCount(0);
    await expect(page.locator(STATUS_MESSAGE)).toHaveText("Recording discarded");
  });
}

test("synthetic Stop and Discard events cannot change recording state", async ({ page }) => {
  await loadContentScript(page);
  await focusFirstTextField(page);
  await page.locator(MIC_BUTTON).click();
  for (const label of ["Stop recording", "Discard recording"]) {
    await page.getByRole("button", { name: label, exact: true }).evaluate((button) => button.click());
  }
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
  expect(await page.evaluate(() => window.__dictozyTest.trackStops)).toBe(0);
  await page.getByRole("button", { name: "Discard recording", exact: true }).click();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "idle");
});

for (const action of ["copy", "discard", "expire"]) {
  test(`recovery ${action} explains refusal and returns keyboard focus safely`, async ({ page }) => {
    await loadContentScript(page);
    await page.clock.install();
    const field = await focusFirstTextField(page);
    await page.evaluate(() => window.__dictozyTest.queueResponse({}, { defer: true }));
    await recordAndStop(page);
    await waitForRequestCount(page, 1);
    await field.fill("My new writing");
    await resolveLatestTranscript(page);
    const panel = page.getByRole("region", { name: "Transcript recovery" });
    await expect(panel).toContainText("The field changed");
    await expect(panel).not.toContainText("private dictated result");
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
      configurable: true, value: { writeText: async () => {} },
    }));
    const control = page.getByRole("button", { name: action === "discard" ? "Discard transcript" : "Copy transcript", exact: true });
    await control.focus();
    if (action === "expire") await page.clock.fastForward(60001);
    else await page.keyboard.press("Enter");
    await expect(panel).toHaveCount(0);
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("My new writing");
    await expect(page.locator(".voice-dictation-announcement")).toContainText(
      action === "copy" ? "Transcript copied" : action === "discard" ? "Transcript discarded" : "Transcript expired",
    );
  });
}

test("recovery expiry does not steal editor focus", async ({ page }) => {
  await loadContentScript(page);
  await page.clock.install();
  await focusFirstTextField(page);
  await page.evaluate(() => window.__dictozyTest.queueResponse({}, { defer: true }));
  await recordAndStop(page);
  await waitForRequestCount(page, 1);
  const other = page.locator('input[type="search"]');
  await other.focus();
  await resolveLatestTranscript(page);
  await other.fill("Keep typing here");
  await page.clock.fastForward(60001);
  await expect(other).toBeFocused();
  await expect(other).toHaveValue("Keep typing here");
});

test("recording limit remains clamped to 30 seconds with automatic stop", async ({ page }) => {
  await loadContentScript(page);
  await page.clock.install();
  const field = await focusFirstTextField(page);
  await page.evaluate(() => window.__dictozyTest.setStorage({ recordingDurationMs: 60000 }));
  await page.locator(MIC_BUTTON).click();
  await expect(page.locator(".voice-dictation-timing")).toHaveText("0s elapsed · 30s left");
  await page.clock.fastForward(29000);
  await expect(page.locator(".voice-dictation-timing")).toHaveText("29s elapsed · 1s left");
  await page.clock.fastForward(1100);
  await expect(field).toHaveValue("Default transcript");
  expect(await page.evaluate(() => window.__dictozyTest.trackStops)).toBe(1);
  expect(await page.evaluate(() => window.__dictozyTest.requests.length)).toBe(1);
  await expect(page.locator(".voice-dictation-feedback")).toBeHidden();
});

for (const selector of ["#plainTextarea", "#nestedEditor"]) {
  test(`feedback Stop preserves selection and Undo in ${selector}`, async ({ page }) => {
    await loadContentScript(page);
    const field = page.locator(selector);
    await field.fill("Alpha Beta");
    await field.evaluate((el) => {
      if ("selectionStart" in el) el.setSelectionRange(6, 10);
      else {
        el.textContent = "Alpha Beta"; // Select text, not the nested fixture’s indentation node.
        const range = document.createRange();
        range.setStart(el.firstChild, 6); range.setEnd(el.firstChild, 10);
        getSelection().removeAllRanges(); getSelection().addRange(range);
      }
    });
    await page.locator(MIC_BUTTON).click();
    await page.getByRole("button", { name: "Stop recording", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => field.evaluate((el) => "value" in el ? el.value : el.textContent)).toBe("Alpha Default transcript");
    await expect(field).toBeFocused();
    await undoLastEdit(page);
    expect(await field.evaluate((el) => "value" in el ? el.value : el.textContent)).toBe("Alpha Beta");
  });
}

test("late clipboard completion cannot clear a newer recoverable result", async ({ page }) => {
  await loadContentScript(page);
  await page.clock.install();
  const field = await focusFirstTextField(page);
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({}, { defer: true });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: () => new Promise((resolve) => { window.__resolveCopy = resolve; }),
    } });
  });
  await recordAndStop(page);
  await waitForRequestCount(page, 1);
  await field.fill("Edited first");
  await resolveLatestTranscript(page, "First private transcript");
  await page.getByRole("button", { name: "Copy transcript", exact: true }).click();
  await expect(page.getByRole("button", { name: "Copy transcript", exact: true })).toHaveAttribute("aria-disabled", "true");
  await page.clock.fastForward(60001);
  await field.focus();
  await page.evaluate(() => window.__dictozyTest.queueResponse({}, { defer: true }));
  await recordAndStop(page);
  await waitForRequestCount(page, 2);
  await field.fill("Edited second");
  await resolveLatestTranscript(page, "Second private transcript");
  await page.evaluate(() => window.__resolveCopy());
  await expect(page.getByRole("button", { name: "Copy transcript", exact: true })).toBeVisible();
  await page.evaluate(() => { navigator.clipboard.writeText = async (text) => { window.__copied = text; }; });
  await page.getByRole("button", { name: "Copy transcript", exact: true }).click();
  expect(await page.evaluate(() => window.__copied)).toBe("Second private transcript");
  await expect(field).toHaveValue("Edited second");
});

test("compact feedback and recovery remain visible with reduced motion on a narrow page", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loadContentScript(page);
  const field = page.locator("#plainTextarea");
  await page.addStyleTag({ content: "* { box-sizing: content-box; }" });
  await field.focus();
  await page.evaluate(() => {
    window.__dictozyTest.queueResponse({}, { defer: true });
    window.__dictozyTest.deferMicrophone = true;
  });
  await page.locator(MIC_BUTTON).click();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "requesting");
  expect(await page.locator(".voice-dictation-mic-icon--spin").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await page.evaluate(() => window.__dictozyTest.resolveMicrophone());
  const stop = page.getByRole("button", { name: "Stop recording", exact: true });
  await expect(stop).toBeVisible();
  await stop.focus();
  const bounds = await page.locator(".voice-dictation-status").boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(568);
  await page.screenshot({ path: testInfo.outputPath("recording-narrow.png") });
  await page.keyboard.press("Space");
  await waitForRequestCount(page, 1);
  await field.fill("Keep these edits");
  await resolveLatestTranscript(page);
  const panel = page.getByRole("region", { name: "Transcript recovery" });
  const recoveryBounds = await panel.boundingBox();
  expect(recoveryBounds.x).toBeGreaterThanOrEqual(0);
  expect(recoveryBounds.x + recoveryBounds.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: testInfo.outputPath("recovery-narrow.png") });
});

// This models the CSS viewport seen at 400% Chrome zoom on the inspected
// display. Chrome/media/provider are mocked; this is not a VoiceOver test.
async function expectCompactBounds(locator, viewport = { width: 300, height: 228 }) {
  await expect(locator).toBeVisible();
  const bounds = await locator.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
}

async function expectCompactControl(locator) {
  await expectCompactBounds(locator);
  expect(await locator.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
  })).toBe(true);
}

test("300x228 viewport keeps recording controls visible and keyboard reachable with restrained announcements", async ({ page }) => {
  await page.setViewportSize({ width: 300, height: 228 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loadContentScript(page);
  const field = page.locator("#plainTextarea");
  await field.fill("Keep this text.");
  await page.locator(MIC_BUTTON).click();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
  await page.waitForTimeout(250); // Include the normal recording safety checks.
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
  const controls = page.getByRole("group", { name: "Dictation controls", exact: true });
  const stop = page.getByRole("button", { name: "Stop recording", exact: true });
  const discard = page.getByRole("button", { name: "Discard recording", exact: true });
  await expectCompactBounds(controls);
  for (const control of [page.locator(MIC_BUTTON), stop, discard]) await expectCompactControl(control);
  await expect(page.locator(STATUS_MESSAGE)).toHaveAttribute("role", "status");
  await expect(page.locator(STATUS_MESSAGE)).toHaveAttribute("aria-live", "polite");
  await expect(page.locator(STATUS_MESSAGE)).toHaveAttribute("aria-atomic", "true");
  await expect(page.locator(".voice-dictation-timing")).toHaveAttribute("aria-live", "off");
  await expect(page.locator(".voice-dictation-activity")).toHaveAttribute("aria-live", "off");
  expect(await page.locator(MIC_BUTTON).evaluate((element) => getComputedStyle(element).transitionDuration)).toBe("0s");
  await expect(field).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(MIC_BUTTON)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(stop).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(discard).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(stop).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Keep this text.");
  expect(await page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);
});

test("recording panel avoids a bottom composer at 300x228 through timer updates and resize", async ({ page }, testInfo) => {
  const compactViewport = { width: 300, height: 228 };
  await page.setViewportSize(compactViewport);
  await loadContentScript(page);
  // Generic responsive composer geometry: the editor spans most of the small
  // viewport, leaving the microphone above it. This is not a live-app test.
  await page.evaluate(() => {
    const field = document.createElement("textarea");
    field.id = "bottomComposer";
    field.setAttribute("aria-label", "Bottom composer");
    field.style.cssText = "position:fixed;left:16px;right:34px;bottom:16px;width:auto;height:110px;min-height:0;box-sizing:border-box;margin:0;resize:none;";
    document.body.replaceChildren(field);
  });
  const field = page.getByRole("textbox", { name: "Bottom composer", exact: true });
  await field.fill("Alpha Beta Gamma");
  await field.evaluate((element) => element.setSelectionRange(6, 10));
  await page.locator(MIC_BUTTON).click();
  const controls = page.getByRole("group", { name: "Dictation controls", exact: true });
  const stop = page.getByRole("button", { name: "Stop recording", exact: true });
  const discard = page.getByRole("button", { name: "Discard recording", exact: true });

  async function expectClearComposer(viewport) {
    await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
    await expectCompactBounds(controls, viewport);
    const editorBounds = await field.boundingBox();
    const panelBounds = await controls.boundingBox();
    const overlapWidth = Math.max(0, Math.min(editorBounds.x + editorBounds.width, panelBounds.x + panelBounds.width) - Math.max(editorBounds.x, panelBounds.x));
    const overlapHeight = Math.max(0, Math.min(editorBounds.y + editorBounds.height, panelBounds.y + panelBounds.height) - Math.max(editorBounds.y, panelBounds.y));
    expect(overlapWidth * overlapHeight, `Feedback must not cover the editor: ${JSON.stringify({ editorBounds, panelBounds })}`).toBe(0);
    for (const control of [page.locator(MIC_BUTTON), stop, discard]) {
      await expectCompactBounds(control, viewport);
      expect(await control.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
      })).toBe(true);
    }
  }

  await expectClearComposer(compactViewport);
  await expect(page.locator(".voice-dictation-timing")).toContainText("1s elapsed");
  await expectClearComposer(compactViewport);
  await page.setViewportSize({ width: 340, height: 260 });
  await expectClearComposer({ width: 340, height: 260 });
  await page.setViewportSize(compactViewport);
  await expectClearComposer(compactViewport);
  await page.screenshot({ path: testInfo.outputPath("compact-bottom-composer-recording.png") });
  await expect(field).toBeFocused();
  expect(await field.evaluate((element) => [element.selectionStart, element.selectionEnd])).toEqual([6, 10]);
  await page.keyboard.press("Tab");
  await expect(page.locator(MIC_BUTTON)).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(stop).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(discard).toBeFocused();
  await page.keyboard.press("Space");
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Alpha Beta Gamma");
  expect(await field.evaluate((element) => [element.selectionStart, element.selectionEnd])).toEqual([6, 10]);
  expect(await page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);
});

test("300x228 viewport keeps recovery and clipboard failure controls visible and keyboard reachable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loadContentScript(page);
  const field = await focusFirstTextField(page);
  await page.evaluate(() => window.__dictozyTest.queueResponse({}, { defer: true }));
  await recordAndStop(page);
  await waitForRequestCount(page, 1);
  await field.fill("Keep these edits");
  await resolveLatestTranscript(page);
  // Reflow an existing result as a user increases zoom after dictation.
  await page.setViewportSize({ width: 300, height: 228 });
  const panel = page.getByRole("region", { name: "Transcript recovery", exact: true });
  const copy = page.getByRole("button", { name: "Copy transcript", exact: true });
  const discard = page.getByRole("button", { name: "Discard transcript", exact: true });
  await expectCompactBounds(panel);
  await expectCompactControl(copy);
  await expectCompactControl(discard);
  const announcement = page.locator(".voice-dictation-announcement");
  await expect(announcement).toHaveAttribute("role", "status");
  await expect(announcement).toHaveAttribute("aria-live", "polite");
  await expect(announcement).toHaveAttribute("aria-atomic", "true");
  await expect(announcement).toContainText("The field changed");
  expect(await panel.getAttribute("aria-live")).toBeNull();
  expect(await page.locator("html").innerHTML()).not.toContain("private dictated result");
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true, value: { writeText: async () => { throw new Error("fixture denial"); } },
  }));
  await copy.focus();
  await page.keyboard.press("Space");
  await expect(panel).toContainText("Clipboard unavailable");
  await expect(announcement).toContainText("Clipboard unavailable");
  await expectCompactBounds(panel);
  await expectCompactControl(copy);
  await expectCompactControl(discard);
  await expect(copy).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(discard).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(copy).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(panel).toHaveCount(0);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Keep these edits");
});

test("popup practice is explicitly opened and can be revisited without changing preferences", async ({ page }) => {
  await page.goto("/extension/popup.html");
  await expect(page.locator("#status")).toHaveText("Ready.");
  const before = await page.evaluate(() => window.__dictozyTest.storage());
  const open = page.getByRole("button", { name: "Try dictation", exact: true });
  await open.evaluate((button) => button.click());
  expect(await page.evaluate(() => window.__dictozyTest.createdTabs.length)).toBe(0);
  await open.focus();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => window.__dictozyTest.createdTabs[0].url)).toBe("chrome-extension://test-extension/practice.html");
  await page.reload();
  await page.getByRole("button", { name: "Try dictation", exact: true }).click();
  expect(await page.evaluate(() => window.__dictozyTest.createdTabs.length)).toBe(1);
  expect(await page.evaluate(() => window.__dictozyTest.storage())).toEqual(before);
});

test("Tab reaches recording controls on ordinary pages and Shift Tab returns to the editor", async ({ page }) => {
  await loadContentScript(page);
  const field = await focusFirstTextField(page);
  await field.fill("Alpha Beta");
  await field.evaluate((el) => el.setSelectionRange(6, 10));
  await page.locator(MIC_BUTTON).click();
  await expect(field).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(MIC_BUTTON)).toBeFocused();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
  await page.keyboard.press("Shift+Tab");
  await expect(field).toBeFocused();
  expect(await field.evaluate((el) => [el.selectionStart, el.selectionEnd])).toEqual([6, 10]);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Stop recording", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Discard recording", exact: true })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Alpha Beta");
  expect(await page.evaluate(() => window.__dictozyTest.requests.length)).toBe(0);
});

test("recording Tab navigation honors editor handlers and ignores synthetic keys", async ({ page }) => {
  await loadContentScript(page);
  const field = await focusFirstTextField(page);
  await page.locator(MIC_BUTTON).click();
  await field.evaluate((el) => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    el.addEventListener("keydown", (event) => event.preventDefault(), { once: true });
  });
  await expect(field).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(field).toBeFocused();
  await expect(page.locator(MIC_BUTTON)).toHaveAttribute("data-state", "recording");
  await page.keyboard.press("Tab");
  await expect(page.locator(MIC_BUTTON)).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Space");
  await expect(field).toHaveValue("Default transcript");
});
