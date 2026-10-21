// Behaviour proof: what the ported server puts on the wire is byte-for-byte what the source server did. The hashes were
// taken from the SOURCE server (AI-DEMO2 standalone/hostile-a2a-agent, index.mjs) over a real HTTP client: sha256 of the
// raw response body. Two things are normalised because they differ per run: the card's http://127.0.0.1:<port> (the
// ephemeral port) and the reply's random messageId. Any edit to a payload or a handler changes a hash.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { startHttpServer } from '../src/app.js';

const GOLDEN = {
  card: '105bfbfe1fe5b1c3e2d4721688220836725dbb55c2cbf929a3c78514d7750a52',
  reply: 'fd66847c6481779aa1926fe12865dcdce6ea71d2ac2a525705f9c2247dc39c2e',
  methodNotFound: 'ddb14dd5038f5c5db941b3c4e6d317c8b1ea799d3a6b18d934cd5c7876037563',
};
const norm = (t) => t.replaceAll(/http:\/\/127\.0\.0\.1:\d+/g, 'http://HOST').replace(/"messageId":"[0-9a-f-]{36}"/, '"messageId":"ID"');
const h = (t) => createHash('sha256').update(norm(t)).digest('hex');
const rpc = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('wire output matches the source server byte for byte', async () => {
  const server = await startHttpServer(0);
  try {
    assert.equal(h(await (await fetch(server.cardUrl)).text()), GOLDEN.card, 'agent card');
    const reply = await rpc(server.jsonrpcUrl, { jsonrpc: '2.0', id: 7, method: 'message/send', params: { message: { role: 'user', parts: [{ kind: 'text', text: 'refund order 42' }] } } });
    assert.equal(h(await reply.text()), GOLDEN.reply, 'message/send reply');
    const nf = await rpc(server.jsonrpcUrl, { jsonrpc: '2.0', id: 8, method: 'tasks/get' });
    assert.equal(nf.status, 404);
    assert.equal(h(await nf.text()), GOLDEN.methodNotFound, 'method not found');
  } finally { await server.close(); }
});
