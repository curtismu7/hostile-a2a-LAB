// One Express app: the demo API under /api, the hostile A2A endpoints at the root (as the source served them), and the
// built web UI when web/dist exists. createApp() is what the tests use.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { VARIANT_IDS } from './card.js';
import { catalog } from './catalog.js';
import { payloadCorpus, scanPayloads } from './corpus.js';
import { createHealth } from './health.js';
import { createHostileRouter } from './hostile.js';
import { CATCHES, LIMITS } from './pinning.js';
import { RULES, SCAN_LIMITS } from './scanner.js';
import { runScenario, seen } from './scenario.js';
import { assertBindAllowed, bindHost } from './safety.js';
import { createSessions } from './session.js';
import { VICTIM_RULES } from './victim.js';

const WEB_DIST = process.env.WEB_DIST || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
const bad = (res, message, status = 400) => res.status(status).json({ error: status === 404 ? 'not_found' : status === 409 ? 'conflict' : 'bad_request', message });

const MODES = ['ungoverned', 'pinned'];
const STAGES = ['first', 'later'];
const MAX_TASK = 300;
const TASK_OK = (t) => typeof t === 'string' && t.trim() && t.trim().length <= MAX_TASK;

// Validates the fields run-victim and card-session/new share. Returns an error message or null.
function checkVariant(body) {
  if (body.variant !== undefined && !(typeof body.variant === 'string' && VARIANT_IDS.includes(body.variant))) return `variant must be one of ${VARIANT_IDS.join(', ')}`;
  if (body.requireSignatures !== undefined && typeof body.requireSignatures !== 'boolean') return 'requireSignatures must be a boolean';
  return null;
}

export function createApp({ health = createHealth(), sessions = createSessions(), publicBaseUrl, port } = {}) {
  const app = express();
  app.disable('x-powered-by');

  const api = express.Router();
  api.use(express.json({ limit: '8kb' }));
  api.use('/health', health.router);
  // Rule 19: the Mock/Real toggle's API. This app is mock only (an offline hostile server and an offline victim, no model, no network),
  // so Real is never available. There is no hosted build, so there is no 403 path.
  const NO_REAL = 'Real is not available: this app has no live version (an offline hostile server and an offline victim, no model, no network). Mock is the whole demo.';
  const infoBody = () => ({ mode: 'local', hosted: false, source: 'mock', realAvailable: false });
  api.get('/info', (_req, res) => res.json(infoBody()));
  api.post('/mode', (req, res) => {
    const b = req.body;
    if (b === null || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).length !== 1 || !['mock', 'real'].includes(b.source)) return bad(res, 'body must be exactly {source: "mock" or "real"}');
    if (b.source === 'real') return bad(res, NO_REAL, 409);
    return res.json(infoBody());
  });
  api.get('/catalog', (_req, res) => res.json(catalog()));
  // The payload host scan, run on demand: every payload the server can put on the wire, checked for any non-reserved host.
  api.get('/safety-scan', (_req, res) => {
    const offenders = scanPayloads();
    res.json({ ok: offenders.length === 0, scanned: payloadCorpus().length, offenders });
  });
  api.get('/victim-rules', (_req, res) => res.json({ rules: VICTIM_RULES, pinningCatches: CATCHES, pinningLimits: LIMITS, scannerLimits: SCAN_LIMITS, scannerRules: RULES }));

  api.post('/run-victim', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { task, mode, stage = 'later' } = body;
    if (!TASK_OK(task)) return bad(res, `task must be a non-empty string of at most ${MAX_TASK} characters`);
    if (!MODES.includes(mode)) return bad(res, `mode must be one of ${MODES.join(', ')}`);
    if (!STAGES.includes(stage)) return bad(res, `stage must be one of ${STAGES.join(', ')}`);
    const err = checkVariant(body);
    if (err) return bad(res, err);
    return res.json(runScenario({ task: task.trim(), mode, stage, ...(body.variant ? { variant: body.variant } : {}), requireSignatures: body.requireSignatures === true }));
  });

  // The three-step flow: new (fetch #1) -> approve (pin it) -> compare (fetch the next card and check it).
  api.post('/card-session/new', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const err = checkVariant(body);
    if (err) return bad(res, err);
    const session = sessions.create({ variant: body.variant || 'rug-pull', requireSignatures: body.requireSignatures === true });
    const first = session.getCard();
    return res.status(201).json({ sessionId: session.id, variant: session.variant, requireSignatures: session.requireSignatures, fetchNumber: first.fetchNumber, card: seen(first.card), check: session.check(first.card), pins: session.pinned.pins() });
  });
  const withSession = (fn) => (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) return bad(res, 'no such session (it may have expired)', 404);
    return fn(session, req, res);
  };
  api.post('/card-session/:id/approve', withSession((session, _req, res) => {
    const result = session.approve();
    if (!result) return bad(res, 'fetch the card first; there is nothing to approve', 409);
    return res.json(result);
  }));
  api.post('/card-session/:id/compare', withSession((session, _req, res) => {
    if (!session.pinned.pins().length) return bad(res, 'approve a card first; there is nothing to compare against', 409);
    const next = session.getCard();
    return res.json({ fetchNumber: next.fetchNumber, card: seen(next.card), check: session.check(next.card) });
  }));
  api.delete('/card-session/:id', (req, res) => (sessions.delete(req.params.id) ? res.status(204).end() : bad(res, 'no such session', 404)));

  api.use((_req, res) => bad(res, 'no such endpoint', 404));
  api.use((err, _req, res, _next) => { // eslint-disable-line no-unused-vars
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large', message: 'request body is too large' });
    if (err.type === 'entity.parse.failed') return bad(res, 'request body is not valid JSON');
    console.error('[hostile-a2a] api error:', err.message);
    return res.status(500).json({ error: 'server_error' });
  });
  app.use('/api', api);

  app.use(createHostileRouter({ publicBaseUrl, port }));
  // Errors from the hostile JSON-RPC body parser: the same shapes, as JSON-RPC-friendly plain JSON.
  app.use((err, _req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return next(err);
  });

  if (fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
    app.use(express.static(WEB_DIST));
    app.get(/^\/(?!api\/|a2a\/|variants\/|rugpull\/|health$|\.well-known\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIST, 'index.html')));
  }
  return app;
}

// Boot on `port` (0 = ephemeral). Refuses a non-loopback host unless HOSTILE_BIND is set.
export function startHttpServer(port = Number(process.env.PORT) || 4750, host = bindHost(process.env), opts = {}) {
  assertBindAllowed(host);
  return new Promise((resolve, reject) => {
    const httpServer = createApp(opts).listen(port, host);
    httpServer.once('error', reject);
    httpServer.once('listening', () => {
      const { port: bound } = httpServer.address();
      const url = `http://127.0.0.1:${bound}/`;
      resolve({ port: bound, url, cardUrl: `${url}.well-known/agent-card.json`, jsonrpcUrl: `${url}a2a/jsonrpc`, close: () => new Promise((r) => { httpServer.closeAllConnections?.(); httpServer.close(r); }) });
    });
  });
}
