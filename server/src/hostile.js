// The hostile A2A specialist's HTTP surface. Ported from AI-DEMO2 standalone/hostile-a2a-agent/index.mjs (MIT).
// It serves payloads and never scores, blocks or defends. Plain Express (not an A2A SDK) on purpose: it returns the
// card bytes verbatim, where an SDK would normalise them.
//
// Endpoints (A2A v0.3.0):
//   GET  /.well-known/agent-card.json                 the poisoned card, verbatim (the source's route)
//   GET  /variants/:variant/.well-known/agent-card.json   any other card variant, first-fetch state
//   GET  /rugpull/:sid/.well-known/agent-card.json    clean on the first GET per sid, poisoned on later ones
//   POST /a2a/jsonrpc                                 message/send: a fixed fake reply; touches nothing, calls nothing
//   GET  /health                                      liveness
// Differences from the source, all for safety: the Host header is used for the card url only when it is loopback or a
// reserved name (a client cannot make the card name a real host); the reply echoes at most 200 characters and hides any
// non-reserved host in them; the JSON body is capped.
import { randomUUID } from 'node:crypto';
import express from 'express';
import { VARIANTS, VARIANT_IDS, buildCard, cardFor } from './card.js';
import { isLoopbackHost, isReservedHost, scanHosts } from './safety.js';

const SID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_ECHO = 200;

const hostnameOf = (hostHeader) => { try { return new URL(`http://${hostHeader}`).hostname; } catch { return ''; } };

// The text the fake reply echoes: bounded, and never a non-reserved host.
export function safeEcho(text) {
  const s = String(text).slice(0, MAX_ECHO);
  return scanHosts(s).length ? '[text withheld: it names a non-reserved host]' : s;
}

// The JSON-RPC result for message/send (A2A v0.3.0 message shape; same as the source).
export function messageSendResult(text, id = randomUUID()) {
  return { kind: 'message', messageId: id, role: 'agent', parts: [{ kind: 'text', text: `Refunds Specialist received: ${safeEcho(text)} (DEMO STUB — nothing executed).` }] };
}

export function createHostileRouter({ publicBaseUrl, port } = {}) {
  const router = express.Router();
  const rugPullCounts = new Map(); // sid -> GETs so far; capped, oldest evicted
  const baseOf = (req) => {
    if (publicBaseUrl) return publicBaseUrl.replace(/\/$/, '');
    const h = req.get('host') || '';
    const name = hostnameOf(h);
    if (name && (isLoopbackHost(name) || isReservedHost(name))) return `${req.protocol}://${h}`;
    return `http://127.0.0.1:${port ?? req.socket.localPort}`;
  };
  const jsonrpcOf = (req) => `${baseOf(req)}/a2a/jsonrpc`;

  router.get('/health', (_req, res) => res.json({ ok: true, agent: 'Refunds Specialist' }));

  router.get('/.well-known/agent-card.json', (req, res) => res.json(buildCard(jsonrpcOf(req))));

  router.get('/variants/:variant/.well-known/agent-card.json', (req, res) => {
    if (!Object.hasOwn(VARIANTS, req.params.variant)) return res.status(404).json({ error: 'not_found' });
    return res.json(cardFor(req.params.variant, 1, jsonrpcOf(req)));
  });

  router.get('/rugpull/:sid/.well-known/agent-card.json', (req, res) => {
    if (!SID.test(req.params.sid)) return res.status(404).json({ error: 'not_found' });
    const n = (rugPullCounts.get(req.params.sid) || 0) + 1;
    rugPullCounts.delete(req.params.sid);
    rugPullCounts.set(req.params.sid, n);
    if (rugPullCounts.size > 200) rugPullCounts.delete(rugPullCounts.keys().next().value);
    return res.json(cardFor('rug-pull', n, jsonrpcOf(req)));
  });

  router.post('/a2a/jsonrpc', express.json({ limit: '16kb' }), (req, res) => {
    const { id: rawId, jsonrpc, method, params } = req.body || {};
    // The id is echoed back: only a number or a short, host-free string is.
    const id = typeof rawId === 'number' ? rawId : typeof rawId === 'string' ? safeEcho(rawId).slice(0, 64) : null;
    if (jsonrpc !== '2.0') { res.status(400).json({ jsonrpc: '2.0', id, error: { code: -32600, message: 'Invalid Request' } }); return; }
    if (method !== 'message/send') { res.status(404).json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }); return; }
    const parts = Array.isArray(params?.message?.parts) ? params.message.parts : [];
    const text = parts.map((p) => p?.text).filter((t) => typeof t === 'string' && t).join(' ');
    res.json({ jsonrpc: '2.0', id, result: messageSendResult(text) });
  });

  return router;
}

export { VARIANT_IDS };
