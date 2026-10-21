// Agent Card scanner. The rule table and the text patterns are COPIED from /Users/cmuir/Development/mcp-tools
// (server/src/scanner/rules.js and engine.js, which derive from AI-DEMO2 standalone/mcp-scanner, MIT). Rule ids and
// severities are the same; only the rules that apply to card text are kept (hidden-instruction, exfil-sink,
// credential-harvest, sensitive-action, unicode tricks, scan-truncated). Not imported across repos.
//
// What it reads: the card `description` and each skill `description` (instruction, leak, credential and fund-moving
// rules), plus every other string in the card for invisible/bidi/look-alike characters. It reports evidence offsets
// into the ORIGINAL string and shows invisible characters as [U+XXXX]. It never blocks anything.
// A size, depth and count budget turns hostile input into a "scan truncated" finding, not a crash.
import { unicodeHits, visible } from './scanner-unicode.js';

export const RULES = {
  'MT-HI-001': { severity: 'high', kind: 'hidden-instruction', title: 'Instruction tag in metadata (<IMPORTANT>, <SYSTEM>, ...)' },
  'MT-HI-002': { severity: 'high', kind: 'hidden-instruction', title: 'Metadata tells the agent to hide something from the user' },
  'MT-HI-003': { severity: 'high', kind: 'hidden-instruction', title: 'Agent-directed imperative smuggled into metadata' },
  'MT-EX-002': { severity: 'warn', kind: 'exfil-sink', title: 'Argument or skill text asks for sensitive context (credentials, tokens, full conversation)' },
  'MT-CR-001': { severity: 'high', kind: 'credential-harvest', title: 'Text tells the agent to collect passwords, codes or secrets' },
  'MT-SA-001': { severity: 'warn', kind: 'sensitive-action', title: 'Content points the agent at a payment or fund-moving action' },
  'MT-SA-002': { severity: 'high', kind: 'sensitive-action', title: 'Content tells the agent to bypass approval or consent' },
  'MT-UC-001': { severity: 'high', kind: 'unicode-trick', title: 'Bidirectional control characters' },
  'MT-UC-002': { severity: 'warn', kind: 'unicode-trick', title: 'Zero-width or other invisible characters' },
  'MT-UC-003': { severity: 'high', kind: 'unicode-trick', title: 'Unicode tag characters (invisible ASCII smuggling)' },
  'MT-UC-004': { severity: 'warn', kind: 'unicode-trick', title: 'Mixed-script word (Latin with Cyrillic or Greek look-alikes)' },
  'MT-LM-001': { severity: 'warn', kind: 'scan-truncated', title: 'Scan truncated: input exceeded a size, depth or count budget' },
};

const INSTRUCTION_TAG = /<\/?\s*(important|system|secret|instructions?|admin)\s*>/i;
const SECRECY = /\bdo not (tell|mention|inform|reveal|disclose|notify)\b/i;
const AGENT_IMPERATIVE = /\b(ignore (all )?previous|before (calling|using) (any|another) tool|you must (always|first)|always call)\b/i;
const LEAK_HINT = /\b(full (conversation )?context|credentials?|api[- ]?keys?|secrets?|passwords?|bearer|auth(entication)? tokens?|tokens?)\b/i;
const SENSITIVE_ACTION = /\b(transfer|payment|payout|wire|remit)\b/i;
const APPROVAL_BYPASS = /\b(bypass|skip|without|no)\b[^.\n]{0,40}\b(approval|consent|authorization)\b/i;
const CRED_COLLECT = /\b(collect|gather|ask for|request|obtain|prompt for|include|send|provide)\b[^.\n]{0,60}\b(passwords?|passcodes?|one[- ]time (code|pass\w*)|otp|mfa (code|token)|credentials?|secrets?|api[- ]?keys?|bearer tokens?)\b/i;
const TEXT_RULES = [
  ['MT-HI-001', INSTRUCTION_TAG], ['MT-HI-002', SECRECY], ['MT-HI-003', AGENT_IMPERATIVE],
  ['MT-EX-002', LEAK_HINT], ['MT-CR-001', CRED_COLLECT], ['MT-SA-001', SENSITIVE_ACTION], ['MT-SA-002', APPROVAL_BYPASS],
];

export const DEFAULT_BUDGET = { maxDepth: 32, maxNodes: 20_000, maxChars: 1_048_576, maxStringChars: 20_000, maxFindings: 200 };

// What a scan of a card does NOT catch.
export const SCAN_LIMITS = [
  { id: 'result-injection', text: 'Result-based injection: a clean card whose task replies carry the instruction. The scan reads the card, never a reply.' },
  { id: 'novel-phrasing', text: 'The rules are heuristics over known poisoning shapes. Plain-language persuasion, another language, or an instruction split across fields can slip past, and an unusually worded honest card can trip a flag.' },
  { id: 'well-behaved', text: 'A malicious agent with an honest card. The card says nothing wrong; what the agent does with the work is invisible here.' },
  { id: 'clean-is-not-safe', text: 'A clean scan is not proof of safety. It does not judge who runs the agent or whether it should be trusted at all.' },
  { id: 'reports-only', text: 'The scanner reports. It never blocks an agent, changes a card, or stops a delegation.' },
];

const fieldName = (path) => path.map((p, i) => (typeof p === 'number' ? `[${p}]` : `${i ? '.' : ''}${p}`)).join('');

export function scanCard(card, opts = {}) {
  const budget = { ...DEFAULT_BUDGET, ...opts };
  const findings = [];
  const truncated = new Map();
  const used = { nodes: 0, chars: 0 };
  let capped = false;
  if (!card || typeof card !== 'object' || Array.isArray(card)) return { findings, truncated: false };

  const add = (ruleId, subject, detail, { field, start = 0, end = 0, text = '' }) => {
    if (findings.length >= budget.maxFindings) { capped = true; return; }
    const rule = RULES[ruleId];
    findings.push({ ruleId, severity: rule.severity, kind: rule.kind, subject, detail, evidence: [{ field, start, end, excerpt: visible(text.slice(start, Math.min(end, start + 200))) }] });
  };
  const cut = (reason, where) => {
    const t = truncated.get(reason) || { count: 0, first: where };
    t.count += 1;
    truncated.set(reason, t);
  };

  // textual: run the instruction/leak rules too. Every string gets the unicode checks.
  function check(text, { subject, path, textual }) {
    const field = fieldName(path);
    let s = text;
    if (s.length > budget.maxStringChars) { cut('string', `${subject} ${field}`); s = s.slice(0, budget.maxStringChars); }
    for (const h of unicodeHits(s)) add(h.ruleId, subject, h.detail, { field, start: h.start, end: h.end, text: s });
    if (!textual) return;
    for (const [id, re] of TEXT_RULES) {
      const m = re.exec(s);
      if (m) add(id, subject, `${RULES[id].title}: "${visible(m[0])}"`, { field, start: m.index, end: m.index + m[0].length, text: s });
    }
  }

  const textual = (path) => path.length === 1 && path[0] === 'description'
    || (path.length === 3 && path[0] === 'skills' && path[2] === 'description');
  const subjectOf = (path) => (path[0] === 'skills' ? `skill:${card.skills?.[path[1]]?.id || card.skills?.[path[1]]?.name || `#${path[1]}`}` : `card:${typeof card.name === 'string' ? card.name : 'agent'}`);

  function walk(value, path, depth, ancestors) {
    if (used.nodes >= budget.maxNodes) { cut('nodes', fieldName(path)); return; }
    used.nodes += 1;
    if (typeof value === 'string') {
      used.chars += value.length;
      if (used.chars > budget.maxChars) { cut('chars', fieldName(path)); return; }
      check(value, { subject: subjectOf(path), path, textual: textual(path) });
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (depth >= budget.maxDepth) { cut('depth', fieldName(path)); return; }
    if (ancestors.has(value)) { cut('cycle', fieldName(path)); return; }
    ancestors.add(value);
    const keys = Array.isArray(value) ? value.keys() : Object.keys(value);
    for (const k of keys) {
      if (used.nodes >= budget.maxNodes) { cut('nodes', fieldName(path)); break; }
      if (typeof k === 'string') { for (const h of unicodeHits(k)) add(h.ruleId, subjectOf(path), `field name: ${h.detail}`, { field: fieldName([...path, k]), start: h.start, end: h.end, text: k }); }
      walk(value[k], [...path, k], depth + 1, ancestors);
    }
    ancestors.delete(value);
  }
  walk(card, [], 0, new Set());

  const what = { depth: `nesting deeper than ${budget.maxDepth} levels`, nodes: `more than ${budget.maxNodes} values`, chars: `more than ${budget.maxChars} characters in total`, string: `a string longer than ${budget.maxStringChars} characters`, cycle: 'a cyclic reference' };
  for (const [reason, t] of truncated) {
    findings.push({ ruleId: 'MT-LM-001', severity: 'warn', kind: 'scan-truncated', subject: 'scan', detail: `scan truncated: ${what[reason]} (${t.count} place(s), first at ${t.first || 'the top'}); the rest of that input was NOT scanned`, evidence: [] });
  }
  if (capped) findings.push({ ruleId: 'MT-LM-001', severity: 'warn', kind: 'scan-truncated', subject: 'scan', detail: `scan truncated: more than ${budget.maxFindings} findings; later ones were dropped`, evidence: [] });
  return { findings, truncated: truncated.size > 0 || capped };
}

export { visible };
