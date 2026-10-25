// Scan + Start over CDP and return at once (the transfer keeps running). DevRCard -> DevRD<n> only.
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && document.querySelectorAll('.drive select').length < 2; i++) await sleep(100);
  const sels = [...document.querySelectorAll('.drive select')].map((s) => s.value);
  if (sels[0] !== 'DevRCard' || !/^DevRD\d+$/.test(sels[1])) return { abort: sels };
  const btn = (t) => [...document.querySelectorAll('.actions button')].find((b) => b.textContent.startsWith(t));
  btn('Scan origin').click();
  for (let i = 0; i < 100 && !btn('Start transfer'); i++) await sleep(100);
  btn('Start transfer').click();
  return { started: true };
})()
