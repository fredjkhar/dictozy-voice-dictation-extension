const { test, expect } = require("@playwright/test");

const storageKey = "dictozy.web.draft.v1";
const micSelector = ".voice-dictation-mic-button";

// Deterministic adapter checks. Installed-extension/synthetic audio coverage is separate.
async function workspace(page, baseURL, { stored } = {}) {
  const origin = new URL(baseURL).origin;
  const requests = [];
  const blocked = [];
  let responseGate = Promise.resolve();
  let releaseResponse = () => {};
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin) {
      blocked.push(request.url());
      return route.abort("blockedbyclient");
    }
    if (url.pathname === "/workspace-config.js") {
      return route.fulfill({ contentType: "application/javascript", body:
        `globalThis.DictozyWebConfig=Object.freeze({endpoint:${JSON.stringify(origin + "/api/transcribe")},localReview:true});` });
    }
    if (url.pathname === "/workspace.html") {
      const response = await route.fetch();
      return route.fulfill({ response, body: (await response.text()).replace(
        "connect-src https://voice-dictation-extension.onrender.com", `connect-src ${origin}`) });
    }
    if (url.pathname === "/api/transcribe") {
      requests.push({ method: request.method(), body: request.postData() || "", headers: request.headers() });
      await responseGate;
      try { await route.fulfill({ json: { transcript: "Bring the blue notebook." } }); } catch (_) { /* Client cancelled. */ }
      return;
    }
    return route.continue();
  });
  await page.addInitScript(({ stored, storageKey }) => {
    const state = window.__workspaceTest = {
      requests: 0, starts: 0, stops: 0, copies: [], clipboardDenied: false,
      permissionDenied: false, deferPermission: false, pendingPermissions: [],
    };
    if (stored !== undefined && !sessionStorage.getItem("workspace-test-seeded")) {
      localStorage.setItem(storageKey, stored);
      sessionStorage.setItem("workspace-test-seeded", "true");
    }
    function stream() {
      const track = new EventTarget();
      track.muted = false;
      track.readyState = "live";
      track.stop = () => { if (track.readyState !== "ended") { track.readyState = "ended"; state.stops += 1; } };
      return { getTracks: () => [track], getAudioTracks: () => [track] };
    }
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
      getUserMedia: async () => {
        state.requests += 1;
        if (state.permissionDenied) throw new DOMException("private details", "NotAllowedError");
        if (state.deferPermission) return new Promise(resolve => state.pendingPermissions.push(() => resolve(stream())));
        return stream();
      },
    } });
    window.MediaRecorder = class extends EventTarget {
      static isTypeSupported(type) { return type.startsWith("audio/webm"); }
      constructor(_stream, options) { super(); this.mimeType = options.mimeType; this.state = "inactive"; }
      start() { this.state = "recording"; state.starts += 1; }
      stop() {
        if (this.state === "inactive") return;
        this.state = "inactive";
        queueMicrotask(() => {
          const event = new Event("dataavailable");
          event.data = new Blob(["synthetic browser fixture"], { type: this.mimeType });
          this.dispatchEvent(event);
          this.dispatchEvent(new Event("stop"));
        });
      }
    };
    Object.defineProperty(window, "AudioContext", { configurable: true, value: undefined });
    Object.defineProperty(window, "webkitAudioContext", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async text => {
        if (state.clipboardDenied) throw new DOMException("Denied", "NotAllowedError");
        state.copies.push(text);
      },
      readText: () => { throw new Error("The workspace must never read the clipboard"); },
    } });
  }, { stored, storageKey });
  await page.goto("/try.html");
  const frame = page.frames().find(frame => new URL(frame.url()).pathname === "/workspace.html");
  expect(frame).toBeTruthy();
  await expect(frame.locator("#draft")).toBeEnabled();
  await expect(frame.locator(micSelector)).toBeVisible();
  return {
    frame, requests, blocked,
    defer() { responseGate = new Promise(resolve => { releaseResponse = resolve; }); },
    release() { releaseResponse(); },
  };
}

async function recordAndStop(frame) {
  await frame.locator(micSelector).click();
  await expect(frame.locator(micSelector)).toHaveAttribute("data-state", "recording");
  await frame.getByRole("button", { name: "Stop recording", exact: true }).click();
}

test("workspace starts without capture, focus or draft persistence; Copy is explicit and truthful", async ({ page, baseURL }) => {
  const { frame, requests, blocked } = await workspace(page, baseURL);
  const draft = frame.locator("#draft");
  await expect(draft).not.toBeFocused();
  expect(await frame.evaluate(() => window.__workspaceTest.requests)).toBe(0);
  await frame.locator(micSelector).evaluate(button => button.click());
  expect(await frame.evaluate(() => window.__workspaceTest.requests)).toBe(0);
  await expect(frame.locator("#copy-text")).toBeDisabled();
  await draft.fill("A private draft.\nSecond line.");
  await expect(frame.locator("#word-count")).toHaveText("5 words");
  expect(await frame.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull();
  expect(await frame.evaluate(() => window.__workspaceTest.copies)).toEqual([]);
  await frame.locator("#copy-text").click();
  await expect(frame.locator("#workspace-feedback")).toHaveText("Text copied.");
  expect(await frame.evaluate(() => window.__workspaceTest.copies)).toEqual(["A private draft.\nSecond line."]);
  await frame.evaluate(() => { window.__workspaceTest.clipboardDenied = true; });
  await frame.locator("#copy-text").click();
  await expect(frame.locator("#workspace-feedback")).toContainText("Copy was unavailable");
  await expect(draft).toHaveValue("A private draft.\nSecond line.");
  expect(requests).toHaveLength(0);
  expect(blocked).toEqual([]);
});

test("website adapter inserts at the retained selection with native Undo and sends audio settings only", async ({ page, baseURL }) => {
  const { frame, requests, blocked } = await workspace(page, baseURL);
  const draft = frame.locator("#draft");
  await draft.fill("Alpha Beta Gamma");
  await draft.evaluate(el => { el.setSelectionRange(6, 10); window.originalEditor = el; });
  await recordAndStop(frame);
  await expect(draft).toHaveValue("Alpha Bring the blue notebook. Gamma");
  expect(await draft.evaluate(el => el === window.originalEditor)).toBe(true);
  expect(await frame.evaluate(() => window.__workspaceTest.stops)).toBe(1);
  expect(requests).toHaveLength(1);
  expect(requests[0].method).toBe("POST");
  expect(requests[0].body).toContain('name="file"');
  expect(requests[0].body).toContain('name="language"');
  expect(requests[0].body).not.toContain("Alpha");
  expect(requests[0].body).not.toContain("vocabulary");
  expect(requests[0].headers["x-request-id"]).toMatch(/^[A-Za-z0-9_-]{8,80}$/);
  await draft.press("ControlOrMeta+z");
  await expect(draft).toHaveValue("Alpha Beta Gamma");
  expect(blocked).toEqual([]);
});

test("Clear cancellation preserves selection; confirmed Clear deletes draft and cancels late results", async ({ page, baseURL }) => {
  const state = await workspace(page, baseURL);
  const { frame } = state;
  const draft = frame.locator("#draft");
  await draft.fill("Keep this text.");
  await draft.evaluate(el => el.setSelectionRange(5, 9, "backward"));
  await frame.locator("#clear-text").click();
  await frame.locator("#cancel-clear").click();
  await expect(draft).toHaveValue("Keep this text.");
  expect(await draft.evaluate(el => [el.selectionStart, el.selectionEnd, el.selectionDirection])).toEqual([5, 9, "backward"]);
  await frame.locator(".workspace-settings summary").click();
  await frame.locator("#remember-draft").check();
  state.defer();
  await recordAndStop(frame);
  await expect.poll(() => state.requests.length).toBe(1);
  await frame.locator("#clear-text").click();
  await frame.locator("#confirm-clear").click();
  state.release();
  await expect(draft).toHaveValue("");
  expect(await frame.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull();
  await page.waitForTimeout(150);
  await expect(draft).toHaveValue("");
  await expect(frame.locator(".voice-dictation-recovery")).toHaveCount(0);
});

test("Discard sends no clip and processing cancellation cannot insert a late website response", async ({ page, baseURL }) => {
  const state = await workspace(page, baseURL);
  const { frame } = state;
  const draft = frame.locator("#draft");
  await draft.fill("Keep this note.");
  await frame.locator(micSelector).click();
  await frame.getByRole("button", { name: "Discard recording", exact: true }).click();
  expect(state.requests).toHaveLength(0);
  expect(await frame.evaluate(() => window.__workspaceTest.stops)).toBe(1);
  state.defer();
  await recordAndStop(frame);
  await expect.poll(() => state.requests.length).toBe(1);
  await frame.getByRole("button", { name: "Cancel transcription", exact: true }).click();
  state.release();
  await page.waitForTimeout(150);
  await expect(draft).toHaveValue("Keep this note.");
  await expect(frame.locator(".voice-dictation-recovery")).toHaveCount(0);
  expect(await frame.evaluate(() => window.__workspaceTest.stops)).toBe(2);
  expect(state.blocked).toEqual([]);
});

test("remembering requires consent, restores one plain-text draft, and disabling removes it", async ({ page, baseURL }) => {
  let { frame } = await workspace(page, baseURL);
  await frame.locator("#draft").fill("<b>Plain text only</b>\nOne draft.");
  expect(await frame.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull();
  await frame.locator(".workspace-settings summary").click();
  await frame.locator("#remember-draft").check();
  await expect(frame.locator("#save-status")).toHaveText("Saved in this browser.");
  await page.reload();
  frame = page.frames().find(frame => new URL(frame.url()).pathname === "/workspace.html");
  await expect(frame.locator("#draft")).toHaveValue("<b>Plain text only</b>\nOne draft.");
  await expect(frame.locator("#remember-draft")).toBeChecked();
  await expect(frame.locator("#workspace b")).toHaveCount(0);
  await frame.locator(".workspace-settings summary").click();
  await frame.locator("#remember-draft").uncheck();
  expect(await frame.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull();
  await expect(frame.locator("#draft")).toHaveValue("<b>Plain text only</b>\nOne draft.");
});

test("malformed saved data and storage failures never claim a successful save or deletion", async ({ page, baseURL }) => {
  const { frame } = await workspace(page, baseURL, { stored: '{"version":1,"text":42}' });
  await expect(frame.locator("#draft")).toHaveValue("");
  await expect(frame.locator("#remember-draft")).not.toBeChecked();
  expect(await frame.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull();
  await frame.locator(".workspace-settings summary").click();
  await frame.locator("#draft").fill("Retain this text.");
  await frame.evaluate(() => {
    window.originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
  });
  await frame.locator("#remember-draft").check();
  await expect(frame.locator("#save-status")).toContainText("Could not save");
  await expect(frame.locator("#remember-draft")).not.toBeChecked();
  await frame.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await frame.locator("#remember-draft").check();
  await expect(frame.locator("#save-status")).toHaveText("Saved in this browser.");
  await frame.evaluate(() => {
    Storage.prototype.removeItem = () => { throw new DOMException("Denied", "SecurityError"); };
  });
  await frame.locator("#remember-draft").uncheck();
  await expect(frame.locator("#save-status")).toContainText("could not be cleared");
  await expect(frame.locator("#draft")).toHaveValue("Retain this text.");
});

test("newer edits stay untouched and eligible recovery copies only after a click", async ({ page, baseURL }) => {
  const state = await workspace(page, baseURL);
  const { frame } = state;
  const draft = frame.locator("#draft");
  await draft.fill("Alpha Beta");
  state.defer();
  await recordAndStop(frame);
  await expect.poll(() => state.requests.length).toBe(1);
  await draft.fill("Dear Alpha Beta");
  state.release();
  await expect(frame.locator(".voice-dictation-recovery")).toBeVisible();
  await expect(draft).toHaveValue("Dear Alpha Beta");
  expect(await frame.evaluate(() => window.__workspaceTest.copies)).toEqual([]);
  await frame.getByRole("button", { name: "Copy transcript", exact: true }).click();
  expect(await frame.evaluate(() => window.__workspaceTest.copies)).toEqual(["Bring the blue notebook."]);
  await expect(frame.locator(".voice-dictation-recovery")).toHaveCount(0);
  await expect(draft).toHaveValue("Dear Alpha Beta");
});

test("permission denial and abandoned late permission keep typing usable and stop the late track", async ({ page, baseURL }) => {
  const { frame, requests } = await workspace(page, baseURL);
  await frame.locator("#draft").fill("Keep this note.");
  await frame.evaluate(() => { window.__workspaceTest.permissionDenied = true; });
  await frame.locator(micSelector).click();
  await expect(frame.locator(".voice-dictation-status__message")).toContainText("Microphone access is blocked");
  await expect(frame.locator("#draft")).toBeEnabled();
  await frame.evaluate(() => {
    window.__workspaceTest.permissionDenied = false;
    window.__workspaceTest.deferPermission = true;
  });
  await frame.locator(micSelector).click();
  await expect.poll(() => frame.evaluate(() => window.__workspaceTest.pendingPermissions.length)).toBe(1);
  await frame.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.__workspaceTest.pendingPermissions.shift()();
  });
  await expect.poll(() => frame.evaluate(() => window.__workspaceTest.stops)).toBe(1);
  expect(await frame.evaluate(() => window.__workspaceTest.starts)).toBe(0);
  expect(requests).toHaveLength(0);
  await expect(frame.locator("#draft")).toHaveValue("Keep this note.");
});

test("the embedded document cannot independently activate, and no-JS visitors can type", async ({ page, browser, baseURL }) => {
  await page.goto("/workspace.html");
  await expect(page.locator("#draft")).toBeDisabled();
  await expect(page.locator(micSelector)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Dictozy writing workspace" })).toHaveAttribute("href", "/try.html");
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const nojs = await context.newPage();
    await nojs.goto(baseURL + "/try.html");
    const draft = nojs.frameLocator("iframe.workspace-nojs").getByRole("textbox", { name: "Your text" });
    await draft.fill("Typed without JavaScript.");
    await expect(draft).toHaveValue("Typed without JavaScript.");
    await expect(nojs.getByRole("link", { name: "Microphone help" })).toHaveAttribute("href", "/support.html#microphone");
  } finally { await context.close(); }
});
