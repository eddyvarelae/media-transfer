// VR-1 UI-pass driver: Scan + Start on rig images only, samples the progress section every 50 ms,
// optional cancel when window.__CANCEL = { file, afterFolderBytes } is set.
(async () => {
  const WANT = window.__DEST, CANCEL = window.__CANCEL || null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const dsel = document.querySelectorAll('.drive select')[1];
  if (dsel.value !== WANT) { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(dsel, WANT); dsel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(400); }
  const sels = [...document.querySelectorAll('.drive select')].map((s) => s.value);
  if (sels[0] !== 'TestCard' || sels[1] !== WANT || !/^TestDest\d*$/.test(WANT)) return { abort: 'wrong drives', sels };
  const btn = (t) => [...document.querySelectorAll('.actions button')].find((b) => b.textContent.startsWith(t));
  btn('Scan origin').click();
  for (let i = 0; i < 100 && !btn('Start transfer') && !btn('Nothing'); i++) await sleep(100);
  const planEl = [...document.querySelectorAll('h2')].find((h) => h.textContent.toUpperCase() === 'PLAN')?.closest('section');
  const planText = planEl?.innerText;
  if (!btn('Start transfer')) return { nothingToCopy: true, planText };
  let lastP = null; const offP = window.api.onProgress((p) => (lastP = p));
  const timeline = []; let prev = '';
  const t0 = performance.now(); let cancelAt = null, doneAt = null;
  const h2seen = []; const mo = new MutationObserver(() => { const h = document.querySelector('.progress-section h2')?.textContent; if (h && h !== h2seen[h2seen.length - 1]?.h2) h2seen.push({ t: Math.round(performance.now() - t0), h2: h, conveyor: !!document.querySelector('.conveyor'), cur: document.querySelector('.current-file')?.innerText }); });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  btn('Start transfer').click();
  for (let i = 0; i < 6000; i++) {
    const sec = document.querySelector('.progress-section');
    const s = {
      h2: sec?.querySelector('h2')?.textContent,
      conveyor: !!sec?.querySelector('.conveyor'),
      copyPct: sec?.querySelector('.progress-stats span')?.textContent,
      readBack: [...(sec?.querySelectorAll('.progress-stats span') || [])].find((x) => x.textContent.startsWith('Read back'))?.textContent,
      cur: sec?.querySelector('.current-file')?.innerText,
      cancelBtn: !!btn('Cancel'),
    };
    const key = `${s.h2}|${s.conveyor}|${s.cur?.replace(/\d+\/\d+$/, '')}`;
    if (key !== prev) { timeline.push({ t: Math.round(performance.now() - t0), ...s }); prev = key; }
    if (CANCEL && !cancelAt && lastP && lastP.currentFile.endsWith(CANCEL.file) && lastP.bytesCopiedFolder >= CANCEL.afterFolderBytes) {
      cancelAt = Math.round(performance.now() - t0); btn('Cancel').click();
      timeline.push({ t: cancelAt, event: 'Cancel clicked', currentFile: lastP.currentFile, bytesCopiedFolder: lastP.bytesCopiedFolder });
    }
    if (document.querySelector('.verify') || (cancelAt && !btn('Cancel'))) { doneAt = Math.round(performance.now() - t0); break; }
    await sleep(50);
  }
  await sleep(300);
  offP(); mo.disconnect();
  return {
    h2seen,
    planText, cancelAt, doneAt, cancelToIdleMs: cancelAt ? doneAt - cancelAt : null,
    MBps: lastP ? +(lastP.bytesCopiedOverall / 1e6 / (lastP.elapsedMs / 1000)).toFixed(1) : null,
    timeline,
    rows: [...document.querySelectorAll('.verify tbody tr')].map((r) => r.innerText),
    failedList: [...document.querySelectorAll('.failed-files li')].map((l) => l.innerText),
    endText: document.querySelector('.progress-section')?.innerText,
    error: document.querySelector('.error')?.innerText,
  };
})()
