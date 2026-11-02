const path = require("node:path");
const { test: base, expect, chromium } = require("@playwright/test");

// Repeated local sessions with the real unpacked MV3 extension, native recorder
// and Chromium's synthetic microphone. A known-delay service-worker stub and
// production-host blocking keep this provider-free. These measurements describe
// this harness only, not physical speech, live applications or pilot targets.
const BACKEND_STUB_DELAY_MS = 100;
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
    await context.route("https://**/*", (route) => route.abort());
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    await worker.evaluate((delayMs) => {
      globalThis.__backendCalls = 0;
      globalThis.fetch = async () => {
        globalThis.__backendCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return new Response(JSON.stringify({ transcript: "Native browser fixture" }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      };
    }, BACKEND_STUB_DELAY_MS);
    try { await use(context); } finally { await context.close(); }
  },
});

const MIC = ".voice-dictation-mic-button";
const INITIAL_TEXT = "Alpha Beta Gamma";
const INSERTED_TEXT = "Alpha Native browser fixture Gamma";

test.describe.configure({ mode: "default" });

test("repeated native recording, Undo, Redo and discard leave each editor and control state intact", async ({ page, context }, testInfo) => {
  test.setTimeout(60000); // Functional budget for ten native capture sessions; not a latency target.
  await page.goto("http://127.0.0.1:4173/qa/manual-test-page.html");
  const textarea = page.locator("#plainTextarea");
  const richEditor = page.locator("#plainEditor");
  const unrelatedField = page.locator("#plainTextInput");
  await textarea.fill(INITIAL_TEXT);
  await richEditor.evaluate((field) => { field.innerHTML = "Alpha <strong>Beta</strong> Gamma"; });
  await unrelatedField.fill("Unrelated fixture text");
  // Only numeric elapsed times leave this instrumentation. Its click and input
  // observers do not alter capture, selection, editor events or extension APIs.
  await page.evaluate(() => {
    window.__dailyTiming = { started: null, duration: null, targetId: null };
    document.addEventListener("click", (event) => {
      if (event.isTrusted && event.target.closest('[aria-label="Stop recording"]')) {
        window.__dailyTiming.started = performance.now();
      }
    }, true);
    document.addEventListener("input", (event) => {
      const timing = window.__dailyTiming;
      if (event.target.id === timing.targetId && timing.started !== null && timing.duration === null) {
        timing.duration = performance.now() - timing.started;
      }
    }, true);
  });
  const worker = context.serviceWorkers()[0];
  const stop = page.getByRole("button", { name: "Stop recording", exact: true });
  const discard = page.getByRole("button", { name: "Discard recording", exact: true });
  const samples = [];
  const undoKey = process.platform === "darwin" ? "Meta+Z" : "Control+Z";
  const redoKey = process.platform === "darwin" ? "Meta+Shift+Z" : "Control+Shift+Z";

  async function selectWord(field, rich) {
    await field.scrollIntoViewIfNeeded();
    await field.evaluate((element, isRich) => {
      element.focus();
      if (isRich) {
        const range = document.createRange();
        range.selectNodeContents(element.querySelector("strong"));
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        element.setSelectionRange(6, 10);
      }
      window.__dailyTiming = { started: null, duration: null, targetId: element.id };
    }, rich);
  }

  async function expectRecordingControls() {
    await expect(page.locator(MIC)).toHaveAttribute("data-state", "recording");
    await expect(page.locator(MIC)).toBeVisible();
    await expect(stop).toBeVisible();
    await expect(discard).toBeVisible();
    await expect(page.locator(".voice-dictation-timing")).toContainText("left");
  }

  async function expectUnchangedEditors() {
    await expect(textarea).toHaveValue(INITIAL_TEXT);
    await expect(richEditor).toHaveText(INITIAL_TEXT);
    await expect(richEditor.locator("strong")).toHaveText("Beta");
    await expect(unrelatedField).toHaveValue("Unrelated fixture text");
    await expect(page.locator(".voice-dictation-recovery")).toHaveCount(0);
  }

  for (let cycle = 0; cycle < 5; cycle += 1) {
    const rich = cycle % 2 === 1;
    const field = rich ? richEditor : textarea;
    await selectWord(field, rich);
    await page.locator(MIC).click();
    await expectRecordingControls();
    await page.waitForTimeout(1600); // The synthetic device emits a periodic tone.
    await stop.click();
    if (rich) await expect(field).toHaveText(INSERTED_TEXT);
    else await expect(field).toHaveValue(INSERTED_TEXT);
    if (rich) await expect(textarea).toHaveValue(INITIAL_TEXT);
    else await expect(richEditor).toHaveText(INITIAL_TEXT);
    await expect(unrelatedField).toHaveValue("Unrelated fixture text");
    await expect(page.locator(MIC)).toHaveAttribute("data-state", "success");
    await expect(stop).toBeHidden();
    await expect(discard).toBeHidden();
    await expect(field).toBeFocused();
    const elapsed = await page.evaluate(() => window.__dailyTiming.duration);
    expect(Number.isFinite(elapsed)).toBe(true);
    samples.push(elapsed);
    await page.keyboard.press(undoKey);
    await expectUnchangedEditors();
    // Exercise the browser's native history in both selected-range targets,
    // then leave the original content restored before the discard session.
    await page.keyboard.press(redoKey);
    if (rich) {
      await expect(field).toHaveText(INSERTED_TEXT);
      await expect(textarea).toHaveValue(INITIAL_TEXT);
    } else {
      await expect(field).toHaveValue(INSERTED_TEXT);
      await expect(richEditor).toHaveText(INITIAL_TEXT);
      await expect(richEditor.locator("strong")).toHaveText("Beta");
    }
    await expect(field).toBeFocused();
    await expect(unrelatedField).toHaveValue("Unrelated fixture text");
    await expect(page.locator(".voice-dictation-recovery")).toHaveCount(0);
    await page.keyboard.press(undoKey);
    await expectUnchangedEditors();
    await expect(field).toBeFocused();
    expect(await worker.evaluate(() => globalThis.__backendCalls)).toBe(cycle + 1);

    // Alternate a completed session with an explicit discard on the other
    // target, making stale callbacks/selection state observable on each cycle.
    await selectWord(rich ? textarea : richEditor, !rich);
    await page.locator(MIC).click();
    await expectRecordingControls();
    await discard.click();
    await expect(page.locator(MIC)).toHaveAttribute("data-state", "idle");
    await expect(stop).toBeHidden();
    await expect(discard).toBeHidden();
    await expectUnchangedEditors();
    expect(await worker.evaluate(() => globalThis.__backendCalls)).toBe(cycle + 1);
  }
  // Give the final native stop callback a chance to run before the last check.
  await page.waitForTimeout(200);
  await expect(page.locator(MIC)).toHaveAttribute("data-state", "idle");
  await expectUnchangedEditors();
  expect(await worker.evaluate(() => globalThis.__backendCalls)).toBe(5);
  const sorted = [...samples].sort((a, b) => a - b);
  await testInfo.attach("local-synthetic-stubbed-latency-aggregates", {
    contentType: "application/json",
    body: Buffer.from(JSON.stringify({
      successful_cycles: 5,
      discarded_cycles: 5,
      backend_stub_delay_ms: BACKEND_STUB_DELAY_MS,
      sample_count: samples.length,
      stop_to_insert_median_ms: Math.round(sorted[Math.floor(sorted.length / 2)]),
      stop_to_insert_p95_ms: Math.round(sorted[Math.ceil(sorted.length * 0.95) - 1]),
    }, null, 2)),
  });
});
