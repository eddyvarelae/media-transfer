// usage: node cdp.mjs eval "<js>" | shot <out.png> | cast <outdir> <seconds>
import fs from 'node:fs';
const port = process.env.CDP_PORT || 9229;
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const waiters = new Map(); const handlers = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiters.has(d.id)) { waiters.get(d.id)(d); waiters.delete(d.id); } else handlers.forEach((h) => h(d)); };
await new Promise((r) => (ws.onopen = r));
const send = (method, params = {}) => new Promise((r) => { const i = ++id; waiters.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'eval') {
  const r = await send('Runtime.evaluate', { expression: a, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(r.result?.result?.value ?? r.result, null, 1));
} else if (cmd === 'shot') {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(a, Buffer.from(r.result.data, 'base64')); console.log('wrote', a);
} else if (cmd === 'cast') {
  fs.mkdirSync(a, { recursive: true }); let n = 0; const t0 = Date.now();
  handlers.push(async (d) => { if (d.method === 'Page.screencastFrame') { const ts = Date.now() - t0; fs.writeFileSync(`${a}/f${String(n++).padStart(5, '0')}_${ts}.jpg`, Buffer.from(d.params.data, 'base64')); send('Page.screencastFrameAck', { sessionId: d.params.sessionId }); } });
  await send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1 });
  await new Promise((r) => setTimeout(r, Number(b) * 1000));
  await send('Page.stopScreencast'); console.log('frames', n);
}
ws.close();
