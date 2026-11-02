/* Render the checked-in geometry using the repository's pinned Playwright. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const icons = path.join(root, 'extension/icons');
const store = path.join(root, 'store/assets/0.1.14');
const svg = (width, height, contents) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${contents}\n</svg>\n`;
const geometry = (markup) => markup.slice(markup.indexOf('>') + 1, markup.lastIndexOf('</svg>')).trim();

async function exportBrand() {
  const mark = geometry(await fs.readFile(path.join(__dirname, 'mark.svg'), 'utf8'));
  const lettering = geometry(await fs.readFile(path.join(__dirname, 'wordmark.svg'), 'utf8'));
  const lockup = (color) => svg(264, 64, `${mark}
  <g color="${color}" transform="translate(80 1) scale(1.59)">${lettering}</g>`);
  await fs.writeFile(path.join(__dirname, 'lockup-light.svg'), lockup('#0F172A'));
  await fs.writeFile(path.join(__dirname, 'lockup-dark.svg'), lockup('#FFFFFF'));

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.route(/^https?:/, (route) => route.abort());
    async function png(filename, width, height, image) {
      await page.setViewportSize({ width, height });
      await page.setContent(`<style>*{box-sizing:border-box}html,body{margin:0}svg{display:block;width:100%;height:100%}</style>${image}`);
      await page.screenshot({ path: filename, omitBackground: true });
    }

    await fs.mkdir(store, { recursive: true });
    for (const size of [16, 32, 48, 128, 256, 512, 1024]) {
      // Keep toolbar artwork legible. Google's 128px Store icon has 16px transparent gutters.
      const area = size === 128 ? 96 : size;
      const offset = (size - area) / 2;
      const body = `<g transform="translate(${offset} ${offset}) scale(${area / 64})">${mark}</g>`;
      await png(path.join(icons, `icon-${size}.png`), size, size, svg(size, size, body));
    }
    await fs.copyFile(path.join(icons, 'icon-128.png'), path.join(store, 'icon-128.png'));

    const left = [6, 13, 23, 12, 34, 19, 42, 25, 10];
    const wave = left.map((height, i) => {
      const x = 17 + i * 13;
      return `<path d="M${x} ${124-height/2}v${height} M${440-x} ${124-height/2}v${height}"/>`;
    }).join('\n');
    const promo = svg(440, 280, `<rect width="440" height="280" fill="#0B1220"/>
      <g fill="none" stroke="#273C68"><circle cx="220" cy="124" r="102"/><circle cx="220" cy="124" r="159"/></g>
      <g fill="none" stroke="#609BFF" stroke-width="4" stroke-linecap="round">${wave}</g>
      <g transform="translate(167 60) scale(1.65625)">${mark}</g>
      <g color="#FFFFFF" transform="translate(145.9 173) scale(1.3)">${lettering}</g>`);
    await png(path.join(store, 'promo-small-440x280.png'), 440, 280, promo);

    const previews = [];
    for (const size of [16, 32, 48]) {
      const bytes = await fs.readFile(path.join(icons, `icon-${size}.png`));
      previews.push(`<figure><img width="${size}" height="${size}" alt="" src="data:image/png;base64,${bytes.toString('base64')}"><figcaption>${size} px</figcaption></figure>`);
    }
    await page.setViewportSize({ width: 740, height: 288 });
    await page.setContent(`<style>
      *{box-sizing:border-box}body{background:#f8fafc;color:#0f172a;margin:0;font:14px system-ui}
      header,section{display:flex;align-items:center}header{height:96px;padding:0 36px;justify-content:space-between}
      header svg{width:190px;height:auto}header span{font-size:13px;color:#475569}
      section{height:96px;gap:42px;padding:0 36px;border-top:1px solid #cbd5e1}
      section:last-child{background:#202124;color:white;border:0}
      section b{width:165px;font-weight:550}figure{display:flex;align-items:center;gap:10px;margin:0}figcaption{font-size:12px}
    </style><header>${lockup('#0F172A')}<span>Toolbar exports at actual size</span></header>
    <section><b>Light toolbar</b>${previews.join('')}</section><section><b>Dark toolbar</b>${previews.join('')}</section>`);
    await page.screenshot({ path: path.join(__dirname, 'toolbar-proof.png') });
  } finally {
    await browser.close();
  }
}

exportBrand().catch((error) => { console.error(error); process.exitCode = 1; });
