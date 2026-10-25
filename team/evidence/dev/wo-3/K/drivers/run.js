// One Scan + Start over CDP; DevKCard -> DevKE<n> only. MODE (string replaced): run | cancel-at-C0002 | cancel-in-CLIP
(async () => {
  const MODE = '__MODE__';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && document.querySelectorAll('.drive select').length < 2; i++) await sleep(100);
  const sels = [...document.querySelectorAll('.drive select')].map((s) => s.value);
  if (sels[0] !== 'DevKCard' || !/^DevKE\d$/.test(sels[1])) return { abort: sels };
  const btn = (t) => [...document.querySelectorAll('.actions button')].find((b) => b.textContent.startsWith(t));
  btn('Scan origin').click();
  for (let i = 0; i < 100 && !btn('Start transfer') && !btn('Nothing'); i++) await sleep(100);
  if (!btn('Start transfer')) return { nothingToCopy: true, button: btn('Nothing')?.textContent };
  let fired = false;
  const off = window.api.onProgress((p) => {
    if (fired) return;
    if ((MODE === 'cancel-at-C0002' && p.currentFile === 'C0002.MP4') || (MODE === 'cancel-in-CLIP' && p.folderLabel === 'CLIP')) { fired = true; btn('Cancel').click(); }
  });
  const done = new Promise((r) => window.api.onDone(r));
  btn('Start transfer').click();
  const report = await done; off(); await sleep(300);
  document.querySelector('.verify')?.scrollIntoView();
  return { heading: document.querySelector('.progress-section h2')?.textContent, rows: [...document.querySelectorAll('.verify tbody tr')].map((r) => r.innerText), failed: [...document.querySelectorAll('.failed-files li')].map((l) => l.innerText), note: document.querySelector('.cleanup-note')?.textContent ?? null, report };
})()
