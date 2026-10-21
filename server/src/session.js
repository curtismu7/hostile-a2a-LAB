// A card session: the in-memory stand-in for "an A2A client fetching the card". It owns a fetch counter, so "fetch #1
// (approve), fetch #2 (compare)" is deterministic and per session, and a pinned-card client. The card is a JSON round
// trip of what the hostile server builds, which is what arrives over the wire (the HTTP route is tested to match).
import { randomUUID } from 'node:crypto';
import { FETCH_ORIGIN, SESSION_JSONRPC_URL, cardFor } from './card.js';
import { createPinnedCardClient } from './pinning.js';

export function createSession({ variant, requireSignatures = false, id = randomUUID() }) {
  const pinned = createPinnedCardClient({ requireSignatures });
  const session = {
    id, variant, requireSignatures, pinned, fetchCount: 0, last: null,
    getCard() {
      session.fetchCount += 1;
      session.last = { fetchNumber: session.fetchCount, card: cardFor(variant, session.fetchCount, SESSION_JSONRPC_URL) };
      return session.last;
    },
    // Trust on first use: pin whatever the last fetch returned.
    approve() { return session.last ? { ...pinned.approve(session.last.card, { origin: FETCH_ORIGIN }), fetchNumber: session.last.fetchNumber } : null; },
    check(card = session.last?.card) { return pinned.check(card, { origin: FETCH_ORIGIN }); },
  };
  return session;
}

// A small registry for the API: capped, with a time-to-live, oldest evicted first.
export function createSessions({ max = 50, ttlMs = 15 * 60_000, now = Date.now } = {}) {
  const live = new Map(); // id -> { session, touched }
  const sweep = () => {
    for (const [id, e] of live) if (now() - e.touched > ttlMs) live.delete(id);
    while (live.size >= max) live.delete(live.keys().next().value);
  };
  return {
    create(opts) { sweep(); const session = createSession(opts); live.set(session.id, { session, touched: now() }); return session; },
    get(id) {
      const e = live.get(id);
      if (!e || now() - e.touched > ttlMs) return null;
      e.touched = now();
      return e.session;
    },
    delete: (id) => live.delete(id),
    size: () => live.size,
  };
}
