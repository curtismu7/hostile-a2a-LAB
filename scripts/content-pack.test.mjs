import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { PACK_PATH, buildPack, serialize } from './build-content-pack.mjs';
import { validatePack } from './validate-content-pack.mjs';

test('content-pack.json is exactly what the generator produces (run: node scripts/build-content-pack.mjs)', () => {
  assert.equal(fs.readFileSync(PACK_PATH, 'utf8'), serialize(buildPack()), 'content-pack.json is stale; regenerate it and commit the result');
});

test('the generator is deterministic', () => assert.equal(serialize(buildPack()), serialize(buildPack())));

test('content-pack.json validates against docs/content-pack.schema.json', () => {
  assert.deepEqual(validatePack(JSON.parse(fs.readFileSync(PACK_PATH, 'utf8'))), []);
});

test('the validator rejects a broken pack', () => {
  const pack = buildPack();
  pack.cards[0].terms = ['no-such-term'];
  delete pack.title;
  assert.ok(validatePack(pack).length >= 2);
});

test('the pack has the ten required terms, both stories, and no unverified source URLs', () => {
  const pack = buildPack();
  for (const id of ['agent-card', 'agent-card-poisoning', 'delegation', 'inter-agent-abuse', 'specialist', 'generalist', 'card-pinning', 'off-origin-url', 'signed-card', 'unsigned-card-policy']) assert.ok(pack.glossary.some((g) => g.id === id), id);
  assert.deepEqual(pack.sources, []);
  assert.deepEqual(pack.stories.map((s) => s.id), ['S21', 'S22']);
  assert.ok(pack.cards.some((c) => c.story === 'S21') && pack.cards.some((c) => c.story === 'S22'));
});

test('the glossary says signature verification is not implemented', () => {
  const t = buildPack().glossary.find((g) => g.id === 'signed-card');
  assert.match(t.term, /not implemented/i);
  assert.match(t.definition, /NOT verify/);
});

test('a commit is recorded only when passed', () => {
  assert.equal(buildPack().source, undefined);
  assert.equal(buildPack({ commit: 'abc1234' }).source.commit, 'abc1234');
});
