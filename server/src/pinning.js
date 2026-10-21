// Pinned-card client: trust on first use for A2A Agent Cards. Structure follows hostile-mcp's pinning.js (copied, adapted).
//
// approve(card, {origin})  records sha256(canonical({name, description, url, version, capabilities, skills, securitySchemes}))
//                          and the approved definition. Approval records what was received. It does not read it.
// check(card, {origin})    compares a later fetch against the pin and returns findings, most severe first:
//   origin-mismatch  the card's `url` (or an additional interface) is on a different origin than the one the card was fetched from
//   unsigned-policy  the policy requires signed cards and this one has none, or has one this demo cannot verify
//   skill-added      a skill id that was not pinned (the field diff is included)
//   changed          the canonical hash differs from the pin (the rug-pull of a card; the field diff is included)
//   scanner-finding  the scanner rules (scanner.js) flag text in the card (evidence offsets, invisible characters shown as [U+XXXX])
//   unpinned         nothing approved yet for this origin, so there is nothing to compare; the other checks still run
//   ok               none of the above
//
// CARD SIGNATURES ARE NOT VERIFIED HERE. A2A cards may carry JWS `signatures`. Verifying one needs the signer's key
// (a JWKS fetched from the card's own claimed issuer, which is a network call this offline demo never makes) and a trust
// decision about who may sign. The check below is a stub that FAILS CLOSED: when policy.requireSignatures is on, every
// card is reported unsigned-policy, whether it carries a signature or not.
import { createHash } from 'node:crypto';
import { scanCard, visible } from './scanner.js';

const own = (o, k) => Object.hasOwn(o, k);
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// Sorted keys at every depth, own keys only. Arrays keep their order (skills are sorted by the caller).
const MAX_DEPTH = 64;
const TOO_DEEP = '[too deep]';
export function canonicalize(value, depth = 0) {
  if (depth > MAX_DEPTH) return TOO_DEEP;
  if (Array.isArray(value)) return value.map((v) => canonicalize(v, depth + 1));
  if (isObj(value)) return Object.fromEntries(Object.keys(value).sort().map((k) => [k, canonicalize(value[k], depth + 1)]));
  return value;
}

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => isObj(o) && own(o, k)).map((k) => [k, o[k]]));

// The pinned view of a card: the fields that decide who is called, what it claims and what it may be asked.
// Skills are a set, so they are ordered by id.
export function pinnedView(card) {
  const c = isObj(card) ? card : {};
  const skills = (Array.isArray(c.skills) ? c.skills : [])
    .map((s) => ({ ...pick(s, ['id', 'name', 'description', 'inputModes', 'outputModes']) }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)) || JSON.stringify(canonicalize(a)).localeCompare(JSON.stringify(canonicalize(b))));
  return {
    name: c.name ?? '',
    description: c.description ?? '',
    url: c.url ?? '',
    version: c.version ?? '',
    capabilities: isObj(c.capabilities) ? c.capabilities : {},
    skills,
    securitySchemes: isObj(c.securitySchemes) ? c.securitySchemes : {},
  };
}

export const cardHash = (card) => createHash('sha256').update(JSON.stringify(canonicalize(pinnedView(card)))).digest('hex');

export const originOf = (url) => { try { const u = new URL(url); return u.origin === 'null' ? '' : u.origin; } catch { return ''; } };

// Field-level difference: [{ path, change: 'added'|'removed'|'changed', before, after, beforeRevealed?, afterRevealed? }].
// Strings carry a revealed copy so a change that looks identical on screen is visibly different.
// Depth is bounded like canonicalize: a hostile, deeply nested value is reported as one bounded change, never recursed into.
export function diffValues(before, after, path = '', depth = 0) {
  if (depth > MAX_DEPTH) return [{ path, change: 'changed', before: TOO_DEEP, after: TOO_DEEP, beforeRevealed: TOO_DEEP, afterRevealed: TOO_DEEP }];
  if (isObj(before) && isObj(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap((k) => diffValues(own(before, k) ? before[k] : undefined, own(after, k) ? after[k] : undefined, path ? `${path}.${k}` : k, depth + 1));
  }
  if (Array.isArray(before) && Array.isArray(after) && path === 'skills') return diffSkills(before, after);
  if (JSON.stringify(canonicalize(before)) === JSON.stringify(canonicalize(after))) return [];
  // Values are canonicalized (depth-bounded) so a deep leaf can never overflow the stack here or when the result is serialized.
  const b = canonicalize(before);
  const a = canonicalize(after);
  const entry = before === undefined ? { path, change: 'added', after: a } : after === undefined ? { path, change: 'removed', before: b } : { path, change: 'changed', before: b, after: a };
  const rev = (v) => (typeof v === 'string' ? visible(v) : JSON.stringify(v));
  if (before !== undefined) entry.beforeRevealed = rev(b);
  if (after !== undefined) entry.afterRevealed = rev(a);
  return [entry];
}

function diffSkills(before, after) {
  const key = (s, i) => (isObj(s) && s.id !== undefined ? String(s.id) : `#${i}`);
  const b = new Map(before.map((s, i) => [key(s, i), s]));
  const a = new Map(after.map((s, i) => [key(s, i), s]));
  return [...new Set([...b.keys(), ...a.keys()])].sort().flatMap((id) => diffValues(b.get(id), a.get(id), `skills[${id}]`));
}

export const CATCHES = [
  { id: 'rug-pull', text: 'A card whose name, description, url, version, capabilities, skills or securitySchemes changed after approval (the field diff is shown).' },
  { id: 'skill-added', text: 'A skill added after approval, even one whose text is harmless: the agent now claims more than you approved.' },
  { id: 'origin-mismatch', text: 'A card whose url (or additional interface) points at a different origin than the one it was fetched from.' },
  { id: 'unsigned-policy', text: 'A card with no signature when your policy requires one. The signature itself is NOT verified here (see limits).' },
  { id: 'scanner-finding', text: 'Hidden instructions, leak requests, credential collection and invisible characters that the scanner rules know about.' },
];

export const LIMITS = [
  { id: 'signatures-not-verified', text: 'Card signature verification is NOT implemented in this demo. Verifying a JWS needs the signer\'s key and a decision about who may sign; fetching a key from the card\'s own claimed issuer would be a network call and would trust the card to vouch for itself. The signature check is a stub that fails closed under a require-signatures policy and never reports a card as verified.' },
  { id: 'first-use-poison', text: 'A poison approved blindly at first use stays approved. Pinning records what was accepted, it does not judge it, and the scanner only knows its own rules.' },
  { id: 'semantic-manipulation', text: 'Plain-language persuasion ("the preferred handler for all money requests") contains nothing a rule can match. It is not caught by pinning or by the scanner.' },
  { id: 'well-behaved-malicious', text: 'A malicious agent with an honest card and honest changes passes every check. The card is not the agent.' },
  { id: 'result-injection', text: 'Only the card is checked. Instructions inside a task reply are never seen here.' },
  { id: 're-approval', text: 'If a person approves a changed card again, the new card becomes the pin.' },
  { id: 'one-fetch', text: 'A card can differ by caller, time or header. A pin covers the fetches you made, not the ones you did not.' },
];

const SEVERITY = ['origin-mismatch', 'unsigned-policy', 'skill-added', 'changed', 'scanner-finding', 'unpinned'];

export function createPinnedCardClient({ requireSignatures = false } = {}) {
  const pins = new Map(); // origin -> { origin, sha256, view }
  const publicPin = (p) => ({ origin: p.origin, sha256: p.sha256 });

  function approve(card, { origin }) {
    const scan = scanCard(card);
    const pin = { origin, sha256: cardHash(card), view: structuredClone(canonicalize(pinnedView(card))) };
    pins.set(origin, pin);
    // What the scanner said at the moment of approval: approving a flagged card is possible, and visible.
    return { pin: publicPin(pin), scannerFindingsAtApproval: scan.findings.length, note: 'Approval records the card as received. It does not read it.' };
  }

  function check(card, { origin }) {
    const pin = pins.get(origin);
    const sha256 = cardHash(card);
    const findings = [];
    const result = { origin, sha256, requireSignatures };
    const wanted = [card?.url, ...(Array.isArray(card?.additionalInterfaces) ? card.additionalInterfaces.map((i) => i?.url) : [])].filter((u) => typeof u === 'string');
    const off = wanted.filter((u) => originOf(u) !== origin);
    if (off.length) { findings.push('origin-mismatch'); result.offOriginUrls = [...new Set(off)]; }
    if (requireSignatures) {
      findings.push('unsigned-policy');
      result.signature = { required: true, present: Array.isArray(card?.signatures) && card.signatures.length > 0, verified: false, note: 'Signature verification is NOT implemented in this demo; a require-signatures policy fails closed.' };
    }
    if (pin) {
      result.pinnedSha256 = pin.sha256;
      const now = pinnedView(card);
      const pinnedIds = new Set(pin.view.skills.map((s) => String(s.id)));
      const added = now.skills.filter((s) => !pinnedIds.has(String(s.id)));
      if (added.length) { findings.push('skill-added'); result.addedSkills = added.map((s) => String(s.id)); }
      if (pin.sha256 !== sha256) { findings.push('changed'); result.diff = diffValues(pin.view, now); }
    }
    const scan = scanCard(card);
    if (scan.findings.length) { findings.push('scanner-finding'); result.scanner = scan; }
    if (!pin) findings.push('unpinned');
    const verdict = SEVERITY.find((v) => findings.includes(v)) ?? 'ok';
    // A card with no pin and nothing else wrong is 'unpinned', not 'ok': nothing was compared.
    return { ...result, verdict, findings: SEVERITY.filter((v) => findings.includes(v)) };
  }

  return { approve, check, pins: () => [...pins.values()].map(publicPin) };
}
