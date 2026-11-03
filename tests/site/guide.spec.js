const { test, expect } = require("@playwright/test");

test("guide links, history and keyboard navigation select a step and focus its heading", async ({ page }) => {
  await page.goto("/guide.html");
  await expect(page.getByText("Step 1 of 6")).toBeVisible();
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeDisabled();

  const next = page.getByRole("button", { name: "Next step" });
  await next.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#record$/);
  await expect(page.getByRole("heading", { name: "Recording controls" })).toBeFocused();
  await expect(page.getByRole("link", { name: "Recording controls" })).toHaveAttribute("aria-current", "step");

  await page.getByRole("link", { name: "Skip to help" }).click();
  await expect(page.getByText("Step 6 of 6")).toBeVisible();
  await page.goBack();
  await expect(page.getByText("Step 2 of 6")).toBeVisible();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByText("Step 1 of 6")).toBeVisible();

  await page.goto("/guide.html#recover");
  await expect(page.getByRole("heading", { name: "Recover a transcript" })).toBeFocused();
});

test("stop, discard, automatic stop and reset remain local and cancel outstanding sample delivery", async ({ page, baseURL }) => {
  const remoteOrDynamicRequests = [];
  const audioCalls = [];
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (new URL(req.url()).origin !== baseURL || req.method() !== "GET" ||
        !["document", "script", "stylesheet", "image"].includes(req.resourceType())) {
      remoteOrDynamicRequests.push(req.url());
      return route.abort();
    }
    await route.continue();
  });
  await page.exposeFunction("reportAudioCall", (api) => { audioCalls.push(api); });
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: () => {
      window.reportAudioCall("getUserMedia");
      return Promise.reject(new Error("Microphone unavailable in simulation test"));
    } });
    for (const name of ["SpeechRecognition", "webkitSpeechRecognition"]) {
      Object.defineProperty(window, name, { configurable: true, value: class {
        constructor() { window.reportAudioCall(name); }
      } });
    }
  });
  await page.clock.install();
  await page.goto("/guide.html#record");
  const mic = page.getByRole("button", { name: "Start sample microphone" });
  await mic.click();
  await page.clock.runFor(3000);
  await expect(page.locator("#rec-timer")).toHaveText("3s elapsed · 7s left");
  await expect(page.locator("#rec-timer")).toHaveAttribute("aria-live", "off");
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.clock.runFor(14000);
  await expect(page.locator("#record-note")).toHaveText("For our studio visit:");
  await expect(page.getByRole("status")).toContainText("Recording discarded");

  await mic.click();
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await page.getByRole("button", { name: "Reset guide" }).click();
  await page.clock.runFor(15000);
  await expect(page.getByRole("status")).toContainText("Guide reset");
  await page.getByRole("link", { name: "Recording controls" }).click();
  await expect(page.locator("#record-note")).toHaveText("For our studio visit:");
  await mic.click();
  await page.clock.runFor(10500);
  await expect(page.getByRole("button", { name: "Cancel transcription" })).toBeVisible();
  await page.clock.runFor(2500);
  await expect(page.locator("#record-note")).toHaveText("For our studio visit: Bring the blue notebook.");

  await page.getByRole("link", { name: "Vocabulary and settings" }).click();
  await page.getByRole("button", { name: "Save sample term" }).click();
  await page.getByRole("switch").click();
  await expect(page.locator('textarea, [contenteditable="true"], input:not([type=checkbox]), form')).toHaveCount(0);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  expect(remoteOrDynamicRequests).toEqual([]);
  expect(audioCalls).toEqual([]);
});

test("cancellation prevents late insertion; completing the sample offers Undo", async ({ page }) => {
  await page.clock.install();
  await page.goto("/guide.html#insert");
  const draft = page.locator("#insert-note");
  const insert = page.getByRole("button", { name: "Try sample insertion" });
  await insert.click();
  await page.getByRole("button", { name: "Cancel transcription" }).click();
  await page.clock.runFor(4000);
  await expect(draft).toHaveText("For our studio visit:");
  await expect(page.getByRole("status")).toContainText("cancelled");
  await expect(insert).toBeFocused();

  await insert.click();
  await page.clock.runFor(2500);
  await expect(draft).toContainText("Bring the blue notebook.");
  const undo = page.getByRole("button", { name: "Undo insertion" });
  await expect(undo).toBeFocused();
  await undo.press("Enter");
  await expect(draft).toHaveText("For our studio visit:");
});

test("recovery preserves the changed draft through sample Copy, Discard and expiry", async ({ page }) => {
  await page.clock.install();
  await page.goto("/guide.html#recover");
  const edit = page.getByRole("button", { name: "Change the sample draft" });
  const draft = page.locator("#recover-note");
  await edit.click();
  const copy = page.getByRole("button", { name: "Copy transcript" });
  await expect(copy).toBeFocused();
  await copy.press("Enter");
  await expect(page.locator("#sample-tray")).toContainText("Bring the blue notebook.");
  await expect(draft).toHaveText("For our Friday studio visit:");
  await edit.click();
  await page.getByRole("button", { name: "Discard transcript" }).click();
  await expect(page.locator("#sample-tray")).toBeHidden();
  await expect(draft).toHaveText("For our Friday studio visit:");
  await edit.click();
  await page.getByRole("button", { name: "Preview expiry" }).click();
  await expect(page.getByRole("status")).toContainText("expired");
  await expect(copy).toBeHidden();

  await edit.click();
  await page.clock.fastForward(60001);
  await expect(copy).toBeHidden();
  await expect(page.getByRole("status")).toContainText("expired");
  await expect(draft).toHaveText("For our Friday studio visit:");

  await edit.click();
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
    delete document.hidden;
  });
  await expect(copy).toBeHidden();
  await expect(draft).toHaveText("For our Friday studio visit:");
  await page.clock.fastForward(60001);
  await expect(page.getByRole("status")).toContainText("page was hidden");
});

test("saving a sample term leaves sharing off until explicit opt-in; clear and reset revoke it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/guide.html#vocabulary");
  const sharing = page.getByRole("switch", { name: "Enable vocabulary assistance" });
  const result = page.locator("#term-result");
  await expect(sharing).toBeDisabled();
  const save = page.getByRole("button", { name: "Save sample term" });
  await save.click();
  await expect(sharing).toHaveAttribute("aria-checked", "false");
  await expect(result).toHaveText("No vocabulary");
  await expect(page.locator("#sharing-help")).toContainText("through Dictozy’s backend to xAI");
  await sharing.press("Space");
  await expect(sharing).toHaveAttribute("aria-checked", "true");
  await expect(result).toHaveText("Would include Dictozy");
  await sharing.press("Space");
  await expect(result).toHaveText("No vocabulary");
  await sharing.press("Space");
  await page.getByRole("button", { name: "Clear sample term" }).click();
  await expect(sharing).toBeDisabled();
  await expect(sharing).toHaveAttribute("aria-checked", "false");
  await save.click();
  await sharing.click();
  await page.getByRole("button", { name: "Reset guide" }).click();
  await page.getByRole("link", { name: "Vocabulary and settings" }).click();
  await expect(sharing).toBeDisabled();
  await expect(result).toHaveText("No vocabulary");
  expect(await page.locator(".guide-paper").evaluate(el => el.getAnimations({subtree: true}).length)).toBe(0);
});

test.describe("guide without scripts", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 320, height: 640 } });
  test("every step and the privacy boundary are readable and linked without simulated controls", async ({ page }) => {
    await page.goto("/guide.html#recover");
    await expect(page.getByText("Interactive demo — no microphone access or audio is sent.", { exact: false }).first()).toBeVisible();
    for (const id of ["install", "record", "insert", "recover", "vocabulary", "troubleshoot"]) {
      await expect(page.locator(`#${id} h2`)).toBeVisible();
      await expect(page.locator(`.guide-index a[href="#${id}"]`)).toBeVisible();
    }
    await expect(page.getByRole("button", { name: "Start sample microphone" })).toBeHidden();
    await expect(page.locator("#recover .guide-note")).toContainText("up to 60 seconds");
    await expect(page.locator("#vocabulary .step-lead")).toContainText("opt-in sends them with your dictations through Dictozy’s backend to xAI");
    await expect(page.getByRole("link", { name: "Microphone blocked" })).toHaveAttribute("href", "support.html#microphone");
  });
});
