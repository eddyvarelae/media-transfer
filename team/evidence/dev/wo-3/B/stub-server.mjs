// Local stand-in for POST /v1/events (WO-3 B evidence): logs each body to a JSONL file, replies 202.
// Usage: node stub-server.mjs <out.jsonl> [port=8790]
import http from 'node:http';
import fs from 'node:fs';
const [out, port = '8790'] = process.argv.slice(2);
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    fs.appendFileSync(out, JSON.stringify({ receivedAt: new Date().toISOString(), method: req.method, url: req.url, body: JSON.parse(body || 'null') }) + '\n');
    res.writeHead(req.url === '/v1/events' && req.method === 'POST' ? 202 : 404).end();
  });
}).listen(+port, '127.0.0.1', () => console.log('stub on', port));
