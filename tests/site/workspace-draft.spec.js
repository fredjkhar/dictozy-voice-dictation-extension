const { test, expect } = require("@playwright/test");

const storageKey = "dictozy.web.draft.v1";

// Two top-level pages in the same browser context share the real localStorage
// and Web Locks implementations. Recording is not used in these checks.
async function openWorkspace(context, baseURL, { suppressStorageEvents = false, noLocks = false } = {}) {
  const page = await context.newPage();
  const origin = new URL(baseURL).origin;
  await page.route("**/*", route => new URL(route.request().url()).origin === origin
    ? route.continue() : route.abort("blockedbyclient"));
  await page.addInitScript(({ suppressStorageEvents, noLocks, storageKey }) => {
    if (suppressStorageEvents) window.addEventListener("storage", event => event.stopImmediatePropagation(), true);
    if (noLocks) Object.defineProperty(navigator, "locks", { configurable: true, value: undefined });
    const setItem = Storage.prototype.setItem;
    window.__draftWrites = [];
    Storage.prototype.setItem = function(key, value) {
      if (key === storageKey) window.__draftWrites.push(value);
      return setItem.call(this, key, value);
    };
  }, { suppressStorageEvents, noLocks, storageKey });
  await page.goto(baseURL + "/try.html");
  const frame = page.frames().find(frame => new URL(frame.url()).pathname === "/workspace.html");
  await expect(frame.locator("#draft")).toBeEnabled();
  await frame.locator(".workspace-settings summary").click();
  return { page, frame, draft: frame.locator("#draft"), remember: frame.locator("#remember-draft"), status: frame.locator("#save-status") };
}

async function saved(tab) {
  return tab.frame.evaluate(key => {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  }, storageKey);
}

async function remember(tab, text = "Original local draft.") {
  await tab.draft.fill(text);
  await tab.remember.check();
  await expect.poll(async () => (await saved(tab))?.text).toBe(text);
}

async function holdLock(tab) {
  await tab.frame.evaluate(key => new Promise(acquired => {
    navigator.locks.request(key, () => new Promise(release => {
      window.__releaseDraftLock = release;
      acquired();
    }));
  }), storageKey);
}

async function releaseLock(tab) {
  await tab.frame.evaluate(() => window.__releaseDraftLock());
}

for (const action of ["disable", "clear"]) {
  test(`${action} in one tab revokes stale-tab saving and reload cannot restore deleted text`, async ({ context, baseURL }) => {
    const a = await openWorkspace(context, baseURL);
    await remember(a);
    const b = await openWorkspace(context, baseURL, { suppressStorageEvents: true });
    await expect(b.remember).toBeChecked();
    await expect(b.draft).toHaveValue("Original local draft.");
    if (action === "disable") await a.remember.uncheck();
    else {
      await a.frame.locator("#clear-text").click();
      await a.frame.locator("#confirm-clear").click();
    }
    await expect.poll(() => saved(a)).toBeNull();
    await b.draft.fill("Unsaved writing in the stale tab.");
    await expect(b.remember).not.toBeChecked();
    await expect(b.status).toContainText(/off|paused|revok/i);
    expect(await saved(a)).toBeNull();
    await expect(b.draft).toHaveValue("Unsaved writing in the stale tab.");
    await expect(a.draft).toHaveValue(action === "clear" ? "" : "Original local draft.");
    await b.page.reload();
    const restored = b.page.frameLocator("#writing-workspace");
    await expect(restored.locator("#draft")).toHaveValue("");
    await expect(restored.locator("#remember-draft")).not.toBeChecked();
    expect(await saved(a)).toBeNull();
  });
}

test("simultaneous draft updates serialize; conflict pauses without replacing either editor", async ({ context, baseURL }) => {
  const a = await openWorkspace(context, baseURL, { suppressStorageEvents: true });
  await remember(a);
  const b = await openWorkspace(context, baseURL, { suppressStorageEvents: true });
  const original = await saved(a);
  await holdLock(a);
  await a.draft.fill("Newer version from A.");
  await b.draft.fill("Unsaved version from B.");
  await releaseLock(a);
  await expect.poll(async () => (await saved(a))?.text).toBe("Newer version from A.");
  await expect(b.remember).not.toBeChecked();
  await expect(b.status).toContainText(/paused|another tab|newer/i);
  await expect(a.draft).toHaveValue("Newer version from A.");
  await expect(b.draft).toHaveValue("Unsaved version from B.");
  const updated = await saved(a);
  expect(updated.consent).toBe(original.consent);
  expect(updated.revision).not.toBe(original.revision);
  expect(await b.frame.evaluate(() => window.__draftWrites)).toEqual([]);
  await b.remember.click();
  await b.frame.locator("#keep-saved-draft").click();
  await expect(b.remember).not.toBeChecked();
  expect((await saved(a)).text).toBe("Newer version from A.");
  await expect(b.draft).toHaveValue("Unsaved version from B.");
  await b.remember.click();
  await b.frame.locator("#replace-saved-draft").click();
  await expect.poll(async () => (await saved(a))?.text).toBe("Unsaved version from B.");
  await expect(a.draft).toHaveValue("Newer version from A.");
});

test("replacement confirmation is nonblocking and rechecks the saved revision after waiting for the lock", async ({ context, baseURL }) => {
  const a = await openWorkspace(context, baseURL);
  await remember(a);
  const b = await openWorkspace(context, baseURL, { suppressStorageEvents: true });
  await a.draft.fill("A's first newer revision.");
  await expect.poll(async () => (await saved(a))?.text).toBe("A's first newer revision.");
  await b.draft.fill("B's unsaved replacement.");
  await expect(b.remember).not.toBeChecked();
  await b.remember.click();
  await expect(b.frame.locator("#replace-draft-dialog")).toBeVisible();
  // This callback must execute while the confirmation is open. A blocking
  // window.confirm would suspend recording/recovery cleanup timers too.
  expect(await b.frame.evaluate(() => new Promise(resolve => setTimeout(() => {
    resolve(document.getElementById("replace-draft-dialog").open);
  }, 25)))).toBe(true);

  await holdLock(a);
  await a.draft.fill("A's latest revision while B confirms.");
  await b.frame.locator("#replace-saved-draft").click();
  await expect(b.frame.locator("#replace-draft-dialog")).not.toBeVisible();
  await releaseLock(a);
  await expect.poll(async () => (await saved(a))?.text).toBe("A's latest revision while B confirms.");
  await expect(b.remember).not.toBeChecked();
  await expect(b.status).toContainText(/paused|another tab|newer/i);
  await expect(a.draft).toHaveValue("A's latest revision while B confirms.");
  await expect(b.draft).toHaveValue("B's unsaved replacement.");
  expect(await b.frame.evaluate(() => window.__draftWrites)).toEqual([]);
});

test("revocation followed by identical-text opt-in does not revive the older consent", async ({ context, baseURL }) => {
  const a = await openWorkspace(context, baseURL);
  await remember(a);
  const b = await openWorkspace(context, baseURL, { suppressStorageEvents: true });
  const before = await saved(a);
  await a.remember.uncheck();
  await expect.poll(() => saved(a)).toBeNull();
  await a.remember.check();
  await expect.poll(async () => (await saved(a))?.consent).not.toBe(before.consent);
  await expect.poll(async () => (await saved(a))?.text).toBe("Original local draft.");
  const reenabled = await saved(a);
  await b.draft.fill("Stale tab must not save this.");
  await expect(b.remember).not.toBeChecked();
  expect(await saved(a)).toEqual(reenabled);
  await expect(b.draft).toHaveValue("Stale tab must not save this.");
});

test("queued saving cannot survive a later local revocation or an earlier cross-tab Clear", async ({ context, baseURL }) => {
  const a = await openWorkspace(context, baseURL, { suppressStorageEvents: true });
  await remember(a);
  const b = await openWorkspace(context, baseURL, { suppressStorageEvents: true });
  await holdLock(a);
  await b.draft.fill("Queued text must not be saved.");
  await b.remember.uncheck();
  await releaseLock(a);
  await expect.poll(() => saved(a)).toBeNull();
  expect(await b.frame.evaluate(() => window.__draftWrites)).toEqual([]);
  await expect(b.draft).toHaveValue("Queued text must not be saved.");

  // A renewed, explicit choice starts a new consent generation.
  await a.draft.fill("A new saved draft.");
  await expect(a.remember).not.toBeChecked();
  await a.remember.check();
  await expect.poll(async () => (await saved(a))?.text).toBe("A new saved draft.");
  await b.page.reload();
  b.frame = b.page.frames().find(frame => new URL(frame.url()).pathname === "/workspace.html");
  b.draft = b.frame.locator("#draft");
  b.remember = b.frame.locator("#remember-draft");
  await expect(b.remember).toBeChecked();
  await holdLock(a);
  await a.frame.locator("#clear-text").click();
  await a.frame.locator("#confirm-clear").click();
  await b.draft.fill("Unsaved after the queued Clear.");
  await releaseLock(a);
  await expect.poll(() => saved(a)).toBeNull();
  await expect(b.remember).not.toBeChecked();
  expect(await b.frame.evaluate(() => window.__draftWrites)).toEqual([]);
  await expect(b.draft).toHaveValue("Unsaved after the queued Clear.");
});

test("cross-tab storage read/write/delete failures preserve unsaved editors and report failure", async ({ context, baseURL }) => {
  const a = await openWorkspace(context, baseURL);
  await remember(a);
  const b = await openWorkspace(context, baseURL, { suppressStorageEvents: true });
  await b.frame.evaluate(() => {
    window.__originalGet = Storage.prototype.getItem;
    Storage.prototype.getItem = () => { throw new DOMException("Denied", "SecurityError"); };
  });
  await b.draft.fill("Keep my unsaved B writing.");
  await expect(b.remember).not.toBeChecked();
  await expect(b.status).toContainText(/could not|unavailable|paused/i);
  expect((await saved(a)).text).toBe("Original local draft.");
  await expect(b.draft).toHaveValue("Keep my unsaved B writing.");
  await b.frame.evaluate(() => {
    Storage.prototype.getItem = window.__originalGet;
    Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); };
  });
  await b.remember.click();
  await b.frame.locator("#replace-saved-draft").click();
  await expect(b.status).toContainText(/could not|unavailable/i);
  expect((await saved(a)).text).toBe("Original local draft.");
  await expect(b.draft).toHaveValue("Keep my unsaved B writing.");
  await a.frame.evaluate(() => {
    Storage.prototype.removeItem = () => { throw new DOMException("Denied", "SecurityError"); };
  });
  await a.remember.uncheck();
  await expect(a.status).toContainText(/could not|unavailable/i);
  expect((await saved(a)).text).toBe("Original local draft.");
  await expect(a.draft).toHaveValue("Original local draft.");
  await expect(b.draft).toHaveValue("Keep my unsaved B writing.");
});

test("browsers without Web Locks keep typing available without automatic draft writes", async ({ context, baseURL }) => {
  const a = await openWorkspace(context, baseURL);
  await remember(a);
  const b = await openWorkspace(context, baseURL, { noLocks: true });
  await expect(b.remember).toBeDisabled();
  await expect(b.remember).not.toBeChecked();
  await b.draft.fill("Unsaved text with coordination unavailable.");
  await expect(b.status).toContainText(/unavailable|cannot|not supported/i);
  expect((await saved(a)).text).toBe("Original local draft.");
  expect(await b.frame.evaluate(() => window.__draftWrites)).toEqual([]);
  await expect(b.draft).toHaveValue("Unsaved text with coordination unavailable.");
});
