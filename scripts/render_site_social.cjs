// Run a loopback preview on port 4174 first, then: node scripts/render_site_social.cjs
const { chromium } = require("@playwright/test");
const path = require("node:path");

async function renderSocialCard() {
  const base = "http://127.0.0.1:4174";
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await page.route("**/*", route =>
      new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await page.goto(base);
    await page.addStyleTag({ content: `
      body { height: 630px; overflow: hidden; border-top: 10px solid var(--brand-primary); }
      .site-header { border: none; background: transparent; }
      .site-header__inner { height: 90px; }
      .brand img { width: auto; height: 42px; }
      .primary-nav, .header-install, .hero-panel .eyebrow, .hero-actions, .hero-note,
      main > :not(.hero), .site-footer { display: none; }
      .hero { padding: 0; height: 480px; grid-template-columns: 1fr 1fr; gap: 4rem; }
      .hero h1 { margin: 0 0 1.4rem; font-size: 4.4rem; }
      .hero-copy { font-size: 1.5rem; }
      body::after { content: "dictozy.com"; position: absolute; bottom: 25px; left: var(--gutter);
        color: var(--text-secondary); font-size: 1.1rem; }
    ` });
    await page.locator(".hero-copy").evaluate(el => { el.textContent = "Voice dictation for Chrome"; });
    await page.locator(".brand img").evaluate(img => img.decode());
    await page.screenshot({ path: path.resolve(__dirname, "../site/assets/dictozy-social.png") });
  } finally {
    await browser.close();
  }
}

renderSocialCard().catch(error => { console.error(error); process.exitCode = 1; });
