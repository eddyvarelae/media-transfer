// VR-6 telemetry stub: accepts POST /v1/events on 127.0.0.1:<port>, answers 202, appends every request
// (time, method, path, body) as one JSON line to <out>. Usage: node stub.mjs <port> <out.jsonl>
import http from 'node:http'; import fs from 'node:fs';
const [port = '8799', out = 'stub.jsonl'] = process.argv.slice(2);
http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c));
  req.on('end', () => {
    fs.appendFileSync(out, JSON.stringify({ at: new Date().toISOString(), method: req.method, path: req.url, body }) + '\n');
    res.writeHead(req.method === 'POST' ? 202 : 404, { 'Content-Type': 'application/json' }); res.end('{}');
  });
}).listen(+port, '127.0.0.1', () => console.log('stub on', port, '->', out));
