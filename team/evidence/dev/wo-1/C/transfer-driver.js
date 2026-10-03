(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sels = [...document.querySelectorAll('.drive select')].map((s) => s.value);
  if (sels[0] !== 'TestCard' || sels[1] !== 'TestDest') return { abort: 'wrong drives', sels };
  const btn = (t) => [...document.querySelectorAll('.actions button')].find((b) => b.textContent.startsWith(t));
  btn('Scan origin').click();
  for (let i = 0; i < 100 && !btn('Start transfer'); i++) await sleep(100);
  const destBase = document.querySelector('.plan code')?.textContent;
  if (!destBase?.startsWith('/Volumes/TestDest/')) return { abort: 'dest not TestDest', destBase };
  let last = null, tiles = 0;
  const offP = window.api.onProgress((p) => (last = p));
  const mo = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.classList?.contains('lane') && tiles++)));
  mo.observe(document.body, { childList: true, subtree: true });
  const t0 = performance.now();
  btn('Start transfer').click();
  for (let i = 0; i < 1200 && !document.querySelector('.verify'); i++) await sleep(50);
  const wall = performance.now() - t0;
  offP(); mo.disconnect();
  const ok = [...document.querySelectorAll('.verify td.ok')].length;
  return { thumbs: localStorage.getItem('mt.thumbs') !== 'off', destBase, bytes: last.totalBytesOverall, elapsedMs: last.elapsedMs, MBps: +(last.totalBytesOverall / 1e6 / (last.elapsedMs / 1000)).toFixed(1), wallMs: Math.round(wall), tiles, verifyOk: ok };
})()
