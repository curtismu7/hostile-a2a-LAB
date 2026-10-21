// POST /api/run-victim: one deterministic story, run two ways.
//
//   ungoverned: the client takes whatever card it fetched and hands it to the victim.
//   pinned:     the client approved fetch #1 (trust on first use), checks the card it is about to use, and withholds it
//               from the victim unless the verdict is ok.
//
// stage 'later' (default) is the next time the card is fetched (#2); stage 'first' is the day of approval (#1).
import { FETCH_ORIGIN } from './card.js';
import { cardHash } from './pinning.js';
import { createSession } from './session.js';
import { runVictim } from './victim.js';
import { visible } from './scanner.js';

export const seen = (card) => ({
  name: card.name,
  url: card.url,
  version: card.version,
  sha256: cardHash(card).slice(0, 12),
  description: card.description ?? '',
  descriptionRevealed: visible(card.description ?? ''),
  skills: (card.skills || []).map((s) => ({ id: s.id, name: s.name, description: s.description ?? '', descriptionRevealed: visible(s.description ?? '') })),
});

export function runScenario({ task, mode, stage = 'later', variant = 'rug-pull', requireSignatures = false }) {
  const session = createSession({ variant, requireSignatures: mode === 'pinned' && requireSignatures });
  const trace = [];
  const step = (what, detail) => trace.push({ step: trace.length + 1, what, ...(detail ? { detail } : {}) });
  step('Discover the specialist: GET its well-known Agent Card path', `Card origin ${FETCH_ORIGIN}`);

  let fetched = session.getCard();
  step(`Card fetch #${fetched.fetchNumber}`, `${fetched.card.skills.length} skill(s) received. Nothing in A2A discovery inspected the text.`);
  let approval = null;
  if (mode === 'pinned') {
    approval = session.approve();
    step('Approve fetch #1 (trust on first use)', `Pinned ${approval.pin.sha256.slice(0, 12)}. Approval does not read the content.`);
  }
  if (stage === 'later') {
    fetched = session.getCard();
    step(`Card fetch #${fetched.fetchNumber} (the next time the card is fetched)`, `${fetched.card.skills.length} skill(s) received.`);
  }

  let check = null;
  let withheld = false;
  if (mode === 'pinned') {
    check = session.check(fetched.card);
    withheld = check.verdict !== 'ok';
    step('Check against the pin and the scanner rules', withheld ? `Withheld: ${check.findings.join(', ')}` : 'Nothing changed, nothing flagged');
  }
  const victim = withheld
    ? { task, executed: false, sent: false, selected: null, steps: [], delegation: null, reasons: [], notes: ['The pinned client withheld this card, so the victim never saw it and delegated nothing.'] }
    : runVictim({ task, card: fetched.card, origin: FETCH_ORIGIN });
  step('The victim reads the card and decides', victim.delegation ? `Would send to ${victim.delegation.to}${victim.steps.length ? ` after ${victim.steps.map((s) => s.tool).join(', ')}` : ''}` : 'No delegation');

  return {
    mode, stage, variant, task, trace,
    cardSeen: seen(fetched.card),
    pinned: mode === 'pinned' ? { origin: FETCH_ORIGIN, approval, check, withheld } : null,
    victim,
    summary: { poisonLanded: victim.reasons.some((r) => r.poison), withheld },
  };
}
