// Capture an unpacked candidate, including Chromium's native toolbar popup.
// Usage: node store/source/0.1.14/capture.cjs /absolute/path/to/review-output
const { chromium } = require("playwright");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const assert = require("node:assert/strict");

const extension = path.resolve(__dirname, "../../../extension");
const output = process.argv[2];
if (!output) throw new Error("Specify a review output directory");

// Native action popups are separate Chrome debugging targets outside the tab
// list. Attach to that target to photograph its real, browser-sized viewport.
async function popupSession(context, tab, worker) {
  const session = await context.newCDPSession(tab);
  await worker.evaluate(() => chrome.action.openPopup());
  const { targetInfos } = await session.send("Target.getTargets");
  const target = targetInfos.find(item => item.url === new URL("popup.html", worker.url()).href);
  assert.ok(target, "Toolbar popup target did not open");
  const { sessionId } = await session.send("Target.attachToTarget", { targetId: target.targetId });
  let sequence = 0;
  async function send(method, params = {}) {
    const id = ++sequence;
    const response = new Promise((resolve, reject) => {
      function receive(event) {
        const data = JSON.parse(event.message);
        if (event.sessionId !== sessionId || data.id !== id) return;
        session.off("Target.receivedMessageFromTarget", receive);
        if (data.error) reject(new Error(data.error.message)); else resolve(data.result);
      }
      session.on("Target.receivedMessageFromTarget", receive);
    });
    await session.send("Target.sendMessageToTarget", { sessionId, message: JSON.stringify({ id, method, params }) });
    return response;
  }
  return {
    async evaluate(expression) {
      const value = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      assert.ok(!value.exceptionDetails, value.exceptionDetails?.text);
      return value.result.value;
    },
    async capture(file) {
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      await fs.writeFile(path.join(output, file), Buffer.from(data, "base64"));
    },
    close: () => session.send("Target.closeTarget", { targetId: target.targetId }),
  };
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  const files = {
    "/": ["text/html", path.join(__dirname, "recording.html")],
    "/settings": ["text/html", path.join(__dirname, "settings.html")],
    "/lockup.svg": ["image/svg+xml", path.join(__dirname, "../../brand-0.1.14/lockup-light.svg")],
    "/popup.png": ["image/png", path.join(output, "popup.png")],
    "/vocabulary.png": ["image/png", path.join(output, "vocabulary.png")],
  };
  const host = http.createServer(async (request, response) => {
    const resource = files[request.url];
    if (!resource) { response.writeHead(404).end(); return; }
    try { response.writeHead(200, { "Content-Type": resource[0] }).end(await fs.readFile(resource[1])); }
    catch { response.destroy(); }
  });
  await new Promise(resolve => host.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + host.address().port;
  let context;
  try {
    context = await chromium.launchPersistentContext("", {
      channel: "chromium", headless: false, viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
        "--window-size=1480,1040", "--force-device-scale-factor=1", "--disable-background-networking",
        "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"],
    });
    await context.route("https://**/*", route => route.abort());
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    await worker.evaluate(async () => {
      globalThis.captureRequests = 0;
      globalThis.fetch = () => { captureRequests++; throw new Error("External requests blocked during capture"); };
      await chrome.storage.local.set({ personalVocabulary: { enabled: false, terms: ["Dictozy", "Bluefin Studio"] } });
    });
    const page = context.pages()[0];
    await page.goto(origin);
    const popup = await popupSession(context, page, worker);
    await popup.evaluate(`new Promise((resolve, reject) => {
      const start = performance.now();
      function ready() {
        if (document.querySelector('#status')?.textContent === 'Ready.' && !document.querySelector('#siteToggleRow').hidden) resolve(true);
        else if (performance.now() - start > 5000) reject(Error('Popup settings failed to load'));
        else requestAnimationFrame(ready);
      } ready();
    })`);
    await popup.capture("popup.png");
    await popup.evaluate(`document.querySelector('.vocabulary-settings summary').click();
      document.querySelector('.vocabulary-settings').scrollIntoView({block:'start'});
      new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    assert.equal(await popup.evaluate("document.getElementById('vocabularyEnabled').checked"), false);
    console.log("Native popup:", await popup.evaluate("[innerWidth,innerHeight,document.documentElement.scrollHeight]"));
    await popup.capture("vocabulary.png");
    await popup.close();
    await page.bringToFront();
    await page.locator("#note").focus();
    const mic = page.locator(".voice-dictation-mic-button");
    await mic.click();
    await page.waitForFunction(() => /[23]s elapsed/.test(document.querySelector(".voice-dictation-timing")?.textContent || ""));
    await page.mouse.move(1, 1);
    await page.screenshot({ path: path.join(output, "screenshot-dictation-1280x800.png") });
    const panel = await page.locator(".voice-dictation-status").boundingBox();
    const card = await page.locator("article").boundingBox();
    assert.ok(panel && card && panel.x >= card.x && panel.y >= card.y &&
      panel.x + panel.width <= card.x + card.width && panel.y + panel.height <= card.y + card.height,
      "The crop must include the complete genuine recording panel");
    await page.screenshot({ clip: card, path: path.join(output, "recording-crop.png") });
    await page.getByRole("button", { name: "Discard recording", exact: true }).click();
    assert.equal(await worker.evaluate(() => globalThis.captureRequests), 0);
    await page.goto(origin + "/settings");
    await page.locator("figure img").first().waitFor();
    await page.evaluate(() => Promise.all(Array.from(document.images, image => image.decode())));
    await page.screenshot({ path: path.join(output, "screenshot-settings-1280x800.png") });
    console.log("Captured genuine popup, vocabulary and recording controls. Zero backend requests.");
  } finally {
    if (context) await context.close();
    host.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
