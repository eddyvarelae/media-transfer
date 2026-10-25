// VR-3 check 4: edit TsCard2's profile so its folders are [CLIP, DCIM] (remove DCIM, re-add it, flatten it).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const osel = document.querySelectorAll('.drive select')[0];
  if (osel.value !== 'TsCard2') { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(osel, 'TsCard2'); osel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(400); }
  [...document.querySelectorAll('.drive')][0].querySelector('button.link, a, button')
  const edit = [...document.querySelectorAll('.drive')][0].querySelectorAll('*');
  [...edit].find((e) => e.textContent === 'Edit profile' && e.children.length === 0).click(); await sleep(600);
  const ed = document.querySelector('.profile-editor');
  if (!ed.querySelector('code').textContent.endsWith('/TsCard2')) return { abort: 'editor for wrong volume' };
  const rowSel = (f) => [...ed.querySelectorAll('.selected-row')].find((r) => r.querySelector('code').textContent === f);
  [...rowSel('DCIM').querySelectorAll('button')].find((b) => b.textContent === 'remove').click(); await sleep(300);
  const tree = [...ed.querySelectorAll('.tree-row')].find((r) => r.querySelector('.tree-name').textContent.endsWith(' DCIM'));
  tree.querySelector('input').click(); await sleep(300);
  rowSel('DCIM').querySelector('input').click(); await sleep(200);
  const picked = [...ed.querySelectorAll('.selected-row')].map((r) => r.querySelector('code').textContent + (r.querySelector('input').checked ? ' (flatten)' : ''));
  [...ed.querySelectorAll('button')].find((b) => b.textContent === 'Save profile').click(); await sleep(600);
  return { picked };
})()
