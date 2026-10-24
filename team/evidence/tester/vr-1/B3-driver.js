// Runs one Scan + Start transfer over CDP (node team/evidence/dev/wo-1/cdp.mjs eval "$(cat this)").
// Aborts unless origin is TestCard and the destination a TestDest* rig image.
(async () => {
  const WANT = window.__DEST;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && document.querySelectorAll('.drive select').length < 2; i++) await sleep(100);
  const dsel = document.querySelectorAll('.drive select')[1];
  if (WANT && dsel.value !== WANT) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(dsel, WANT); dsel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(400); }
  const sels = [...document.querySelectorAll('.drive select')].map((s) => s.value);
  if (WANT && sels[1] !== WANT) return { abort: 'could not select dest', sels };
  if (sels[0] !== 'TestCard' || !/^TestDest\d*$/.test(sels[1] || '')) return { abort: 'wrong drives', sels };
  const btn = (t) => [...document.querySelectorAll('.actions button')].find((b) => b.textContent.startsWith(t));
  btn('Scan origin').click();
  for (let i = 0; i < 100 && !btn('Start transfer') && !btn('Nothing'); i++) await sleep(100);
  const destBase = document.querySelector('.plan code')?.textContent;
  if (!/^\/Volumes\/TestDest\d*\//.test(destBase || '')) return { abort: 'dest not a rig image', destBase };
  if (!btn('Start transfer')) return { nothingToCopy: true, destBase };
  const phases = new Set(); let last = null, lastV = null, tiles = 0, verifyPhaseSeenAt = null;
  const offP = window.api.onProgress((p) => (last = p));
  const offV = window.api.onVerify ? window.api.onVerify((v) => (lastV = v)) : () => {};
  const mo = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.classList?.contains('lane') && tiles++)));
  mo.observe(document.body, { childList: true, subtree: true });
  const t0 = performance.now();
  btn('Start transfer').click();
  for (let i = 0; i < 2400 && !document.querySelector('.verify'); i++) {
    phases.add(document.querySelector('.progress-section h2')?.textContent);
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
    phases: [...phases], planText: null, rows: [...document.querySelectorAll('.verify tbody tr')].map((r) => r.innerText),
    failedList: [...document.querySelectorAll('.failed-files li')].map((l) => l.innerText),
  };
})()
