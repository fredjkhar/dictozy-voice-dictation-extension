const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { test, expect, chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "../../..");
const FIXTURE = path.join(ROOT, "qa/workspace-compatibility");
const OFFICIAL = "https://dictozy.com";
const ENDPOINT = "https://voice-dictation-extension.onrender.com/api/transcribe";
const SAMPLE = "Native workspace fixture";
const MIC = ".voice-dictation-mic-button";
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function publishedSnapshot() {
  const evidence = JSON.parse(fs.readFileSync(path.join(FIXTURE, "provenance.json"), "utf8"));
  assert.equal(evidence.source_commit, "27f2171fcc7a3d0e48c7062aa2781864abf9ab47");
  const archive = path.join(FIXTURE, evidence.archive);
  assert.equal(sha256(fs.readFileSync(archive)), evidence.archive_sha256);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "dictozy-published-coexist-"));
  execFileSync("tar", ["-xzf", archive, "-C", temporary]);
  const extension = path.join(temporary, "extension");
  assert.equal(Object.keys(evidence.files_sha256).length, 21);
  for (const [file, hash] of Object.entries(evidence.files_sha256)) {
    assert.equal(sha256(fs.readFileSync(path.join(extension, file))), hash, file);
  }
  assert.equal(JSON.parse(fs.readFileSync(path.join(extension, "manifest.json"))).version, "0.1.14");
  return { extension, dispose: () => fs.rmSync(temporary, { recursive: true }) };
}

async function launch(mode) {
  const frozen = mode === "published" ? publishedSnapshot() : null;
  const extension = mode === "none" ? null : frozen?.extension || path.join(ROOT, "extension");
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium", headless: true,
    args: [
      ...(extension ? [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] : []),
      "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
      // Network interception is backed by DNS failure, including worker traffic.
      "--host-resolver-rules=MAP * ~NOTFOUND",
    ],
  });
  let websiteRequests = 0;
  let releaseUpload;
  const blocked = [];
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.href === ENDPOINT) {
      const headers = {
        "Access-Control-Allow-Origin": OFFICIAL,
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "X-Request-ID, Content-Type",
      };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 200, headers });
      expect(request.method()).toBe("POST");
      websiteRequests += 1;
      await new Promise((resolve) => { releaseUpload = resolve; });
      return route.fulfill({ status: 200, headers, json: { transcript: SAMPLE } });
    }
    if (url.origin === "https://unrelated.example") {
      return route.fulfill({ contentType: "text/html", body: '<label>Other text<textarea id="outside"></textarea></label>' });
    }
    if (url.origin === OFFICIAL) {
      if (url.pathname === "/invalid-parent.html") {
        return route.fulfill({ contentType: "text/html", body: '<iframe id="writing-workspace" src="/workspace.html" allow="microphone"></iframe>' });
      }
      if (url.pathname === "/nested-parent.html") {
        return route.fulfill({ contentType: "text/html", body: '<iframe src="/try.html" allow="microphone"></iframe>' });
      }
      const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      const file = path.resolve(ROOT, "site", relative);
      if (file.startsWith(path.join(ROOT, "site") + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        const contentType = ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp" })[path.extname(file)] || "application/octet-stream";
        return route.fulfill({ body: fs.readFileSync(file), contentType });
      }
    }
    blocked.push(request.url());
    return route.abort();
  });
  const worker = extension ? context.serviceWorkers()[0] || await context.waitForEvent("serviceworker") : null;
  if (worker) await worker.evaluate(() => {
    globalThis.__extensionUploads = 0;
    globalThis.fetch = async () => {
      globalThis.__extensionUploads += 1;
      return new Response(JSON.stringify({ transcript: "Unrelated extension fixture" }), { status: 200 });
    };
  });
  const page = await context.newPage();
  const events = [];
  const cdp = await context.newCDPSession(page);
  await cdp.send("Runtime.addBinding", { name: "__workspaceEvidence" });
  cdp.on("Runtime.bindingCalled", (event) => {
    if (event.name === "__workspaceEvidence") events.push(JSON.parse(event.payload));
  });
  // Instrument actual APIs in every execution world, including extension isolated worlds.
  // Native capture/track stop still execute; this is measurement, not simulated audio APIs.
  cdp.on("Runtime.executionContextCreated", ({ context: execution }) => {
    cdp.send("Runtime.evaluate", { contextId: execution.id, expression: `(() => {
      if (!navigator.mediaDevices?.getUserMedia || globalThis.__workspaceInstrumented) return;
      globalThis.__workspaceInstrumented = true;
      const report = (kind) => __workspaceEvidence(JSON.stringify({kind, path: location.pathname, origin: location.origin}));
      const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (...args) => {
        report('capture');
        return capture(...args).then(stream => {
          for (const track of stream.getTracks()) {
            const stop = track.stop.bind(track);
            track.stop = () => { report('track-stop'); return stop(); };
          }
          return stream;
        });
      };
      // The main world owns this counter, so one native input event is counted once.
      ${execution.auxData?.isDefault ? `document.addEventListener('input', e => { if(e.target.id === 'draft' && e.target.value.includes('${SAMPLE}')) report('insertion'); });` : ""}
    })()` }).catch(() => {});
  });
  await cdp.send("Runtime.enable");
  return {
    context, page, worker, events, blocked,
    uploads: () => websiteRequests,
    release: () => releaseUpload?.(),
    async close() { releaseUpload?.(); await context.close(); frozen?.dispose(); },
  };
}

// Persistent Chromium extension launches run sequentially within this file.
test.describe.configure({ mode: "default" });
for (const mode of ["none", "published", "updated"]) {
  test(`native workspace with ${mode} extension: one capture, request and insertion; command cannot compete`, async ({}, testInfo) => {
    const fixture = await launch(mode);
    const { page, worker, events } = fixture;
    try {
      await page.goto(`${OFFICIAL}/try.html`);
      const frame = page.frameLocator("#writing-workspace");
      const draft = frame.locator("#draft");
      await expect(draft).toBeEnabled();
      await draft.fill("Keep this text. ");
      await draft.focus();
      expect(await page.locator('textarea:enabled,input:not([disabled]),[contenteditable="true"]').count()).toBe(0);
      expect(await page.locator(`${MIC}:visible`).count()).toBe(0);
      // A browser-reserved extension binding is not a website shortcut. Exercise
      // DOM keyboard input separately, then the real installed worker command route.
      await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+Y" : "Control+Shift+Y");
      if (worker) await worker.evaluate(() => sendToggleToActiveTab());
      await page.waitForTimeout(150);
      expect(events.filter(e => e.kind === "capture")).toHaveLength(0);
      expect(fixture.uploads()).toBe(0);
      await frame.locator(MIC).click();
      await expect(frame.locator(MIC)).toHaveAttribute("data-state", "recording");
      if (worker) await worker.evaluate(() => sendToggleToActiveTab());
      await expect(frame.locator(MIC)).toHaveAttribute("data-state", "recording");
      await page.waitForTimeout(1600); // Native fake device's periodic tone, not a recognition test.
      await frame.getByRole("button", { name: "Stop recording", exact: true }).click();
      await expect.poll(fixture.uploads).toBe(1);
      if (worker) await worker.evaluate(() => sendToggleToActiveTab());
      await expect(draft).toHaveValue("Keep this text. ");
      fixture.release();
      await expect(draft).toHaveValue(`Keep this text. ${SAMPLE}`);
      expect(events.filter(e => e.kind === "capture")).toHaveLength(1);
      expect(events.filter(e => e.kind === "insertion")).toHaveLength(1);
      expect(events.filter(e => e.kind === "track-stop").length).toBeGreaterThanOrEqual(1);
      expect(fixture.uploads()).toBe(1);
      if (worker) expect(await worker.evaluate(() => __extensionUploads)).toBe(0);
      await testInfo.attach("coexistence-counts.json", {
        contentType: "application/json", body: Buffer.from(JSON.stringify({ mode,
          extensionSource: mode === "published" ? "27f2171fcc7a3d0e48c7062aa2781864abf9ab47" : mode,
          captures: 1, websitePosts: fixture.uploads(), insertions: 1, extensionPosts: 0,
          method: "Installed Chromium, native synthetic microphone and MediaRecorder, stubbed backend; command function path and DOM keyboard tested separately.",
        }, null, 2)),
      });
      await page.keyboard.press(process.platform === "darwin" ? "Meta+Z" : "Control+Z");
      await expect(draft).toHaveValue("Keep this text. ");
      expect(fixture.blocked).toEqual([]);

      // Direct document navigation must remain noneditable even with the old content script.
      await page.goto(`${OFFICIAL}/workspace.html`);
      await expect(page.locator("#draft")).toBeDisabled();
      await expect(page.locator("#workspace-guard")).toBeVisible();
      if (worker) await worker.evaluate(() => sendToggleToActiveTab());
      await page.waitForTimeout(150);
      expect(events.filter(e => e.kind === "capture")).toHaveLength(1);
      expect(fixture.uploads()).toBe(1);

      await page.goto(`${OFFICIAL}/invalid-parent.html`);
      await expect(page.frameLocator("iframe").locator("#draft")).toBeDisabled();
      await expect(page.frameLocator("iframe").locator("#workspace-guard")).toBeVisible();
      await page.goto(`${OFFICIAL}/nested-parent.html`);
      await expect(page.frameLocator("iframe").locator("#workspace-embed-warning")).toBeVisible();
      expect(events.filter(e => e.kind === "capture")).toHaveLength(1);
      expect(fixture.uploads()).toBe(1);

      if (worker) {
        // Exclusion must not globally disable normal extension behavior elsewhere.
        await page.goto("https://unrelated.example/");
        const field = page.locator("#outside");
        await field.focus();
        await expect(page.locator(MIC)).toBeVisible();
        await worker.evaluate(() => sendToggleToActiveTab());
        await expect(page.locator(MIC)).toHaveAttribute("data-state", "recording");
        await page.waitForTimeout(1600);
        await page.getByRole("button", { name: "Stop recording", exact: true }).click();
        await expect(field).toHaveValue("Unrelated extension fixture");
        expect(await worker.evaluate(() => __extensionUploads)).toBe(1);
        expect(events.filter(e => e.kind === "capture")).toHaveLength(2);
      }
    } finally { await fixture.close(); }
  });
}

test("scrolling the parent past the visible recording controls cancels native capture without uploading", async () => {
  const fixture = await launch("none");
  const { page, events } = fixture;
  try {
    await page.setViewportSize({ width: 390, height: 600 });
    await page.goto(`${OFFICIAL}/try.html`);
    const frame = page.frameLocator("#writing-workspace");
    const draft = frame.locator("#draft");
    await draft.fill("Keep my draft.");
    await frame.locator(MIC).click();
    await expect(frame.locator(MIC)).toHaveAttribute("data-state", "recording");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    expect(await page.evaluate(() => {
      const outer = document.getElementById("writing-workspace");
      const inner = outer.contentDocument.querySelector(".voice-dictation-mic-button");
      return outer.getBoundingClientRect().top + inner.getBoundingClientRect().bottom;
    })).toBeLessThanOrEqual(0);
    await expect.poll(() => frame.locator(MIC).getAttribute("data-state")).not.toBe("recording");
    await expect.poll(() => events.filter(event => event.kind === "track-stop").length).toBeGreaterThanOrEqual(1);
    await page.waitForTimeout(350);
    expect(events.filter(event => event.kind === "capture")).toHaveLength(1);
    expect(events.filter(event => event.kind === "insertion")).toHaveLength(0);
    expect(fixture.uploads()).toBe(0);
    await expect(draft).toHaveValue("Keep my draft.");
    await expect(frame.locator(".voice-dictation-recovery")).toHaveCount(0);
  } finally { await fixture.close(); }
});
