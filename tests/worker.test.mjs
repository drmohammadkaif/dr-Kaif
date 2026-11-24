import test from 'node:test';
import assert from 'node:assert/strict';
let n = 0;
// A fresh copy of the Worker per test, like a fresh Cloudflare isolate (tables are created once per isolate).
const load = async () => (await import('../src/worker.js?t=' + n++)).default;
import { makeDB } from './d1-shim.mjs';

const env = async () => ({ worker: await load(), DB: makeDB(), ASSETS: { fetch: async () => new Response('asset') } });
const tok = (c) => c.repeat(64).slice(0, 64);
const call = (e, path, opt = {}, token = tok('a')) =>
  e.worker.fetch(new Request('http://x' + path, { ...opt, headers: { authorization: 'Bearer ' + token, ...(opt.headers || {}) } }), e);

test('health works without auth and static files fall through', async () => {
  const e = await env();
  assert.equal((await e.worker.fetch(new Request('http://x/api/health'), e)).status, 200);
  assert.equal(await (await e.worker.fetch(new Request('http://x/index.html'), e)).text(), 'asset');
});
test('rejects missing or malformed tokens', async () => {
  const e = await env();
  assert.equal((await e.worker.fetch(new Request('http://x/api/data'), e)).status, 401);
  assert.equal((await call(e, '/api/data', {}, 'short')).status, 401);
});
test('document: empty, create, update, conflict', async () => {
  const e = await env();
  assert.equal((await call(e, '/api/data')).status, 404);
  let r = await call(e, '/api/data', { method: 'PUT', body: JSON.stringify({ base: 0, blob: 'v1.1.x.y' }) });
  assert.deepEqual(await r.json(), { ver: 1 });
  r = await call(e, '/api/data', { method: 'PUT', body: JSON.stringify({ base: 1, blob: 'second' }) });
  assert.deepEqual(await r.json(), { ver: 2 });
  r = await call(e, '/api/data', { method: 'PUT', body: JSON.stringify({ base: 1, blob: 'stale' }) });
  assert.equal(r.status, 409); assert.equal((await r.json()).ver, 2);
  r = await call(e, '/api/data', { method: 'PUT', body: JSON.stringify({ base: 0, blob: 'again' }) });
  assert.equal(r.status, 409);
  const got = await (await call(e, '/api/data')).json();
  assert.equal(got.blob, 'second'); assert.equal(got.ver, 2);
});
test('users are isolated from each other', async () => {
  const e = await env();
  await call(e, '/api/data', { method: 'PUT', body: JSON.stringify({ base: 0, blob: 'mine' }) }, tok('a'));
  assert.equal((await call(e, '/api/data', {}, tok('b'))).status, 404);
});
test('media: chunked upload, list, download, replace, delete', async () => {
  const e = await env();
  const big = 'Z'.repeat(2_300_000);
  let r = await call(e, '/api/media/abc123xyz', { method: 'PUT', body: big });
  assert.deepEqual(await r.json(), { ok: true, parts: 3 });
  const list = await (await call(e, '/api/media')).json();
  assert.equal(list.items.length, 1); assert.equal(list.items[0].id, 'abc123xyz'); assert.equal(list.items[0].size, big.length);
  assert.equal((await (await call(e, '/api/media/abc123xyz')).text()).length, big.length);
  await call(e, '/api/media/abc123xyz', { method: 'PUT', body: 'small' });
  assert.equal(await (await call(e, '/api/media/abc123xyz')).text(), 'small');
  assert.equal((await call(e, '/api/media/BAD!', { method: 'PUT', body: 'x' })).status, 400);
  assert.equal((await call(e, '/api/media/abc123xyz', { method: 'DELETE' })).status, 200);
  assert.equal((await call(e, '/api/media/abc123xyz')).status, 404);
});
test('too large documents are refused; delete-all wipes everything', async () => {
  const e = await env();
  assert.equal((await call(e, '/api/data', { method: 'PUT', body: JSON.stringify({ base: 0, blob: 'x'.repeat(1_950_000) }) })).status, 413);
  await call(e, '/api/data', { method: 'PUT', body: JSON.stringify({ base: 0, blob: 'ok' }) });
  await call(e, '/api/media/m1m1m1m1', { method: 'PUT', body: 'data' });
  assert.equal((await call(e, '/api/all', { method: 'DELETE' })).status, 200);
  assert.equal((await call(e, '/api/data')).status, 404);
  assert.deepEqual(await (await call(e, '/api/media')).json(), { items: [] });
});
