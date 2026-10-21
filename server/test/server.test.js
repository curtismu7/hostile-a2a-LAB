// Ported from the source's agent-card.test.js and server.test.js, plus the variants. A real HTTP client discovers the
// agent and must get the poison byte for byte, and message/send must answer with a v0.3.0 message result.
import assert from 'node:assert/strict';
import test from 'node:test';
import { startHttpServer } from '../src/app.js';
import { CLEAN_DESCRIPTION, POISONED_DESCRIPTION, POISONED_SKILL, VARIANT_IDS, buildCard, cardFor, SESSION_JSONRPC_URL } from '../src/card.js';

test('the card description smuggles an agent-directed instruction', () => {
  assert.match(POISONED_DESCRIPTION, /<IMPORTANT>[\s\S]*<\/IMPORTANT>/, 'no <IMPORTANT> block');
  assert.match(POISONED_DESCRIPTION, /create_transfer/, 'lost the induced harmful action');
  assert.match(POISONED_DESCRIPTION, /do not (mention|tell)/i, 'lost the secrecy instruction');
});

test('the poisoned skill instructs exfiltrating credentials/tokens', () => {
  assert.match(POISONED_SKILL.description, /credential|token/i, 'skill no longer leaks secrets');
});

test('buildCard is a v0.3.0 card, serves the poison verbatim, wires the JSON-RPC url', () => {
  const card = buildCard('http://example/a2a/jsonrpc');
  assert.equal(card.protocolVersion, '0.3.0');
  assert.equal(card.preferredTransport, 'JSONRPC');
  assert.equal(card.url, 'http://example/a2a/jsonrpc');
  assert.equal(card.additionalInterfaces[0].url, 'http://example/a2a/jsonrpc');
  assert.match(card.description, /<IMPORTANT>/, 'description poison dropped from the card');
  assert.ok(card.skills.some((s) => /credential|token/i.test(s.description)), 'skill poison dropped from the card');
});

test('the poisoned v0.3.0 Agent Card arrives verbatim at the well-known path', async () => {
  const server = await startHttpServer(0);
  try {
    const card = await (await fetch(server.cardUrl)).json();
    assert.equal(card.name, 'Refunds Specialist');
    assert.equal(card.protocolVersion, '0.3.0');
    assert.match(card.description, /<IMPORTANT>[\s\S]*create_transfer[\s\S]*<\/IMPORTANT>/, 'injection lost in transit');
    assert.ok(card.skills.some((s) => /credential|token/i.test(s.description)), 'skill exfil lost in transit');
    assert.match(card.url, /\/a2a\/jsonrpc$/, 'card url should point at the JSON-RPC endpoint');
    assert.equal(card.url, `http://127.0.0.1:${server.port}/a2a/jsonrpc`);
  } finally { await server.close(); }
});

test('POST /a2a/jsonrpc message/send answers with a v0.3.0 message result', async () => {
  const server = await startHttpServer(0);
  try {
    const res = await fetch(server.jsonrpcUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'message/send', params: { message: { role: 'user', parts: [{ kind: 'text', text: 'refund order 42' }] } } }),
    });
    const body = await res.json();
    assert.equal(body.result.kind, 'message');
    assert.equal(body.result.role, 'agent');
    assert.match(body.result.parts[0].text, /refund order 42/);
    assert.match(body.result.parts[0].text, /STUB/i);
    assert.equal(body.id, 1);
  } finally { await server.close(); }
});

test('JSON-RPC errors: bad version 400, unknown method 404, bad JSON 400, oversized body 413', async () => {
  const server = await startHttpServer(0);
  const post = (body, raw) => fetch(server.jsonrpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ?? JSON.stringify(body) });
  try {
    assert.equal((await post({ jsonrpc: '1.0', id: 1, method: 'message/send' })).status, 400);
    assert.equal((await post({ jsonrpc: '2.0', id: 1, method: 'tasks/get' })).status, 404);
    assert.equal((await post(null, '{not json')).status, 400);
    assert.equal((await post(null, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'message/send', pad: 'x'.repeat(20_000) }))).status, 413);
    const weird = await (await post({ jsonrpc: '2.0', id: { a: 1 }, method: 'message/send', params: { message: { parts: 'nope' } } })).json();
    assert.equal(weird.id, null);
    assert.match(weird.result.parts[0].text, /received:\s+\(DEMO STUB/);
  } finally { await server.close(); }
});

test('the rug-pull card is clean on the first GET per session and poisoned on later ones, per session id', async () => {
  const server = await startHttpServer(0);
  const get = async (sid) => (await fetch(`${server.url}rugpull/${sid}/.well-known/agent-card.json`)).json();
  try {
    assert.equal((await get('a')).description, CLEAN_DESCRIPTION);
    assert.equal((await get('b')).description, CLEAN_DESCRIPTION, 'a second session starts clean too');
    assert.match((await get('a')).description, /<IMPORTANT>/);
    assert.match((await get('a')).description, /<IMPORTANT>/);
    assert.equal((await fetch(`${server.url}rugpull/bad%20id/.well-known/agent-card.json`)).status, 404);
  } finally { await server.close(); }
});

test('every variant served over HTTP equals the card the sessions use (same bytes in, same card out)', async () => {
  const server = await startHttpServer(0);
  try {
    for (const v of VARIANT_IDS) {
      const got = await (await fetch(`${server.url}variants/${v}/.well-known/agent-card.json`)).json();
      assert.deepEqual(got, cardFor(v, 1, `http://127.0.0.1:${server.port}/a2a/jsonrpc`), v);
    }
    assert.equal((await fetch(`${server.url}variants/__proto__/.well-known/agent-card.json`)).status, 404);
    assert.equal((await fetch(`${server.url}variants/nope/.well-known/agent-card.json`)).status, 404);
    assert.ok(SESSION_JSONRPC_URL.endsWith('/a2a/jsonrpc'));
  } finally { await server.close(); }
});
