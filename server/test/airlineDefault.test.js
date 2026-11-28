// AirGuard Airlines (a fictional airline) is the default story: the card fixtures, the sample reply and the catalog's
// customer read as an airline, and no retired brand or retail wording is on the wire.
import assert from 'node:assert/strict';
import test from 'node:test';
import { startHttpServer } from '../src/app.js';
import { VARIANT_IDS, SESSION_JSONRPC_URL, cardFor } from '../src/card.js';
import { payloadCorpus } from '../src/corpus.js';
import { DEFAULT_CUSTOMER, loadCustomer } from '../src/customer.js';
import { createHealth } from '../src/health.js';
import { allPassed, runChecks } from '../src/doctor.js';
import { createSessions } from '../src/session.js';

// Retired names: the earlier airline brands, the other family brands and the bank/retail wording this lab used to carry.
const RETIRED = [/Meridian/i, /Skyline Air/i, /Northwind/i, /Contoso/i, /Tessera/i, /Fabrikam/i, /Harbor/i, /Vellum/i, /Super Banking/i, /Hostile MCP/i, /refund (of )?(an |my last )?order/i];

test('the default customer is AirGuard Airlines, not the old copied name', () => {
  assert.equal(DEFAULT_CUSTOMER.name, 'AirGuard Airlines');
  assert.equal(loadCustomer({ path: '/nonexistent/customer.config.json' }).name, 'AirGuard Airlines');
});

test('GET /api/catalog serves the AirGuard Airlines customer when no config is given', async () => {
  const health = createHealth({ demoId: 'hostile-a2a', demoName: 'Hostile A2A', version: '0.1.0', runChecks, allPassed });
  const server = await startHttpServer(0, '127.0.0.1', { health, sessions: createSessions(), customer: loadCustomer({ path: '/nonexistent/customer.config.json' }) });
  try {
    const cat = await (await fetch(`http://127.0.0.1:${server.port}/api/catalog`)).json();
    assert.equal(cat.customer.name, 'AirGuard Airlines');
  } finally { health.stop(); await server.close(); }
});

test('the clean refund skill is a booking refund, and the whole payload corpus carries no retired name', () => {
  assert.equal(cardFor('clean', 1, SESSION_JSONRPC_URL).skills[0].description, 'Process a customer refund for a booking.');
  const corpus = payloadCorpus();
  assert.ok(corpus.length > VARIANT_IDS.length);
  for (const { where, text } of corpus) for (const re of RETIRED) assert.doesNotMatch(text, re, `${where} ${re}`);
  assert.match(corpus.at(-1).text, /refund booking 42/);
});
