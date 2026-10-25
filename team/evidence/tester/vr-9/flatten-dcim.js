// VR-4: turn "flatten subfolders" on for DCIM in TsCard2's profile (VR-3's reorder left it off).
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const osel = document.querySelectorAll('.drive select')[0];
  if (osel.value !== 'TsCard2') { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(osel, 'TsCard2'); osel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(400); }
  [...document.querySelectorAll('.drive')[0].querySelectorAll('*')].find((e) => e.textContent === 'Edit profile' && e.children.length === 0).click(); await sleep(600);
  const ed = document.querySelector('.profile-editor');
  if (!ed.querySelector('code').textContent.endsWith('/TsCard2')) return { abort: 'editor for wrong volume' };
  const box = [...ed.querySelectorAll('.selected-row')].find((r) => r.querySelector('code').textContent === 'DCIM').querySelector('input');
  if (!box.checked) box.click(); await sleep(300);
  [...ed.querySelectorAll('button')].find((b) => b.textContent === 'Save profile').click(); await sleep(600);
  return 'saved';
})()
