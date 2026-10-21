// The payload corpus and its host scan (the rules live in safety.js).
import { SESSION_JSONRPC_URL, VARIANT_IDS, cardFor } from './card.js';
import { messageSendResult } from './hostile.js';
import { scanHosts } from './safety.js';

// Every payload string the server can put on the wire: every card variant at every fetch number, and the fake reply.
export function payloadCorpus() {
  const cards = VARIANT_IDS.flatMap((v) => [1, 2].map((n) => ({ where: `card ${v} #${n}`, text: JSON.stringify(cardFor(v, n, SESSION_JSONRPC_URL)) })));
  return [...cards, { where: 'message/send reply', text: JSON.stringify(messageSendResult("refund order 42", "id")) }];
}

// [{ where, hosts }] for every payload that names a non-reserved host. Empty array = safe.
export function scanPayloads(corpus = payloadCorpus()) {
  return corpus.map(({ where, text }) => ({ where, hosts: scanHosts(text) })).filter((x) => x.hosts.length);
}
