// Telemetry stub for M.2: logs each body, replies 202, holds the FIRST response for 3 s (under the client's 5 s timeout).
import http from 'node:http'; import fs from 'node:fs';
const [out, port = '8791'] = process.argv.slice(2); let n = 0;
http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    const i = ++n; const b = JSON.parse(body || 'null');
    fs.appendFileSync(out, JSON.stringify({ i, receivedAt: new Date().toISOString(), installId: b?.installId, events: b?.events?.length }) + '\n');
    setTimeout(() => res.writeHead(202).end(), i === 1 ? 3000 : 0);
  });
}).listen(+port, '127.0.0.1');
