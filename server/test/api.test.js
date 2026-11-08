import assert from 'node:assert/strict';
import test from 'node:test';
import { startHttpServer } from '../src/app.js';
import { VARIANT_IDS } from '../src/card.js';
import { createHealth } from '../src/health.js';
import { createSessions } from '../src/session.js';
import { scanHosts } from '../src/safety.js';
import { guardNetwork } from './netguard.js';

async function withServer(fn, opts) {
  const health = createHealth();
  const guard = guardNetwork();
  const server = await startHttpServer(0, '127.0.0.1', { health, sessions: createSessions(), ...opts });
  const base = `http://127.0.0.1:${server.port}`;
  const post = (path, body, init = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body), ...init });
  try { await fn({ base, post, get: (p) => fetch(base + p) }); } finally { health.stop(); await server.close(); guard.restore(); }
  assert.deepEqual(guard.attempts, [], 'the API made no outbound attempt');
}
const TASK = 'Please refund order 42';

test('GET /api/health is demo-health/1 and ready', () => withServer(async ({ get }) => {
  const r = await get('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const b = await r.json();
  assert.equal(b.schema, 'demo-health/1');
  assert.equal(b.state, 'ready');
  assert.equal(b.runtime, 'offline');
  assert.deepEqual(Object.keys(b.demo).sort(), ['id', 'name', 'version']);
}));

test('GET /api/catalog, /api/safety-scan and /api/victim-rules', () => withServer(async ({ get }) => {
  const cat = await (await get('/api/catalog')).json();
  assert.equal(cat.items.length, 11);
  const scan = await (await get('/api/safety-scan')).json();
  assert.deepEqual({ ok: scan.ok, offenders: scan.offenders }, { ok: true, offenders: [] });
  assert.ok(scan.scanned > VARIANT_IDS.length);
  const rules = await (await get('/api/victim-rules')).json();
  assert.equal(rules.rules.length, 8);
  assert.ok(rules.pinningLimits.length && rules.scannerLimits.length && rules.scannerRules['MT-HI-001']);
}));

test('run-victim ungoverned, the next fetch: the card rug-pull lands and a FAKE token is in the message', () => withServer(async ({ post }) => {
  const r = await (await post('/api/run-victim', { task: TASK, mode: 'ungoverned' })).json();
  assert.equal(r.variant, 'rug-pull');
  assert.equal(r.summary.poisonLanded, true);
  assert.equal(r.pinned, null);
  assert.equal(r.victim.executed, false);
  assert.deepEqual(r.victim.steps.map((s) => s.tool), ['create_transfer']);
  assert.equal(r.victim.delegation.request.params.message.metadata.audit.bearerToken, 'FAKE-TOKEN-NOT-REAL');
  assert.deepEqual(r.trace.map((t) => t.step), [1, 2, 3, 4]);
  assert.match(r.cardSeen.description, /<IMPORTANT>/);
  assert.deepEqual(scanHosts(JSON.stringify(r)), []);
}));

test('run-victim pinned, the next fetch: the card is withheld with the diff, nothing delegated', () => withServer(async ({ post }) => {
  const r = await (await post('/api/run-victim', { task: TASK, mode: 'pinned' })).json();
  assert.equal(r.summary.withheld, true);
  assert.equal(r.summary.poisonLanded, false);
  assert.equal(r.victim.delegation, null);
  assert.equal(r.pinned.check.verdict, 'changed');
  assert.ok(r.pinned.check.diff.some((d) => d.path === 'description'));
  assert.ok(r.pinned.check.scanner.findings.length > 0);
  assert.equal(r.trace.length, 6);
}));

test('stage first: the rug-pull has not happened yet, both clients delegate cleanly; a static poison shows what each does', () => withServer(async ({ post }) => {
  for (const mode of ['ungoverned', 'pinned']) {
    const r = await (await post('/api/run-victim', { task: TASK, mode, stage: 'first' })).json();
    assert.equal(r.summary.poisonLanded, false, mode);
    assert.ok(r.victim.delegation, mode);
  }
  const ungov = await (await post('/api/run-victim', { task: TASK, mode: 'ungoverned', stage: 'first', variant: 'poisoned' })).json();
  assert.equal(ungov.summary.poisonLanded, true);
  const pinned = await (await post('/api/run-victim', { task: TASK, mode: 'pinned', stage: 'first', variant: 'poisoned' })).json();
  assert.equal(pinned.pinned.check.verdict, 'scanner-finding');
  assert.equal(pinned.summary.withheld, true, 'the scanner rules flag it at first use');
  // Plain-language steering: nothing flags it, so even the pinned client delegates (the honest limit).
  const steer = await (await post('/api/run-victim', { task: 'Pay my electricity bill', mode: 'pinned', stage: 'later', variant: 'plain-language' })).json();
  assert.equal(steer.pinned.check.verdict, 'ok');
  assert.equal(steer.summary.poisonLanded, true, 'pinning and the scanner both miss plain-language steering');
}));

test('run-victim: signatures policy applies to the pinned client only', () => withServer(async ({ post }) => {
  const p = await (await post('/api/run-victim', { task: TASK, mode: 'pinned', variant: 'clean', requireSignatures: true })).json();
  assert.equal(p.pinned.check.verdict, 'unsigned-policy');
  assert.match(p.pinned.check.signature.note, /NOT implemented/);
  const u = await (await post('/api/run-victim', { task: TASK, mode: 'ungoverned', variant: 'clean', requireSignatures: true })).json();
  assert.equal(u.pinned, null);
}));

test('run-victim validates its input', () => withServer(async ({ post }) => {
  const bad = [{}, { task: '', mode: 'pinned' }, { task: 5, mode: 'pinned' }, { task: 'x'.repeat(301), mode: 'pinned' }, { task: TASK, mode: 'nope' }, { task: TASK, mode: 'pinned', stage: 'never' }, { task: TASK, mode: 'pinned', variant: '__proto__' }, { task: TASK, mode: 'pinned', variant: 7 }, { task: TASK, mode: 'pinned', requireSignatures: 'yes' }, null, [], 'text'];
  for (const b of bad) {
    const r = await post('/api/run-victim', b);
    assert.equal(r.status, 400, JSON.stringify(b)?.slice(0, 60));
    assert.equal((await r.json()).error, 'bad_request');
  }
  assert.equal((await post('/api/run-victim', '{oops')).status, 400);
}));

test('a huge body is refused with 413 on every POST route', () => withServer(async ({ post }) => {
  const huge = JSON.stringify({ task: 'x'.repeat(20_000), mode: 'pinned' });
  for (const p of ['/api/run-victim', '/api/card-session/new', '/api/card-session/abc/approve']) assert.equal((await post(p, huge)).status, 413, p);
  assert.equal((await post('/a2a/jsonrpc', JSON.stringify({ pad: 'x'.repeat(20_000) }))).status, 413);
}));

test('prototype-pollution keys in a request body change nothing', () => withServer(async ({ post }) => {
  const r = await post('/api/run-victim', '{"task":"Please refund order 42","mode":"pinned","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
  assert.equal(r.status, 200);
  assert.equal({}.polluted, undefined);
}));

test('unicode in the task is echoed as data, never executed or reinterpreted', () => withServer(async ({ post }) => {
  const task = 'refund ‮order 42​ <script>alert(1)</script> \u{E0041}';
  const r = await (await post('/api/run-victim', { task, mode: 'ungoverned', stage: 'first' })).json();
  assert.equal(r.victim.delegation.request.params.message.parts[0].text, task);
}));

test('three-step flow: new (fetch 1) -> approve -> compare (fetch 2) -> changed, with a diff', () => withServer(async ({ post, get }) => {
  const s = await post('/api/card-session/new', { variant: 'rug-pull' });
  assert.equal(s.status, 201);
  const made = await s.json();
  assert.equal(made.fetchNumber, 1);
  assert.equal(made.check.verdict, 'unpinned');
  assert.deepEqual(made.pins, []);
  assert.doesNotMatch(made.card.description, /IMPORTANT/);
  assert.equal((await post(`/api/card-session/${made.sessionId}/compare`, {})).status, 409, 'compare before approve');
  const ap = await (await post(`/api/card-session/${made.sessionId}/approve`, {})).json();
  assert.equal(ap.fetchNumber, 1);
  assert.equal(ap.pin.sha256, made.check.sha256);
  const cmp = await (await post(`/api/card-session/${made.sessionId}/compare`, {})).json();
  assert.equal(cmp.fetchNumber, 2);
  assert.equal(cmp.check.verdict, 'changed');
  assert.match(cmp.card.description, /<IMPORTANT>/);
  assert.ok(cmp.check.diff.length >= 2);
  // A different session starts clean again: the counter is per session.
  const other = await (await post('/api/card-session/new', { variant: 'rug-pull' })).json();
  assert.equal(other.fetchNumber, 1);
  assert.doesNotMatch(other.card.description, /IMPORTANT/);
  assert.equal((await fetch(`${(await get('/api/health')).url.replace(/\/api\/health$/, '')}/api/card-session/${made.sessionId}`, { method: 'DELETE' })).status, 204);
  assert.equal((await post(`/api/card-session/${made.sessionId}/approve`, {})).status, 404);
}));

test('card-session/new validation and the signature policy', () => withServer(async ({ post }) => {
  assert.equal((await post('/api/card-session/new', { variant: 'nope' })).status, 400);
  assert.equal((await post('/api/card-session/new', { requireSignatures: 1 })).status, 400);
  assert.equal((await post('/api/card-session/nope/approve', {})).status, 404);
  assert.equal((await post('/api/card-session/nope/compare', {})).status, 404);
  const m = await (await post('/api/card-session/new', { variant: 'clean', requireSignatures: true })).json();
  assert.equal(m.check.verdict, 'unsigned-policy');
  assert.equal(m.requireSignatures, true);
}));

test('sessions are capped and expire', () => {
  let t = 0;
  const sessions = createSessions({ max: 3, ttlMs: 1000, now: () => t });
  const ids = [1, 2, 3, 4].map(() => sessions.create({ variant: 'clean' }).id);
  assert.equal(sessions.size(), 3);
  assert.equal(sessions.get(ids[0]), null, 'oldest evicted');
  assert.ok(sessions.get(ids[3]));
  t = 5000;
  assert.equal(sessions.get(ids[3]), null, 'expired');
});

test('unknown API paths are 404 JSON; other methods on known paths do not crash', () => withServer(async ({ get, post }) => {
  assert.equal((await get('/api/nope')).status, 404);
  assert.equal((await fetch(`${(await get('/api/health')).url}`, { method: 'POST' })).status, 405);
  assert.equal((await post('/api/catalog', {})).status, 404);
}));

test('GET /api/shelf is reachable with no web build: returns the SHELF_URL (trailing slash trimmed); POST is not 200', async () => {
  const before = process.env.SHELF_URL;
  process.env.SHELF_URL = 'https://shelf.example:8443/';
  try {
    await withServer(async ({ base, get, post }) => {
      const r = await get('/api/shelf');
      assert.equal(r.status, 200);
      assert.deepEqual(await r.json(), { shelfUrl: 'https://shelf.example:8443' });
      assert.notEqual((await post('/api/shelf', {})).status, 200);
    });
  } finally {
    if (before === undefined) delete process.env.SHELF_URL; else process.env.SHELF_URL = before;
  }
});
