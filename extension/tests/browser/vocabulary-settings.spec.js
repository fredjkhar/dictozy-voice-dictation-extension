const { expect, test } = require("@playwright/test");

async function openVocabulary(page, options = {}) {
  await page.addInitScript(({ initial = null, failInitialRead = false }) => {
    const key = "dictozy-vocabulary-popup-test";
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(initial ? { personalVocabulary: initial } : {}));
    const read = () => JSON.parse(localStorage.getItem(key));
    const state = {
      failRead: failInitialRead,
      failWrite: false,
      deferWrite: false,
      writes: 0,
      read,
      replace(value) {
        localStorage.setItem(key, JSON.stringify({ ...read(), personalVocabulary: value }));
      },
    };
    window.__vocabularyTest = state;
    const beforeWrite = async () => {
      if (state.failWrite) {
        state.failWrite = false;
        throw new Error("private storage exception");
      }
      if (state.deferWrite) {
        state.deferWrite = false;
        await new Promise((resolve) => { state.completeWrite = resolve; });
      }
      state.writes += 1;
    };
    window.chrome = {
      runtime: { lastError: null, getURL: (path) => `chrome-extension://test/${path}` },
      commands: { getAll: (callback) => callback([]) },
      tabs: {
        query: async () => [{ id: 1 }],
        sendMessage: async () => ({ ok: true, origin: "https://example.test" }),
        create: async () => ({}),
      },
      storage: {
        local: {
          async get(defaults) {
            if (Object.hasOwn(defaults, "personalVocabulary") && state.failRead) {
              state.failRead = false;
              throw new Error("private storage exception");
            }
            return { ...defaults, ...read() };
          },
          async set(values) {
            if (Object.hasOwn(values, "personalVocabulary")) await beforeWrite();
            localStorage.setItem(key, JSON.stringify({ ...read(), ...values }));
          },
          async remove(storageKey) {
            if (storageKey === "personalVocabulary") await beforeWrite();
            const values = read();
            delete values[storageKey];
            localStorage.setItem(key, JSON.stringify(values));
          },
        },
      },
    };
  }, options);
  await page.goto("/extension/popup.html");
  await page.getByText("Personal vocabulary", { exact: true }).click();
}

async function expectSaved(page, value) {
  await expect.poll(() => page.evaluate(() => window.__vocabularyTest.read().personalVocabulary)).toEqual(value);
}

test("vocabulary defaults off and local edits, explicit consent, disable and clear persist", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await openVocabulary(page);
  const editor = page.locator("#vocabularyTerms");
  const toggle = page.locator("#vocabularyEnabled");
  await expect(toggle).toBeEnabled();
  await expect(toggle).not.toBeChecked();
  await expectSaved(page, undefined);
  await expect(page.locator("#vocabularyDisclosure")).toContainText("Saving words locally does not enable sending");
  await editor.fill("acme\njane doe");
  await page.locator("#saveVocabulary").click();
  await expectSaved(page, { enabled: false, terms: ["acme", "jane doe"] });
  await page.screenshot({ path: testInfo.outputPath("vocabulary-settings.png"), fullPage: true });

  await page.reload();
  await page.getByText("Personal vocabulary", { exact: true }).click();
  await expect(editor).toHaveValue("acme\njane doe");
  await expect(toggle).not.toBeChecked();
  await editor.fill("new word");
  await toggle.click();
  await expectSaved(page, { enabled: true, terms: ["acme", "jane doe"] });
  await expect(editor).toHaveValue("new word");
  await page.locator("#saveVocabulary").click();
  await expectSaved(page, { enabled: true, terms: ["new word"] });
  await toggle.click();
  await expectSaved(page, { enabled: false, terms: ["new word"] });
  await page.reload();
  await page.getByText("Personal vocabulary", { exact: true }).click();
  await expect(toggle).not.toBeChecked();
  await expect(editor).toHaveValue("new word");
  await page.locator("#clearVocabulary").click();
  await expectSaved(page, undefined);
  await expect(editor).toHaveValue("");
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await page.getByText("Personal vocabulary", { exact: true }).click();
  await expect(editor).toHaveValue("");
  await expect(toggle).not.toBeChecked();
});

test("vocabulary ignores synthetic opt-in and preserves the latest stored consent and terms", async ({ page }) => {
  await openVocabulary(page, { initial: { enabled: false, terms: ["saved"] } });
  const toggle = page.locator("#vocabularyEnabled");
  await expect(toggle).toBeEnabled();
  await toggle.evaluate((element) => element.click());
  await expect(toggle).not.toBeChecked();
  expect(await page.evaluate(() => window.__vocabularyTest.writes)).toBe(0);
  await page.evaluate(() => window.__vocabularyTest.replace({ enabled: true, terms: ["elsewhere"] }));
  await page.locator("#vocabularyTerms").fill("edited");
  await page.locator("#saveVocabulary").click();
  await expectSaved(page, { enabled: true, terms: ["edited"] });
  await page.evaluate(() => window.__vocabularyTest.replace({ enabled: true, terms: ["latest"] }));
  await toggle.focus();
  await page.keyboard.press("Space");
  await expectSaved(page, { enabled: false, terms: ["latest"] });
});

test("invalid vocabulary stays unsaved without exposing terms in error text", async ({ page }) => {
  await openVocabulary(page, { initial: { enabled: false, terms: ["saved"] } });
  const invalid = "private".repeat(8);
  await page.locator("#vocabularyTerms").fill(invalid);
  await page.locator("#saveVocabulary").click();
  await expectSaved(page, { enabled: false, terms: ["saved"] });
  await expect(page.locator("#vocabularyStatus")).toContainText("Changes were not saved");
  await expect(page.locator("#vocabularyStatus")).not.toContainText(invalid);
  await expect(page.locator("#vocabularyTerms")).toHaveValue(invalid);
  expect(await page.evaluate(() => window.__vocabularyTest.writes)).toBe(0);
});

test("vocabulary storage failures are honest and pending writes disable competing edits", async ({ page }) => {
  const initial = { enabled: true, terms: ["saved"] };
  await openVocabulary(page, { initial });
  const toggle = page.locator("#vocabularyEnabled");
  const status = page.locator("#vocabularyStatus");
  await expect(toggle).toBeChecked();
  await page.evaluate(() => { window.__vocabularyTest.failWrite = true; });
  await toggle.click();
  await expect(status).toContainText("Changes were not confirmed");
  await expect(toggle).toBeChecked();
  await expectSaved(page, initial);
  await page.locator("#vocabularyTerms").fill("unsaved edit");
  await page.evaluate(() => { window.__vocabularyTest.failWrite = true; });
  await page.locator("#saveVocabulary").click();
  await expect(status).toContainText("Changes were not confirmed");
  await expect(page.locator("#vocabularyTerms")).toHaveValue("unsaved edit");
  await expectSaved(page, initial);
  await page.evaluate(() => { window.__vocabularyTest.failWrite = true; });
  await page.locator("#clearVocabulary").click();
  await expectSaved(page, initial);
  await expect(toggle).toBeChecked();
  await expect(status).not.toContainText("private storage exception");

  await page.evaluate(() => { window.__vocabularyTest.deferWrite = true; });
  await page.locator("#saveVocabulary").click();
  for (const id of ["vocabularyTerms", "vocabularyEnabled", "saveVocabulary", "clearVocabulary"]) {
    await expect(page.locator(`#${id}`)).toBeDisabled();
  }
  await page.evaluate(() => window.__vocabularyTest.completeWrite());
  await expectSaved(page, { enabled: true, terms: ["unsaved edit"] });
  await expect(toggle).toBeEnabled();
});

test("failed initial vocabulary load leaves consent unknown and controls unavailable", async ({ page }) => {
  const initial = { enabled: true, terms: ["saved"] };
  await openVocabulary(page, { initial, failInitialRead: true });
  await expect(page.locator("#vocabularyStatus")).toContainText("setting is unknown");
  for (const id of ["vocabularyTerms", "vocabularyEnabled", "saveVocabulary", "clearVocabulary"]) {
    await expect(page.locator(`#${id}`)).toBeDisabled();
  }
  await expect(page.locator("#vocabularyEnabled")).not.toBeChecked();
  await expectSaved(page, initial);
  expect(await page.evaluate(() => window.__vocabularyTest.writes)).toBe(0);
});
