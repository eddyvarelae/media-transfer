// Runs one Scan + Start transfer over CDP (node team/evidence/dev/wo-1/cdp.mjs eval "$(cat this)").
// Aborts unless origin is DevBCard and the destination DevBDest (WO-3 J rig).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && document.querySelectorAll('.drive select').length < 2; i++) await sleep(100);
  const sels = [...document.querySelectorAll('.drive select')].map((s) => s.value);
  if (sels[0] !== 'DevBCard' || sels[1] !== 'DevBDest') return { abort: 'wrong drives', sels };
  const btn = (t) => [...document.querySelectorAll('.actions button')].find((b) => b.textContent.startsWith(t));
  btn('Scan origin').click();
  for (let i = 0; i < 100 && !btn('Start transfer') && !btn('Nothing'); i++) await sleep(100);
  const destBase = document.querySelector('.plan code')?.textContent;
  if (!/^\/Volumes\/DevBDest\//.test(destBase || '')) return { abort: 'dest not a rig image', destBase };
  if (!btn('Start transfer')) return { nothingToCopy: true, destBase };
  let last = null, lastV = null, tiles = 0, verifyPhaseSeenAt = null;
  const offP = window.api.onProgress((p) => (last = p));
  const offV = window.api.onVerify ? window.api.onVerify((v) => (lastV = v)) : () => {};
  const mo = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.classList?.contains('lane') && tiles++)));
  mo.observe(document.body, { childList: true, subtree: true });
  const t0 = performance.now();
  btn('Start transfer').click();
  for (let i = 0; i < 2400 && !document.querySelector('.verify'); i++) {
    if (!verifyPhaseSeenAt && document.querySelector('.progress-section h2')?.textContent === 'Verifying') verifyPhaseSeenAt = Math.round(performance.now() - t0);
    await sleep(25);
  }
  const wall = performance.now() - t0;
  offP(); offV(); mo.disconnect();
  return {
    thumbs: localStorage.getItem('mt.thumbs') !== 'off', destBase,
    bytes: last.totalBytesOverall, elapsedMs: last.elapsedMs,
    MBps: +(last.totalBytesOverall / 1e6 / (last.elapsedMs / 1000)).toFixed(1),
    wallMs: Math.round(wall), verifiedBytes: lastV?.bytesVerifiedOverall, verifyPhaseSeenAt, tiles,
    rows: [...document.querySelectorAll('.verify tbody tr')].map((r) => r.innerText),
    failedList: [...document.querySelectorAll('.failed-files li')].map((l) => l.innerText),
  };
})()
