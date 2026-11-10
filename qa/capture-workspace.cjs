// Local-only review captures; actual Chromium capture with fake device, mocked transcript.
// Start scripts/workspace_preview.py on 4198 first. Never contacts production/provider.
const { chromium, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs/review/web-workspace');
const BASE = 'http://127.0.0.1:4198';
const API = 'http://127.0.0.1:4199/api/transcribe';
const axePath = process.env.DICTOZY_AXE_PATH;
const reports = [];
const captures = [];
function saveCapture(name, bytes) {
  execFileSync('python3',['-c',"from PIL import Image; import sys; Image.open(sys.stdin.buffer).save(sys.argv[1], format='WEBP', lossless=True)",path.join(OUT,name+'.webp')],{input:bytes});
  captures.push(name+'.webp');
}
const blocked = [];
const errors = [];
fs.mkdirSync(OUT, {recursive:true});
(async () => {
  const browser = await chromium.launch({headless:true, args:[
    '--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
  ]});
  const context = await browser.newContext({viewport:{width:1440,height:1000}, deviceScaleFactor:1, reducedMotion:'reduce', permissions:['microphone','clipboard-write']});
  let releaseUpload = null;
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.href === BASE + '/_qa-axe.js' && axePath) return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(axePath)});
    if (url.href === API) {
      if (route.request().method() === 'OPTIONS') return route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':BASE,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'X-Request-ID,Content-Type'}});
      await new Promise(resolve => {releaseUpload=resolve;});
      try { await route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':BASE},json:{transcript:'Bring the blue notebook.'}}); } catch(_) {}
      return;
    }
    if (url.origin === BASE) return route.continue();
    blocked.push(url.href); return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', error=>errors.push(error.message));
  async function open(width=390,height=844) {
    await page.setViewportSize({width,height});
    await page.goto(BASE+'/try.html');
    const frame=page.frames().find(f=>f.url().includes('/workspace.html'));
    await expect(frame.locator('#draft')).toBeEnabled();
    await expect(frame.locator('.voice-dictation-mic-button')).toBeVisible();
    return frame;
  }
  async function inspect(name,frame) {
    const layouts=[];
    for(const [label,target] of [['page',page],['workspace',frame]]) {
      layouts.push(await target.evaluate(label=>({label,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth+1}),label));
      if(axePath) {
        await target.addScriptTag({url:BASE+'/_qa-axe.js'});
        const result=await target.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
        reports.push({state:name,target:label,violations:result.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))});
      }
    }
    reports.push({state:name,layouts});
    saveCapture(name, await page.screenshot());
  }
  for (const [width,height] of [[1440,1000],[768,1024],[390,844],[320,844]]) {
    const frame=await open(width,height);
    await inspect('empty-'+width,frame);
  }
  let frame=await open(1440,1000);
  await frame.locator('#draft').fill('Notes for our studio visit:\nAsk about the lighting and bring the blue notebook.');
  await inspect('populated-1440',frame);
  await frame.locator('#copy-text').click();
  await expect(frame.locator('#workspace-feedback')).toHaveText('Text copied.');
  await inspect('copy-feedback-1440',frame);
  await frame.locator('#clear-text').click();
  await expect(frame.locator('#clear-dialog')).toBeVisible();
  await inspect('clear-confirmation-1440',frame);
  await frame.locator('#cancel-clear').click();
  await frame.locator('.workspace-settings summary').click();
  await frame.locator('#remember-draft').check();
  await expect(frame.locator('#save-status')).toHaveText('Saved in this browser.');
  await inspect('settings-1440',frame);
  await frame.locator('#remember-draft').uncheck();
  frame=await open(390,844);
  await frame.locator('#draft').fill('Notes for our studio visit:');
  await frame.locator('.voice-dictation-mic-button').scrollIntoViewIfNeeded();
  await frame.locator('.voice-dictation-mic-button').click();
  await expect(frame.locator('.voice-dictation-mic-button')).toHaveAttribute('data-state','recording');
  await page.waitForTimeout(1100);
  await inspect('recording-390',frame);
  await frame.getByRole('button',{name:'Stop recording',exact:true}).click();
  await expect(frame.locator('.voice-dictation-mic-button')).toHaveAttribute('data-state','transcribing');
  await expect.poll(()=>Boolean(releaseUpload)).toBe(true);
  await inspect('processing-390',frame);
  await frame.locator('#draft').fill('Dear team,\nNotes for our studio visit:');
  releaseUpload(); releaseUpload=null;
  await expect(frame.locator('.voice-dictation-recovery')).toBeVisible();
  await frame.locator('.voice-dictation-recovery').scrollIntoViewIfNeeded();
  await inspect('recovery-390',frame);
  await frame.getByRole('button',{name:'Discard transcript',exact:true}).click();
  await frame.locator('.workspace-settings summary').click();
  await frame.locator('.workspace-settings').scrollIntoViewIfNeeded();
  await inspect('settings-390',frame);
  frame=await open(320,844);
  for(const target of [page,frame]) await target.evaluate(()=>document.documentElement.style.fontSize='200%');
  await frame.locator('.workspace-settings summary').click();
  await frame.locator('.workspace-settings').scrollIntoViewIfNeeded();
  await inspect('enlarged-text-320',frame);
  const nojs=await browser.newContext({viewport:{width:390,height:844},javaScriptEnabled:false});
  await nojs.route('**/*',route=>new URL(route.request().url()).origin===BASE?route.continue():route.abort());
  const nojsPage=await nojs.newPage();
  await nojsPage.goto(BASE+'/try.html');
  const fallback=nojsPage.frames().find(f=>f.url()==='about:srcdoc');
  await expect(fallback.getByRole('textbox',{name:'Your text'})).toBeVisible();
  await fallback.getByRole('textbox',{name:'Your text'}).fill('Ordinary typing remains available.');
  saveCapture('no-javascript-390',await nojsPage.screenshot());
  await nojs.close();
  const sourceFiles=['site/try.html','site/try.js','site/workspace.html','site/workspace.js','site/workspace.css','site/shared/dictation-controller.js'];
  fs.writeFileSync(path.join(OUT,'validation.json'), JSON.stringify({browser:browser.version(),method:'Real Chromium APIs with fake microphone device; browser-routed fixed transcript, loopback-only requests. No provider or physical microphone.',source_commit:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(),captures_sha256:Object.fromEntries(captures.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT,name))).digest('hex')])),working_tree_files_sha256:Object.fromEntries(sourceFiles.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,name))).digest('hex')])),blocked_external:blocked,page_errors:errors,reports},null,2)+'\n');
  await browser.close();
  console.log(JSON.stringify({captures:captures.length,blocked,errors}));
})().catch(error=>{console.error(error);process.exit(1);});
