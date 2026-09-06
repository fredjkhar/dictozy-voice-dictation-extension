const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const PUBLIC_PAGES = ["/index.html", "/privacy.html", "/support.html", "/404.html"];
const STORE_URL = "https://chromewebstore.google.com/detail/folpeencabfejhjokmldikaelonphmma";
const PRODUCTION_ROOT = "https://dictozy.com/";
const LEGACY_ROOT = "https://fredjkhar.github.io/dictozy-voice-dictation-extension/";
const HOMEPAGE_DESCRIPTION =
  "Dictozy is a Chrome voice dictation extension for quickly entering messages, notes, searches, and form text into supported web fields with no account required.";
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
    const hrefs = await page.locator("a[href]").evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href")));

    for (const href of hrefs) {
      const destination = new URL(href, page.url());
      if (destination.origin !== baseURL) {
        continue;
      }
      const response = await request.get(`${destination.origin}${destination.pathname}${destination.search}`);
      expect(response.ok(), `${path} -> ${href}`).toBe(true);
    }
  }

  await page.goto("/index.html");
  await expect(page.getByRole("link", { name: "Install from Chrome Web Store" })).toHaveAttribute("href", STORE_URL);
  await expect(page.getByRole("link", { name: "See how it works" })).toHaveAttribute("href", "#how-it-works");

  const storeLinks = page.locator(`a[href="${STORE_URL}"]`);
  expect(await storeLinks.count()).toBeGreaterThanOrEqual(3);
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
    {
      path: "/index.html",
      canonical: PRODUCTION_ROOT,
      image: `${PRODUCTION_ROOT}assets/screenshot-dictation-1280x800.png`,
    },
    {
      path: "/privacy.html",
      canonical: `${PRODUCTION_ROOT}privacy.html`,
      image: `${PRODUCTION_ROOT}assets/screenshot-dictation-1280x800.png`,
    },
    {
      path: "/support.html",
      canonical: `${PRODUCTION_ROOT}support.html`,
      image: `${PRODUCTION_ROOT}assets/screenshot-settings-1280x800.png`,
    },
  ];

  for (const expected of expectedPages) {
    await page.goto(expected.path);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", expected.canonical);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", expected.canonical);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", expected.image);
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", expected.image);
    expect((await page.content()).includes(LEGACY_ROOT)).toBe(false);
  }

  await page.goto("/index.html");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", HOMEPAGE_DESCRIPTION);
  expect(HOMEPAGE_DESCRIPTION.length).toBeGreaterThanOrEqual(150);
  expect(HOMEPAGE_DESCRIPTION.length).toBeLessThanOrEqual(170);

  const structuredData = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
  expect(structuredData.url).toBe(PRODUCTION_ROOT);
  expect(structuredData.image).toBe(`${PRODUCTION_ROOT}assets/screenshot-dictation-1280x800.png`);
  expect(structuredData.softwareVersion).toBe("0.1.11");
  expect(structuredData.installUrl).toBe(STORE_URL);
  expect(structuredData.aggregateRating).toBeUndefined();
  expect(structuredData.review).toBeUndefined();

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain(`Sitemap: ${PRODUCTION_ROOT}sitemap.xml`);
  expect(robots).not.toContain(LEGACY_ROOT);

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain(`<loc>${PRODUCTION_ROOT}</loc>`);
  expect(sitemap).toContain(`<loc>${PRODUCTION_ROOT}privacy.html</loc>`);
  expect(sitemap).toContain(`<loc>${PRODUCTION_ROOT}support.html</loc>`);
  expect(sitemap).not.toContain(LEGACY_ROOT);
});

test("homepage presents the real Dictozy controls as crisp components", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page.locator(".dictation-demo")).toBeVisible();
  await expect(page.locator(".voice-dictation-mic-button")).toBeVisible();
  await expect(page.locator(".voice-dictation-status")).toHaveText("Recording");
  await expect(page.locator(".popup-preview")).toBeVisible();
  await expect(page.locator(".popup-switch")).toHaveCount(2);
  await expect(page.locator('main img[src*="screenshot-"]')).toHaveCount(0);
});

test("homepage FAQ is concise, keyboard operable, and linked to first-party help", async ({ page }) => {
  await page.goto("/index.html");

  const faq = page.locator("#faq");
  await expect(faq.locator("details")).toHaveCount(5);
  await expect(faq.getByRole("link", { name: "Dictozy support" })).toHaveAttribute("href", "support.html");
  await expect(faq.locator('a[href="privacy.html"]')).toHaveAttribute("href", "privacy.html");

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

test("homepage refinements keep the hero neutral and primary sections aligned", async ({ page }) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1920, height: 960 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/index.html");

    const layout = await page.evaluate(() => {
      const bodyStyle = getComputedStyle(document.body);
      const hero = document.querySelector(".hero");
      const heroPanel = document.querySelector(".hero-panel");
      const assuranceElement = document.querySelector(".assurance-band");
      const assuranceItem = assuranceElement.firstElementChild;
      const assurance = assuranceElement.getBoundingClientRect();
      const content = document.querySelector(".content-section").getBoundingClientRect();
      const assuranceStyle = getComputedStyle(assuranceElement);
      const assuranceItemStyle = getComputedStyle(assuranceItem);
      const supportStyle = getComputedStyle(document.querySelector(".support-callout"));

      return {
        bodyBackground: bodyStyle.backgroundColor,
        heroBackground: getComputedStyle(hero).backgroundColor,
        heroPanelBackground: getComputedStyle(heroPanel).backgroundColor,
        assuranceLeft: assurance.left,
        assuranceWidth: assurance.width,
        contentLeft: content.left,
        contentWidth: content.width,
        assuranceBorderWidths: [
          assuranceStyle.borderTopWidth,
          assuranceStyle.borderRightWidth,
          assuranceStyle.borderBottomWidth,
          assuranceStyle.borderLeftWidth,
        ],
        assuranceMarginTop: assuranceStyle.marginTop,
        assuranceAlignment: assuranceItemStyle.alignContent,
        assurancePaddingLeft: Number.parseFloat(assuranceItemStyle.paddingLeft),
        assurancePaddingRight: Number.parseFloat(assuranceItemStyle.paddingRight),
        assurancePaddingTop: assuranceItemStyle.paddingTop,
        assurancePaddingBottom: assuranceItemStyle.paddingBottom,
        supportBorderTopWidth: supportStyle.borderTopWidth,
      };
    });

    expect(layout.heroBackground).toBe(layout.bodyBackground);
    expect(layout.heroPanelBackground).toBe(layout.bodyBackground);
    expect(Math.abs(layout.assuranceLeft - layout.contentLeft)).toBeLessThanOrEqual(1);
    expect(Math.abs(layout.assuranceWidth - layout.contentWidth)).toBeLessThanOrEqual(1);
    expect(layout.assuranceBorderWidths).toEqual(["1px", "1px", "1px", "1px"]);
    expect(layout.assuranceMarginTop).toBe("24px");
    expect(layout.assuranceAlignment).toBe("start");
    expect(layout.assurancePaddingLeft).toBeLessThanOrEqual(26);
    expect(layout.assurancePaddingRight).toBeLessThanOrEqual(26);
    expect(layout.assurancePaddingTop).toBe(layout.assurancePaddingBottom);
    expect(layout.supportBorderTopWidth).toBe("1px");
  }
});

test("section and page navigation preserves clear destinations and browser history", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator('.primary-nav a[href="#controls"]').click();
  await expect.poll(() => new URL(page.url()).hash).toBe("#controls");
  await expect(page.locator("#controls")).toBeInViewport();

  await page.getByRole("link", { name: "Privacy", exact: true }).first().click();
  await expect(page).toHaveURL(/\/privacy\.html$/);
  await expect(page.locator('.primary-nav a[aria-current="page"]')).toHaveText("Privacy");

  await page.getByRole("link", { name: "Security", exact: true }).click();
  await expect.poll(() => new URL(page.url()).hash).toBe("#security");
  await expect(page.locator("#security")).toBeInViewport();

  await page.locator('.primary-nav a[href="support.html"]').click();
  await expect(page).toHaveURL(/\/support\.html$/);
  await expect(page.locator('.primary-nav a[aria-current="page"]')).toHaveText("Support");

  await page.getByRole("link", { name: "FAQ", exact: true }).click();
  await expect.poll(() => new URL(page.url()).hash).toBe("#faq");
  await expect(page.locator("#faq")).toBeInViewport();

  await page.locator('.primary-nav a[href="index.html#how-it-works"]').click();
  await expect(page).toHaveURL(/\/index\.html#how-it-works$/);
  await expect(page.locator("#how-it-works")).toBeInViewport();

  await page.goBack();
  await expect(page).toHaveURL(/\/support\.html#faq$/);
  await expect(page.locator("#faq")).toBeInViewport();
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
