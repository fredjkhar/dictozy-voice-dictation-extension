const path = require("node:path");
const { test: base, expect, chromium } = require("@playwright/test");

// Acceptance checks in an isolated unpacked MV3 browser: native recorder and
// clipboard, synthetic microphone, deliberately deferred backend. Production
// traffic is blocked. These are not live Gmail or physical-microphone results.
const test = base.extend({
  context: async ({}, use) => {
    const extension = path.resolve(__dirname, "../..");
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium", headless: true,
      args: [
        `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
        "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
        "--host-resolver-rules=MAP voice-dictation-extension.onrender.com ~NOTFOUND",
      ],
    });
    await context.route("https://**/*", (route) => route.abort());
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    await worker.evaluate(() => {
      globalThis.__backendCalls = 0;
      globalThis.fetch = async () => {
        globalThis.__backendCalls += 1;
        await new Promise((resolve) => { globalThis.__resolveResponse = resolve; });
        return new Response(JSON.stringify({ transcript: "Synthetic recovery fixture" }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      };
    });
    try { await use(context); } finally { await context.close(); }
  },
});

test.describe.configure({ mode: "default" });
const ORIGIN = "http://127.0.0.1:4173";
const URL = `${ORIGIN}/qa/recovery-acceptance-fixture.html`;
const MIC = ".voice-dictation-mic-button";
const PANEL = ".voice-dictation-recovery";
const BODY = "Dear Alpha Beta Gamma";

async function prepareRecovery(page, context) {
  await page.route(URL, (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta charset="utf-8"><style>
      body { padding: 40px; font-family: sans-serif; }
      input, [contenteditable] { display: block; width: 500px; min-height: 50px; margin: 20px; }
    </style></head><body>
      <div id="editor" role="textbox" aria-label="Message body" contenteditable="true">Alpha Beta Gamma</div>
      <label>Subject<input id="subject"></label>
    </body></html>`,
  }));
  await page.goto(URL);
  const editor = page.locator("#editor");
  await editor.evaluate((element) => {
    element.focus();
    const range = document.createRange();
    range.setStart(element.firstChild, 6);
    range.setEnd(element.firstChild, 10);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    // Observe only lifetime numbers; do not change the extension's clocks.
    window.__recoveryLifetime = { appeared: null, removed: null };
    new MutationObserver(() => {
      const timing = window.__recoveryLifetime;
      if (document.querySelector(".voice-dictation-recovery")) {
        if (timing.appeared === null) timing.appeared = performance.now();
      } else if (timing.appeared !== null && timing.removed === null) {
        timing.removed = performance.now();
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  });
  await page.locator(MIC).click();
  await expect(page.locator(MIC)).toHaveAttribute("data-state", "recording");
  await page.waitForTimeout(1600); // Native synthetic microphone emits a periodic tone.
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  const worker = context.serviceWorkers()[0];
  await expect.poll(() => worker.evaluate(() => globalThis.__backendCalls)).toBe(1);
  await expect(page.locator(MIC)).toHaveAttribute("data-state", "transcribing");
  // Edit after Stop while the backend response is explicitly pending.
  await editor.evaluate((element) => {
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(true);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  await page.keyboard.insertText("Dear ");
  await worker.evaluate(() => globalThis.__resolveResponse());
  await expect(page.locator(PANEL)).toBeVisible();
  await expect(page.locator(PANEL)).toContainText("The field changed.");
  await expect(editor).toHaveText(BODY);
  expect(await page.locator("html").innerHTML()).not.toContain("Synthetic recovery fixture");
  return editor;
}

async function tabTo(page, control) {
  let passedMicrophone = false;
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press("Tab");
    if (await page.locator(MIC).evaluate((element) => element === document.activeElement)) passedMicrophone = true;
    if (await control.evaluate((element) => element === document.activeElement)) {
      expect(passedMicrophone).toBe(true); // The regression involves this intermediate focus stop.
      return;
    }
  }
  await expect(control).toBeFocused();
}

test("unpacked recovery expires after a real minute without stealing another editor's focus", async ({ page, context }, testInfo) => {
  test.setTimeout(90000);
  const editor = await prepareRecovery(page, context);
  const subject = page.locator("#subject");
  await subject.fill("Expiry test");
  await expect(subject).toBeFocused();
  await page.waitForTimeout(55000);
  await expect(page.locator(PANEL)).toBeVisible();
  await expect(editor).toHaveText(BODY);
  await page.waitForTimeout(6000);
  await expect(page.locator(PANEL)).toHaveCount(0);
  await expect(subject).toBeFocused();
  await page.keyboard.insertText("X");
  await expect(subject).toHaveValue("Expiry testX");
  await expect(editor).toHaveText(BODY);
  await expect(page.locator(".voice-dictation-announcement")).toContainText("Transcript expired");
  const timing = await page.evaluate(() => window.__recoveryLifetime);
  const lifetimeMs = timing.removed - timing.appeared;
  // Allow 100 ms for observer/timer scheduling; no mocked or advanced clock.
  expect(lifetimeMs).toBeGreaterThanOrEqual(59900);
  expect(await context.serviceWorkers()[0].evaluate(() => globalThis.__backendCalls)).toBe(1);
  await testInfo.attach("real-clock-recovery-lifetime", {
    contentType: "application/json", body: Buffer.from(JSON.stringify({ lifetime_ms: Math.round(lifetimeMs) })),
  });
});

test("unpacked recovery Copy is keyboard reachable and permits explicit native paste", async ({ page, context }) => {
  // Only this disposable test profile receives clipboard permission.
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: ORIGIN });
  const editor = await prepareRecovery(page, context);
  const subject = page.locator("#subject");
  await subject.fill("Paste here: ");
  const copy = page.getByRole("button", { name: "Copy transcript", exact: true });
  await tabTo(page, copy);
  await page.keyboard.press("Enter");
  await expect(page.locator(PANEL)).toHaveCount(0);
  await expect(page.locator(".voice-dictation-announcement")).toContainText("Transcript copied");
  await expect(subject).toBeFocused();
  await expect(subject).toHaveValue("Paste here: ");
  await expect(editor).toHaveText(BODY);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
  await expect(subject).toHaveValue("Paste here: Synthetic recovery fixture");
  await expect(editor).toHaveText(BODY);
  expect(await context.serviceWorkers()[0].evaluate(() => globalThis.__backendCalls)).toBe(1);
});

test("unpacked recovery Discard supports keyboard navigation and restores editor focus", async ({ page, context }) => {
  const editor = await prepareRecovery(page, context);
  const subject = page.locator("#subject");
  await subject.fill("Keep this subject");
  const discard = page.getByRole("button", { name: "Discard transcript", exact: true });
  await tabTo(page, discard);
  await page.keyboard.press("Space");
  await expect(page.locator(PANEL)).toHaveCount(0);
  await expect(page.locator(".voice-dictation-announcement")).toContainText("Transcript discarded");
  await expect(subject).toBeFocused();
  await page.keyboard.insertText("X");
  await expect(subject).toHaveValue("Keep this subjectX");
  await expect(editor).toHaveText(BODY);
  await expect(page.locator(MIC)).toHaveAttribute("data-state", "idle");
  expect(await context.serviceWorkers()[0].evaluate(() => globalThis.__backendCalls)).toBe(1);
});
