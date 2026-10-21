#!/usr/bin/env node
// Generates docs/threat-catalog.md from the catalog data behind GET /api/catalog (server/src/catalog.js).
// Pattern copied from hostile-mcp (scripts/build-threat-catalog.mjs). Deterministic. The test in scripts/docs.test.mjs
// fails if the committed file is stale.
//   node scripts/build-threat-catalog.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CATALOG_DOC = path.join(ROOT, 'docs', 'threat-catalog.md');
const WORD = { yes: 'Yes', partial: 'Partly', no: 'No' };

export async function buildThreatCatalog() {
  const { catalog } = await import(pathToFileURL(path.join(ROOT, 'server/src/catalog.js')));
  const { items, pinningCatches, pinningLimits, scannerLimits, scannerRules } = catalog();
  const out = [
    '# Threat catalog',
    '',
    'Generated from `server/src/catalog.js` by `node scripts/build-threat-catalog.mjs`. Do not edit by hand; the same data is served at `GET /api/catalog`.',
    '',
    '"Scanner" means the card scanner rules in `server/src/scanner.js` (the mcp-tools rule table, copied). "Pinning" means the pinned-card client in `server/src/pinning.js`, including its off-origin and require-signatures checks. `server/test/catalog.test.js` runs every claim below against the real code.',
    '',
    '| Poison | Served here | Where it hides | Scanner | Pinning |',
    '| --- | --- | --- | --- | --- |',
    ...items.map((i) => `| \`${i.id}\` | ${i.servedHere ? `\`${i.variant}\`` : 'no (described only)'} | ${i.category} | ${WORD[i.scanner.catches]} | ${WORD[i.pinning.catches]} |`),
    '',
  ];
  for (const i of items) {
    out.push(`## \`${i.id}\``, '', `Hides in: ${i.category}.${i.servedHere ? ` Served as the \`${i.variant}\` variant${i.requireSignatures ? ', shown to a client that requires signatures' : ''}.` : ' Not served by this server.'}`, '',
      `- What it does: ${i.what}`, `- How it lands: ${i.how}`,
      `- Scanner (${WORD[i.scanner.catches]}): ${i.scanner.note}`, `- Pinning (${WORD[i.pinning.catches]}): ${i.pinning.note}`, '');
  }
  out.push('## What pinning catches', '', ...pinningCatches.map((c) => `- ${c.text}`), '', '## What pinning does not catch', '', ...pinningLimits.map((l) => `- ${l.text}`), '',
    '## What a scan does not catch', '', ...scannerLimits.map((l) => `- ${l.text}`), '',
    '## Scanner rules', '', '| Id | Severity | Kind | Title |', '| --- | --- | --- | --- |', ...scannerRules.map((r) => `| ${r.id} | ${r.severity} | ${r.kind} | ${r.title} |`), '');
  return out.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) fs.writeFileSync(CATALOG_DOC, await buildThreatCatalog());
