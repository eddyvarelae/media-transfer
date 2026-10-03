// Serves one file with HTTP Range support, throttled to RATE bytes/s (test rig only).
import http from 'node:http'; import fs from 'node:fs';
const [file, port = '8765', mbps = '120'] = process.argv.slice(2);
const RATE = Number(mbps) * 1e6; const size = fs.statSync(file).size;
let next = 0; // pacing clock shared by all requests (no idle credit)
http.createServer(async (req, res) => {
  let start = 0, end = size - 1; const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || '');
  if (m) { start = +m[1]; if (m[2]) end = +m[2]; }
  const headers = { 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, 'Content-Type': 'application/octet-stream' };
  if (req.method === 'HEAD') { res.writeHead(200, { ...headers, 'Content-Length': size }); return res.end(); }
  if (m) { res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}` }); } else res.writeHead(200, headers);
  const fd = fs.openSync(file, 'r'); let pos = start;
  while (pos <= end) {
    const n = Math.min(256 * 1024, end - pos + 1); const buf = Buffer.alloc(n); fs.readSync(fd, buf, 0, n, pos); pos += n;
    next = Math.max(next, Date.now()) + (n / RATE) * 1000; const due = next - Date.now(); if (due > 1) await new Promise((r) => setTimeout(r, due));
    if (!res.write(buf)) await new Promise((r) => res.once('drain', r));
  }
  fs.closeSync(fd); res.end();
}).listen(+port, '127.0.0.1', () => console.log('serving', file, size, 'at', mbps, 'MB/s'));
