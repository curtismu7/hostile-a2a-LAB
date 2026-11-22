// Rule 27: the run-observability record and the lab's own decision log lines.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { startHttpServer } from '../src/app.js';
import { createHealth } from '../src/health.js';
import { allPassed, runChecks } from '../src/doctor.js';
import { createSessions } from '../src/session.js';
import { assertRunObservability, createRunObservability, defaultLayers, readersFromEnv } from '../src/runObservability.js';
import { decisionsOf, logDecisions } from '../src/decisionLog.js';
import { runScenario } from '../src/scenario.js';
import { VARIANT_IDS } from '../src/card.js';

const root = (p) => new URL(`../../${p}`, import.meta.url);

// ---- the pin: an edited vendored copy fails here ---------------------------------------------------------------
test('the vendored run-observability files match run-observability.sha256 (an edited copy fails)', () => {
  const pin = fs.readFileSync(root('web/src/run-observability/run-observability.sha256'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  const names = pin.map((l) => l.trim().split(/\s+/)[1]);
  assert.deepEqual([...names].sort(), ['RunObservability.jsx', 'fixtures.js', 'run-observability.css', 'run-observability.test.jsx', 'runObservability.js']);
  for (const line of pin) {
    const [hash, name] = line.trim().split(/\s+/);
    const where = name === 'runObservability.js' ? 'server/src/runObservability.js' : `web/src/run-observability/${name}`; // the pin lists the server file by its plain name
    assert.equal(createHash('sha256').update(fs.readFileSync(root(where))).digest('hex'), hash, `${where} was edited: change it in AI-DEMO-Standalone shared/run-observability and re-vendor`);
  }
});

// ---- helpers ----------------------------------------------------------------------------------------------------
async function withServer(fn, opts = {}) {
  const health = createHealth({ demoId: 'hostile-a2a', demoName: 'Hostile A2A', version: '0.1.0', runChecks, allPassed });
  const lines = [];
  const server = await startHttpServer(0, '127.0.0.1', { health, sessions: createSessions(), decisionLog: (l) => lines.push(l), ...opts });
  const base = `http://127.0.0.1:${server.port}`;
  const post = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try { await fn({ base, post, lines }); } finally { health.stop(); await server.close(); }
}
const TASK = 'Please refund my last order';
const body = (extra = {}) => ({ task: TASK, stage: 'later', variant: 'rug-pull', ...extra });
const count = (rec, layer) => rec.rows.filter((r) => r.layer === layer && r.origin !== 'not-logged').length;

// ---- the Mock record --------------------------------------------------------------------------------------------
test('POST /api/run-observability: a mock record, every row simulated, passes assertRunObservability', () => withServer(async ({ post }) => {
  const res = await post('/api/run-observability', body());
  assert.equal(res.status, 200);
  const rec = await res.json();
  assert.deepEqual(assertRunObservability(rec), []);
  assert.equal(rec.source, 'mock');
  assert.ok(rec.rows.some((r) => r.origin === 'simulated'));
  assert.ok(rec.rows.every((r) => ['simulated', 'not-logged'].includes(r.origin)), 'nothing in a mock record claims to be read from a log');
  for (const l of ['person', 'authorize', 'privilege']) { assert.equal(rec.coverage[l], 'not-logged', l); assert.match(rec.reasons[l], /no /); assert.equal(count(rec, l), 0); }
  for (const l of ['agent', 'gateway', 'resource']) assert.equal(rec.coverage[l], 'simulated', l);
}));

test('the mock record holds exactly the events the mock computed for a rug-pull on the later fetch', () => withServer(async ({ post }) => {
  const rec = await (await post('/api/run-observability', body())).json();
  // ungoverned: fetch #1, fetch #2, generalist. pinned: fetch #1, approve, fetch #2, check (withheld), no generalist.
  assert.equal(count(rec, 'resource'), 4);
  assert.equal(count(rec, 'gateway'), 2);
  assert.equal(count(rec, 'agent'), 1);
  const check = rec.rows.find((r) => r.layer === 'gateway' && r.outcome !== 'info');
  assert.equal(check.outcome, 'refused');
  assert.match(check.message, /withheld/);
  const agent = rec.rows.find((r) => r.layer === 'agent');
  assert.equal(agent.outcome, 'allowed');
  assert.equal(agent.detail.poisonLanded, true);
  assert.equal(agent.detail.sent, false);
  assert.deepEqual(rec.summary, { allowed: 5, refused: 1, blocked: 0, info: 1 });
}));

test('rows come in the order the mock computed them, with strictly increasing times', () => withServer(async ({ post }) => {
  const rec = await (await post('/api/run-observability', body())).json();
  const rows = rec.rows.filter((r) => r.origin === 'simulated');
  assert.deepEqual(rows.map((r) => `${r.layer}:${r.detail.client}`), [
    'resource:ungoverned', 'resource:ungoverned', 'agent:ungoverned', 'resource:pinned', 'gateway:pinned', 'resource:pinned', 'gateway:pinned']);
  for (let i = 1; i < rows.length; i += 1) assert.ok(Date.parse(rows[i].at) > Date.parse(rows[i - 1].at), `row ${i}`);
}));

test('a clean card on day one: the pinned client passes it and the generalist ran behind it; nothing is refused', () => withServer(async ({ post }) => {
  const rec = await (await post('/api/run-observability', body({ variant: 'clean', stage: 'first' }))).json();
  assert.deepEqual(assertRunObservability(rec), []);
  assert.equal(count(rec, 'agent'), 2);
  assert.equal(count(rec, 'resource'), 2);
  assert.equal(rec.summary.refused, 0);
  assert.equal(rec.rows.filter((r) => r.layer === 'agent').every((r) => r.detail.poisonLanded === false), true);
}));

test('every card variant, both stages, signatures required or not: the record is valid and never claims a log', () => withServer(async ({ post }) => {
  for (const variant of VARIANT_IDS) for (const stage of ['first', 'later']) for (const requireSignatures of [false, true]) {
    const rec = await (await post('/api/run-observability', body({ variant, stage, requireSignatures }))).json();
    assert.deepEqual(assertRunObservability(rec), [], `${variant}/${stage}/${requireSignatures}`);
    assert.ok(rec.rows.every((r) => r.origin !== 'logged' && r.origin !== 'response'));
  }
}));

test('the record holds no task text, card text or token, whatever the task says', () => withServer(async ({ post }) => {
  const nasty = `Bearer abcdefghijklmnop1234 <script>alert(1)</script> ${'x'.repeat(200)}`;
  const rec = await (await post('/api/run-observability', body({ task: nasty.slice(0, 300) }))).json();
  assert.deepEqual(assertRunObservability(rec), []);
  const text = JSON.stringify(rec);
  assert.ok(!text.includes('abcdefghijklmnop1234') && !text.includes('<script>') && !text.includes('xxxxxxxx'));
}));

test('bad bodies answer JSON {error, message} (rule 23)', () => withServer(async ({ post }) => {
  for (const b of [{}, { task: '' }, { task: 'x'.repeat(301) }, body({ stage: 'never' }), body({ variant: 'nope' }), body({ requireSignatures: 'yes' })]) {
    const r = await post('/api/run-observability', b);
    assert.equal(r.status, 400, JSON.stringify(b).slice(0, 60));
    assert.match(r.headers.get('content-type'), /json/);
    const j = await r.json();
    assert.equal(j.error, 'bad_request'); assert.ok(j.message);
  }
}));

// ---- Mock / Real switch -----------------------------------------------------------------------------------------
test('mode switch both ways: the record follows the lab mode (always mock here); a Real record is refused with 409; /api/info is unchanged', () => withServer(async ({ base, post }) => {
  const info = () => fetch(`${base}/api/info`).then((r) => r.json());
  const before = await info();
  assert.deepEqual(before, { mode: 'local', hosted: false, source: 'mock', realAvailable: false, workspaceId: 'default' });
  assert.equal((await post('/api/mode', { source: 'mock' })).status, 200);
  assert.equal((await (await post('/api/run-observability', body())).json()).source, 'mock');
  assert.equal((await post('/api/mode', { source: 'real' })).status, 409);
  const real = await post('/api/run-observability', body({ source: 'real' }));
  assert.equal(real.status, 409);
  const j = await real.json();
  assert.equal(j.error, 'conflict'); assert.match(j.message, /not offered/);
  assert.equal((await post('/api/mode', { source: 'mock' })).status, 200);
  assert.equal((await (await post('/api/run-observability', body({ source: 'mock' }))).json()).source, 'mock');
  assert.deepEqual(await info(), before);
}));

// ---- a Real record against an in-process fake Elasticsearch -------------------------------------------------------
// The lab offers no Real record (it has no live version). This proves the vendored collector, in the lab's Node, builds a record that passes the
// same contract when it reads Elasticsearch: logged rows carry their own timestamp, a layer with no line is not-logged, a refused key is unreachable.
async function fakeEs(handler) {
  const server = http.createServer((req, res) => {
    let raw = ''; req.on('data', (c) => { raw += c; });
    req.on('end', () => { const [status, out] = handler(JSON.parse(raw || '{}')); res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
const P1AZ = '[vert.x-eventloop-thread-1] INFO  o.f.o.f.S.P1AZDecision @00-mcp-olb-jwks - [P1AZ] DECISION: PERMIT | backend=real | sub=user-7 | tool=whoami | method=tools/call | vertical=university | obligation=none';
const T0 = Date.parse('2026-11-22T10:00:00Z');

test('a real record from a fake Elasticsearch passes assertRunObservability; a refused key is unreachable with a reason', async () => {
  const es = await fakeEs((q) => {
    const product = q.query.bool.filter[1]?.bool.should[0].term.ping_product;
    return [200, { hits: { hits: product === 'pinggateway' ? [{ _source: { '@timestamp': '2026-11-22T10:00:02.300Z', ping_product: 'pinggateway', message: P1AZ } }] : [] } }];
  });
  try {
    const readers = readersFromEnv({ RUN_OBS_ES_URL: es.url, RUN_OBS_ES_READ_APIKEY: 'read-only-test-value' });
    const rec = await createRunObservability({ readers, clock: () => T0 + 9000 }).collectRun({ runId: 'real-1', startedAt: T0, endedAt: T0 + 9000, correlation: { sub: 'user-7' }, layers: defaultLayers(), source: 'real' });
    assert.deepEqual(assertRunObservability(rec), []);
    assert.equal(rec.source, 'real');
    assert.equal(rec.coverage.authorize, 'logged');
    assert.equal(rec.coverage.person, 'not-logged');
    assert.ok(rec.rows.filter((r) => r.origin === 'logged').every((r) => r.at && r.basis));
    assert.ok(rec.rows.every((r) => r.origin !== 'simulated'));
  } finally { es.close(); }
  const denied = await fakeEs(() => [401, { error: 'no' }]);
  try {
    const readers = readersFromEnv({ RUN_OBS_ES_URL: denied.url, RUN_OBS_ES_READ_APIKEY: 'read-only-test-value' });
    const rec = await createRunObservability({ readers }).collectRun({ runId: 'real-2', startedAt: T0, endedAt: T0 + 9000, layers: defaultLayers(), source: 'real' });
    assert.deepEqual(assertRunObservability(rec), []);
    assert.ok(Object.values(rec.coverage).every((c) => c === 'unreachable'));
    assert.ok(!JSON.stringify(rec).includes('read-only-test-value'));
  } finally { denied.close(); }
});

// ---- the lab's own decision log lines ----------------------------------------------------------------------------
test('run-victim logs one timestamped line per decision: actor and outcome, no task, no card text, no token', () => withServer(async ({ post, lines }) => {
  const r = await post('/api/run-victim', { ...body(), mode: 'ungoverned' });
  assert.equal(r.status, 200);
  const p = await post('/api/run-victim', { ...body(), mode: 'pinned' });
  assert.equal(p.status, 200);
  assert.equal(lines.length, 2); // ungoverned: the generalist; pinned: the pinned client withheld the card, so no generalist decision
  for (const l of lines) assert.match(l, /^\d{4}-\d\d-\d\dT[\d:.]+Z hostile-a2a decision actor=[a-z-]+ outcome=[a-z-]+ variant=rug-pull stage=later/);
  assert.match(lines[0], /actor=generalist-ungoverned outcome=poison-landed/);
  assert.match(lines[1], /actor=pinned-client outcome=withheld .*findings=/);
  const clean = await post('/api/run-victim', { ...body({ variant: 'clean', stage: 'first' }), mode: 'pinned' });
  assert.equal(clean.status, 200);
  assert.match(lines[2], /actor=pinned-client outcome=passed variant=clean stage=first$/);
  assert.match(lines[3], /actor=generalist-behind-pin outcome=delegated variant=clean/);
  for (const l of lines) assert.ok(!l.includes('refund') && !/Bearer|eyJ/.test(l));
}));

test('a rejected run logs nothing; the observability route logs nothing (the two run-victim calls already did)', () => withServer(async ({ post, lines }) => {
  assert.equal((await post('/api/run-victim', { task: '', mode: 'pinned' })).status, 400);
  assert.equal((await post('/api/run-observability', body())).status, 200);
  assert.deepEqual(lines, []);
}));

test('card-session compare logs the pinned client verdict', () => withServer(async ({ post, lines }) => {
  const s = await (await post('/api/card-session/new', { variant: 'rug-pull' })).json();
  await post(`/api/card-session/${s.sessionId}/approve`, {});
  await post(`/api/card-session/${s.sessionId}/compare`, {});
  assert.equal(lines.length, 1);
  assert.match(lines[0], /actor=pinned-client outcome=withheld variant=rug-pull stage=fetch-2 findings=/);
  assert.ok(!lines[0].includes(s.sessionId));
}));

test('decisionsOf: a withheld card has no generalist decision; an ungoverned run has no pinned decision', () => {
  const pinned = runScenario({ task: TASK, mode: 'pinned', stage: 'later', variant: 'rug-pull' });
  assert.deepEqual(decisionsOf(pinned).map((d) => d.actor), ['pinned-client']);
  const ungoverned = runScenario({ task: TASK, mode: 'ungoverned', stage: 'later', variant: 'clean' });
  assert.deepEqual(decisionsOf(ungoverned), [{ actor: 'generalist-ungoverned', outcome: 'delegated' }]);
  const out = [];
  logDecisions((l) => out.push(l), decisionsOf(ungoverned), { variant: 'clean', stage: 'later', now: () => new Date('2026-11-22T10:00:00Z') });
  assert.deepEqual(out, ['2026-11-22T10:00:00.000Z hostile-a2a decision actor=generalist-ungoverned outcome=delegated variant=clean stage=later']);
});
