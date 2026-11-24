// Dr. Kaif - Cloudflare Worker
// Serves the app (static files in /public) and a tiny encrypted-sync API backed by D1.
// The database tables are created automatically on the first request. Nothing to set up by hand.
//
// Privacy: the app encrypts your data on your device (AES-GCM) before uploading. This server only
// ever stores encrypted text and a hash of your secret, so it cannot read your data.

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
const text = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

const MAX_DOC = 1_900_000;         // characters per document (a D1 row is limited to about 2 MB)
const CHUNK = 900_000;             // characters per media chunk
const MAX_MEDIA_CHARS = 8_000_000; // about 6 MB original file after encryption and base64
const MAX_MEDIA_ITEMS = 400;
const MAX_USER_CHARS = 150_000_000;

let ready = null;
function init(env) {
  if (!ready) {
    ready = env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS docs (id TEXT PRIMARY KEY, ver INTEGER NOT NULL, blob TEXT NOT NULL, updated INTEGER NOT NULL)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS media (uid TEXT NOT NULL, mid TEXT NOT NULL, part INTEGER NOT NULL, total INTEGER NOT NULL, data TEXT NOT NULL, size INTEGER NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY (uid, mid, part))'),
    ]).catch((e) => { ready = null; throw e; });
  }
  return ready;
}

async function sha256Hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function authUser(request) {
  const h = request.headers.get('authorization') || '';
  const m = /^Bearer ([a-f0-9]{64})$/.exec(h);
  if (!m) return null;
  return sha256Hex(m[1]); // the secret itself is never stored, only its hash
}

const MID = /^[a-z0-9]{6,24}$/;

async function handleApi(request, env, url) {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  if (path === '/api/health') return json({ ok: true, time: Date.now(), app: 'dr-kaif' });

  await init(env);
  const uid = await authUser(request);
  if (!uid) return json({ error: 'unauthorized' }, 401);

  // ---- main document (encrypted app data) ----
  if (path === '/api/data') {
    if (method === 'GET') {
      const row = await env.DB.prepare('SELECT ver, blob, updated FROM docs WHERE id = ?').bind(uid).first();
      if (!row) return json({ error: 'none' }, 404);
      return json({ ver: row.ver, blob: row.blob, updated: row.updated });
    }
    if (method === 'PUT') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
      const base = Number.isInteger(body.base) ? body.base : -1;
      const blob = typeof body.blob === 'string' ? body.blob : '';
      if (!blob || base < 0) return json({ error: 'bad request' }, 400);
      if (blob.length > MAX_DOC) return json({ error: 'too large' }, 413);
      const now = Date.now();
      let changes = 0;
      if (base === 0) {
        const r = await env.DB.prepare('INSERT OR IGNORE INTO docs (id, ver, blob, updated) VALUES (?, 1, ?, ?)').bind(uid, blob, now).run();
        changes = r.meta && r.meta.changes ? r.meta.changes : 0;
        if (changes === 1) return json({ ver: 1 });
      } else {
        const r = await env.DB.prepare('UPDATE docs SET ver = ver + 1, blob = ?, updated = ? WHERE id = ? AND ver = ?').bind(blob, now, uid, base).run();
        changes = r.meta && r.meta.changes ? r.meta.changes : 0;
        if (changes === 1) return json({ ver: base + 1 });
      }
      const cur = await env.DB.prepare('SELECT ver FROM docs WHERE id = ?').bind(uid).first();
      return json({ error: 'conflict', ver: cur ? cur.ver : 0 }, 409);
    }
  }

  // ---- media (encrypted photos / PDFs) ----
  if (path === '/api/media' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT mid, COUNT(*) AS parts, MAX(total) AS total, SUM(size) AS size FROM media WHERE uid = ? GROUP BY mid').bind(uid).all();
    const items = (rows.results || []).filter((r) => r.parts === r.total).map((r) => ({ id: r.mid, size: r.size }));
    return json({ items });
  }
  const mm = /^\/api\/media\/([A-Za-z0-9!]+)$/.exec(path);
  if (mm) {
    const mid = mm[1];
    if (!MID.test(mid)) return json({ error: 'bad id' }, 400);
    if (method === 'GET') {
      const rows = await env.DB.prepare('SELECT part, total, data FROM media WHERE uid = ? AND mid = ? ORDER BY part').bind(uid, mid).all();
      const list = rows.results || [];
      if (!list.length || list.length !== list[0].total) return json({ error: 'none' }, 404);
      return text(list.map((r) => r.data).join(''));
    }
    if (method === 'PUT') {
      const body = await request.text();
      if (!body) return json({ error: 'empty' }, 400);
      if (body.length > MAX_MEDIA_CHARS) return json({ error: 'too large' }, 413);
      const usage = await env.DB.prepare('SELECT COUNT(DISTINCT mid) AS n, COALESCE(SUM(size),0) AS s FROM media WHERE uid = ? AND mid != ?').bind(uid, mid).first();
      if (usage && (usage.n >= MAX_MEDIA_ITEMS || usage.s + body.length > MAX_USER_CHARS)) return json({ error: 'quota' }, 413);
      const parts = [];
      for (let i = 0; i < body.length; i += CHUNK) parts.push(body.slice(i, i + CHUNK));
      const now = Date.now();
      const stmts = [env.DB.prepare('DELETE FROM media WHERE uid = ? AND mid = ?').bind(uid, mid)];
      parts.forEach((p, i) => stmts.push(env.DB.prepare('INSERT INTO media (uid, mid, part, total, data, size, updated) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(uid, mid, i, parts.length, p, p.length, now)));
      await env.DB.batch(stmts);
      return json({ ok: true, parts: parts.length });
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM media WHERE uid = ? AND mid = ?').bind(uid, mid).run();
      return json({ ok: true });
    }
  }

  // ---- delete everything for this user ----
  if (path === '/api/all' && method === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM docs WHERE id = ?').bind(uid),
      env.DB.prepare('DELETE FROM media WHERE uid = ?').bind(uid),
    ]);
    return json({ ok: true });
  }

  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        return json({ error: 'server error', detail: String((err && err.message) || err).slice(0, 200) }, 500);
      }
    }
    // Everything else is a static file (normally served directly by Cloudflare without running this code).
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
  },
};
