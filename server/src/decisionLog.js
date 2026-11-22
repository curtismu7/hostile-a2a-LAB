// Rule 27: the lab's own server logs what it did for a run, one timestamped line per event to stdout: actor and outcome, never a token, a card text or a task.
// Only ids this lab itself defines go in (the card variant id, the stage, the client, the pin and scanner finding ids), so a line holds nothing an attacker wrote.
//   2026-11-22T10:00:00.000Z hostile-a2a event actor=pinned-client outcome=withheld client=pinned variant=rug-pull stage=later findings=changed,scanner-finding
// The decisions are the pinned client's approval and verdict; the other lines (the specialist serving the card, what the generalist did) are steps, not decisions.
export const stdoutSink = (line) => process.stdout.write(`${line}\n`);

// The events one runScenario() result holds, in the order the mock computed them. One run-victim call computes them all at once, so they share one time.
export function eventsOf(run) {
  const client = run.mode;
  const out = [{ actor: 'hostile-specialist', outcome: 'served', client, fetches: run.stage === 'later' ? 2 : 1 }];
  if (run.pinned) {
    out.push({ actor: 'pinned-client', outcome: 'approved', client });
    out.push({ actor: 'pinned-client', outcome: run.pinned.withheld ? 'withheld' : 'passed', client, findings: run.pinned.check.findings });
  }
  if (!run.pinned?.withheld) {
    out.push({ actor: run.mode === 'pinned' ? 'generalist-behind-pin' : 'generalist-ungoverned', outcome: run.summary.poisonLanded ? 'poison-landed' : run.victim.delegation ? 'delegated' : 'no-delegation', client });
  }
  return out;
}

export const lineOf = (e) => {
  const extra = [e.client && `client=${e.client}`, e.fetches && `fetches=${e.fetches}`, `variant=${e.variant}`, `stage=${e.stage}`, e.findings?.length && `findings=${e.findings.join(',')}`].filter(Boolean).join(' ');
  return `${e.at} hostile-a2a event actor=${e.actor} outcome=${e.outcome} ${extra}`;
};

// Stamps the events with one time (an ISO string), writes each as a line and returns the stamped events (what the run store keeps and the record is built from).
export function logEvents(sink, events, { variant, stage, at }) {
  const stamped = events.map((e) => ({ ...e, variant, stage, at }));
  for (const e of stamped) sink(lineOf(e));
  return stamped;
}
