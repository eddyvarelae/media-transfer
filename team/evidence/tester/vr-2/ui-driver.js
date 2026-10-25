// VR-2 transfer driver: picks window.__ORIGIN / window.__DEST (Ts* rig volumes only), Scan + Start, samples the
// progress section, records copy + verify progress events. window.__CANCEL:
//   { file, afterFolderBytes }        cancel once that file has copied that many folder bytes
//   { inflight: true, minBytes }      cancel while one file is still being read back and the next is copying
(async () => {
  const ORIGIN = window.__ORIGIN, WANT = window.__DEST, CANCEL = window.__CANCEL || null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!/^TsCard2?$/.test(ORIGIN) || !/^TsDest\d*$/.test(WANT)) return { abort: 'not Tester rig volumes' };
  const setSel = async (el, v) => { if (el.value !== v) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('change', { bubbles: true })); await sleep(400); } };
  for (let i = 0; i < 50 && document.querySelectorAll('.drive select').length < 2; i++) await sleep(100);
  await setSel(document.querySelectorAll('.drive select')[0], ORIGIN);
  await setSel(document.querySelectorAll('.drive select')[1], WANT);
  const sels = [...document.querySelectorAll('.drive select')].map((s) => s.value);
  if (sels[0] !== ORIGIN || sels[1] !== WANT) return { abort: 'could not select drives', sels };
  const btn = (t) => [...document.querySelectorAll('.actions button')].find((b) => b.textContent.startsWith(t));
  btn('Scan origin').click();
  const want = `/Volumes/${WANT}/${ORIGIN}`;
  const fresh = () => (document.querySelector('.plan code')?.textContent || '').startsWith(want) && (btn('Start transfer') || btn('Nothing'));
  for (let i = 0; i < 100 && !fresh(); i++) await sleep(100);
  if (!fresh()) return { abort: 'plan did not refresh for ' + want };
  const planText = [...document.querySelectorAll('h2')].find((h) => h.textContent.toUpperCase() === 'PLAN')?.closest('section')?.innerText;
  if (!/^\/Volumes\/TsDest\d*\//.test(document.querySelector('.plan code')?.textContent || '')) return { abort: 'plan destination not a rig image', planText };
  if (!btn('Start transfer')) return { nothingToCopy: true, planText };
  if (window.__PLANONLY) return { planOnly: true, planText };
  let lastP = null, lastV = null; const files = new Set(); const startAt = {}; let curStart = null;
  const offP = window.api.onProgress((p) => { lastP = p; files.add(p.currentFile); });
  const offV = window.api.onVerify ? window.api.onVerify((v) => (lastV = v)) : () => {}; // v2.0 has no onVerify
  const offF = window.api.onFileStart((f) => { curStart = { name: f.name, at: lastP?.bytesCopiedOverall ?? 0 }; startAt[f.name] = curStart.at; });
  const t0 = performance.now(); const h2seen = [];
  const mo = new MutationObserver(() => { const h = document.querySelector('.progress-section h2')?.textContent; if (h && h !== h2seen[h2seen.length - 1]?.h2) h2seen.push({ t: Math.round(performance.now() - t0), h2: h, conveyor: !!document.querySelector('.conveyor') }); });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  let cancel = null, doneAt = null;
  btn('Start transfer').click();
  for (let i = 0; i < 12000; i++) {
    if (CANCEL && !cancel && lastP) {
      // in flight: the file now copying started after another one, and the read-back has not yet covered the bytes before it
      const hit = CANCEL.inflight
        ? !!(curStart && lastV && curStart.at > 0 && lastP.currentFile === curStart.name && lastV.currentFile !== curStart.name && lastV.bytesVerifiedOverall < curStart.at && lastP.bytesCopiedOverall - curStart.at >= (CANCEL.minBytes || 0))
        : lastP.currentFile.endsWith(CANCEL.file) && lastP.bytesCopiedFolder >= CANCEL.afterFolderBytes;
      if (hit) { cancel = { t: Math.round(performance.now() - t0), copying: { ...lastP }, verifying: lastV && { ...lastV }, curStart: { ...curStart }, readBackShortBy: curStart.at - (lastV?.bytesVerifiedOverall ?? 0) }; btn('Cancel').click(); }
    }
    if (document.querySelector('.verify') || (cancel && !btn('Cancel'))) { doneAt = Math.round(performance.now() - t0); break; }
    await sleep(CANCEL ? 5 : 25);
  }
  await sleep(300); offP(); offV(); offF(); mo.disconnect();
  return {
    planText, cancel, doneAt, cancelToIdleMs: cancel ? doneAt - cancel.t : null, h2seen,
    MBps: lastP ? +(lastP.bytesCopiedOverall / 1e6 / (lastP.elapsedMs / 1000)).toFixed(1) : null,
    wallMs: doneAt, bytes: lastP?.totalBytesOverall, verifiedBytes: lastV?.bytesVerifiedOverall,
    rows: [...document.querySelectorAll('.verify tbody tr')].map((r) => r.innerText),
    failedList: [...document.querySelectorAll('.failed-files li')].map((l) => l.innerText),
    endText: document.querySelector('.progress-section')?.innerText,
  };
})()
