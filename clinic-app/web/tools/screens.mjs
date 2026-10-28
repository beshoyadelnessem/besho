// Screenshots of the demo build for review: node tools/screens.mjs <outDir>
// Serves dist/ itself and swaps Google Fonts for the local Cairo copy (no network here).
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || 'playwright');
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const out = process.argv[2] || '.';
const root = new URL('../dist/', import.meta.url).pathname;
const fonts = new URL('../../../acl-home-exercises/fonts/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/json' };
const server = createServer(async (req, res) => {
  const p = req.url.split('?')[0];
  try { const f = join(root, p === '/' ? 'index.html' : p); res.writeHead(200, { 'Content-Type': types[extname(f)] || 'application/octet-stream' }); res.end(await readFile(f)); }
  catch { res.writeHead(404); res.end(); }
}).listen(4173);

const css = [400, 600, 700, 800].map((w) => `@font-face{font-family:Cairo;font-weight:${w};src:url(data:font/woff2;base64,${''}FONT${w}) format('woff2');}`).join('');
const fontData = {};
for (const w of [400, 600, 700, 800]) fontData[w] = (await readFile(join(fonts, `cairo-arabic-${w}-normal.woff2`))).toString('base64');
const cssFilled = css.replace(/FONT(\d+)/g, (_, w) => fontData[w]);

const browser = await chromium.launch();
const shot = async (name, steps, viewport = { width: 400, height: 860 }) => {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => console.log('PAGE ERROR', name, e.message));
  await page.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: cssFilled }));
  await page.route('https://fonts.gstatic.com/**', (r) => r.abort());
  await page.goto('http://localhost:4173/');
  await page.evaluate(() => document.fonts.ready);
  await steps(page);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await page.close();
};
const click = (page, text) => page.getByText(text, { exact: false }).first().click();

await shot('1-login', async () => {});
await shot('2-patient-home', async (p) => { await click(p, 'ادخل كمريض (أحمد)'); await p.waitForSelector('.session'); });
await shot('3-exercise', async (p) => {
  await click(p, 'ادخل كمريض (أحمد)'); await p.waitForSelector('.session.open');
  await p.locator('.session.open').first().click(); await p.waitForSelector('.caution');
});
await shot('4-onboarding', async (p) => {
  await click(p, 'ادخل كمريض جديد'); await p.waitForSelector('#age');
  await click(p, 'أنثى'); await p.fill('#age', '64'); await click(p, 'محجبة');
});
await shot('5-staff-home', async (p) => { await click(p, 'ادخل كأخصائي'); await p.waitForSelector('.prow'); }, { width: 1200, height: 800 });
await shot('6-staff-patient', async (p) => {
  await click(p, 'ادخل كأخصائي'); await p.waitForSelector('.prow'); await click(p, 'أحمد سمير');
  await p.waitForSelector('.days'); await click(p, '+ تمرين'); await click(p, 'رفع الرجل مفرودة');
}, { width: 1200, height: 900 });
await shot('7-admin', async (p) => { await click(p, 'ادخل كأدمن'); await p.waitForSelector('.prow'); await click(p, 'الدكاترة والأخصائيين'); }, { width: 1200, height: 700 });
await shot('8-patient-dark', async (p) => { await p.emulateMedia({ colorScheme: 'dark' }); await click(p, 'ادخل كمريض (أحمد)'); await p.waitForSelector('.session'); });
await browser.close();
server.close();
