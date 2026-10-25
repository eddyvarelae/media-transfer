// VR-2: label one Ts* rig volume in the app. Called as (label)(VOL, ROLE, FOLDERS, FLATTEN).
(async (VOL, ROLE, FOLDERS = [], FLATTEN = []) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if (!/^(TsCard2?|TsDest(\d*|X))$/.test(VOL)) return { abort: 'not a Tester rig volume' };
  for (let i = 0; i < 50 && !document.querySelector('.unknown-card'); i++) await sleep(100);
  const card = [...document.querySelectorAll('.unknown-card')].find((c) => c.querySelector('strong')?.textContent === VOL);
  if (!card) return { abort: 'no new-drive card', VOL };
  card.querySelector('button.primary').click(); await sleep(500);
  const ed = document.querySelector('.profile-editor');
  if (!ed.querySelector('code').textContent.endsWith('/' + VOL)) return { abort: 'editor for wrong volume' };
  const sel = ed.querySelector('select');
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, ROLE);
  sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(300);
  const row = (n) => [...document.querySelectorAll('.profile-editor .tree-row')].find((r) => r.querySelector('.tree-name').textContent.endsWith(' ' + n));
  for (const f of FOLDERS) {
    const parts = f.split('/');
    for (const p of parts.slice(0, -1)) { const r = row(p); if (r.querySelector('.tree-caret').textContent === '▸') r.querySelector('.tree-caret').click(); await sleep(500); }
    row(parts[parts.length - 1]).querySelector('input').click(); await sleep(150);
  }
  for (const f of FLATTEN) [...document.querySelectorAll('.selected-row')].find((r) => r.querySelector('code').textContent === f).querySelector('input').click();
  await sleep(200);
  const picked = [...document.querySelectorAll('.selected-row')].map((r) => r.querySelector('code').textContent + (r.querySelector('input').checked ? ' (flatten)' : ''));
  [...ed.querySelectorAll('button')].find((b) => b.textContent === 'Save profile').click(); await sleep(600);
  return { VOL, ROLE, picked };
})
