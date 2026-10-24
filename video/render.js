// Renders index.html frame by frame (seeking a pure function of time) into PNGs.
// Usage: node render.js <outDir> [fps=30] [duration=5] [only=comma,separated,times]
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

(async () => {
  const [outDir, fps = "30", dur = "5", only] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on("console", m => console.log("[page]", m.text()));
  page.on("pageerror", e => { console.error("[pageerror]", e.message); process.exit(1); });
  await page.goto("file://" + path.resolve(__dirname, "index.html"));
  await page.evaluate(() => window.__ready);
  const times = only ? only.split(",").map(Number) : [...Array(Math.round(+fps * +dur)).keys()].map(i => i / +fps);
  for (const [i, t] of times.entries()) {
    const t0 = Date.now();
    await page.evaluate(t => window.renderAt(t), t);
    const name = only ? `t_${t.toFixed(2)}.png` : `f_${String(i).padStart(4, "0")}.png`;
    await page.screenshot({ path: path.join(outDir, name) });
    console.log(name, Date.now() - t0, "ms");
  }
  await browser.close();
})();
