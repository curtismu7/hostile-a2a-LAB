// Rule 27: the lab's own server logs each decision it makes, one timestamped line to stdout: actor and outcome, never a token, a card text or a task.
// Only ids this lab itself defines go in (the card variant id, the stage, the pin and scanner finding ids), so a line holds nothing an attacker wrote.
//   2026-11-22T10:00:00.000Z hostile-a2a decision actor=pinned-client outcome=withheld variant=rug-pull stage=later findings=changed,scanner-finding
export const stdoutSink = (line) => process.stdout.write(`${line}\n`);

// The decisions one runScenario() result holds: the pinned client's verdict (pinned runs only) and the generalist's (when it saw the card).
export function decisionsOf(run) {
  const out = [];
  if (run.mode === 'pinned') {
    out.push({ actor: 'pinned-client', outcome: run.pinned.withheld ? 'withheld' : 'passed', findings: run.pinned.check.findings });
  }
  if (!run.pinned?.withheld) {
    const outcome = run.summary.poisonLanded ? 'poison-landed' : run.victim.delegation ? 'delegated' : 'no-delegation';
    out.push({ actor: run.mode === 'pinned' ? 'generalist-behind-pin' : 'generalist-ungoverned', outcome });
  }
  return out;
}

export function logDecisions(sink, decisions, { variant, stage, now = () => new Date() }) {
  for (const d of decisions) {
    const findings = d.findings?.length ? ` findings=${d.findings.join(',')}` : '';
    sink(`${now().toISOString()} hostile-a2a decision actor=${d.actor} outcome=${d.outcome} variant=${variant} stage=${stage}${findings}`);
  }
}
