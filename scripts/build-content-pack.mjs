#!/usr/bin/env node
/**
 * Generates content-pack.json (repo root). Format: docs/content-pack.schema.json (a copy of the ID-JAG kit's schema).
 * Glossary from content/terms.json; cards from the web pages and the stories in web/src/data/stories.
 * Pattern copied from hostile-mcp (scripts/build-content-pack.mjs).
 * Deterministic: lists sorted by id, 2-space JSON, no timestamps. The git commit is recorded only when passed
 * (--commit=<sha>), so a plain run is reproducible.
 *
 * Sources: none. The source README (AI-DEMO2 standalone/hostile-a2a-agent) and this repo's docs name only loopback
 * addresses; no public documentation URL appears in either, and this pack lists only URLs it can verify from the repo.
 *
 *   node scripts/build-content-pack.mjs [--commit=<sha>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PACK_PATH = path.join(ROOT, 'content-pack.json');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const CARDS = [
  { id: 'gallery', label: 'Poison gallery', description: 'Every card payload the server can serve, with what the scanner rules and pinning each catch.', group: 'try-it', href: '/#/gallery', terms: ['agent-card', 'agent-card-poisoning', 'inter-agent-abuse', 'specialist'], story: 'S21' },
  { id: 'run', label: 'Run the delegation', description: 'The same task through an ungoverned client and a pinned client, side by side. No model needed; nothing is sent.', group: 'try-it', href: '/#/run', terms: ['delegation', 'generalist', 'card-pinning', 'unsigned-card-policy'], story: 'S21' },
  { id: 'roundtrip', label: 'Card round trip', description: 'Approve fetch 1, fetch again, compare: the agent that changed overnight, with the field diff.', group: 'try-it', href: '/#/roundtrip', terms: ['card-pinning', 'off-origin-url'], story: 'S22' },
  { id: 'limits', label: 'Honest limits', description: 'What pinning and the scanner do not catch, and why card signature verification is not implemented here.', group: 'concept', href: '/#/limits', terms: ['signed-card', 'unsigned-card-policy'] },
  { id: 'diagram', label: 'Diagram', description: 'Specialist, card, pinned client, generalist and the message it would send. Movable boxes, Simulate, Reset.', group: 'concept', href: '/#/diagram', terms: ['agent-card', 'delegation'] },
];

export function buildPack({ commit } = {}) {
  const pkg = readJson('package.json');
  const stories = fs.readdirSync(path.join(ROOT, 'web/src/data/stories')).filter((f) => f.endsWith('.json')).map((f) => ({ f, s: readJson(`web/src/data/stories/${f}`) }))
    .map(({ f, s }) => ({ id: s.id, title: s.title, say: s.say, file: `web/src/data/stories/${f}` })).sort(byId);
  const ids = new Set(stories.map((s) => s.id));
  const pack = {
    schema: 'demo-content-pack/1',
    id: 'hostile-a2a',
    title: 'Hostile A2A agent / poisoned Agent Card',
    version: pkg.version,
    ...(commit ? { source: { repo: 'hostile-a2a', commit } } : {}),
    demo: { id: 'hostile-a2a', name: 'Hostile A2A', catalog: 'D7', baseUrl: 'http://localhost:4901', doctor: '/api/health', tags: ['a2a', 'agent-card', 'delegation', 'card-pinning'] },
    glossary: readJson('content/terms.json').sort(byId),
    sources: [],
    cards: CARDS.map(({ href, ...c }) => ({ ...c, action: { type: 'route', href } })).sort(byId),
    diagrams: [{ id: 'card-path', label: 'Where the Agent Card is consumed', href: '/#/diagram' }],
    stories,
  };
  for (const c of pack.cards) if (c.story && !ids.has(c.story)) throw new Error(`card ${c.id} names unknown story ${c.story}`);
  return pack;
}

export const serialize = (pack) => `${JSON.stringify(pack, null, 2)}\n`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const commit = process.argv.find((a) => a.startsWith('--commit='))?.slice(9);
  fs.writeFileSync(PACK_PATH, serialize(buildPack({ commit })));
  console.log(`wrote ${path.relative(process.cwd(), PACK_PATH) || PACK_PATH}`);
}
