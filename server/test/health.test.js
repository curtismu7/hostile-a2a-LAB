// Adapted from hostile-mcp (server/test/health.test.js). GET /api/health is demo-health/1 exactly.
import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { allPassed, runChecks } from '../src/doctor.js';
import { createHealth } from '../src/health.js';

async function serve(health, fn) {
  const app = express();
  app.use('/api/health', health.router);
  const s = app.listen(0, '127.0.0.1');
  await new Promise((r) => s.once('listening', r));
  try { await fn(`http://127.0.0.1:${s.address().port}/api/health`); } finally { health.stop(); s.close(); }
}

test('demo-health/1: exact fields, public, no-store', async () => {
  await serve(createHealth({ demoId: 'hostile-a2a', demoName: 'Hostile A2A', version: '0.1.0', runChecks, allPassed, now: () => new Date('2026-10-21T12:00:00.000Z') }), async (url) => {
    const res = await fetch(url);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/json/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ['at', 'demo', 'runtime', 'schema', 'state']);
    assert.deepEqual(Object.keys(body.demo).sort(), ['id', 'name', 'version']);
    assert.equal(body.schema, 'demo-health/1');
    assert.equal(body.at, '2026-10-21T12:00:00.000Z');
    assert.equal(body.state, 'ready');
    assert.equal(body.runtime, 'offline');
    assert.equal(body.demo.id, 'hostile-a2a');
    assert.equal(body.demo.name, 'Hostile A2A');
    assert.ok(body.demo.id.length <= 64 && body.demo.name.length <= 80 && body.demo.version.length <= 32);
    assert.ok(JSON.stringify(body).length < 4096);
  });
});

test('GET only', async () => {
  await serve(createHealth({ demoId: 'hostile-a2a', demoName: 'Hostile A2A', version: '0.1.0', runChecks, allPassed }), async (url) => {
    for (const method of ['POST', 'PUT', 'DELETE']) {
      const r = await fetch(url, { method });
      assert.equal(r.status, 405, method);
      assert.equal(r.headers.get('allow'), 'GET');
    }
  });
});

test('the state is cached: requests never run the checks, a refresh does', async () => {
  let runs = 0;
  let ok = true;
  const runChecks2 = () => { runs += 1; return [{ id: 'x', level: ok ? 'pass' : 'fail', detail: '' }]; };
  const health = createHealth({ demoId: 'hostile-a2a', demoName: 'Hostile A2A', version: '0.1.0', runChecks: runChecks2, allPassed });
  assert.equal(runs, 1, 'one check at startup');
  await serve(health, async (url) => {
    const before = runs;
    for (let i = 0; i < 5; i++) await fetch(url);
    assert.equal(runs, before, 'five requests, no extra checks');
    assert.equal((await (await fetch(url)).json()).state, 'ready');
    ok = false;
    health.refresh(); // what the 60 s timer calls (next test)
    assert.equal(runs, before + 1);
    assert.equal((await (await fetch(url)).json()).state, 'broken');
  });
});

test('the background timer is 60 seconds and runs the same refresh', () => {
  let runs = 0;
  const timers = [];
  const real = globalThis.setInterval;
  globalThis.setInterval = (fn, ms) => { timers.push({ fn, ms }); return real(fn, ms); };
  let health;
  try { health = createHealth({ demoId: 'hostile-a2a', demoName: 'Hostile A2A', version: '0.1.0', runChecks: () => { runs += 1; return []; }, allPassed }); } finally { globalThis.setInterval = real; }
  assert.deepEqual(timers.map((t) => t.ms), [60_000]);
  timers[0].fn();
  assert.equal(runs, 2, 'startup check plus one timer tick');
  health.stop();
});

test('a throwing check reports unknown, not a crash', async () => {
  await serve(createHealth({ demoId: 'hostile-a2a', demoName: 'Hostile A2A', version: '0.1.0', runChecks: () => { throw new Error('boom'); }, allPassed }), async (url) => {
    assert.equal((await (await fetch(url)).json()).state, 'unknown');
  });
});

test('doctor passes here, reports the HOSTILE_BIND opt-in, states the signature limit, and never prints a secret', () => {
  const ok = runChecks({ env: {} });
  assert.ok(allPassed(ok));
  assert.deepEqual(ok.map((c) => c.id), ['node', 'bind', 'payload-hosts', 'outbound', 'signatures']);
  assert.match(ok.find((c) => c.id === 'signatures').detail, /NOT implemented/);
  assert.ok(allPassed(runChecks({ env: { HOSTILE_BIND: '' } })), 'an empty HOSTILE_BIND is the loopback default');
  assert.match(runChecks({ env: { HOSTILE_BIND: '0.0.0.0' } }).find((c) => c.id === 'bind').detail, /HOSTILE_BIND opt-in/);
  assert.doesNotMatch(JSON.stringify(runChecks({ env: { SECRET_TOKEN: 'shh-secret-value' } })), /shh-secret-value/);
});
