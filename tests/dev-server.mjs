// Local test server: serves /public and runs the real Worker code against an in-memory SQLite stand-in for D1.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import worker from '../src/worker.js';
import { makeDB } from './d1-shim.mjs';

const root = path.resolve(new URL('../public', import.meta.url).pathname);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
export function start(port = 0) {
  const env = { DB: makeDB(), ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } };
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith('/api/')) {
        const chunks = []; for await (const c of req) chunks.push(c);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const r = await worker.fetch(new Request('http://localhost' + req.url, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }), env);
        res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
      }
      let p = req.url.split('?')[0]; if (p === '/') p = '/index.html';
      const file = path.join(root, p);
      if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r({ server, port: server.address().port })));
}
if (process.argv[1] && process.argv[1].endsWith('dev-server.mjs')) start(8788).then(({ port }) => console.log('http://127.0.0.1:' + port));
