// The family same-origin write rule on the demo API, including the lab-proxy (https://local.ping-devops.com:8443/hostile-a2a/),
// and proof that the hostile A2A surface other clients call stays open.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { createHealth } from '../src/health.js';

const NAME = 'hostile-a2a.local.ping-devops.com';
const PROXY_ORIGIN = 'https://local.ping-devops.com:8443';
const PROXIED = { host: `${NAME}:4750`, 'x-forwarded-host': 'local.ping-devops.com:8443', 'x-forwarded-proto': 'https' };
const RUN = JSON.stringify({ task: 'refund order 42', mode: 'pinned' });

const start = async (opts) => {
  const health = createHealth(); await health.ready;
  const server = await new Promise((r) => { const s = createApp({ health, ...opts }).listen(0, '127.0.0.1', () => r(s)); });
  return { port: server.address().port, close: () => { health.stop?.(); server.closeAllConnections?.(); server.close(); } };
};
const send = (port, { method = 'POST', path = '/api/run-victim', headers = {}, body = RUN } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, path, method, headers: { 'content-type': 'application/json', ...headers } }, (res) => {
    let b = ''; res.on('data', (d) => { b += d; }); res.on('end', () => resolve({ status: res.statusCode, body: b }));
  });
  req.on('error', reject); req.end(method === 'GET' || method === 'DELETE' ? undefined : body);
});

let lab;
before(async () => { lab = await start({ labHosts: [NAME], labPort: 4750 }); });
after(() => lab.close());

test('lab-proxy: launcher writes (allowed Host, Origin === X-Forwarded-Proto://X-Forwarded-Host) are accepted, the card flow included', async () => {
  const h = { ...PROXIED, origin: PROXY_ORIGIN };
  assert.equal((await send(lab.port, { headers: h })).status, 200);
  const made = await send(lab.port, { path: '/api/card-session/new', body: '{}', headers: h });
  assert.equal(made.status, 201, made.body);
  const { sessionId } = JSON.parse(made.body);
  assert.equal((await send(lab.port, { path: `/api/card-session/${sessionId}/approve`, body: '{}', headers: h })).status, 200);
  assert.equal((await send(lab.port, { path: `/api/card-session/${sessionId}/compare`, body: '{}', headers: h })).status, 200);
  assert.equal((await send(lab.port, { method: 'DELETE', path: `/api/card-session/${sessionId}`, headers: h })).status, 204);
  assert.equal((await send(lab.port, { method: 'GET', path: '/api/health', headers: PROXIED })).status, 200);
});

test('loopback: a same-origin write and a write with no Origin are accepted', async () => {
  for (const host of [`127.0.0.1:${lab.port}`, `localhost:${lab.port}`]) {
    assert.equal((await send(lab.port, { headers: { host, origin: `http://${host}` } })).status, 200, host);
  }
  assert.equal((await send(lab.port, { headers: { host: `127.0.0.1:${lab.port}` } })).status, 200);
});

test('a foreign Origin on a demo-API write is refused (403), behind the proxy or on loopback', async () => {
  for (const origin of ['https://evil.example', 'http://local.ping-devops.com:8443', 'https://local.ping-devops.com', 'null', `http://127.0.0.1:${lab.port + 1}`]) {
    const r = await send(lab.port, { headers: { ...PROXIED, origin } });
    assert.equal(r.status, 403, origin); assert.match(r.body, /bad_origin/);
  }
  const lb = await send(lab.port, { headers: { host: `127.0.0.1:${lab.port}`, origin: 'https://evil.example' } });
  assert.equal(lb.status, 403); assert.match(lb.body, /bad_origin/);
  assert.equal((await send(lab.port, { path: '/api/reset', body: '{}', headers: { ...PROXIED, origin: 'https://evil.example' } })).status, 403);
  assert.equal((await send(lab.port, { headers: { ...PROXIED, 'x-forwarded-proto': 'ftp', origin: 'ftp://local.ping-devops.com:8443' } })).status, 403);
  assert.equal((await send(lab.port, { headers: { ...PROXIED, 'x-forwarded-host': '', origin: 'https://' } })).status, 403);
});

test('forwarded headers on a loopback Host are ignored', async () => {
  for (const [host, xfh, origin] of [[`127.0.0.1:${lab.port}`, 'evil.example', 'https://evil.example'], [`localhost:${lab.port}`, 'local.ping-devops.com:8443', PROXY_ORIGIN]]) {
    const r = await send(lab.port, { headers: { host, 'x-forwarded-host': xfh, 'x-forwarded-proto': 'https', origin } });
    assert.equal(r.status, 403, host); assert.match(r.body, /bad_origin/);
  }
});

test('a Host outside the set is refused on the demo API, reads included', async () => {
  for (const host of ['local.ping-devops.com:4750', 'evil.example:4750', `${NAME}:1`, NAME, `${NAME}.evil.example:4750`]) {
    const r = await send(lab.port, { headers: { ...PROXIED, host, origin: PROXY_ORIGIN } });
    assert.equal(r.status, 403, host); assert.match(r.body, /host_not_allowed/);
    assert.equal((await send(lab.port, { method: 'GET', path: '/api/health', headers: { host } })).status, 403, host);
  }
  const bare = await start({ labHosts: [], labPort: 4750 });
  try { assert.equal((await send(bare.port, { headers: { ...PROXIED, origin: PROXY_ORIGIN } })).status, 403); } finally { bare.close(); }
});

test('the hostile A2A surface stays open to other clients: agent cards and JSON-RPC under any Host and Origin', async () => {
  const rpc = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'message/send', params: { message: { parts: [{ text: 'refund order 42' }] } } });
  for (const headers of [{}, { host: 'hostile-a2a:4750' }, { host: 'evil.example', origin: 'https://evil.example' }]) {
    const card = await send(lab.port, { method: 'GET', path: '/.well-known/agent-card.json', headers });
    assert.equal(card.status, 200, JSON.stringify(headers));
    assert.match(JSON.parse(card.body).url, /\/a2a\/jsonrpc$/);
    assert.equal((await send(lab.port, { method: 'GET', path: '/rugpull/s1/.well-known/agent-card.json', headers })).status, 200);
    const r = await send(lab.port, { path: '/a2a/jsonrpc', body: rpc, headers });
    assert.equal(r.status, 200, JSON.stringify(headers)); assert.equal(JSON.parse(r.body).result.kind, 'message');
  }
});
