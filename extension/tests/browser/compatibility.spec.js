const path = require("node:path");
const { test: base, expect, chromium } = require("@playwright/test");

// Local editor models with the actual unpacked MV3 extension, isolated content
// scripts, native MediaRecorder and Chromium's synthetic microphone. Backend
// responses are stubbed in the service worker; production DNS is blocked.
// These cases do not establish compatibility with any live application.
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
      globalThis.__deferResponse = false;
      globalThis.fetch = async () => {
        globalThis.__backendCalls += 1;
        if (globalThis.__deferResponse) {
          await new Promise((resolve) => { globalThis.__resolveResponse = resolve; });
        }
        return new Response(JSON.stringify({ transcript: "Fixture transcript" }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      };
    });
    try { await use(context); } finally { await context.close(); }
  },
});
// Persistent Chromium profiles are expensive to launch concurrently. Keep this
// file's cases serial while the remaining browser suite may run in parallel.
test.describe.configure({ mode: "default" });

const MIC = ".voice-dictation-mic-button";
const URL = "http://127.0.0.1:4173/qa/compatibility-fixture.html";
const markup = (body) => `<!doctype html><html><head><meta charset="utf-8"><style>
  body { padding: 40px; font-family: sans-serif; }
  input, textarea, [contenteditable] { display: block; width: 400px; min-height: 50px; }
  iframe { display: block; width: 600px; height: 200px; margin-top: 40px; }
</style></head><body>${body}</body></html>`;

async function openFixture(page, body, headers = {}) {
  await page.route(URL, (route) => route.fulfill({
    contentType: "text/html", headers, body: markup(body),
  }));
  await page.goto(URL);
}

async function recordAndStop(page) {
  await page.locator(MIC).click();
  await expect(page.locator(MIC)).toHaveAttribute("data-state", "recording");
  await page.waitForTimeout(1600); // Native synthetic microphone emits a periodic tone.
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
}

for (const levels of [1, 2]) {
  test(`unpacked MV3 preserves selected text and Undo through ${levels} open shadow roots`, async ({ page }) => {
    await openFixture(page, '<div id="host"></div>');
    await page.evaluate((levels) => {
      let host = document.querySelector("#host");
      for (let level = 0; level < levels; level += 1) {
        const root = host.attachShadow({ mode: "open" });
        root.innerHTML = level === levels - 1
          ? '<input id="shadowField" value="Alpha Beta" style="width:400px;height:50px">'
          : '<div id="innerHost"></div>';
        host = root.firstElementChild;
      }
    }, levels);
    const field = page.locator("#shadowField");
    await field.focus();
    await field.evaluate((element) => element.setSelectionRange(6, 10));
    await expect(page.locator(MIC)).toBeVisible();
    await recordAndStop(page);
    await expect(field).toHaveValue("Alpha Fixture transcript");
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z");
    await expect(field).toHaveValue("Alpha Beta");
  });
}

test("unpacked MV3 does not activate in a closed shadow root", async ({ page, context }) => {
  await openFixture(page, '<div id="host"></div>');
  await page.evaluate(() => {
    const root = document.querySelector("#host").attachShadow({ mode: "closed" });
    root.innerHTML = '<input style="width:400px;height:50px">';
    root.firstElementChild.focus();
  });
  await page.waitForTimeout(200);
  await expect(page.locator(MIC)).toBeHidden();
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(() => sendToggleToActiveTab());
  await expect(page.locator(MIC)).toBeHidden();
  expect(await worker.evaluate(() => globalThis.__backendCalls)).toBe(0);
});

for (const targetType of ["password", "text"]) {
  test(`unpacked MV3 discards nested-shadow recording when focus moves to another ${targetType} field`, async ({ page, context }) => {
    await openFixture(page, '<div id="host"></div>');
    await page.evaluate((targetType) => {
      const root = document.querySelector("#host").attachShadow({ mode: "open" });
      root.innerHTML = "<div></div>";
      const inner = root.firstElementChild.attachShadow({ mode: "open" });
      inner.innerHTML = `<input id="safeField" style="width:400px;height:50px"><input id="otherField" type="${targetType}" style="width:400px;height:50px">`;
    }, targetType);
    await page.locator("#safeField").focus();
    await page.locator(MIC).click();
    await expect(page.locator(MIC)).toHaveAttribute("data-state", "recording");
    const immediateState = await page.locator("#otherField").evaluate((field) => {
      field.focus();
      return document.querySelector(".voice-dictation-mic-button").dataset.state;
    });
    expect(immediateState).toBe("idle");
    await expect(page.locator(MIC)).toBeHidden();
    await expect(page.locator(MIC)).toHaveAttribute("data-state", "idle");
    expect(await context.serviceWorkers()[0].evaluate(() => globalThis.__backendCalls)).toBe(0);
    await expect(page.locator("#safeField")).toHaveValue("");
    await expect(page.locator("#otherField")).toHaveValue("");
    // Re-enter by mouse. Intra-shadow programmatic focus alone is not composed
    // to document listeners. A new session must not retain old focus listeners.
    await page.locator("#safeField").click();
    await recordAndStop(page);
    await expect(page.locator("#safeField")).toHaveValue("Fixture transcript");
    await expect(page.locator("#otherField")).toHaveValue("");
    expect(await context.serviceWorkers()[0].evaluate(() => globalThis.__backendCalls)).toBe(1);
  });
}

test("unpacked MV3 preserves a rich selection and Undo in an open shadow root", async ({ page }) => {
  await openFixture(page, '<div id="host"></div>');
  await page.evaluate(() => {
    const root = document.querySelector("#host").attachShadow({ mode: "open" });
    root.innerHTML = '<div id="shadowEditor" contenteditable="true" style="width:400px;min-height:50px">Alpha <strong>Beta</strong> tail</div>';
    const editor = root.firstElementChild;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor.querySelector("strong"));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  const editor = page.locator("#shadowEditor");
  await recordAndStop(page);
  await expect(editor).toHaveText("Alpha Fixture transcript tail");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z");
  await expect(editor).toHaveJSProperty("innerHTML", "Alpha <strong>Beta</strong> tail");
});

test("unpacked MV3 retains recording when focus moves within the same rich editor", async ({ page }) => {
  await openFixture(page, '<div id="editor" contenteditable="true">Alpha <span id="firstPart" tabindex="0">Beta</span> <span id="secondPart" tabindex="0">Gamma</span></div>');
  const editor = page.locator("#editor");
  await editor.evaluate((element) => {
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  await page.locator(MIC).click();
  await expect(page.locator(MIC)).toHaveAttribute("data-state", "recording");
  for (const selector of ["#firstPart", "#secondPart"]) {
    const immediateState = await page.locator(selector).evaluate((element) => {
      element.focus();
      return document.querySelector(".voice-dictation-mic-button").dataset.state;
    });
    expect(immediateState).toBe("recording");
  }
  await page.waitForTimeout(1600);
  await page.getByRole("button", { name: "Stop recording", exact: true }).click();
  await expect(editor).toHaveText("Alpha Beta Gamma Fixture transcript");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z");
  await expect(editor).toHaveText("Alpha Beta Gamma");
});

test("unpacked MV3 rejects same-HTML rich node replacement while transcription is pending", async ({ page, context }) => {
  await openFixture(page, '<div id="editor" contenteditable="true">Alpha <strong>Beta</strong> tail</div>');
  const editor = page.locator("#editor");
  await editor.evaluate((element) => {
    element.focus();
    const range = document.createRange();
    range.selectNodeContents(element.querySelector("strong"));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });
  const worker = context.serviceWorkers()[0];
  await worker.evaluate(() => { globalThis.__deferResponse = true; });
  await recordAndStop(page);
  await expect.poll(() => worker.evaluate(() => globalThis.__backendCalls)).toBe(1);
  await editor.evaluate((element) => { element.innerHTML = element.innerHTML; });
  await worker.evaluate(() => globalThis.__resolveResponse());
  await expect(page.getByRole("button", { name: "Copy transcript", exact: true })).toBeVisible();
  await expect(editor).toHaveJSProperty("innerHTML", "Alpha <strong>Beta</strong> tail");
  await expect(page.locator(".voice-dictation-recovery")).toContainText("The field changed.");
  expect(await page.locator("body").innerText()).not.toContain("Fixture transcript");
});

for (const origin of ["http://127.0.0.1:4173", "http://localhost:4173"]) {
  test(`unpacked MV3 excludes ${origin.includes("localhost") ? "cross" : "same"}-origin iframe editors and cancels on frame focus`, async ({ page, context }) => {
    const childUrl = `${origin}/qa/child-editor.html`;
    await page.route(childUrl, (route) => route.fulfill({ contentType: "text/html", body: markup('<input id="childField">') }));
    await openFixture(page, `<input id="topField"><iframe title="Child editor" src="${childUrl}"></iframe>`);
    const childField = page.frameLocator("iframe").locator("#childField");
    await expect(childField).toBeVisible();
    await expect(page.frameLocator("iframe").locator(MIC)).toHaveCount(0);
    await page.locator("#topField").focus();
    await page.locator(MIC).click();
    await expect(page.locator(MIC)).toHaveAttribute("data-state", "recording");
    await childField.focus();
    await expect(page.locator(MIC)).toHaveAttribute("data-state", "idle");
    await expect(page.locator(MIC)).toBeHidden();
    expect(await context.serviceWorkers()[0].evaluate(() => globalThis.__backendCalls)).toBe(0);
    await expect(childField).toHaveValue("");
  });
}

test("unpacked MV3 respects a real microphone Permissions-Policy response header", async ({ page, context }) => {
  await openFixture(page, '<textarea id="field"></textarea>', { "Permissions-Policy": "microphone=()" });
  expect(await page.evaluate(() => document.featurePolicy.allowsFeature("microphone"))).toBe(false);
  await page.locator("#field").focus();
  await page.locator(MIC).click();
  await expect(page.locator(MIC)).toHaveAttribute("data-state", "error");
  await expect(page.locator(".voice-dictation-status")).toContainText("Recording is not available on this page.");
  expect(await context.serviceWorkers()[0].evaluate(() => globalThis.__backendCalls)).toBe(0);
});

test("unpacked MV3 avoids an adjacent composer control and keeps recording placement stable", async ({ page, context }) => {
  await openFixture(page, `
    <textarea id="composer" style="position:absolute;left:250px;top:200px;width:400px;height:24px;min-height:0;padding:0;box-sizing:border-box"></textarea>
    <button id="nativeControl" style="position:absolute;left:650px;top:190px;width:44px;height:44px">Mic</button>
  `);
  const field = page.locator("#composer");
  await page.locator("#nativeControl").evaluate((button) => {
    window.__nativeClicks = 0;
    button.addEventListener("click", () => { window.__nativeClicks += 1; });
  });
  await field.focus();
  await expect(page.locator(MIC)).toBeVisible();
  const micBox = await page.locator(MIC).boundingBox();
  const nativeBox = await page.locator("#nativeControl").boundingBox();
  const overlaps = micBox.x < nativeBox.x + nativeBox.width && micBox.x + micBox.width > nativeBox.x &&
    micBox.y < nativeBox.y + nativeBox.height && micBox.y + micBox.height > nativeBox.y;
  expect(overlaps).toBe(false);
  await page.locator("#nativeControl").click();
  expect(await page.evaluate(() => window.__nativeClicks)).toBe(1);
  await field.focus();
  await page.locator(MIC).click();
  await expect(page.locator(MIC)).toHaveAttribute("data-state", "recording");
  const recordingPosition = await page.locator(MIC).evaluate((button) => ({ left: button.style.left, top: button.style.top }));
  await page.locator("#nativeControl").evaluate((button) => {
    button.remove(); // Opening the preferred side must not move an active Stop control.
    window.dispatchEvent(new Event("resize"));
  });
  await expect(page.locator(MIC)).toHaveAttribute("data-state", "recording");
  expect(await page.locator(MIC).evaluate((button) => ({ left: button.style.left, top: button.style.top }))).toEqual(recordingPosition);
  await page.getByRole("button", { name: "Discard recording", exact: true }).click();
  expect(await context.serviceWorkers()[0].evaluate(() => globalThis.__backendCalls)).toBe(0);
  await expect(field).toHaveValue("");
});
