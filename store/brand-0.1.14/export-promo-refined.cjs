/* Only render the refined marketing tile; never regenerate submitted assets. */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'store/assets/0.1.14/promo-small-440x280-refined.png');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function render() {
  const lockup = await fs.readFile(path.join(root, 'site/assets/dictozy-lockup.svg'), 'utf8');
  const mark = await fs.readFile(path.join(__dirname, 'mark.svg'), 'utf8');
  // Pin the approved PR #10 lettering and original icon, not the old wordmark.svg.
  assert.equal(sha256(lockup), 'd3fef1f2b8ca790650d2dbfc70b9592240bf786cf29554bbd04bb1f777e15c6c');
  assert.equal(sha256(mark), '39002a487e6b17762a75a02b98a60d03e6759953a33a95b21ac3e97bdf1c4321');

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
    await page.route('**/*', (route) => route.abort());
    await page.setContent('<style>html,body{margin:0;background:#0B1220}svg{display:block}</style>');
    const bounds = await page.evaluate(({ lockup, mark }) => {
      const parse = (source) => new DOMParser().parseFromString(source, 'image/svg+xml').documentElement;
      const approved = parse(lockup).querySelector('#wordmark');
      const lettering = approved.cloneNode(true);
      lettering.setAttribute('fill', '#FFFFFF');
      const icon = parse(mark).innerHTML;
      // Background, rings, waveform and icon placement are identical to export.cjs.
      const wave = [6, 13, 23, 12, 34, 19, 42, 25, 10].map((height, i) => {
        const x = 17 + i * 13;
        return `<path d="M${x} ${124-height/2}v${height} M${440-x} ${124-height/2}v${height}"/>`;
      }).join('');
      const tile = parse(`<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
        <rect width="440" height="280" fill="#0B1220"/>
        <g fill="none" stroke="#273C68"><circle cx="220" cy="124" r="102"/><circle cx="220" cy="124" r="159"/></g>
        <g fill="none" stroke="#609BFF" stroke-width="4" stroke-linecap="round">${wave}</g>
        <g transform="translate(167 60) scale(1.65625)">${icon}</g>
        <g id="wordmark-placement"/>
      </svg>`);
      tile.querySelector('#wordmark-placement').append(lettering);
      document.body.append(tile);
      const placed = tile.querySelector('#wordmark');
      // Retain every path and per-letter kerning transform verbatim.
      if (placed.children.length !== 7 || ![...placed.children].every((letter, i) =>
        letter.isEqualNode(approved.children[i]))) {
        throw new Error('Approved wordmark geometry changed');
      }
      const box = placed.getBBox();
      const width = 164;
      const scale = width / box.width;
      const x = (440 - width) / 2;
      const y = 180;
      tile.querySelector('#wordmark-placement').setAttribute('transform',
        `translate(${x - box.x * scale} ${y - box.y * scale}) scale(${scale})`);
      return { x, y, width, height: box.height * scale, scale };
    }, { lockup, mark });
    const png = await page.screenshot({ path: output, omitBackground: false });
    console.log(JSON.stringify({ file: path.relative(root, output), bytes: png.length,
      sha256: sha256(png), chromium: browser.version(), wordmark: bounds }, null, 2));
  } finally {
    await browser.close();
  }
}

render().catch((error) => { console.error(error); process.exitCode = 1; });
