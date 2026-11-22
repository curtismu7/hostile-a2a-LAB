// Rule 27: the run-observability record for ONE run of this lab (both clients), built with the shared collector (runObservability.js, vendored, never edited).
//
// MOCK only. Every row is computed from what this lab's mock actually did on this run (the scenario result of each client: the card fetches,
// the pinned client's verdict, the generalist's decision), stamped with the time the server built it (1 ms apart where the mock computed them in the same millisecond). No event is added that the mock did not compute.
// Real is NOT offered: this lab has no live version (GET /api/info says realAvailable false), so there is no Real record to build.
//
// What is not here, and why each layer says "not logged":
//   person, authorize, privilege : this lab has no sign-in, no PingOne Authorize and no Privilege in the run.
import { createRunObservability } from './runObservability.js';
import { runScenario } from './scenario.js';

const PRODUCT = { specialist: 'lab mock: hostile specialist', pinned: 'lab mock: pinned client', generalist: 'lab mock: generalist' };

// The events one client's scenario result holds, in the order the mock computed them.
function eventsOf(run, at) {
  const ev = [];
  const fetches = run.stage === 'later' ? 2 : 1;
  const served = (n) => ev.push({ layer: 'resource', product: PRODUCT.specialist, outcome: 'allowed', at: at(), message: `The hostile specialist served its Agent Card (fetch #${n}, card variant ${run.variant}). Nothing in A2A discovery inspects the text.`, detail: { client: run.mode, fetch: n, variant: run.variant } });
  served(1);
  if (run.pinned) ev.push({ layer: 'gateway', product: PRODUCT.pinned, outcome: 'info', at: at(), message: 'The pinned client approved fetch #1 (trust on first use). Approval does not read the content.', detail: { client: run.mode, sha256: run.pinned.approval.pin.sha256.slice(0, 12) } });
  if (fetches === 2) served(2);
  if (run.pinned) {
    const { check, withheld } = run.pinned;
    ev.push({
      layer: 'gateway', product: PRODUCT.pinned, outcome: withheld ? 'refused' : 'allowed', at: at(),
      message: withheld ? `The pinned client withheld the card before the generalist read it: ${check.findings.join(', ')}.` : 'The pinned client passed the card: nothing changed and the scanner flagged nothing.',
      detail: { client: run.mode, verdict: check.verdict, findings: check.findings },
    });
  }
  if (!run.pinned?.withheld) {
    const d = run.victim.delegation;
    const landed = run.summary.poisonLanded;
    ev.push({
      layer: 'agent', product: PRODUCT.generalist, outcome: d ? 'allowed' : 'info', at: at(),
      message: !d ? 'The generalist read the card and had nothing to delegate.' : landed ? 'The generalist read the card and built a delegation message carrying the poison (nothing was sent).' : 'The generalist read the card and built a clean delegation message (nothing was sent).',
      detail: { client: run.mode, sent: false, poisonLanded: landed, steps: run.victim.steps.length },
    });
  }
  return ev;
}

const NONE = (what) => `This lab has no ${what}, so nothing happened in this layer during the run.`;

// `body` is the validated run-victim body ({ task, stage, variant, requireSignatures }); `clock` is injectable for tests.
export async function buildRunRecord({ body, clock = () => Date.now(), runId = `run-${clock().toString(36)}` }) {
  const startedAt = clock();
  const runs = ['ungoverned', 'pinned'].map((mode) => runScenario({ ...body, mode, requireSignatures: mode === 'pinned' && body.requireSignatures === true }));
  // Events are computed within the same millisecond: each stamp is the clock, moved forward 1 ms when needed so the time order is the order the mock computed them in.
  let last = 0;
  const at = () => new Date((last = Math.max(clock(), last + 1))).toISOString();
  const events = runs.flatMap((r) => eventsOf(r, at));
  const simulated = (layer) => events.filter((e) => e.layer === layer);
  const layers = [
    { layer: 'person', simulated: [], reason: NONE('sign-in') },
    { layer: 'agent', simulated: simulated('agent') },
    { layer: 'authorize', simulated: [], reason: NONE('PingOne Authorize') },
    { layer: 'privilege', simulated: [], reason: NONE('Privilege') },
    { layer: 'gateway', simulated: simulated('gateway') },
    { layer: 'resource', simulated: simulated('resource') },
  ];
  return createRunObservability({ clock }).collectRun({ runId, startedAt, endedAt: Math.max(clock(), last), layers, source: 'mock' });
}
