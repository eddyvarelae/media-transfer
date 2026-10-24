import { Worker } from 'node:worker_threads';

/**
 * The read-back hash runs in one worker thread, so reading and hashing the destination copy never
 * delays the main thread's next card read (the copy of the following file runs meanwhile). The
 * worker is inline source, so nothing extra is packaged.
 */
const WORKER_SRC = `
const { parentPort } = require('worker_threads');
const crypto = require('crypto');
const fs = require('fs');
const aborted = new Set();
parentPort.on('message', (m) => {
  if (m.op === 'abort') aborted.add(m.id);
  else if (m.op === 'file') {
    const h = crypto.createHash('sha256');
    const rs = fs.createReadStream(m.path, { highWaterMark: 1024 * 1024 });
    rs.on('data', (chunk) => {
      if (aborted.has(m.id)) {
        aborted.delete(m.id);
        rs.destroy();
        parentPort.postMessage({ id: m.id, digest: null });
        return;
      }
      h.update(chunk);
      parentPort.postMessage({ id: m.id, bytes: chunk.length });
    });
    rs.on('error', (e) => parentPort.postMessage({ id: m.id, error: String(e && e.message || e) }));
    rs.on('end', () => parentPort.postMessage({ id: m.id, digest: h.digest('hex') }));
  }
});
`;

type Reply = { id: number; digest?: string | null; bytes?: number; error?: string };
type Job = { resolve: (d: string | null) => void; reject: (e: Error) => void; onBytes?: (n: number) => void };

let worker: Worker | null = null;
let nextId = 1;
const jobs = new Map<number, Job>();

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(WORKER_SRC, { eval: true });
  w.on('message', (r: Reply) => {
    const job = jobs.get(r.id);
    if (!job) return;
    if (r.bytes !== undefined) return job.onBytes?.(r.bytes);
    jobs.delete(r.id);
    if (jobs.size === 0) w.unref(); // an idle worker never keeps the process alive
    if (r.error !== undefined) job.reject(new Error(r.error));
    else job.resolve(r.digest ?? null);
  });
  const fail = (e: Error) => {
    worker = null;
    for (const job of jobs.values()) job.reject(e);
    jobs.clear();
  };
  w.on('error', fail);
  w.on('exit', (code) => fail(new Error(`hash worker exited (${code})`)));
  worker = w;
  return w;
}

function job(onBytes?: (n: number) => void): { id: number; done: Promise<string | null> } {
  getWorker().ref();
  const id = nextId++;
  const done = new Promise<string | null>((resolve, reject) =>
    jobs.set(id, { resolve, reject, onBytes }),
  );
  return { id, done };
}

/** SHA-256 of a file read back from disk inside the worker. Resolves null on cancel. */
export function hashFileOffThread(
  p: string,
  onChunk: (bytes: number) => void,
  shouldCancel: () => boolean,
): Promise<string | null> {
  const w = getWorker();
  let abortSent = false;
  const { id, done } = job((n) => {
    if (shouldCancel()) {
      if (!abortSent) w.postMessage({ op: 'abort', id });
      abortSent = true;
      return;
    }
    onChunk(n);
  });
  w.postMessage({ op: 'file', id, path: p });
  return done;
}
