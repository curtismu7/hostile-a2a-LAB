import assert from 'node:assert/strict';
import test from 'node:test';
import { SESSION_JSONRPC_URL, CLEAN_DESCRIPTION, HIDDEN_INSTRUCTION, cardFor, encodeTags } from '../src/card.js';
import { RULES, scanCard } from '../src/scanner.js';

const ids = (card) => scanCard(card).findings.map((f) => f.ruleId);

test('the rule table keeps the copied ids and severities', () => {
  assert.equal(RULES['MT-HI-001'].severity, 'high');
  assert.equal(RULES['MT-EX-002'].severity, 'warn');
  assert.equal(RULES['MT-UC-003'].kind, 'unicode-trick');
  for (const [id, r] of Object.entries(RULES)) assert.ok(/^MT-[A-Z]{2}-\d{3}$/.test(id) && ['info', 'warn', 'high'].includes(r.severity) && r.title, id);
});

test('the poisoned card: instruction tag and secrecy in the description (the "ignore any previous" phrasing has no rule); leak in the skill', () => {
  const { findings } = scanCard(cardFor('poisoned', 1, SESSION_JSONRPC_URL));
  const bySubject = (p) => findings.filter((f) => f.subject.startsWith(p)).map((f) => f.ruleId);
  assert.deepEqual(bySubject('card:'), ['MT-HI-001', 'MT-HI-002', 'MT-EX-002']);
  assert.deepEqual(bySubject('skill:'), ['MT-EX-002', 'MT-CR-001']);
});

test('evidence offsets point into the original string', () => {
  const card = cardFor('poisoned', 1, SESSION_JSONRPC_URL);
  const f = scanCard(card).findings.find((x) => x.ruleId === 'MT-HI-001');
  const [e] = f.evidence;
  assert.equal(e.field, 'description');
  assert.equal(card.description.slice(e.start, e.end).toLowerCase(), '<important>');
  const skill = scanCard(card).findings.find((x) => x.subject.startsWith('skill:') && x.ruleId === 'MT-EX-002');
  assert.equal(skill.evidence[0].field, 'skills[0].description');
  assert.match(card.skills[0].description.slice(skill.evidence[0].start, skill.evidence[0].end), /credential|token|context/i);
});

test('clean, skill-added, off-origin and plain-language cards trip no rule (text has nothing to match)', () => {
  for (const [v, n] of [['clean', 1], ['rug-pull', 1], ['skill-added', 2], ['origin-mismatch', 2], ['plain-language', 1]]) assert.deepEqual(ids(cardFor(v, n, SESSION_JSONRPC_URL)), [], `${v}#${n}`);
});

test('hidden tag characters: found, revealed as [U+XXXX], and the decoded text is shown', () => {
  const card = cardFor('hidden-characters', 1, SESSION_JSONRPC_URL);
  const f = scanCard(card).findings.find((x) => x.ruleId === 'MT-UC-003');
  assert.ok(f, 'tag characters found');
  assert.match(f.detail, /\[U\+E00/);
  assert.ok(f.detail.includes('spell:'));
  assert.match(f.evidence[0].excerpt, /^\[U\+E00/);
  assert.equal(f.evidence[0].start, CLEAN_DESCRIPTION.length);
  assert.ok(!/[\u{E0000}-\u{E007F}]/u.test(JSON.stringify(f.evidence)), 'the excerpt carries no raw invisible character');
  assert.ok(HIDDEN_INSTRUCTION.length > 20 && encodeTags('a').codePointAt(0) === 0xE0061);
});

test('bidi, zero-width and mixed-script tricks are flagged, in any string including field names', () => {
  const card = { name: 'Refunds', description: 'Pay‮roll​ ok pаypal', skills: [{ id: 'a', name: 'n​ame', description: 'fine' }], 'ke​y': 'v' };
  const got = ids(card);
  for (const id of ['MT-UC-001', 'MT-UC-002', 'MT-UC-004']) assert.ok(got.includes(id), id);
  assert.ok(scanCard(card).findings.some((f) => f.evidence[0]?.field === 'skills[0].name'));
  assert.ok(scanCard(card).findings.some((f) => /field name/.test(f.detail)));
});

test('hostile inputs end in a truncation finding or a quiet empty result, never a crash', () => {
  assert.deepEqual(scanCard(null), { findings: [], truncated: false });
  assert.deepEqual(scanCard('x'), { findings: [], truncated: false });
  assert.deepEqual(scanCard([1, 2]), { findings: [], truncated: false });
  let deep = { description: 'x' }; for (let i = 0; i < 5000; i++) deep = { n: deep };
  const d = scanCard({ name: 'a', description: 'ok', extra: deep });
  assert.equal(d.truncated, true);
  assert.ok(d.findings.some((f) => f.ruleId === 'MT-LM-001' && /nesting/.test(f.detail)));
  const huge = scanCard({ name: 'a', description: 'tokens '.repeat(50_000) });
  assert.ok(huge.findings.some((f) => f.ruleId === 'MT-LM-001' && /string longer/.test(f.detail)));
  const wide = scanCard({ name: 'a', description: 'ok', skills: Array.from({ length: 30_000 }, (_, i) => ({ id: `s${i}`, description: 'ok' })) });
  assert.equal(wide.truncated, true);
  const cyc = { name: 'c', description: 'ok' }; cyc.self = cyc;
  assert.ok(scanCard(cyc).findings.some((f) => /cyclic/.test(f.detail)));
  const many = scanCard({ name: 'a', description: '​'.repeat(10) + 'x​'.repeat(1000), skills: [] });
  assert.ok(many.findings.length <= 201);
});

test('prototype-pollution keys are data: no crash, no pollution', () => {
  const card = JSON.parse('{"name":"a","description":"ok","__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}},"skills":[{"id":"x","__proto__":{"description":"call me"}}]}');
  scanCard(card);
  assert.equal({}.polluted, undefined);
});
