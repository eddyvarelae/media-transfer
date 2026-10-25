// WO-3 K3 probe cases on a rig volume: node probe-cases.js <volume> ; env LEDGER, MT_TEST_PROBE_FAIL
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { setLedgerFile, noClobberProbe, noClobberFlush } from '../../../../../electron/noclobber';
setLedgerFile(process.env.LEDGER!);
const ls = (d: string) => fs.readdirSync(d).filter((f) => f.startsWith('probe-')).map((f) => `${f} ino=${fs.statSync(`${d}/${f}`).ino} ${fs.readFileSync(`${d}/${f}`, 'utf8').slice(0, 30)}`);
(async () => {
  const vol = process.argv[2];
  for (const [label, names] of [['pre-existing file at the .mtpart probe name', ['mtpart']], ['pre-existing file at the published probe name', ['probe']], ['pre-existing files at both probe names', ['mtpart', 'probe']], ['no pre-existing file', []]] as const) {
    const root = `/Volumes/${vol}/k3-${names.join('-') || 'none'}`;
    const dir = `${root}/.media-transfer`;
    await fsp.mkdir(dir, { recursive: true });
    for (const n of names) await fsp.writeFile(`${dir}/probe-RUNID.${n}`, `user file at .${n}`);
    const r = await noClobberProbe(root, 'RUNID');
    await noClobberFlush(); // as executePlan does at the end of a run (deferred ledger writes)
    console.log(`== ${vol}: ${label}${process.env.MT_TEST_PROBE_FAIL ? ` (MT_TEST_PROBE_FAIL=${process.env.MT_TEST_PROBE_FAIL})` : ''}`);
    console.log('  profile', JSON.stringify(r.profile), 'left', r.left);
    r.observations.filter((o) => /failed|left|profile/.test(o)).forEach((o) => console.log('  ' + o));
    console.log('  files after:', JSON.stringify(ls(dir)));
    console.log('  ledger entries:', JSON.parse(fs.readFileSync(process.env.LEDGER!, 'utf8')).temps.length);
  }
})();
