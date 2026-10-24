// Renders build/icon-src.svg (and build/icon-src-small.svg for the 16 and 32 px slots) to
// build/icon.png (1024), build/icon.iconset/ and build/icon.icns. Run: npm run icon
// Rasterized by Electron's Chromium in an offscreen transparent window, so the alpha is real.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const dir = __dirname;
const full = fs.readFileSync(path.join(dir, 'icon-src.svg'), 'utf8');
const small = fs.readFileSync(path.join(dir, 'icon-src-small.svg'), 'utf8');
// iconset slot -> [pixels, source]
const slots = {
  'icon_16x16.png': [16, small],
  'icon_16x16@2x.png': [32, small],
  'icon_32x32.png': [32, small],
  'icon_32x32@2x.png': [64, full],
  'icon_128x128.png': [128, full],
  'icon_128x128@2x.png': [256, full],
  'icon_256x256.png': [256, full],
  'icon_256x256@2x.png': [512, full],
  'icon_512x512.png': [512, full],
  'icon_512x512@2x.png': [1024, full],
};

let win = null;
const tmpHtml = path.join(require('node:os').tmpdir(), `mt-icon-${process.pid}.html`);

async function render(px, svg) {
  if (!win) {
    win = new BrowserWindow({
      width: px,
      height: px,
      show: false,
      frame: false,
      transparent: true,
      useContentSize: true,
      webPreferences: { offscreen: true },
    });
  }
  win.setContentSize(px, px);
  const src = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  fs.writeFileSync(
    tmpHtml,
    `<html><body style="margin:0;background:transparent;overflow:hidden"><img width="${px}" height="${px}" src="${src}"></body></html>`,
  );
  await win.loadFile(tmpHtml);
  await new Promise((r) => setTimeout(r, 200));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: px, height: px });
  const out = img.getSize().width === px ? img : img.resize({ width: px, height: px, quality: 'best' });
  return out.toPNG();
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const set = path.join(dir, 'icon.iconset');
  fs.rmSync(set, { recursive: true, force: true });
  fs.mkdirSync(set);
  for (const [name, [px, svg]] of Object.entries(slots)) {
    fs.writeFileSync(path.join(set, name), await render(px, svg));
  }
  fs.copyFileSync(path.join(set, 'icon_512x512@2x.png'), path.join(dir, 'icon.png'));
  execFileSync('iconutil', ['-c', 'icns', set, '-o', path.join(dir, 'icon.icns')]);
  fs.rmSync(tmpHtml, { force: true });
  console.log('wrote build/icon.png, build/icon.iconset/, build/icon.icns');
  app.quit();
});
