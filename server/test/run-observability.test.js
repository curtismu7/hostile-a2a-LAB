// Rule 27: the run-observability record and the lab's own decision log lines.
import assert from 'node:assert/strict';
import test from 'node:test';
import { startHttpServer } from '../src/app.js';
import { createHealth } from '../src/health.js';
import { allPassed, runChecks } from '../src/doctor.js';
import { createSessions } from '../src/session.js';
import { assertRunObservability, createRunObservability, defaultLayers, LAYERS } from '../src/runObservability.js';
import { checkPin } from '../../scripts/run-observability-checkPin.mjs';
import { eventsOf, logEvents } from '../src/decisionLog.js';
import { createRunStore } from '../src/runRecord.js';
import { runScenario } from '../src/scenario.js';
import { VARIANT_IDS } from '../src/card.js';

// ---- the pin: an edited vendored copy fails here ---------------------------------------------------------------
// The one shared check (vendored byte for byte as scripts/run-observability-checkPin.mjs). This lab reads no logs, so it has no readers file.
test('the vendored run-observability files match run-observability.sha256 (an edited copy fails)', () => {
  assert.deepEqual(checkPin(new URL('../../', import.meta.url).pathname), []);
});

// ---- helpers ----------------------------------------------------------------------------------------------------
async function withServer(fn, opts = {}) {
  const health = createHealth({ demoId: 'hostile-a2a', demoName: 'Hostile A2A', version: '0.1.0', runChecks, allPassed });
  const lines = [];
  const server = await startHttpServer(0, '127.0.0.1', { health, sessions: createSessions(), decisionLog: (l) => lines.push(l), ...opts });
  const base = `http://127.0.0.1:${server.port}`;
  const post = (path, body, headers = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  try { await fn({ base, post, lines }); } finally { health.stop(); await server.close(); }
}
const TASK = 'Please refund my last order';
const victim = (extra = {}) => ({ task: TASK, stage: 'later', variant: 'rug-pull', ...extra });
// What the Run page does: both clients under one runId, then the record for that runId.
async function runBoth(post, runId, extra = {}, headers = {}) {
  for (const mode of ['ungoverned', 'pinned']) assert.equal((await post('/api/run-victim', victim({ mode, runId, ...extra }), headers)).status, 200);
}
async function record(post, runId, extra = {}, headers = {}) { return (await post('/api/run-observability', { runId, ...extra }, headers)).json(); }
const count = (rec, layer) => rec.rows.filter((r) => r.layer === layer && r.origin !== 'not-logged').length;
const stamp = (line) => line.split(' ')[0];

// ---- the Mock record --------------------------------------------------------------------------------------------
test('POST /api/run-observability: a mock record, every row simulated, passes assertRunObservability', () => withServer(async ({ post }) => {
  await runBoth(post, 'run-1');
  const res = await post('/api/run-observability', { runId: 'run-1' });
  assert.equal(res.status, 200);
  const rec = await res.json();
  assert.deepEqual(assertRunObservability(rec), []);
  assert.equal(rec.source, 'mock');
  assert.ok(rec.rows.some((r) => r.origin === 'simulated'));
  assert.ok(rec.rows.every((r) => ['simulated', 'not-logged'].includes(r.origin)), 'nothing in a mock record claims to be read from a log');
  for (const l of ['person', 'authorize', 'privilege']) { assert.equal(rec.coverage[l], 'not-logged', l); assert.match(rec.reasons[l], /no /); assert.equal(count(rec, l), 0); }
  for (const l of ['agent', 'gateway', 'resource']) assert.equal(rec.coverage[l], 'simulated', l);
}));

test('the mock record holds exactly the events the server wrote for a rug-pull on the later fetch, and only the pinned client decides', () => withServer(async ({ post }) => {
  await runBoth(post, 'run-2');
  const rec = await record(post, 'run-2');
  // ungoverned: served, generalist. pinned: served, approved, withheld (no generalist: it never saw the card).
  assert.equal(count(rec, 'resource'), 2);
  assert.equal(count(rec, 'gateway'), 2);
  assert.equal(count(rec, 'agent'), 1);
  const check = rec.rows.find((r) => r.layer === 'gateway' && r.outcome !== 'info');
  assert.equal(check.outcome, 'refused');
  assert.match(check.message, /withheld/);
  const agent = rec.rows.find((r) => r.layer === 'agent');
  assert.equal(agent.outcome, 'info', 'building a poisoned message is not a decision');
  assert.equal(agent.detail.poisonLanded, true);
  assert.equal(agent.detail.sent, false);
  assert.ok(rec.rows.filter((r) => r.layer === 'resource' || r.layer === 'agent').every((r) => r.outcome === 'info'));
  assert.deepEqual(rec.summary, { allowed: 0, refused: 1, blocked: 0, info: 4, unverified: 0 });
}));

test('a clean card on day one: the pinned client passes it (the one allowed decision) and the generalist ran behind it', () => withServer(async ({ post }) => {
  await runBoth(post, 'run-3', { variant: 'clean', stage: 'first' });
  const rec = await record(post, 'run-3');
  assert.deepEqual(assertRunObservability(rec), []);
  assert.equal(count(rec, 'agent'), 2);
  assert.equal(count(rec, 'resource'), 2);
  assert.deepEqual(rec.summary, { allowed: 1, refused: 0, blocked: 0, info: 5, unverified: 0 });
  assert.equal(rec.rows.filter((r) => r.layer === 'agent').every((r) => r.detail.poisonLanded === false && r.outcome === 'info'), true);
}));

test('every card variant, both stages, signatures required or not: the record is valid, never claims a log, allows only through the pinned client', () => withServer(async ({ post }) => {
  let n = 0;
  for (const variant of VARIANT_IDS) for (const stage of ['first', 'later']) for (const requireSignatures of [false, true]) {
    const runId = `run-v${n++}`;
    await runBoth(post, runId, { variant, stage, requireSignatures });
    const rec = await record(post, runId);
    assert.deepEqual(assertRunObservability(rec), [], `${variant}/${stage}/${requireSignatures}`);
    assert.ok(rec.rows.every((r) => r.origin !== 'logged' && r.origin !== 'response'));
    assert.ok(rec.rows.filter((r) => r.outcome !== 'info').every((r) => r.layer === 'gateway'), `${variant}: only the pinned client decides`);
  }
}));

// ---- the honesty rule for times: the record carries the very times the lab wrote to stdout ---------------------------
test('the record row times equal the stdout line times for the same run (real clock)', () => withServer(async ({ post, lines }) => {
  await runBoth(post, 'run-t1');
  const rec = await record(post, 'run-t1');
  const rows = rec.rows.filter((r) => r.origin === 'simulated');
  assert.equal(rows.length, lines.length);
  assert.deepEqual(rows.map((r) => r.atExact).sort(), lines.map(stamp).sort());
  assert.deepEqual(rows.map((r) => r.at).sort(), lines.map(stamp).sort());
  assert.equal(rec.window.from, [...lines.map(stamp)].sort()[0]);
  assert.equal(rec.window.to, [...lines.map(stamp)].sort().at(-1));
}));

test('a stepping clock: the ungoverned call and the pinned call get their own times; every row has its line time', async () => {
  let t = Date.parse('2026-11-22T10:00:00.000Z');
  const clock = () => { const v = t; t += 250; return v; };
  await withServer(async ({ post, lines }) => {
    await runBoth(post, 'run-t3');
    const rec = await record(post, 'run-t3');
    const rows = rec.rows.filter((r) => r.origin === 'simulated');
    assert.deepEqual([...new Set(rows.map((r) => r.at))], ['2026-11-22T10:00:00.000Z', '2026-11-22T10:00:00.250Z']);
    assert.deepEqual(rows.map((r) => r.at).sort(), lines.map(stamp).sort());
    // the first call's events (served, generalist) carry the first time; the second call's (served, approved, withheld) the second
    assert.deepEqual(rows.filter((r) => r.at.endsWith('00.000Z')).map((r) => r.detail.client), ['ungoverned', 'ungoverned']);
  }, { clock });
});

test('a frozen clock: every event keeps the one real time (no invented bumps) and the order they were written in', async () => {
  const clock = () => Date.parse('2026-11-22T10:00:00.000Z');
  await withServer(async ({ post }) => {
    await runBoth(post, 'run-t4');
    const rec = await record(post, 'run-t4');
    const rows = rec.rows.filter((r) => r.origin === 'simulated');
    assert.equal(new Set(rows.map((r) => r.at)).size, 1);
    assert.equal(rec.window.from, rec.window.to);
    assert.deepEqual(rows.map((r) => r.layer), ['resource', 'resource', 'gateway', 'gateway', 'agent']);
  }, { clock });
});

test('rows that share a time keep the order the events were written in (specialist, approval, verdict, generalist)', async () => {
  let t = Date.parse('2026-11-22T10:00:00.000Z');
  const clock = () => { const v = t; t += 250; return v; };
  await withServer(async ({ post, lines }) => {
    await runBoth(post, 'run-o1', { variant: 'clean', stage: 'first' });
    const rec = await record(post, 'run-o1');
    const pinned = rec.rows.filter((r) => r.origin === 'simulated' && r.detail.client === 'pinned');
    assert.deepEqual(pinned.map((r) => `${r.layer}:${r.outcome}`), ['resource:info', 'gateway:info', 'gateway:allowed', 'agent:info']);
    assert.deepEqual(lines.slice(2).map((l) => l.match(/actor=([a-z-]+) outcome=([a-z-]+)/).slice(1).join(':')), ['hostile-specialist:served', 'pinned-client:approved', 'pinned-client:passed', 'generalist-behind-pin:delegated']);
  }, { clock });
});

test('the record is built from stored events, not a re-run: the scenario runs once per run-victim call', () => withServer(async ({ post }) => {
  await runBoth(post, 'run-t5');
  const a = await record(post, 'run-t5');
  await new Promise((r) => setTimeout(r, 15));
  const b = await record(post, 'run-t5');
  assert.deepEqual(b.rows, a.rows, 'asking again later gives the same rows with the same times');
}));

// ---- the request ------------------------------------------------------------------------------------------------
test('unknown runId 404, missing or malformed runId 400, another workspace cannot read the run; all JSON {error, message} (rule 23)', () => withServer(async ({ post }) => {
  await runBoth(post, 'run-w1');
  const check = async (body, status, headers) => {
    const r = await post('/api/run-observability', body, headers);
    assert.equal(r.status, status, JSON.stringify(body));
    assert.match(r.headers.get('content-type'), /json/);
    const j = await r.json(); assert.ok(j.error && j.message);
  };
  await check({ runId: 'never-ran' }, 404);
  await check({}, 400);
  await check({ runId: 5 }, 400);
  await check({ runId: 'has space' }, 400);
  await check({ runId: 'x'.repeat(65) }, 400);
  await check({ runId: 'run-w1' }, 404, { 'x-workspace': 'someone-else' });
}));

test('run-victim refuses a malformed runId (400) and still answers without one', () => withServer(async ({ post }) => {
  assert.equal((await post('/api/run-victim', victim({ mode: 'pinned', runId: 'no good' }))).status, 400);
  assert.equal((await post('/api/run-victim', victim({ mode: 'pinned' }))).status, 200);
}));

test('each run has its own runId on the record; the record echoes it', () => withServer(async ({ post }) => {
  await runBoth(post, 'run-a'); await runBoth(post, 'run-b');
  const a = await record(post, 'run-a'); const b = await record(post, 'run-b');
  assert.equal(a.runId, 'run-a'); assert.equal(b.runId, 'run-b');
  assert.equal(count(a, 'resource'), 2, 'run-b did not leak into run-a');
}));

test('source: null or absent is a mock record; "mock" too; "real" is refused 409 with the true reason; anything else is 400', () => withServer(async ({ post }) => {
  await runBoth(post, 'run-s');
  for (const source of [undefined, null, 'mock']) {
    const r = await post('/api/run-observability', { runId: 'run-s', ...(source === undefined ? {} : { source }) });
    assert.equal(r.status, 200, String(source));
    assert.equal((await r.json()).source, 'mock');
  }
  const real = await post('/api/run-observability', { runId: 'run-s', source: 'real' });
  assert.equal(real.status, 409);
  const j = await real.json();
  assert.equal(j.error, 'conflict');
  assert.match(j.message, /offline in both modes/); assert.match(j.message, /no reader or matcher/);
  assert.doesNotMatch(j.message, /no live version/);
  assert.equal((await post('/api/run-observability', { runId: 'run-s', source: 'live' })).status, 400);
}));

test('the record and the stdout lines hold no task text, card text or token, whatever the task says', () => withServer(async ({ post, lines }) => {
  const nasty = `Bearer abcdefghijklmnop1234 <script>alert(1)</script> ${'x'.repeat(200)}`.slice(0, 300);
  await runBoth(post, 'run-n', { task: nasty });
  const rec = await record(post, 'run-n');
  assert.deepEqual(assertRunObservability(rec), []);
  for (const text of [JSON.stringify(rec), lines.join('\n')]) assert.ok(!text.includes('abcdefghijklmnop1234') && !text.includes('<script>') && !text.includes('xxxxxxxx'));
}));

// ---- Mock / Real switch -----------------------------------------------------------------------------------------
// Hermetic: realDoorFrom reads HAA_* from the environment and the settings file, so point both at nothing; the test then holds on a machine with Real settings.
async function withNoRealSettings(fn) {
  const saved = {};
  for (const k of Object.keys(process.env)) if (k.startsWith('HAA_') || k === 'STANDALONE_ENV') { saved[k] = process.env[k]; delete process.env[k]; }
  process.env.STANDALONE_ENV = '/nonexistent/hostile-a2a-test.env';
  try { return await fn(); } finally { delete process.env.STANDALONE_ENV; Object.assign(process.env, saved); }
}

test('with no Real settings: Mock to Real is refused (409) and back to Mock works; the record stays a mock record throughout and /api/info is unchanged', () => withNoRealSettings(() => withServer(async ({ base, post }) => {
  const info = () => fetch(`${base}/api/info`).then((r) => r.json());
  const before = await info();
  assert.deepEqual(before, { mode: 'local', hosted: false, source: 'mock', realAvailable: false, workspaceId: 'default' });
  await runBoth(post, 'run-m');
  assert.equal((await post('/api/mode', { source: 'mock' })).status, 200);
  assert.equal((await record(post, 'run-m')).source, 'mock');
  assert.equal((await post('/api/mode', { source: 'real' })).status, 409);
  assert.equal((await post('/api/run-observability', { runId: 'run-m', source: 'real' })).status, 409);
  assert.equal((await post('/api/mode', { source: 'mock' })).status, 200);
  assert.equal((await record(post, 'run-m', { source: 'mock' })).source, 'mock');
  assert.deepEqual(await info(), before);
})));

// ---- a real-source record from an inline fake reader --------------------------------------------------------------
// The lab offers no Real record and reads no logs. This proves the vendored core, in the lab's Node, builds a real-source record that passes the same
// contract: a logged row carries its own timestamp, a layer with no line is not-logged, a failing reader makes the layers it covers unreachable.
const P1AZ = '[vert.x-eventloop-thread-1] INFO  o.f.o.f.S.P1AZDecision @00-mcp-olb-jwks - [P1AZ] DECISION: PERMIT | backend=real | sub=user-7 | tool=whoami | method=tools/call | vertical=university | obligation=none';
const T0 = Date.parse('2026-11-22T10:00:00Z');
const fakeReader = (lines) => ({ name: 'fake', canRead: () => true, readLines: async ({ product }) => ({ lines: product === 'pinggateway' ? lines.map((l) => ({ ...l, product })) : [] }) });

test('a real record from an inline fake reader passes assertRunObservability and names all six layers; a failing reader makes layers unreachable with a reason', async () => {
  const rec = await createRunObservability({ readers: [fakeReader([{ at: T0 + 2300, atExact: '2026-11-22T10:00:02.300Z', message: P1AZ }])] })
    .collectRun({ runId: 'real-1', startedAt: T0, endedAt: T0 + 9000, correlation: { sub: 'user-7' }, layers: defaultLayers(), source: 'real' });
  assert.deepEqual(assertRunObservability(rec), []);
  assert.equal(rec.source, 'real');
  assert.deepEqual(Object.keys(rec.coverage).sort(), [...LAYERS].sort());
  assert.equal(rec.coverage.authorize, 'logged');
  assert.equal(rec.coverage.person, 'not-logged');
  assert.ok(rec.rows.filter((r) => r.origin === 'logged').every((r) => r.at && r.basis));
  assert.ok(rec.rows.every((r) => r.origin !== 'simulated'));
  const failing = { name: 'fake', canRead: () => true, readLines: async () => { throw new Error('boom'); } };
  const down = await createRunObservability({ readers: [failing] }).collectRun({ runId: 'real-2', startedAt: T0, endedAt: T0 + 9000, layers: defaultLayers(), source: 'real' });
  assert.deepEqual(assertRunObservability(down), []);
  assert.ok(Object.values(down.coverage).every((c) => c === 'unreachable' || c === 'not-logged'));
});

// ---- the lab's own log lines ------------------------------------------------------------------------------------
test('run-victim writes one timestamped line per event: actor and outcome, no task, no card text, no token; the pinned verdicts are the decisions', () => withServer(async ({ post, lines }) => {
  assert.equal((await post('/api/run-victim', { ...victim(), mode: 'ungoverned' })).status, 200);
  assert.equal((await post('/api/run-victim', { ...victim(), mode: 'pinned' })).status, 200);
  assert.equal(lines.length, 5); // ungoverned: served, generalist. pinned: served, approved, withheld (no generalist: it never saw the card)
  for (const l of lines) assert.match(l, /^\d{4}-\d\d-\d\dT[\d:.]+Z hostile-a2a event actor=[a-z-]+ outcome=[a-z-]+ client=(ungoverned|pinned) /);
  for (const l of lines) assert.match(l, / variant=rug-pull stage=later/);
  assert.match(lines[0], /actor=hostile-specialist outcome=served client=ungoverned fetches=2/);
  assert.match(lines[1], /actor=generalist-ungoverned outcome=poison-landed client=ungoverned/);
  assert.match(lines[2], /actor=hostile-specialist outcome=served client=pinned fetches=2/);
  assert.match(lines[3], /actor=pinned-client outcome=approved client=pinned/);
  assert.match(lines[4], /actor=pinned-client outcome=withheld client=pinned .*findings=/);
  const clean = await post('/api/run-victim', { ...victim({ variant: 'clean', stage: 'first' }), mode: 'pinned' });
  assert.equal(clean.status, 200);
  assert.match(lines[7], /actor=pinned-client outcome=passed client=pinned variant=clean stage=first$/);
  assert.match(lines[8], /actor=generalist-behind-pin outcome=delegated client=pinned variant=clean/);
  for (const l of lines) assert.ok(!l.includes('refund') && !/Bearer|eyJ/.test(l));
}));

test('a rejected run logs nothing; the observability route logs nothing', () => withServer(async ({ post, lines }) => {
  assert.equal((await post('/api/run-victim', { task: '', mode: 'pinned' })).status, 400);
  await runBoth(post, 'run-l');
  const before = lines.length;
  assert.equal((await post('/api/run-observability', { runId: 'run-l' })).status, 200);
  assert.equal(lines.length, before);
}));

test('card-session compare logs the pinned client verdict', () => withServer(async ({ post, lines }) => {
  const s = await (await post('/api/card-session/new', { variant: 'rug-pull' })).json();
  await post(`/api/card-session/${s.sessionId}/approve`, {});
  await post(`/api/card-session/${s.sessionId}/compare`, {});
  assert.equal(lines.length, 1);
  assert.match(lines[0], /actor=pinned-client outcome=withheld client=pinned variant=rug-pull stage=fetch-2 findings=/);
  assert.ok(!lines[0].includes(s.sessionId));
}));

test('eventsOf: a withheld card has no generalist event; an ungoverned run has no pinned event; logEvents stamps one time on every line', () => {
  const pinned = runScenario({ task: TASK, mode: 'pinned', stage: 'later', variant: 'rug-pull' });
  assert.deepEqual(eventsOf(pinned).map((e) => `${e.actor}:${e.outcome}`), ['hostile-specialist:served', 'pinned-client:approved', 'pinned-client:withheld']);
  const ungoverned = runScenario({ task: TASK, mode: 'ungoverned', stage: 'first', variant: 'clean' });
  const out = [];
  const stamped = logEvents((l) => out.push(l), eventsOf(ungoverned), { variant: 'clean', stage: 'first', at: '2026-11-22T10:00:00.000Z' });
  assert.deepEqual(out, [
    '2026-11-22T10:00:00.000Z hostile-a2a event actor=hostile-specialist outcome=served client=ungoverned fetches=1 variant=clean stage=first',
    '2026-11-22T10:00:00.000Z hostile-a2a event actor=generalist-ungoverned outcome=delegated client=ungoverned variant=clean stage=first',
  ]);
  assert.ok(stamped.every((e) => e.at === '2026-11-22T10:00:00.000Z'));
});

test('the run store is bounded per workspace and per runs, and keeps each workspace apart', () => {
  const store = createRunStore({ maxRuns: 2, maxWorkspaces: 2 });
  store.add('w1', 'a', [{ n: 1 }]); store.add('w1', 'b', [{ n: 2 }]); store.add('w1', 'c', [{ n: 3 }]);
  assert.equal(store.get('w1', 'a'), null, 'the oldest run is dropped');
  assert.deepEqual(store.get('w1', 'c'), [{ n: 3 }]);
  store.add('w2', 'a', [{ n: 4 }]); store.add('w3', 'a', [{ n: 5 }]);
  assert.equal(store.get('w1', 'c'), null, 'the oldest workspace is dropped');
  assert.equal(store.get('w2', 'zzz'), null);
});
