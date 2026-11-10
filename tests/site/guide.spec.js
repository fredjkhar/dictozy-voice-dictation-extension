const { test, expect } = require("@playwright/test");

const original = "For our studio visit:";
const result = `${original} Bring the blue notebook.`;
const store = "https://chromewebstore.google.com/detail/folpeencabfejhjokmldikaelonphmma";

async function hidePage(page, event = "visibilitychange") {
  await page.evaluate(name => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    (name === "pagehide" ? window : document).dispatchEvent(new Event(name));
    delete document.hidden;
  }, event);
}

async function startAndStop(page) {
  await page.locator("#sample-mic").click();
  await page.locator("#stop-recording").click();
}

test("one note carries recording through processing, insertion, Undo and replay with keyboard focus", async ({ page }) => {
  await page.clock.install();
  await page.goto("/guide.html");
  await expect(page.locator('script[src^="guide.js"]')).toHaveAttribute("src", "guide.js?v=continuous-1");
  await expect(page.getByRole("heading", { name: "Try Dictozy.", exact: true })).toBeVisible();
  await expect(page.getByText("Start the sample, then stop to see text appear.", { exact: true })).toBeVisible();
  await expect(page.getByText("Demo only — no microphone access or audio upload.", { exact: false }).first()).toBeVisible();
  for (const id of ["install", "recover", "vocabulary"]) await expect(page.locator(`#${id}`)).toHaveJSProperty("open", false);
  await expect(page.locator(".guide-index, .guide-progress, .guide-pager, #insert-note")).toHaveCount(0);
  const note = page.locator("#record-note");
  const mic = page.getByRole("button", { name: "Start sample recording", exact: true });
  await expect(note).toHaveText(original);
  await mic.focus();
  expect(await mic.evaluate(el => el.matches(":focus-visible") && getComputedStyle(el).outlineStyle !== "none")).toBe(true);
  await mic.press("Enter");
  await expect(page.locator("#stop-recording")).toBeFocused();
  await page.clock.runFor(3000);
  await expect(page.locator("#rec-timer")).toHaveText("3s elapsed · 7s left");
  await expect(page.locator("#rec-timer")).toHaveAttribute("aria-live", "off");
  await expect(page.locator("#guide-status")).not.toContainText(/3s|7s/);
  await page.locator("#stop-recording").press("Enter");
  await expect(page.locator("#cancel-recording-result")).toBeFocused();
  await expect(note).toHaveText(original);
  await page.clock.runFor(2401);
  await expect(note).toHaveText(result);
  await expect(page.locator("#guide-status")).toHaveText("Your sample text is ready.");
  await expect(page.locator("#undo-insert")).toBeFocused();
  await expect(page.locator("#record").getByRole("link", { name: "Add to Chrome", exact: true })).toHaveAttribute("href", store);
  await page.locator("#undo-insert").press("Enter");
  await expect(note).toHaveText(original);
  await expect(page.locator("#guide-status")).toHaveText("Undone. Your original note is back.");
  await expect(page.locator("#replay-demo")).toBeFocused();
  await page.locator("#replay-demo").press("Enter");
  await expect(mic).toBeFocused();
  await expect(page.locator("#guide-status")).toHaveText("Select the microphone to start the demo.");
  await expect(page.locator("#rec-panel:visible, #cancel-recording-result:visible, #undo-insert:visible, #replay-demo:visible")).toHaveCount(0);
});

test("Discard and Cancel preserve the note, replay clears state, and the sample stops automatically at ten seconds", async ({ page }) => {
  await page.clock.install();
  await page.goto("/guide.html#record");
  const note = page.locator("#record-note");
  await page.locator("#sample-mic").click();
  await page.locator("#discard-recording").click();
  await page.clock.runFor(15000);
  await expect(note).toHaveText(original);
  await expect(page.locator("#guide-status")).toHaveText("Discarded. Your note is unchanged.");
  await expect(page.locator("#sample-mic")).toBeFocused();
  await startAndStop(page);
  await page.locator("#cancel-recording-result").click();
  await expect(page.locator("#guide-status")).toContainText(/cancelled/i);
  await expect(page.locator("#sample-mic")).toBeFocused();
  await page.clock.runFor(15000);
  await expect(note).toHaveText(original);
  await expect(page.locator("#guide-status")).toContainText(/cancelled/i);
  await page.locator("#sample-mic").click();
  await page.clock.runFor(10000);
  await expect(page.locator("#rec-panel")).toBeHidden();
  await expect(page.locator("#cancel-recording-result")).toBeVisible();
  await page.clock.runFor(2401);
  await expect(note).toHaveText(result);
  await page.locator("#replay-demo").click();
  await expect(note).toHaveText(original);
  await expect(page.locator("#rec-timer")).toHaveText("0s elapsed · 10s left");
});

test("hiding or leaving the page invalidates both recording and pending delivery", async ({ page }) => {
  await page.clock.install();
  for (const event of ["visibilitychange", "pagehide"]) {
    for (const stop of [false, true]) {
      await page.goto("/guide.html");
      await page.locator("#sample-mic").click();
      if (stop) await page.locator("#stop-recording").click();
      await hidePage(page, event);
      await page.clock.runFor(15000);
      await expect(page.locator("#record-note")).toHaveText(original);
      await expect(page.locator("#rec-panel")).toBeHidden();
      await expect(page.locator("#cancel-recording-result")).toBeHidden();
      await expect(page.locator("#undo-insert")).toBeHidden();
    }
  }
});

test("recovery Copy, Discard, expiry and closing preserve the edited draft and clear transient content", async ({ page }) => {
  await page.clock.install();
  await page.goto("/guide.html#recover");
  const edit = page.locator("#edit-draft");
  const draft = page.locator("#recover-note");
  const copy = page.locator("#copy-sample");
  await expect(page.locator("#recover")).toHaveJSProperty("open", true);
  await expect(page.locator("#expire-sample")).toHaveCount(0);
  await edit.click();
  await expect(copy).toBeFocused();
  await expect(page.locator("#recover")).toContainText("Your draft changed, so Dictozy left it untouched.");
  await copy.press("Enter");
  await expect(page.locator("#sample-tray")).toContainText("Bring the blue notebook.");
  await expect(page.locator("#recover")).toContainText(/practice clipboard/i);
  await expect(draft).toHaveText("For our Friday studio visit:");
  await edit.click();
  await page.locator("#discard-sample").click();
  await expect(page.locator("#sample-tray")).toBeHidden();
  await expect(page.locator("#sample-tray-text")).toBeEmpty();
  await expect(draft).toHaveText("For our Friday studio visit:");
  await edit.click();
  await page.clock.fastForward(60001);
  await expect(copy).toBeHidden();
  await expect(page.locator("#recovery-status")).toContainText(/expired/i);
  await expect(edit).toBeFocused();
  await expect(draft).toHaveText("For our Friday studio visit:");
  await edit.click();
  await page.locator("#recover summary").click();
  await expect(page.locator("#recovery-panel")).toHaveJSProperty("hidden", true);
  await page.locator("#recover summary").click();
  await expect(copy).toBeHidden();
  await expect(page.locator("#sample-tray-text")).toBeEmpty();
  await expect(draft).toHaveText("For our Friday studio visit:");
  await edit.click();
  await copy.click();
  await hidePage(page);
  await expect(page.locator("#sample-tray-text")).toBeEmpty();
  await expect(draft).toHaveText("For our Friday studio visit:");
  await edit.click();
  await hidePage(page);
  await page.clock.fastForward(60001);
  await expect(copy).toBeHidden();
  await expect(page.locator("#recovery-status")).not.toContainText(/expired/i);
});

test("optional vocabulary consent and recovery stay independent of the main demo", async ({ page }) => {
  await page.clock.install();
  await page.goto("/guide.html#vocabulary");
  const sharing = page.getByRole("switch");
  const save = page.locator("#save-term");
  await expect(sharing).toBeDisabled();
  await save.click();
  await expect(sharing).toBeFocused();
  await expect(sharing).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("#vocabulary-status")).toHaveText("Saved. Sharing is still off.");
  await expect(page.locator("#sharing-help")).toContainText("In the extension, saving keeps your terms in Chrome. Enable sharing to send them with dictations to Dictozy and xAI.");
  await expect(page.locator("#vocabulary")).toContainText(/sends nothing/i);
  await sharing.press("Space");
  await expect(sharing).toHaveAttribute("aria-checked", "true");
  await sharing.press("Space");
  await expect(sharing).toHaveAttribute("aria-checked", "false");
  await sharing.click();
  await page.locator("#recover summary").click();
  await page.locator("#edit-draft").click();
  await startAndStop(page);
  // Dismissing recovery must not cancel the independent main result or revoke consent.
  await page.locator("#recover summary").click();
  await page.clock.runFor(2401);
  await expect(page.locator("#record-note")).toHaveText(result);
  await page.locator("#replay-demo").click();
  await expect(sharing).toHaveAttribute("aria-checked", "true");
  await page.locator("#clear-term").click();
  await expect(save).toBeFocused();
  await expect(sharing).toBeDisabled();
  await expect(sharing).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("#term-result")).toHaveText("No vocabulary");
});

test("legacy fragments reveal the right section without starting actions and preserve browser history", async ({ page }) => {
  for (const id of ["install", "record", "insert", "recover", "vocabulary", "troubleshoot"]) {
    await page.goto(`/guide.html#${id}`);
    if (["install", "recover", "vocabulary"].includes(id)) {
      await expect(page.locator(`#${id}`)).toHaveJSProperty("open", true);
      await expect(page.locator(`#${id} summary`)).toBeFocused();
    } else if (id === "insert") {
      await expect(page.locator("#insert-guidance")).toBeVisible();
      await expect(page.locator("#record")).toBeInViewport();
    } else {
      await expect(page.locator(`#${id}`)).toBeInViewport();
    }
    await expect(page.locator("#record-note")).toHaveText(original);
    await expect(page.locator("#rec-panel")).toBeHidden();
    await expect(page.locator("#share-term")).toHaveAttribute("aria-checked", "false");
  }
  await page.goto("/support.html");
  await page.getByRole("link", { name: "Try the recovery example" }).click();
  await expect(page.locator("#recover")).toHaveJSProperty("open", true);
  await page.evaluate(() => { location.hash = "vocabulary"; });
  await expect(page.locator("#vocabulary")).toHaveJSProperty("open", true);
  await page.goBack();
  await expect(page).toHaveURL(/#recover$/);
  await expect(page.locator("#recover summary")).toBeFocused();
  await page.goForward();
  await expect(page).toHaveURL(/#vocabulary$/);
  await expect(page.locator("#vocabulary summary")).toBeFocused();
});

test("all scenarios avoid microphone, service, clipboard and persistent storage APIs", async ({ page, baseURL }) => {
  const forbiddenRequests = [];
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    const req = route.request();
    if (new URL(req.url()).origin !== baseURL || req.method() !== "GET" ||
      !["document", "script", "stylesheet", "image"].includes(req.resourceType())) {
      forbiddenRequests.push(req.url());
      return route.abort();
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    window.__unsafeCalls = [];
    const block = name => function () { window.__unsafeCalls.push(name); throw new Error(`Forbidden demo API: ${name}`); };
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: block("getUserMedia") });
    for (const name of ["SpeechRecognition", "webkitSpeechRecognition", "MediaRecorder", "WebSocket", "AudioContext", "webkitAudioContext"])
      Object.defineProperty(window, name, { configurable: true, value: block(name) });
    window.fetch = block("fetch");
    XMLHttpRequest.prototype.open = block("XMLHttpRequest");
    navigator.sendBeacon = block("sendBeacon");
    for (const name of ["read", "readText", "write", "writeText"])
      Object.defineProperty(navigator.clipboard, name, { configurable: true, value: block(`clipboard.${name}`) });
    for (const name of ["getItem", "setItem", "removeItem", "clear"]) Storage.prototype[name] = block(`Storage.${name}`);
    indexedDB.open = block("indexedDB.open");
  });
  await page.clock.install();
  await page.goto("/guide.html");
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute("content", "connect-src 'none'; media-src 'none'; form-action 'none'; object-src 'none'");
  await startAndStop(page);
  await page.clock.runFor(2401);
  await page.locator("#recover summary").click();
  await page.locator("#edit-draft").click();
  await page.locator("#copy-sample").click();
  await page.locator("#vocabulary summary").click();
  await page.locator("#save-term").click();
  await page.locator("#share-term").click();
  await page.locator("#clear-term").click();
  await expect(page.locator('textarea, [contenteditable="true"], input, form')).toHaveCount(0);
  expect(await page.evaluate(() => window.__unsafeCalls)).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  expect(forbiddenRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe("guide without scripts", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 320, height: 640 } });
  test("the note, instructions and optional disclosures remain readable without inert sample controls", async ({ page }) => {
    await page.goto("/guide.html");
    await expect(page.getByRole("heading", { name: "Try Dictozy.", exact: true })).toBeVisible();
    await expect(page.getByText("Demo only — no microphone access or audio upload.", { exact: false }).first()).toBeVisible();
    await expect(page.locator("#record-note")).toHaveText(original);
    for (const id of ["install", "recover", "vocabulary"]) {
      const summary = page.locator(`#${id} summary`);
      await summary.focus();
      await summary.press("Enter");
      await expect(page.locator(`#${id}`)).toHaveJSProperty("open", true);
    }
    await expect(page.locator("#recover")).toContainText("up to 60 seconds");
    await expect(page.locator("#recover")).toContainText(/cancelled dictation/i);
    await expect(page.locator("#sharing-help")).toBeVisible();
    await expect(page.locator("#install")).toContainText(/backend to xAI/);
    await expect(page.locator('#troubleshoot a[href*="support.html"]')).toBeVisible();
    expect(await page.locator("main button").evaluateAll(buttons => buttons.some(button => button.checkVisibility()))).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});
