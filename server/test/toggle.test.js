// Rule 19: the Mock/Real toggle's API. This app is mock only and has no hosted build, so Real is never available.
import assert from 'node:assert/strict';
import test from 'node:test';
import { startHttpServer } from '../src/app.js';
import { createHealth } from '../src/health.js';
import { allPassed, runChecks } from '../src/doctor.js';
import { createSessions } from '../src/session.js';

async function withServer(fn) {
  const health = createHealth({ demoId: 'hostile-a2a', demoName: 'Hostile A2A', version: '0.1.0', runChecks, allPassed });
  const server = await startHttpServer(0, '127.0.0.1', { health, sessions: createSessions() });
  const base = `http://127.0.0.1:${server.port}`;
  const post = (body) => fetch(`${base}/api/mode`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const get = () => fetch(`${base}/api/info`);
  try { await fn({ get: () => fetch(`${base}/api/info`), post, base }); } finally { health.stop(); await server.close(); }
}

test('GET /api/info says Mock with no Real', () => withServer(async ({ get }) => {
  const r = await get();
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { mode: 'local', hosted: false, source: 'mock', realAvailable: false, workspaceId: 'default' });
}));

test('POST /api/reset drops every card session (rule 3)', () => withServer(async ({ base }) => {
  const mk = await fetch(`${base}/api/card-session/new`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(mk.status, 201);
  const reset = await fetch(`${base}/api/reset`, { method: 'POST' });
  assert.equal(reset.status, 200);
  const body = await reset.json();
  assert.equal(body.ok, true);
  assert.ok(body.cleared >= 1, `expected at least one session cleared, got ${body.cleared}`);
  // Resetting again is honest about having nothing to clear.
  const again = await (await fetch(`${base}/api/reset`, { method: 'POST' })).json();
  assert.equal(again.cleared, 0);
}));

test('POST /api/mode keeps Mock (200) and refuses Real with the reason (409)', () => withServer(async ({ post }) => {
  const keep = await post({ source: 'mock' });
  assert.equal(keep.status, 200);
  assert.equal((await keep.json()).source, 'mock');
  const real = await post({ source: 'real' });
  assert.equal(real.status, 409);
  assert.match((await real.json()).message, /no live version/);
}));

test('POST /api/mode refuses a body that is not exactly {source: "mock" | "real"} (400)', () => withServer(async ({ post }) => {
  for (const body of [{}, { source: 'live' }, { source: 'mock', extra: 1 }, [], 'mock']) assert.equal((await post(body)).status, 400, JSON.stringify(body));
}));
