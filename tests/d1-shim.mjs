// A tiny stand-in for Cloudflare D1 (uses Node's built-in SQLite) so the Worker can be tested without any network.
import { DatabaseSync } from 'node:sqlite';
export function makeDB() {
  const db = new DatabaseSync(':memory:');
  class Stmt {
    constructor(sql) { this.sql = sql; this.args = []; }
    bind(...a) { this.args = a; return this; }
    async first() { return db.prepare(this.sql).get(...this.args) ?? null; }
    async all() { return { results: db.prepare(this.sql).all(...this.args) }; }
    async run() { const r = db.prepare(this.sql).run(...this.args); return { success: true, meta: { changes: Number(r.changes) } }; }
  }
  return { prepare: (sql) => new Stmt(sql), async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; }, _raw: db };
}
