const { test, expect } = require("@playwright/test");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PUBLIC_PAGES = ["/index.html", "/guide.html", "/privacy.html", "/support.html", "/404.html"];
const STORE_URL = "https://chromewebstore.google.com/detail/folpeencabfejhjokmldikaelonphmma";
const PRODUCTION_ROOT = "https://dictozy.com/";
const LEGACY_ROOT = "https://fredjkhar.github.io/dictozy-voice-dictation-extension/";
const HOMEPAGE_DESCRIPTION =
  "Dictate short messages, notes, and searches in supported Chrome fields. Explore Dictozy’s recording controls, safe transcript recovery, and optional vocabulary.";
const SOCIAL_IMAGE = `${PRODUCTION_ROOT}assets/dictozy-social.png`;
const REQUIRED_VIEWPORTS = [
  { name: "phone-small", width: 320, height: 568 },
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "desktop-wide", width: 1440, height: 1000 },
  { name: "desktop-ultrawide", width: 1920, height: 960 },
];

function watchPage(page) {
  const consoleErrors = [];
  const failedRequests = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.hostname === "127.0.0.1") {
      failedRequests.push(`${request.method()} ${url.pathname}: ${request.failure()?.errorText || "failed"}`);
    }
  });

  return { consoleErrors, failedRequests };
}

async function loadPageImages(page) {
  const images = page.locator("img");
  for (let index = 0; index < await images.count(); index += 1) {
    const image = images.nth(index);
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
  }
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 0);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.waitForFunction(() => window.scrollY === 0);
}

for (const path of PUBLIC_PAGES) {
  test(`${path} loads its local resources`, async ({ page }) => {
    const observed = watchPage(page);
    const response = await page.goto(path, { waitUntil: "networkidle" });

    expect(response?.ok()).toBe(true);
    await expect(page.locator("h1")).toHaveCount(1);

    const images = page.locator("img");
    const imageCount = await images.count();
    expect(imageCount).toBeGreaterThan(0);
    for (let index = 0; index < imageCount; index += 1) {
      const image = images.nth(index);
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
      expect(await image.evaluate((element) => element.naturalHeight)).toBeGreaterThan(0);
    }

    expect(observed.consoleErrors).toEqual([]);
    expect(observed.failedRequests).toEqual([]);
  });
}

test("internal links resolve and installation actions use the published Store item", async ({ page, request, baseURL }) => {
  for (const path of PUBLIC_PAGES) {
    await page.goto(path);
    await expect(page.locator(".primary-nav a[href$='guide.html']")).toBeVisible();
    await expect(page.locator("footer a[href$='guide.html']")).toBeVisible();
    await expect(page.locator("footer").getByRole("link", { name: "Email support", exact: true }))
      .toHaveAttribute("href", "mailto:dictozy.support@gmail.com");
    if (path === "/support.html") {
      await expect(page.locator("main").getByRole("link", { name: "dictozy.support@gmail.com", exact: true }))
        .toHaveAttribute("href", "mailto:dictozy.support@gmail.com");
    }
    const hrefs = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href")));

    expect(
      hrefs.filter((href) => /^\.?\/?index\.html(?:[?#]|$)/.test(href)),
      `${path} should link to the canonical homepage URL`,
    ).toEqual([]);

    for (const href of new Set(hrefs)) {
      const destination = new URL(href, page.url());
      if (destination.origin !== baseURL) {
        continue;
      }
      const response = await request.get(`${destination.origin}${destination.pathname}${destination.search}`);
      expect(response.ok(), `${path} -> ${href}`).toBe(true);
    }
  }

  await page.goto("/index.html");
  const hero = page.locator(".hero");
  await expect(hero.getByRole("link", { name: "Add to Chrome" })).toHaveAttribute("href", STORE_URL);
  await expect(hero.getByRole("link", { name: /interactive guide/i })).toHaveAttribute("href", /guide\.html$/);
  expect(await page.locator(`a[href="${STORE_URL}"]`).count()).toBeGreaterThanOrEqual(3);
});

test("public pages contain no source repository destinations", async ({ page }) => {
  for (const path of PUBLIC_PAGES) {
    await page.goto(path);
    const links = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => anchor.href));
    expect(links.some((href) => href.includes("github.com")), path).toBe(false);
    await expect(page.getByText(/View Source|Source Code/i)).toHaveCount(0);
  }
});

test("indexable metadata and crawler files use the production domain", async ({ page, request }) => {
  const expectedPages = [
    { path: "/index.html", canonical: PRODUCTION_ROOT },
    { path: "/guide.html", canonical: `${PRODUCTION_ROOT}guide.html` },
    { path: "/privacy.html", canonical: `${PRODUCTION_ROOT}privacy.html` },
    { path: "/support.html", canonical: `${PRODUCTION_ROOT}support.html` },
  ];

  for (const expected of expectedPages) {
    await page.goto(expected.path);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", expected.canonical);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", expected.canonical);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", SOCIAL_IMAGE);
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", SOCIAL_IMAGE);
    expect((await page.content()).includes(LEGACY_ROOT)).toBe(false);
  }

  await page.goto("/index.html");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", HOMEPAGE_DESCRIPTION);
  expect(HOMEPAGE_DESCRIPTION.length).toBeGreaterThanOrEqual(150);
  expect(HOMEPAGE_DESCRIPTION.length).toBeLessThanOrEqual(170);

  const structuredData = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
  expect(structuredData.url).toBe(PRODUCTION_ROOT);
  expect(structuredData.image).toBe(SOCIAL_IMAGE);
  expect(structuredData.softwareVersion).toBe("0.1.14");
  await expect(page.locator(".hero .version")).toHaveText(`v${structuredData.softwareVersion}`);
  expect(structuredData.installUrl).toBe(STORE_URL);
  expect(structuredData.aggregateRating).toBeUndefined();
  expect(structuredData.review).toBeUndefined();

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain(`Sitemap: ${PRODUCTION_ROOT}sitemap.xml`);
  expect(robots).not.toContain(LEGACY_ROOT);

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(`<loc>${PRODUCTION_ROOT}</loc>`);
  expect(sitemap).toContain(`<loc>${PRODUCTION_ROOT}guide.html</loc>`);
  expect(sitemap).toContain(`<loc>${PRODUCTION_ROOT}privacy.html</loc>`);
  expect(sitemap).toContain(`<loc>${PRODUCTION_ROOT}support.html</loc>`);
  expect(sitemap).not.toContain(LEGACY_ROOT);
});

test("the illustrated hero is described accessibly without design-study labels or live controls", async ({ page }) => {
  await page.goto("/");
  const visual = page.locator(".hero-visual");
  await expect(visual).toBeVisible();
  await expect(visual.getByRole("img")).toHaveAccessibleName(/illustration.*voice waveform.*draft note/i);
  await expect(page.locator("main")).not.toContainText(/fig\. 0\d|signal study|field note \/|product capture|concept illustration/i);
  await expect(visual.locator("button,input,textarea,[contenteditable=true]")).toHaveCount(0);
  await expect(page.locator(".hero h1")).toBeVisible();
});

test("the hero communicates its example without scripting or motion", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    await page.goto("/");
    const figure = page.locator(".hero-visual");
    await expect(figure.getByRole("img")).toHaveAccessibleName(/blue notebook/i);
    await expect(page.locator(".hero .button--primary")).toHaveAttribute("href", STORE_URL);
    await figure.hover();
    expect(await figure.evaluate(node => node.getAnimations({ subtree: true }).length)).toBe(0);
  } finally {
    await context.close();
  }
});

test("homepage FAQ is concise, keyboard operable, and linked to first-party help", async ({ page }) => {
  await page.goto("/index.html");

  const faq = page.locator("#faq");
  const details = faq.locator("details");
  await expect(details).toHaveCount(5);
  await expect(faq.locator('a[href$="support.html"]').first()).toBeVisible();
  await expect(faq.locator('a[href*="privacy.html"]')).toHaveAttribute("href", /privacy\.html#storage-retention$/);

  const firstDetails = faq.locator("details").first();
  const firstSummary = firstDetails.locator("summary");
  await firstSummary.focus();
  await expect(firstSummary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(firstDetails).toHaveAttribute("open", "");
  await page.keyboard.press("Enter");
  await expect(firstDetails).not.toHaveAttribute("open", "");
});

test("images declare dimensions and external new-tab links are isolated", async ({ page }) => {
  for (const path of PUBLIC_PAGES) {
    await page.goto(path);
    const imageMetadata = await page.locator("img").evaluateAll((images) =>
      images.map((image) => ({
        altPresent: image.hasAttribute("alt"),
        width: image.getAttribute("width"),
        height: image.getAttribute("height"),
      })),
    );
    expect(imageMetadata.every((image) => image.altPresent && image.width && image.height), path).toBe(true);

    const unsafeNewTabs = await page.locator('a[target="_blank"]').evaluateAll((links) =>
      links.filter((link) => {
        const rel = new Set(link.rel.split(/\s+/).filter(Boolean));
        return !rel.has("noopener") || !rel.has("noreferrer");
      }).length,
    );
    expect(unsafeNewTabs, path).toBe(0);
  }
});

test("hero copy and illustration remain visible and legible in both layouts", async ({ page }) => {
  for (const size of [{ width: 360, height: 800 }, { width: 1440, height: 960 }]) {
    await page.setViewportSize(size);
    await page.goto("/");
    const title = await page.locator(".hero h1").boundingBox();
    const visual = await page.locator(".hero-visual").boundingBox();
    expect(title.width).toBeGreaterThan(200);
    expect(visual.width).toBeGreaterThan(200);
    const horizontalOverlap = Math.min(title.x + title.width, visual.x + visual.width) - Math.max(title.x, visual.x);
    const verticalOverlap = Math.min(title.y + title.height, visual.y + visual.height) - Math.max(title.y, visual.y);
    expect(Math.min(horizontalOverlap, verticalOverlap)).toBeLessThanOrEqual(1);
    expect(visual.x).toBeGreaterThanOrEqual(0);
    expect(visual.x + visual.width).toBeLessThanOrEqual(size.width + 1);
  }
});

test("the reflowed guide index clears the active workspace at tablet width and enlarged text", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/guide.html#recover");
  await page.locator("#edit-draft").click();
  for (const fontSize of ["100%", "200%"]) {
    const dimensions = await page.evaluate(size => {
      document.documentElement.style.fontSize = size;
      document.querySelector(".guide-workspace").scrollIntoView({ block: "start" });
      const index = document.querySelector(".guide-index").getBoundingClientRect();
      const paper = document.querySelector(".guide-paper").getBoundingClientRect();
      return {
        viewport: document.documentElement.clientWidth,
        total: document.documentElement.scrollWidth,
        overlap: Math.min(
          Math.min(index.bottom, paper.bottom) - Math.max(index.top, paper.top),
          Math.min(index.right, paper.right) - Math.max(index.left, paper.left),
        ),
      };
    }, fontSize);
    expect(dimensions.total, fontSize).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.overlap, fontSize).toBeLessThanOrEqual(1);
  }
});

test("section and page navigation preserves destinations and browser history", async ({ page }) => {
  await page.goto("/#controls");
  await expect(page.locator("#controls")).toBeInViewport();
  await page.locator('footer a[href$="privacy.html"]').click();
  await expect(page).toHaveURL(/\/privacy\.html$/);

  await page.getByRole("link", { name: "Security", exact: true }).click();
  await expect(page).toHaveURL(/#security$/);
  await expect(page.locator("#security")).toBeInViewport();

  await page.locator('.primary-nav a[href$="support.html"]').click();
  await expect(page.locator('.primary-nav [aria-current="page"]')).toHaveText("Support");
  await page.getByRole("link", { name: "FAQ", exact: true }).click();
  await expect(page.locator("#faq")).toBeInViewport();

  // The footer is next to the FAQ. Clicking the header would scroll away from the
  // section before leaving, and Back correctly restores that different position.
  await page.locator('footer a[href$="guide.html"]').click();
  await expect(page.locator('.primary-nav [aria-current="page"]')).toContainText("Guide");
  await page.goBack();
  await expect(page).toHaveURL(/\/support\.html#faq$/);
  await expect(page.locator("#faq")).toBeInViewport();
});

test("the published privacy text and effective date are preserved", async ({ page }) => {
  await page.goto("/privacy.html");
  await expect(page.getByText("Effective date: November 1, 2026", { exact: true })).toBeVisible();
  // Hash the published article at f682d10, excluding markup, navigation and layout whitespace.
  const article = (await page.locator("main article").textContent()).replace(/\s+/g, " ").trim();
  expect(createHash("sha256").update(article).digest("hex")).toBe(
    "93b0bd4da220d3d463a4a33282508e571ae125b88ec58c6d51f2363a61cc38ac",
  );
});

test("nested missing paths retain a 404 and working recovery links", async ({ page, request }) => {
  const missing = "/a/missing/page";
  expect((await request.get(missing)).status()).toBe(404);
  // Serve Pages' custom body at the requested nested URL to exercise relative resolution locally.
  const body = await (await request.get("/404.html")).text();
  await page.route(`**${missing}`, route => route.fulfill({ status: 404, contentType: "text/html", body }));
  expect((await page.goto(missing)).status()).toBe(404);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  for (const selector of ["header nav a", "footer nav a", 'link[rel="stylesheet"]', "img[src]", "script[src]"]) {
    const urls = await page.locator(selector).evaluateAll(items => items.map(el => el.href || el.src));
    for (const url of urls.filter(url => new URL(url).origin === new URL(page.url()).origin)) {
      expect((await request.get(url)).status(), url).toBe(200);
    }
  }
});

for (const viewport of REQUIRED_VIEWPORTS) {
  test(`public pages do not overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth, `${path} at ${viewport.name}`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    }
  });
}

test("the mobile header fits on one row and restores desktop navigation when space permits", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header");
  const install = header.getByRole("link", { name: "Add Dictozy to Chrome" });
  const summary = header.locator("summary");
  const label = install.getByText("Add to Chrome", { exact: true });
  await expect(install).toHaveAttribute("href", STORE_URL);

  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(header.locator(".primary-nav")).toBeHidden();
    await expect(label).toBeHidden();
    await expect(summary).toHaveAccessibleName("Menu");
    const [logo, arrow, menu] = await Promise.all([header.locator(".brand"), install, summary].map(el => el.boundingBox()));
    expect(logo.x + logo.width).toBeLessThanOrEqual(arrow.x);
    expect(arrow.x + arrow.width).toBeLessThanOrEqual(menu.x);
    expect(menu.x + menu.width).toBeLessThanOrEqual(width);
    for (const control of [arrow, menu]) {
      expect(control.width).toBeGreaterThanOrEqual(44);
      expect(control.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(control.y + control.height / 2 - logo.y - logo.height / 2)).toBeLessThanOrEqual(2);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(header.locator(".primary-nav")).toBeVisible();
    await expect(label).toBeVisible();
    await expect(summary).toBeHidden();
  }
});

test("mobile navigation closes on Escape, outside interaction, destination selection, and desktop resize", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const details = page.locator("details.site-menu");
  const summary = details.locator("summary");
  const nav = page.getByRole("navigation", { name: "Mobile navigation" });
  const logo = page.getByRole("link", { name: "Dictozy home" });
  await logo.focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Add Dictozy to Chrome" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(summary).toBeFocused();
  expect(await summary.evaluate(el => el.matches(":focus-visible") && getComputedStyle(el).outlineStyle !== "none")).toBe(true);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(nav.getByRole("link", { name: "Overview" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(nav).toBeHidden();
  await expect(summary).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("main :focus")).toHaveCount(1);

  await summary.click();
  await page.locator("header").click({ position: { x: 190, y: 2 } });
  await expect(details).toHaveJSProperty("open", false);
  await summary.click();
  await page.setViewportSize({ width: 768, height: 844 });
  await expect(details).toHaveJSProperty("open", false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(nav).toBeHidden();

  await summary.click();
  await nav.getByRole("link", { name: "Interactive guide" }).click();
  await expect(page).toHaveURL(/\/guide\.html$/);
  await page.goBack();
  await expect(details).toHaveJSProperty("open", false);
});

test.describe("mobile navigation without JavaScript", () => {
  test.use({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });

  test("all pages expose the right menu destinations, current page and footer links", async ({ page }) => {
    const internal = { Overview: "/", "Interactive guide": "/guide.html", Support: "/support.html", Privacy: "/privacy.html" };
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      const summary = page.locator("header summary");
      const nav = page.getByRole("navigation", { name: "Mobile navigation" });
      await expect(nav).toBeHidden();
      await summary.press("Space");
      await expect(nav).toBeVisible();
      const footer = page.locator("footer");
      for (const [section, links] of [
        [nav, { ...internal, "Add to Chrome": STORE_URL }],
        [footer, { ...internal, "Chrome Web Store": STORE_URL, "Email support": "mailto:dictozy.support@gmail.com" }],
      ]) {
        for (const [name, href] of Object.entries(links)) {
          const link = section.getByRole("link", { name, exact: true });
          await expect(link).toBeVisible();
          await expect(link).toHaveAttribute("href", href);
        }
        const current = section.locator('[aria-current="page"]');
        if (path === "/404.html") await expect(current).toHaveCount(0);
        else await expect(current).toHaveAttribute("href", path === "/index.html" ? "/" : path);
      }
      await summary.press("Space");
      await expect(nav).toBeHidden();
    }
    await page.locator("header summary").click();
    await page.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Privacy" }).click();
    await expect(page).toHaveURL(/\/privacy\.html$/);
  });
});

test("skip navigation is first, visible on focus, and moves focus to main content", async ({ page }) => {
  await page.goto("/index.html");
  await page.keyboard.press("Tab");

  const skipLink = page.locator(".skip-link");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  const focusStyle = await skipLink.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
  });
  expect(focusStyle.outlineStyle).not.toBe("none");
  expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0);

  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  expect(new URL(page.url()).hash).toBe("#main-content");
});

test("homepage local lab vitals stay within the website quality targets", async ({ page }) => {
  await page.addInitScript(() => {
    window.__dictozyVitals = { cls: 0, lcp: 0 };
    new PerformanceObserver((entryList) => {
      const entries = entryList.getEntries();
      const latest = entries.at(-1);
      if (latest) {
        window.__dictozyVitals.lcp = latest.startTime;
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__dictozyVitals.cls += entry.value;
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  });

  await page.goto("/index.html", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const vitals = await page.evaluate(() => window.__dictozyVitals);

  expect(vitals.lcp).toBeGreaterThan(0);
  expect(vitals.lcp).toBeLessThanOrEqual(2500);
  expect(vitals.cls).toBeLessThanOrEqual(0.1);
});

test("desktop and mobile homepage screenshots are available for review", async ({ page }, testInfo) => {
  const screenshotDirectory = path.join(process.cwd(), "test-results", "site-screenshots");
  fs.mkdirSync(screenshotDirectory, { recursive: true });

  await page.setViewportSize({ width: 1920, height: 960 });
  await page.goto("/index.html", { waitUntil: "networkidle" });
  await loadPageImages(page);
  const desktopScreenshot = await page.screenshot({
    fullPage: true,
    path: path.join(screenshotDirectory, "homepage-desktop.png"),
  });
  await testInfo.attach("homepage-desktop", {
    body: desktopScreenshot,
    contentType: "image/png",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/index.html", { waitUntil: "networkidle" });
  await loadPageImages(page);
  const mobileScreenshot = await page.screenshot({
    fullPage: true,
    path: path.join(screenshotDirectory, "homepage-mobile.png"),
  });
  await testInfo.attach("homepage-mobile", {
    body: mobileScreenshot,
    contentType: "image/png",
  });
});
