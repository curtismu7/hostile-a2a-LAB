import assert from 'node:assert/strict';
import test from 'node:test';
import { CLEAN_DESCRIPTION, FETCH_ORIGIN, OFF_ORIGIN_URL, SESSION_JSONRPC_URL, cardFor } from '../src/card.js';
import { CATCHES, LIMITS, canonicalize, cardHash, createPinnedCardClient, diffValues, originOf } from '../src/pinning.js';

const card = (v, n = 1) => cardFor(v, n, SESSION_JSONRPC_URL);
const pinned = (opts) => createPinnedCardClient(opts);

test('the hash is order-independent: key order, skill order and unpinned fields do not matter', () => {
  const a = card('clean');
  const b = { skills: [...a.skills].reverse(), version: a.version, url: a.url, description: a.description, name: a.name, capabilities: Object.fromEntries(Object.entries(a.capabilities).reverse()), extraField: 'ignored', protocolVersion: '9.9' };
  assert.equal(cardHash(a), cardHash(b));
  const two = { ...a, skills: [{ id: 'b', name: 'B', description: 'd' }, { id: 'a', name: 'A', description: 'd' }] };
  assert.equal(cardHash(two), cardHash({ ...two, skills: [...two.skills].reverse() }));
  assert.match(cardHash(a), /^[0-9a-f]{64}$/);
});

test('every pinned field changes the hash; unpinned ones do not', () => {
  const a = card('clean');
  const h = cardHash(a);
  for (const [k, v] of [['name', 'X'], ['description', 'X'], ['url', 'https://refunds-demo.invalid/other'], ['version', '2'], ['capabilities', { streaming: true }], ['securitySchemes', { bearer: { type: 'http' } }]]) assert.notEqual(cardHash({ ...a, [k]: v }), h, k);
  for (const k of ['id', 'name', 'description', 'inputModes', 'outputModes']) assert.notEqual(cardHash({ ...a, skills: [{ ...a.skills[0], [k]: k === 'inputModes' || k === 'outputModes' ? ['audio'] : 'X' }] }), h, `skill.${k}`);
  assert.equal(cardHash({ ...a, skills: [{ ...a.skills[0], tags: ['other'] }] }), h, 'skill tags are not pinned');
  assert.equal(cardHash({ ...a, defaultInputModes: ['audio'], preferredTransport: 'GRPC' }), h);
});

test('no pin yet: unpinned, with the other checks still running', () => {
  const c = pinned();
  assert.equal(c.check(card('clean'), { origin: FETCH_ORIGIN }).verdict, 'unpinned');
  const r = c.check(card('poisoned'), { origin: FETCH_ORIGIN });
  assert.equal(r.verdict, 'scanner-finding');
  assert.deepEqual(r.findings, ['scanner-finding', 'unpinned']);
  assert.ok(r.scanner.findings.length >= 5);
});

test('the same card after approval is ok; approving a flagged card is recorded and visible', () => {
  const c = pinned();
  const ap = c.approve(card('clean'), { origin: FETCH_ORIGIN });
  assert.equal(ap.scannerFindingsAtApproval, 0);
  assert.equal(c.check(card('clean'), { origin: FETCH_ORIGIN }).verdict, 'ok');
  const bad = pinned();
  assert.ok(bad.approve(card('poisoned'), { origin: FETCH_ORIGIN }).scannerFindingsAtApproval >= 5);
  assert.equal(bad.check(card('poisoned'), { origin: FETCH_ORIGIN }).verdict, 'scanner-finding', 'approved, unchanged, still flagged by the rules');
});

test('rug-pull of a card: changed, with a field diff, plus the scanner finding', () => {
  const c = pinned();
  c.approve(card('rug-pull', 1), { origin: FETCH_ORIGIN });
  const r = c.check(card('rug-pull', 2), { origin: FETCH_ORIGIN });
  assert.equal(r.verdict, 'changed');
  assert.deepEqual(r.findings, ['changed', 'scanner-finding']);
  assert.notEqual(r.sha256, r.pinnedSha256);
  const d = r.diff.find((x) => x.path === 'description');
  assert.equal(d.change, 'changed');
  assert.equal(d.before, CLEAN_DESCRIPTION);
  assert.match(d.after, /<IMPORTANT>/);
  assert.ok(r.diff.some((x) => x.path === 'skills[process_refund].description'));
  assert.equal(r.diff.every((x) => x.path !== 'version'), true, 'the version did not change: that is the point');
});

test('a skill added later is caught even when its text is harmless', () => {
  const c = pinned();
  c.approve(card('skill-added', 1), { origin: FETCH_ORIGIN });
  const r = c.check(card('skill-added', 2), { origin: FETCH_ORIGIN });
  assert.equal(r.verdict, 'skill-added');
  assert.deepEqual(r.addedSkills, ['export_receipt']);
  assert.deepEqual(r.findings, ['skill-added', 'changed']);
  assert.ok(!r.findings.includes('scanner-finding'));
  assert.equal(r.diff.find((x) => x.path === 'skills[export_receipt]').change, 'added');
});

test('a card whose url origin differs from the origin it was fetched from: origin-mismatch, even with no pin', () => {
  const r = pinned().check(card('origin-mismatch', 2), { origin: FETCH_ORIGIN });
  assert.equal(r.verdict, 'origin-mismatch');
  assert.deepEqual(r.offOriginUrls, [OFF_ORIGIN_URL]);
  const c = pinned();
  c.approve(card('origin-mismatch', 1), { origin: FETCH_ORIGIN });
  assert.deepEqual(c.check(card('origin-mismatch', 2), { origin: FETCH_ORIGIN }).findings, ['origin-mismatch', 'changed']);
  assert.equal(c.check(card('origin-mismatch', 1), { origin: FETCH_ORIGIN }).verdict, 'ok');
  const partial = { ...card('clean'), additionalInterfaces: [{ url: OFF_ORIGIN_URL, transport: 'JSONRPC' }] };
  assert.equal(pinned().check(partial, { origin: FETCH_ORIGIN }).verdict, 'origin-mismatch', 'an additional interface counts too');
  assert.equal(originOf('not a url'), '');
  assert.equal(originOf('data:text/plain,x'), '');
});

test('unsigned card under a require-signatures policy: unsigned-policy, and the check is a stub that fails closed', () => {
  const c = pinned({ requireSignatures: true });
  c.approve(card('clean'), { origin: FETCH_ORIGIN });
  const r = c.check(card('clean'), { origin: FETCH_ORIGIN });
  assert.equal(r.verdict, 'unsigned-policy');
  assert.deepEqual(r.signature, { required: true, present: false, verified: false, note: r.signature.note });
  assert.match(r.signature.note, /NOT implemented/);
  const signed = { ...card('clean'), signatures: [{ protected: 'e30', signature: 'AAAA' }] };
  const s = c.check(signed, { origin: FETCH_ORIGIN });
  assert.equal(s.verdict, 'unsigned-policy', 'a signature that cannot be verified does not pass');
  assert.equal(s.signature.present, true);
  assert.equal(s.signature.verified, false);
  assert.equal(pinned().check(card('clean'), { origin: FETCH_ORIGIN }).signature, undefined, 'no policy, no signature finding');
});

test('severity order: origin-mismatch beats unsigned beats skill-added beats changed beats scanner', () => {
  const c = pinned({ requireSignatures: true });
  c.approve(card('clean'), { origin: FETCH_ORIGIN });
  const worst = { ...card('poisoned'), url: OFF_ORIGIN_URL, skills: [...card('poisoned').skills, { id: 'new', name: 'n', description: 'd' }] };
  const r = c.check(worst, { origin: FETCH_ORIGIN });
  assert.deepEqual(r.findings, ['origin-mismatch', 'unsigned-policy', 'skill-added', 'changed', 'scanner-finding']);
  assert.equal(r.verdict, 'origin-mismatch');
});

test('a diff makes hidden characters visible: two descriptions that look identical differ as [U+XXXX]', () => {
  const a = card('clean');
  const b = { ...a, description: `${a.description}​` };
  const c = pinned();
  c.approve(a, { origin: FETCH_ORIGIN });
  const r = c.check(b, { origin: FETCH_ORIGIN });
  assert.equal(r.verdict, 'changed');
  const d = r.diff.find((x) => x.path === 'description');
  assert.match(d.afterRevealed, /\[U\+200B\]$/);
  assert.equal(d.beforeRevealed, CLEAN_DESCRIPTION);
});

test('hostile input: huge, deeply nested and prototype-pollution cards are handled, not executed', () => {
  const c = pinned();
  c.approve(card('clean'), { origin: FETCH_ORIGIN });
  let deep = 'x'; for (let i = 0; i < 20_000; i++) deep = { n: deep };
  const nasty = [
    { ...card('clean'), capabilities: deep },
    { ...card('clean'), description: 'x'.repeat(2_000_000) },
    { ...card('clean'), skills: Array.from({ length: 50_000 }, (_, i) => ({ id: String(i), name: 'n', description: 'd' })) },
    JSON.parse('{"name":"a","url":"https://refunds-demo.invalid/a","__proto__":{"polluted":1},"constructor":{"x":1},"skills":[{"id":"__proto__","description":"d"},{"id":"constructor"}],"capabilities":{"__proto__":{"y":1}}}'),
    null, 'string', 42, [], { skills: 'nope', capabilities: 'nope', additionalInterfaces: 'nope' }, { skills: [null, 5, 'x', { id: { a: 1 } }] },
  ];
  for (const n of nasty) {
    const r = c.check(n, { origin: FETCH_ORIGIN });
    assert.ok(typeof r.verdict === 'string' && /^[0-9a-f]{64}$/.test(r.sha256));
  }
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.y, undefined);
  assert.notEqual(cardHash(JSON.parse('{"capabilities":{"__proto__":{"y":1}}}')), cardHash({}), 'an own __proto__ key counts as data');
  assert.equal(diffValues(JSON.parse('{"__proto__":1}'), {}).length, 1);
});

test('unicode tricks do not collide: a look-alike description has a different hash', () => {
  const a = card('clean');
  assert.notEqual(cardHash(a), cardHash({ ...a, description: a.description.replace('a', 'а') }));
  assert.notEqual(cardHash(a), cardHash({ ...a, description: `${a.description}‮` }));
});

test('canonicalize is stable and bounded', () => {
  assert.equal(JSON.stringify(canonicalize({ b: 1, a: { d: 1, c: [{ z: 1, y: 2 }] } })), '{"a":{"c":[{"y":2,"z":1}],"d":1},"b":1}');
  let deep = 'x'; for (let i = 0; i < 100_000; i++) deep = [deep];
  assert.ok(JSON.stringify(canonicalize(deep)).includes('too deep'));
});

test('what pinning catches and does not catch is data, and the signature limit is plain', () => {
  assert.deepEqual(CATCHES.map((c) => c.id), ['rug-pull', 'skill-added', 'origin-mismatch', 'unsigned-policy', 'scanner-finding']);
  for (const id of ['signatures-not-verified', 'first-use-poison', 'semantic-manipulation', 'well-behaved-malicious', 'result-injection']) assert.ok(LIMITS.some((l) => l.id === id), id);
  assert.match(LIMITS.find((l) => l.id === 'signatures-not-verified').text, /NOT implemented/);
});
