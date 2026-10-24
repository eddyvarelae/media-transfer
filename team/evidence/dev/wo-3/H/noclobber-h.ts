// Unit checks of electron/noclobber.ts on the H rig (DevHDest = APFS, DevHDestX = exFAT).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { setLedgerFile, noClobberTempStream, noClobberRename, noClobberCleanup, noClobberOwns, ClobberError, ForeignTempError } from '../../../../../electron/noclobber';
const LEDGER = process.env.LEDGER!;
setLedgerFile(LEDGER);
const write = (ws: fs.WriteStream, s: string) => new Promise<void>((r) => ws.end(s, () => ws.on('close', () => r())));
const code = async (f: () => Promise<unknown>) => { try { await f(); return 'ok'; } catch (e: any) { return e instanceof ClobberError ? 'ClobberError' : e instanceof ForeignTempError ? 'ForeignTempError' : e.code ?? e.message; } };
(async () => {
  for (const vol of ['DevHDest', 'DevHDestX']) {
    const d = `/Volumes/${vol}/nc-h`;
    await fsp.mkdir(d, { recursive: true });
    let linkSupport = 'link ok';
    await fsp.writeFile(`${d}/probe-src`, 'x');
    try { await fsp.link(`${d}/probe-src`, `${d}/probe-dst`); await fsp.unlink(`${d}/probe-dst`); } catch (e: any) { linkSupport = e.code; }
    await fsp.unlink(`${d}/probe-src`);
    // 1. place onto a free name
    await write(await noClobberTempStream(`${d}/a.JPG.mtpart`, d, 'run1'), 'AAA');
    const free = await code(() => noClobberRename(`${d}/a.JPG.mtpart`, `${d}/a.JPG`, d, 'run1'));
    // 2. place onto an existing file -> refused, existing untouched, temp still ours
    await fsp.writeFile(`${d}/keep.JPG`, 'keep me');
    await write(await noClobberTempStream(`${d}/keep.JPG.mtpart`, d, 'run1'), 'NEW');
    const onto = await code(() => noClobberRename(`${d}/keep.JPG.mtpart`, `${d}/keep.JPG`, d, 'run1'));
    // 3. placeholder reservation left by a "crash" of another run: empty -> removed by cleanup; non-empty -> kept
    const ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
    await fsp.writeFile(`${d}/crashed-empty.JPG`, '');
    await fsp.writeFile(`${d}/crashed-filled.JPG`, 'renamed before the crash');
    ledger.temps.push({ path: `${d}/crashed-empty.JPG`, destRoot: d, runId: 'run0', createdAt: 'x' }, { path: `${d}/crashed-filled.JPG`, destRoot: d, runId: 'run0', createdAt: 'x' });
    fs.writeFileSync(LEDGER, JSON.stringify(ledger)); setLedgerFile(LEDGER);
    await noClobberCleanup(d, 'run2');
    console.log(vol, {
      hardLinks: linkSupport,
      placeOnFreeName: free, placedContent: fs.readFileSync(`${d}/a.JPG`, 'utf8'), tempGone: !fs.existsSync(`${d}/a.JPG.mtpart`),
      placeOntoExisting: onto, existingContent: fs.readFileSync(`${d}/keep.JPG`, 'utf8'),
      cleanupOfRun1Temp: !fs.existsSync(`${d}/keep.JPG.mtpart`) ? 'own leftover removed' : 'still there',
      crashedEmptyPlaceholder: fs.existsSync(`${d}/crashed-empty.JPG`) ? 'kept' : 'removed',
      crashedFilledPlaceholder: fs.existsSync(`${d}/crashed-filled.JPG`) ? 'kept: ' + fs.readFileSync(`${d}/crashed-filled.JPG`, 'utf8') : 'removed',
      ledgerEntriesLeft: JSON.parse(fs.readFileSync(LEDGER, 'utf8')).temps.length,
    });
  }
})();
