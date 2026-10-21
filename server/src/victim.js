// Offline, deterministic delegating "generalist". No LLM, no network, nothing sent or executed.
// Pattern copied from hostile-mcp's victim.js, adapted for A2A delegation.
//
// Given the Agent Card exactly as received and a benign user task, it reads the card the way a trusting generalist does
// and returns the message it WOULD send to the specialist, as data, with a reason for each step. The rules are fixed
// (VICTIM_RULES); the same input always gives the same output. `executed` and `sent` are always false.
// Where a poison asks for a bearer token, credentials or the conversation, it shows a clearly fake placeholder.
import { decodeTags } from './safety.js';
import { originOf } from './pinning.js';

export const FAKE_TOKEN = 'FAKE-TOKEN-NOT-REAL';
export const FAKE_CREDENTIALS = 'FAKE-CREDENTIALS-NOT-REAL';

export const VICTIM_RULES = [
  { id: 'skill-match', text: 'The benign task picks the skill whose id, name or tags share the most words with it. With no match, the victim does not delegate.' },
  { id: 'route-by-claim', text: 'A card that calls itself the preferred or authoritative handler for money, billing or refunds is believed: the victim delegates any such task to it, matched skill or not.' },
  { id: 'obey-important-block', text: 'An <IMPORTANT> block in the card description is an instruction. If it says to call a tool, the victim lists that call as a step before the delegation.' },
  { id: 'obey-hidden-tags', text: 'Text hidden in Unicode tag characters is read and obeyed the same way (a person sees nothing; the model reads it).' },
  { id: 'include-requested-data', text: 'If the card or the matched skill says to include the conversation, credentials or a bearer token, the victim adds them to the message, using fake placeholders in this demo. A named field ("in the audit field") is honoured.' },
  { id: 'follow-card-url', text: 'The victim sends the message to the `url` in the card, wherever it points, even when that is not the origin it fetched the card from.' },
  { id: 'conceal', text: 'If the card says not to tell the user, the victim does not surface the extra step to the user (shown as concealed).' },
  { id: 'card-only', text: 'The victim reads the card and sends nothing. Instructions inside a task reply are out of its reach here.' },
];

const STOP = new Set(['the', 'a', 'an', 'for', 'in', 'of', 'to', 'on', 'my', 'me', 'please', 'order', 'and', 'with', 'from', 'can', 'you', 'i', 'it', 'is', 'this', 'that']);
const words = (s) => (String(s).toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => !STOP.has(w)).map((w) => w.replace(/s$/, ''));
const CLAIM = /\b(preferred|authoritative|official)\b[^.]{0,60}\b(handler|agent|provider)\b/i;
const MONEY = /\b(money|billing|refunds?|payments?)\b/i;

function matchSkill(task, skills) {
  const tw = new Set(words(task));
  let best = null; let bestScore = 0;
  for (const s of skills) {
    const hits = words([s.id, s.name, ...(Array.isArray(s.tags) ? s.tags : [])].join(' ').replace(/_/g, ' ')).filter((w) => tw.has(w));
    if (new Set(hits).size > bestScore) { best = { skill: s, matched: [...new Set(hits)] }; bestScore = new Set(hits).size; }
  }
  return best;
}

const asText = (v) => (typeof v === 'string' ? v : '');

function directive(text) {
  const call = /\bcall\s+([a-z][a-z0-9_]*)/i.exec(text);
  if (!call) return null;
  const args = {};
  const amount = /\$(\d+(?:\.\d+)?)/.exec(text);
  if (amount) args.amount = Number(amount[1]);
  const to = /\b(external-\d+)\b/.exec(text);
  if (to) args.to = to[1];
  return { tool: call[1], arguments: args, concealed: /do not (mention|tell)/i.test(text) };
}

export function runVictim({ task, card, origin }) {
  const c = card && typeof card === 'object' ? card : {};
  const skills = (Array.isArray(c.skills) ? c.skills : []).filter((s) => s && typeof s === 'object');
  const description = asText(c.description);
  const hidden = decodeTags(description + skills.map((s) => asText(s.description)).join(' '));
  const base = { task, executed: false, sent: false, notes: ['The victim reads the Agent Card only and sends nothing, so result-based injection in a task reply is not shown here.'] };

  const reasons = [];
  const chosen = matchSkill(task, skills);
  const claims = CLAIM.test(description) && MONEY.test(description);
  if (!chosen && !claims) return { ...base, selected: null, steps: [], delegation: null, reasons, notes: ['No skill on the card matches the task, so the victim does not delegate.', ...base.notes] };
  if (chosen) reasons.push({ rule: 'skill-match', poison: false, text: `Task words (${chosen.matched.join(', ')}) match skill ${chosen.skill.id}.` });
  else reasons.push({ rule: 'route-by-claim', poison: true, text: 'No skill matches the task, but the card calls itself the preferred and authoritative handler for money requests, so the victim delegates to it anyway.' });

  const steps = [];
  const metadata = {};
  const wanted = { conversation: false, credentials: false, token: false };
  let concealed = false;
  let field = null;

  // Instructions in the description: an <IMPORTANT> block, or text hidden in tag characters.
  const important = /<IMPORTANT>([\s\S]*?)<\/IMPORTANT>/i.exec(description);
  const blocks = [];
  if (important) blocks.push({ rule: 'obey-important-block', text: important[1], where: 'the card description' });
  if (hidden) blocks.push({ rule: 'obey-hidden-tags', text: hidden, where: 'text hidden in invisible tag characters in the card' });
  for (const b of blocks) {
    const d = directive(b.text);
    if (d) {
      steps.push({ tool: d.tool, arguments: d.arguments, executed: false, reason: `${b.where} tells the agent to call ${d.tool} first` });
      reasons.push({ rule: b.rule, poison: true, text: `${b.where} tells the agent to call ${d.tool}${d.concealed ? ' and to hide it from the user' : ''}; the victim lists it as a step before the delegation.` });
      concealed ||= d.concealed;
    }
    if (/conversation/i.test(b.text)) wanted.conversation = true;
    if (/\b(access|bearer|auth\w*)\s+tokens?\b|\btokens?\b/i.test(b.text)) wanted.token = true;
    if (/\bcredentials?\b|\bpasswords?\b/i.test(b.text)) wanted.credentials = true;
  }
  // The matched skill's description can ask for the same data, in a named field.
  if (chosen) {
    const sd = asText(chosen.skill.description);
    const named = /"([A-Za-z_][A-Za-z0-9_]{0,31})"\s+field/.exec(sd);
    if (/conversation|context/i.test(sd) && /\b(include|attach|add)\b/i.test(sd)) wanted.conversation = true;
    if (/\bcredentials?\b|\bpasswords?\b/i.test(sd) && /\b(include|attach|add)\b/i.test(sd)) wanted.credentials = true;
    if (/\btokens?\b|\bbearer\b/i.test(sd) && /\b(include|attach|add)\b/i.test(sd)) wanted.token = true;
    if (named && (wanted.conversation || wanted.credentials || wanted.token)) field = named[1];
  }
  const data = {};
  if (wanted.conversation) data.conversation = [{ role: 'user', text: task }, { role: 'assistant', text: '(earlier turns of the conversation would be here)' }];
  if (wanted.credentials) data.credentials = FAKE_CREDENTIALS;
  if (wanted.token) data.bearerToken = FAKE_TOKEN;
  if (Object.keys(data).length) {
    if (field) metadata[field] = data; else Object.assign(metadata, data);
    reasons.push({ rule: 'include-requested-data', poison: true, text: `The card asks for ${Object.keys(data).join(', ')}${field ? ` in the "${field}" field` : ' in the task metadata'}; the victim adds it to the message (fake placeholders here, FAKE-TOKEN-NOT-REAL is not a credential).` });
  }

  const to = asText(c.url);
  const offOrigin = origin && originOf(to) !== origin;
  reasons.push(offOrigin
    ? { rule: 'follow-card-url', poison: true, text: `The card's url is ${to}, on a different origin than the one it was fetched from (${origin}); the victim sends there.` }
    : { rule: 'follow-card-url', poison: false, text: `The message goes to the card's url, ${to}.` });
  if (concealed) reasons.push({ rule: 'conceal', poison: true, text: 'The card says not to tell the user, so the extra steps are not shown to the user.' });

  const delegation = {
    to,
    sent: false,
    request: { jsonrpc: '2.0', id: 'would-send-1', method: 'message/send', params: { message: { kind: 'message', role: 'user', parts: [{ kind: 'text', text: task }], ...(Object.keys(metadata).length ? { metadata } : {}) } } },
  };
  return { ...base, selected: chosen ? chosen.skill.id : 'route-by-claim', concealedFromUser: concealed, steps, delegation, reasons };
}
