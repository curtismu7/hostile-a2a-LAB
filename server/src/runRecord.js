// Rule 27: the run-observability record for ONE run of this lab (both clients), built with the shared collector (runObservability.js, vendored, never edited).
//
// MOCK only. The rows are the events the lab's server wrote to stdout for this run (decisionLog.js), kept with the very time on their stdout line when they were
// written (the run store, per workspace). Nothing is re-computed and no time is adjusted: if several events share a millisecond they keep that equal time
// and the order they were written in. Time = when the lab computed it; none of it was read from a product log.
//
// Real record: NOT offered. The Run scenario is offline in both modes, and the shared panel has no reader or matcher for this lab's decision lines
// (a matcher would be added to the shared panel first), so there is nothing a Real record could read.
//
// Outcomes: only the pinned client decides anything here (passed = allowed, withheld = refused). Every other row (the specialist serving the card, the
// pinned client's approval, what the generalist built) is `info`, never allowed.
import { createRunObservability } from './runObservability.js';

const PRODUCT = { 'hostile-specialist': 'lab mock: hostile specialist', 'pinned-client': 'lab mock: pinned client', 'generalist-ungoverned': 'lab mock: generalist', 'generalist-behind-pin': 'lab mock: generalist' };

// One stored event -> one simulated row.
export function rowOf(e) {
  const base = { product: PRODUCT[e.actor], at: e.at, detail: { client: e.client, variant: e.variant, stage: e.stage } };
  if (e.actor === 'hostile-specialist') {
    return { ...base, layer: 'resource', outcome: 'info', message: `The hostile specialist served its Agent Card (${e.fetches} fetch${e.fetches > 1 ? 'es' : ''}, card variant ${e.variant}). Serving is not a decision: nothing in A2A discovery inspects the text.`, detail: { ...base.detail, fetches: e.fetches } };
  }
  if (e.actor === 'pinned-client') {
    if (e.outcome === 'approved') return { ...base, layer: 'gateway', outcome: 'info', message: 'The pinned client approved fetch #1 (trust on first use). Approval does not read the content.' };
    const withheld = e.outcome === 'withheld';
    return {
      ...base, layer: 'gateway', outcome: withheld ? 'refused' : 'allowed',
      message: withheld ? `The pinned client withheld the card before the generalist read it: ${e.findings.join(', ')}.` : 'The pinned client passed the card: nothing changed and the scanner flagged nothing.',
      detail: { ...base.detail, findings: e.findings },
    };
  }
  const landed = e.outcome === 'poison-landed';
  return {
    ...base, layer: 'agent', outcome: 'info',
    message: e.outcome === 'no-delegation' ? 'The generalist read the card and had nothing to delegate.' : landed ? 'The generalist read the card and built a delegation message carrying the poison (nothing was sent). Building a message is not a decision.' : 'The generalist read the card and built a clean delegation message (nothing was sent).',
    detail: { ...base.detail, sent: false, poisonLanded: landed },
  };
}

const NONE = (what) => `This lab has no ${what}, so nothing happened in this layer during the run.`;

// `events` are the stored events of one run (stamped, in the order they were written); `runId` is the run's own id.
// The record's window runs from the first event's time to the last; the clock is only used by the collector for an open window, which never happens here.
export async function buildRunRecord({ events, runId }) {
  const rows = events.map(rowOf);
  const times = rows.map((r) => Date.parse(r.at));
  // Rows that share a millisecond keep that equal time; the collector orders such ties by layer (it regroups rows by layer when it applies its row cap), not by the order they were written in. detail.client tells the two clients apart.
  const layers = ['resource', 'gateway', 'agent'].map((layer) => ({ layer, simulated: rows.filter((r) => r.layer === layer) }));
  layers.unshift({ layer: 'person', simulated: [], reason: NONE('sign-in') });
  layers.push({ layer: 'authorize', simulated: [], reason: NONE('PingOne Authorize') }, { layer: 'privilege', simulated: [], reason: NONE('Privilege') });
  return createRunObservability().collectRun({ runId, startedAt: Math.min(...times), endedAt: Math.max(...times), layers, source: 'mock' });
}

// The events of the recent runs, per workspace (the visitor's own scope), each kept with its stdout time. Bounded: nothing here grows without limit.
export function createRunStore({ maxRuns = 20, maxWorkspaces = 100 } = {}) {
  const spaces = new Map();
  return {
    add(workspace, runId, events) {
      if (!spaces.has(workspace)) { if (spaces.size >= maxWorkspaces) spaces.delete(spaces.keys().next().value); spaces.set(workspace, new Map()); }
      const runs = spaces.get(workspace);
      if (!runs.has(runId)) { if (runs.size >= maxRuns) runs.delete(runs.keys().next().value); runs.set(runId, []); }
      runs.get(runId).push(...events);
    },
    get: (workspace, runId) => spaces.get(workspace)?.get(runId) ?? null,
    clear: () => spaces.clear(),
  };
}
