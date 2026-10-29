// Phone-size screenshots (360px, 2x) of the demo build: node tools/screens-phone.mjs <outDir>
// Serves dist/ itself and swaps Google Fonts for the local Cairo copy (no network here).
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = process.argv[2] || '.';
const root = new URL('../dist/', import.meta.url).pathname;
const fonts = new URL('../../../acl-home-exercises/fonts/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/json' };
const server = createServer(async (req, res) => {
  const p = req.url.split('?')[0];
  try { const f = join(root, p === '/' ? 'index.html' : p); res.writeHead(200, { 'Content-Type': types[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); }
  catch { res.writeHead(404); res.end(); }
}).listen(4173);

let css = '';
for (const w of [400, 600, 700, 800]) {
  for (const sub of ['arabic', 'latin']) {
    const b64 = (await readFile(join(fonts, `cairo-${sub}-${w}-normal.woff2`))).toString('base64');
    css += `@font-face{font-family:Cairo;font-weight:${w};src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
  }
}

const browser = await chromium.launch();
const errors = [];
const shot = async (name, { lang = 'ar', viewport = { width: 360, height: 780 }, dark = false }, steps) => {
  const page = await browser.newPage({ viewport, colorScheme: dark ? 'dark' : 'light', deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  await page.addInitScript((l) => localStorage.setItem('lang', l), lang);
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: css }));
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await page.goto('http://localhost:4173/');
  await page.evaluate(() => document.fonts.ready);
  await steps(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await page.close();
};
const role = (page, n) => page.locator('.card .btn').nth(n).click();   // demo buttons: 0 patient, 1 new, 2 therapist, 3 admin, 4 owner
const desk = { width: 1200, height: 900 };

await shot('01-login', {}, async () => {});
await shot('02-patient-home', {}, async (p) => { await role(p, 0); await p.waitForSelector('.session'); });
await shot('03-exercise', {}, async (p) => { await role(p, 0); await p.waitForSelector('.session.open'); await p.locator('.session.open').first().click(); await p.waitForSelector('.caution'); });
await shot('04-onboarding', {}, async (p) => {
  await role(p, 1); await p.waitForSelector('#age'); await p.locator('.choice').nth(1).click(); await p.fill('#age', '64');
  await p.waitForSelector('.choice >> nth=2'); await p.locator('.choice').nth(2).click();
});
const toLang = async (p, l) => { await p.locator('.icon-btn').last().click(); await p.waitForSelector('#sw-large'); await p.selectOption('#lang-select', l); await p.waitForTimeout(300); };
await shot('05-settings-de', { lang: 'de' }, async (p) => { await role(p, 0); await p.waitForSelector('.session'); await toLang(p, 'de'); await p.click('#sw-large'); });
await shot('06-chat', {}, async (p) => { await role(p, 0); await p.waitForSelector('.session'); await p.locator('.icon-btn').first().click(); await p.waitForSelector('.bubble'); });
await shot('07-staff-home', { viewport: desk }, async (p) => { await role(p, 2); await p.waitForSelector('.prow'); });
await shot('08-staff-patient', { viewport: desk }, async (p) => { await role(p, 2); await p.waitForSelector('.prow'); await p.locator('.prow').first().click(); await p.waitForSelector('.timeline'); });
await shot('09-report-en', { lang: 'en', viewport: desk }, async (p) => { await role(p, 2); await p.waitForSelector('.prow'); await p.locator('.prow').first().click(); await p.waitForSelector('.timeline'); await p.locator('.top .btn.ghost').last().click(); await p.waitForSelector('.report'); });
await shot('10-owner-en', { lang: 'en', viewport: desk }, async (p) => { await role(p, 4); await p.waitForSelector('.card b'); });
await shot('11-admin-appts', { viewport: desk }, async (p) => { await role(p, 3); await p.waitForSelector('.prow'); await p.locator('[role=tab]').nth(3).click(); await p.waitForSelector('table'); });
await shot('12-patient-dark-en', { lang: 'en', dark: true }, async (p) => { await role(p, 0); await p.waitForSelector('.session'); await toLang(p, 'en'); await p.locator('.icon-btn').first().click(); await p.waitForSelector('.session'); });
await shot('13-staff-kid', { viewport: desk }, async (p) => {
  await role(p, 3); await p.waitForSelector('.prow'); await p.locator('.prow').filter({ hasText: 'يوسف' }).click(); await p.waitForSelector('.timeline');
});
await browser.close();
server.close();
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
