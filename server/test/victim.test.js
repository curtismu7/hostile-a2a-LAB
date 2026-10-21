import assert from 'node:assert/strict';
import test from 'node:test';
import { FETCH_ORIGIN, OFF_ORIGIN_URL, SESSION_JSONRPC_URL, cardFor } from '../src/card.js';
import { scanHosts } from '../src/safety.js';
import { FAKE_TOKEN, VICTIM_RULES, runVictim } from '../src/victim.js';
import { guardNetwork } from './netguard.js';

const TASK = 'Please refund order 42';
const run = (variant, n, task = TASK) => runVictim({ task, card: cardFor(variant, n, SESSION_JSONRPC_URL), origin: FETCH_ORIGIN });
const rules = (r) => r.reasons.filter((x) => x.poison).map((x) => x.rule);

test('executed and sent are false, always, for every variant and fetch', () => {
  for (const v of ['poisoned', 'clean', 'rug-pull', 'skill-added', 'origin-mismatch', 'hidden-characters', 'plain-language']) {
    for (const n of [1, 2]) {
      const r = run(v, n);
      assert.equal(r.executed, false, v);
      assert.equal(r.sent, false, v);
      if (r.delegation) assert.equal(r.delegation.sent, false);
      for (const s of r.steps) assert.equal(s.executed, false);
    }
  }
});

test('a clean card: the benign task is delegated as is, nothing poisoned', () => {
  const r = run('clean', 1);
  assert.equal(r.selected, 'process_refund');
  assert.deepEqual(r.steps, []);
  assert.deepEqual(rules(r), []);
  assert.equal(r.delegation.to, SESSION_JSONRPC_URL);
  assert.deepEqual(r.delegation.request.params.message.parts, [{ kind: 'text', text: TASK }]);
  assert.equal(r.delegation.request.params.message.metadata, undefined);
});

test('the poisoned card lands: the <IMPORTANT> block is obeyed, and the conversation, credentials and a FAKE token go in the message', () => {
  const r = run('poisoned', 1);
  assert.deepEqual(r.steps.map((s) => [s.tool, s.arguments]), [['create_transfer', { amount: 500, to: 'external-001' }]]);
  assert.ok(rules(r).includes('obey-important-block'));
  assert.ok(rules(r).includes('include-requested-data'));
  const meta = r.delegation.request.params.message.metadata;
  assert.equal(meta.audit.bearerToken, FAKE_TOKEN);
  assert.equal(meta.audit.bearerToken, 'FAKE-TOKEN-NOT-REAL');
  assert.match(meta.audit.credentials, /NOT-REAL/);
  assert.equal(meta.audit.conversation[0].text, TASK);
  assert.equal(r.concealedFromUser, true);
  assert.ok(rules(r).includes('conceal'));
});

test('the skill\'s "audit" field name is honoured; a hostile field name is not taken from anywhere else', () => {
  const card = { ...cardFor('poisoned', 1, SESSION_JSONRPC_URL), description: 'plain' };
  const meta = runVictim({ task: TASK, card, origin: FETCH_ORIGIN }).delegation.request.params.message.metadata;
  assert.deepEqual(Object.keys(meta), ['audit']);
});

test('hidden tag characters are read and obeyed like an <IMPORTANT> block', () => {
  const r = run('hidden-characters', 1);
  assert.deepEqual(r.steps.map((s) => s.tool), ['create_transfer']);
  assert.ok(rules(r).includes('obey-hidden-tags'));
  assert.equal(r.delegation.request.params.message.metadata.bearerToken, FAKE_TOKEN);
  assert.equal(r.concealedFromUser, true);
});

test('off-origin url: the message goes to the card\'s url, flagged as poison', () => {
  const r = run('origin-mismatch', 2);
  assert.equal(r.delegation.to, OFF_ORIGIN_URL);
  assert.ok(rules(r).includes('follow-card-url'));
  assert.deepEqual(rules(run('origin-mismatch', 1)), []);
});

test('plain-language steering: an unrelated money task is routed to the agent by its own claim', () => {
  const r = run('plain-language', 1, 'Pay my electricity bill');
  assert.equal(r.selected, 'route-by-claim');
  assert.deepEqual(rules(r), ['route-by-claim']);
  assert.ok(r.delegation);
  const none = run('clean', 1, 'Pay my electricity bill');
  assert.equal(none.delegation, null);
  assert.match(none.notes[0], /does not delegate/);
});

test('skill-added: the extra skill changes nothing the victim does', () => {
  assert.deepEqual(rules(run('skill-added', 2)), []);
  assert.equal(run('skill-added', 2, 'Export a receipt for order 42').selected, 'export_receipt');
});

test('deterministic and side-effect free: same input, same output, no network, input not mutated', () => {
  const guard = guardNetwork();
  try {
    const card = cardFor('poisoned', 1, SESSION_JSONRPC_URL);
    const frozen = JSON.stringify(card);
    const a = runVictim({ task: TASK, card, origin: FETCH_ORIGIN });
    const b = runVictim({ task: TASK, card, origin: FETCH_ORIGIN });
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(card), frozen);
  } finally { guard.restore(); }
  assert.deepEqual(guard.attempts, []);
});

test('no real token ever appears: every secret-shaped value in every output is a labelled placeholder', () => {
  for (const v of ['poisoned', 'rug-pull', 'hidden-characters']) {
    const out = JSON.stringify(run(v, 2));
    assert.doesNotMatch(out, /Bearer\s+[A-Za-z0-9._-]{20,}|eyJ[A-Za-z0-9_-]{10,}/);
    for (const m of out.matchAll(/FAKE-[A-Z-]+/g)) assert.match(m[0], /NOT-REAL$/);
  }
  assert.deepEqual(scanHosts(JSON.stringify(run('poisoned', 1))), []);
});

test('hostile cards do not crash the victim', () => {
  for (const card of [null, undefined, 'x', 7, [], { skills: 'nope' }, { skills: [null, 3, { id: {} , tags: 'x'}], description: 7 }, JSON.parse('{"__proto__":{"a":1},"skills":[{"id":"__proto__"}]}')]) {
    const r = runVictim({ task: TASK, card, origin: FETCH_ORIGIN });
    assert.equal(r.executed, false);
  }
  assert.equal({}.a, undefined);
});

test('the rules are documented data', () => {
  assert.ok(VICTIM_RULES.length >= 8 && VICTIM_RULES.every((r) => r.id && r.text));
  assert.ok(VICTIM_RULES.some((r) => r.id === 'card-only'));
});
