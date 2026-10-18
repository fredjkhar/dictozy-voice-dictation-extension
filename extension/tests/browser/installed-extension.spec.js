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
