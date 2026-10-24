// Renders the iconset as a contact sheet: electron team/evidence/dev/wo-3/G/contact-sheet.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../../../../..');
const set = path.join(root, 'build/icon.iconset');
const order = ['icon_16x16.png', 'icon_16x16@2x.png', 'icon_32x32.png', 'icon_32x32@2x.png', 'icon_128x128.png', 'icon_256x256.png', 'icon_512x512.png'];
const cell = (bg, fg) => order.map((f) => {
  const b64 = fs.readFileSync(path.join(set, f)).toString('base64');
  const px = parseInt(f.match(/(\d+)x/)[1]) * (f.includes('@2x') ? 2 : 1);
  const zoom = px <= 64 ? `<img src="data:image/png;base64,${b64}" width="${px * 4}" style="image-rendering:pixelated">` : '';
  return `<div style="display:inline-block;vertical-align:bottom;margin:10px;text-align:center;color:${fg};font:11px -apple-system">${zoom}<br><img src="data:image/png;base64,${b64}" width="${px}"><br>${f} (${px} px)</div>`;
}).join('');
const html = `<html><body style="margin:0;font:13px -apple-system">
<div style="background:#f2f2f2;padding:10px">${cell('#f2f2f2', '#333')}</div>
<div style="background:#1e1e1e;padding:10px">${cell('#1e1e1e', '#ccc')}</div></body></html>`;
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1500, height: 1420, show: false, webPreferences: { offscreen: true } });
  const tmp = path.join(require('node:os').tmpdir(), 'mt-contact.html');
  fs.writeFileSync(tmp, html);
  await win.loadFile(tmp);
  await new Promise((r) => setTimeout(r, 400));
  fs.writeFileSync(path.join(__dirname, 'iconset-contact-sheet.png'), (await win.webContents.capturePage()).toPNG());
  fs.rmSync(tmp);
  app.quit();
});
