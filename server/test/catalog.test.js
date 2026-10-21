// The catalog's claims are RUN against the real scanner and pinned client, so a row cannot say "yes" for something
// that does not happen.
import assert from 'node:assert/strict';
import test from 'node:test';
import { FETCH_ORIGIN, SESSION_JSONRPC_URL, VARIANT_IDS, cardFor } from '../src/card.js';
import { ROWS, catalog } from '../src/catalog.js';
import { createPinnedCardClient } from '../src/pinning.js';
import { scanCard } from '../src/scanner.js';

const PIN_VERDICTS = ['origin-mismatch', 'unsigned-policy', 'skill-added', 'changed'];

function measure(row) {
  const fetchFindings = [1, 2].map((n) => scanCard(cardFor(row.variant, n, SESSION_JSONRPC_URL)).findings.filter((f) => f.subject.startsWith(`${row.subject}:`) || (row.subject === 'card' && f.subject.startsWith('card:'))));
  const scanner = fetchFindings[0].length ? 'yes' : fetchFindings[1].length ? 'partial' : 'no';
  const c = createPinnedCardClient({ requireSignatures: row.requireSignatures === true });
  c.approve(cardFor(row.variant, 1, SESSION_JSONRPC_URL), { origin: FETCH_ORIGIN });
  const later = c.check(cardFor(row.variant, 2, SESSION_JSONRPC_URL), { origin: FETCH_ORIGIN });
  return { scanner, pinning: later.findings.some((f) => PIN_VERDICTS.includes(f)) ? 'yes' : 'no' };
}

test('every served row\'s scanner and pinning answer is what the code actually does', () => {
  for (const row of ROWS.filter((r) => r.variant)) {
    const got = measure(row);
    assert.equal(row.scanner[0], got.scanner, `${row.id} scanner`);
    assert.equal(row.pinning[0], got.pinning, `${row.id} pinning`);
  }
});

test('GET catalog shape: every variant is covered, the not-served row is marked, limits are included', () => {
  const body = catalog();
  assert.deepEqual([...new Set(body.items.filter((i) => i.variant).map((i) => i.variant))].sort(), [...VARIANT_IDS].sort());
  assert.equal(body.items.find((i) => i.id === 'result-injection').servedHere, false);
  assert.equal(new Set(body.items.map((i) => i.id)).size, body.items.length);
  for (const i of body.items) {
    for (const f of ['id', 'category', 'what', 'how']) assert.ok(i[f], `${i.id}.${f}`);
    for (const k of ['scanner', 'pinning']) assert.ok(['yes', 'partial', 'no'].includes(i[k].catches) && i[k].note, `${i.id}.${k}`);
  }
  assert.ok(body.pinningLimits.some((l) => l.id === 'signatures-not-verified'));
  assert.ok(body.scannerLimits.some((l) => l.id === 'result-injection'));
  assert.ok(body.scannerRules.length >= 10);
  const by = Object.fromEntries(body.items.map((i) => [i.id, i]));
  assert.equal(by['plain-language-steering'].scanner.catches, 'no');
  assert.equal(by['plain-language-steering'].pinning.catches, 'no');
  assert.equal(by['card-rug-pull'].pinning.catches, 'yes');
});
