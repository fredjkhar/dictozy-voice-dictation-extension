const path = require("node:path");
const { test: base, expect, chromium } = require("@playwright/test");

// Actual unpacked MV3 extension and native MediaRecorder in bundled Chromium.
// The microphone is Chromium's synthetic device; the backend is stubbed in the
// real service worker. No physical microphone, live site, or provider is used.
const test = base.extend({
  context: async ({}, use) => {
    const extension = path.resolve(__dirname, "../..");
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      headless: true,
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--host-resolver-rules=MAP voice-dictation-extension.onrender.com ~NOTFOUND",
      ],
    });
    // Block page HTTPS traffic too; the DNS rule also blocks service-worker production fallback.
    await context.route("https://**/*", (route) => route.abort());
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    await worker.evaluate(() => {
      globalThis.__backendCalls = 0;
      globalThis.fetch = async () => {
        globalThis.__backendCalls += 1;
        return new Response(JSON.stringify({ transcript: "Native browser fixture" }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      };
    });
    try { await use(context); } finally { await context.close(); }
  },
});

const MIC = ".voice-dictation-mic-button";

test("installed MV3 rejects page-generated clicks and supports keyboard recording with Undo", async ({ page, context }) => {
  await page.goto("http://127.0.0.1:4173/qa/manual-test-page.html");
  const field = page.locator("#plainTextInput");
  await field.focus();
  await expect(page.locator(MIC)).toBeVisible();
  await page.locator(MIC).evaluate((button) => button.click());
  // Allow asynchronous storage/permission callbacks to run before asserting no activation.
  await page.waitForTimeout(200);
  await expect(page.locator(MIC)).toHaveAttribute("data-state", "idle");
  await page.locator(MIC).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(MIC)).toHaveAttribute("data-state", "recording");
  await page.waitForTimeout(1600); // Chromium’s synthetic microphone emits a periodic tone.
  await page.locator(MIC).focus();
  await page.keyboard.press("Space");
  await expect(field).toHaveValue("Native browser fixture");
  await expect(field).toBeFocused();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z");
  await expect(field).toHaveValue("");
  expect(await context.serviceWorkers()[0].evaluate(() => globalThis.__backendCalls)).toBe(1);
});

test("installed MV3 discards unsafe recording and honors real storage changes", async ({ page, context }) => {
  await page.goto("http://127.0.0.1:4173/qa/manual-test-page.html");
  const field = page.locator("#plainTextInput");
  await field.focus();
  await page.locator(MIC).click();
  await expect(page.locator(MIC)).toHaveAttribute("data-state", "recording");
  await page.locator('input[type="password"]').focus();
  await expect(page.locator(MIC)).toBeHidden();
  await expect(page.locator(MIC)).toHaveAttribute("data-state", "idle");
  const worker = context.serviceWorkers()[0];
  expect(await worker.evaluate(() => globalThis.__backendCalls)).toBe(0);
  await field.focus();
  await expect(page.locator(MIC)).toBeVisible();
  await worker.evaluate(() => chrome.storage.local.set({ extensionEnabled: false }));
  await expect(page.locator(MIC)).toBeHidden();
  await worker.evaluate(() => chrome.storage.local.set({ extensionEnabled: true }));
  await expect(page.locator(MIC)).toBeVisible();
});

test("packaged practice is optional, uses explicit activation and preserves native Undo", async ({ page, context }, testInfo) => {
  await context.addInitScript(() => {
    window.__micRequests = 0;
    const nativeGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = (options) => {
      window.__micRequests += 1;
      return nativeGetUserMedia(options);
    };
  });
  const worker = context.serviceWorkers()[0];
  const root = new URL("./", worker.url()).href;
  await page.goto(`${root}popup.html`);
  const opened = context.waitForEvent("page");
  await page.getByRole("button", { name: "Try dictation" }).click();
  const practice = await opened;
  await practice.waitForLoadState();
  await expect(practice).toHaveURL(`${root}practice.html`);
  await expect(practice.getByRole("heading", { name: "Your first dictation" })).toBeVisible();
  await expect(practice.locator("#shortcutValue")).not.toHaveText("Loading");
  expect(await worker.evaluate(() => globalThis.__backendCalls)).toBe(0);
  await practice.getByRole("button", { name: "Try dictation" }).click();
  const field = practice.getByRole("textbox", { name: "Practice field" });
  await expect(field).toBeFocused();
  await expect(practice.locator(MIC)).toHaveAttribute("data-state", "idle");
  expect(await practice.evaluate(() => window.__micRequests)).toBe(0);
  await practice.screenshot({ path: testInfo.outputPath("practice.png"), fullPage: true });
  await practice.keyboard.press("Tab");
  await expect(practice.locator(MIC)).toBeFocused();
  await practice.keyboard.press("Enter");
  await expect(practice.locator(MIC)).toHaveAttribute("data-state", "recording");
  await practice.waitForTimeout(1600);
  expect(await practice.evaluate(() => window.__micRequests)).toBe(1);
  await expect(field).toBeFocused(); // Recording retains the editor’s focus.
  await practice.keyboard.press("Tab");
  await expect(practice.locator(MIC)).toBeFocused();
  await practice.keyboard.press("Tab");
  await expect(practice.getByRole("button", { name: "Stop recording", exact: true })).toBeFocused();
  await practice.keyboard.press("Space");
  await expect(field).toHaveValue("Native browser fixture");
  await expect(field).toBeFocused();
  await practice.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z");
  await expect(field).toHaveValue("");
  expect(await worker.evaluate(() => globalThis.__backendCalls)).toBe(1);
});

test("practice honors master control and receives the existing shortcut command route", async ({ page, context }) => {
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(() => chrome.storage.local.set({ extensionEnabled: false }));
  await page.goto(new URL("practice.html", worker.url()).href);
  await expect(page.locator("#tryDictation")).toBeDisabled();
  const field = page.locator("#practiceField");
  await field.focus();
  await expect(page.locator(MIC)).toBeHidden();
  await worker.evaluate(() => chrome.storage.local.set({ extensionEnabled: true }));
  await expect(page.locator("#tryDictation")).toBeEnabled();
  await page.locator("#tryDictation").click();
  expect(await worker.evaluate(() => sendToggleToActiveTab())).toBe(true);
  await expect(page.locator(MIC)).toHaveAttribute("data-state", "recording");
  await page.getByRole("button", { name: "Discard recording", exact: true }).click();
  await expect(field).toHaveValue("");
  expect(await worker.evaluate(() => globalThis.__backendCalls)).toBe(0);
});

test("practice handles microphone denial with help and no provider request", async ({ page, context }, testInfo) => {
  const worker = context.serviceWorkers()[0];
  await page.goto(new URL("practice.html", worker.url()).href);
  await page.getByRole("button", { name: "Try dictation", exact: true }).click();
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("fixture", "NotAllowedError"); };
  });
  await page.locator(MIC).click();
  await expect(page.locator(MIC)).toHaveAttribute("data-state", "error");
  await expect(page.getByText("Microphone access is blocked.", { exact: false })).toBeVisible();
  expect(await worker.evaluate(() => globalThis.__backendCalls)).toBe(0);
  await page.setViewportSize({ width: 360, height: 640 });
  await page.getByText("Microphone or dictation not working?", { exact: true }).click();
  await expect(page.getByRole("link", { name: "Help and troubleshooting", exact: true })).toHaveAttribute("href", "https://dictozy.com/support.html");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.screenshot({ path: testInfo.outputPath("practice-mobile.png"), fullPage: true });
});
