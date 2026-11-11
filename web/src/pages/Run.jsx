// Structure copied from hostile-mcp (web/src/pages/Run.jsx), adapted: one Agent Card, a delegating generalist that
// returns the message it WOULD send, and an ungoverned and a pinned client side by side.
import React, { useState } from "react";
import { runVictim } from "../lib/api.js";
import { Revealed, Untrusted, pretty } from "../lib/Untrusted.jsx";
import StoryPanel from "../story/StoryPanel.jsx";

export const TASKS = [
  { text: "Please refund my last order", note: "matches the refund skill" },
  { text: "Sort out my billing", note: "matches no skill" },
  { text: "Export a receipt for my refund", note: "matches the receipt skill" },
];
// Each poison is a card variant the server serves. `unsigned` is the clean card under a require-signatures policy.
export const POISONS = [
  { id: "poisoned", label: "Poisoned description and refund skill", task: 0 },
  { id: "hidden-characters", label: "Instruction hidden in invisible characters", task: 0 },
  { id: "plain-language", label: "Plain-language steering", task: 1 },
  { id: "rug-pull", label: "Clean first, poisoned later (rug-pull)", task: 0 },
  { id: "hidden-rug-pull", label: "Clean first, invisible change later", task: 0 },
  { id: "skill-added", label: "A skill added later", task: 2 },
  { id: "origin-mismatch", label: "The url moves to another origin later", task: 0 },
  { id: "unsigned", label: "Clean but unsigned, signatures required", task: 0 },
  { id: "clean", label: "A clean card (an honest card, for comparison)", task: 0 },
];
const STAGES = [["first", "Day one: the card as first fetched"], ["later", "Later: the next fetch of the card"]];

const FINDING_TEXT = {
  "origin-mismatch": "the card's url is not on the origin it was fetched from",
  "unsigned-policy": "the policy requires a signed card (signature verification is NOT implemented here, so this always fails closed)",
  "skill-added": "a skill was added after approval",
  changed: "the card changed since it was approved",
  "scanner-finding": "the scanner rules found instructions, a leak request or hidden characters",
  unpinned: "nothing was approved yet, so there was nothing to compare",
};
const PIN_IDS = ["origin-mismatch", "unsigned-policy", "skill-added", "changed"];

export function outcome(run, other) {
  if (run.summary.poisonLanded) return { id: "landed", label: "POISON LANDED", level: "deny" };
  if (run.mode === "pinned" && run.summary.withheld) {
    return other?.summary.poisonLanded ? { id: "blocked", label: "BLOCKED", level: "ok" } : { id: "withheld", label: "WITHHELD BY POLICY", level: "hold" };
  }
  return { id: "clean", label: "NO POISON LANDED", level: "ok" };
}

function explain(run, result) {
  const found = run.victim.reasons.find((r) => r.poison);
  const poison = found && { text: found.text.charAt(0).toUpperCase() + found.text.slice(1) };
  if (result.id === "landed") {
    return run.mode === "pinned"
      ? `Neither the pin nor the scanner had anything to flag, so the card went through. ${poison.text}`
      : `Nothing checked the card, so the generalist read it as trusted. ${poison.text}`;
  }
  if (result.id === "clean") return "No poison reached the generalist in this run. That does not mean the agent is safe, only that this card, task and stage did not trigger one.";
  const findings = run.pinned.check.findings;
  const why = findings.map((f) => `${f} (${PIN_IDS.includes(f) ? "pin" : "scanner"}: ${FINDING_TEXT[f]})`).join("; ");
  if (result.id === "blocked") return `The pinned client withheld the card before the generalist read it: ${why}. No message was built.`;
  if (result.id === "withheld") return `The pinned client withheld the card: ${why}. The ungoverned client would have sent nothing harmful here either; this is the policy working, not a poison stopped.`;
  return "";
}

function CardSeen({ card }) {
  return (
    <details open>
      <summary>The Agent Card as received</summary>
      <dl className="kv">
        <dt>name</dt><dd><Untrusted text={card.name} /></dd>
        <dt>url</dt><dd><Revealed text={card.url} /></dd>
        <dt>version</dt><dd><Untrusted text={card.version} /> · sha256 <code>{card.sha256}</code></dd>
      </dl>
      <h4>description</h4>
      <Untrusted text={card.descriptionRevealed} block />
      {card.skills.map((s) => (
        <div key={s.id} data-testid={`skill-${s.id}`}>
          <h4>skill <code>{s.id}</code> <span className="muted small"><Untrusted text={s.name} /></span></h4>
          <Untrusted text={s.descriptionRevealed} block />
        </div>
      ))}
    </details>
  );
}

function Check({ check }) {
  const scan = check.scanner?.findings ?? [];
  return (
    <div data-testid="check">
      <h4>Pin and scanner check</h4>
      <ul className="badges" aria-label="Findings">
        {check.findings.length ? check.findings.map((f) => <li key={f} className="pill no">{f}</li>) : <li className="pill yes">ok</li>}
      </ul>
      {check.offOriginUrls && <p className="small">Off-origin url: <Untrusted text={check.offOriginUrls.join(", ")} /></p>}
      {check.signature && <p className="small">{check.signature.note}</p>}
      {scan.length > 0 && (
        <ul className="small">{scan.slice(0, 8).map((f, i) => <li key={i} className="finding"><code>{f.ruleId}</code> {f.subject}: <Untrusted text={f.detail} /></li>)}</ul>
      )}
    </div>
  );
}

export function Column({ title, run, other }) {
  const result = outcome(run, other);
  const d = run.victim.delegation;
  return (
    <section className="card col" aria-label={title} data-testid={`col-${run.mode}`}>
      <h3>{title}</h3>
      <p className={`verdict ${result.level}`} role="status" data-testid={`result-${run.mode}`}>{result.label}</p>
      <p>{explain(run, result)}</p>
      <CardSeen card={run.cardSeen} />
      {run.pinned && <Check check={run.pinned.check} />}
      <h4>The message it would send</h4>
      {!d ? <p className="muted">No message. {run.victim.notes[0]}</p> : (
        <>
          <p className="small">To <Revealed text={d.to} />. Sent: <strong>{String(d.sent)}</strong> (the generalist only returns the message as data).</p>
          <Untrusted text={pretty(d.request)} block />
          {run.victim.steps.length > 0 && (
            <>
              <p className="small">Steps it would run first (never executed):</p>
              <ol className="calls">{run.victim.steps.map((s, i) => <li key={i} className="poison-call"><code>{s.tool}</code> <Untrusted text={JSON.stringify(s.arguments)} /> <span className="pill no">poison</span></li>)}</ol>
            </>
          )}
          <ul className="small">{run.victim.reasons.map((r, i) => <li key={i}>{r.poison && <span className="pill no">poison</span>} <Untrusted text={r.text} /></li>)}</ul>
        </>
      )}
      <p className="muted small">Nothing was sent or executed.</p>
      <details><summary>Trace</summary><ol className="small">{run.trace.map((s) => <li key={s.step}>{s.what}{s.detail ? `: ${s.detail}` : ""}</li>)}</ol></details>
    </section>
  );
}

function initial() {
  const q = new URLSearchParams(window.location.hash.split("?")[1] || "");
  const poison = POISONS.findIndex((p) => p.id === q.get("poison"));
  const task = Number(q.get("task"));
  const p = poison >= 0 ? poison : 0;
  return { poison: p, task: Number.isInteger(task) && TASKS[task] && q.has("task") ? task : POISONS[p].task, stage: STAGES.some(([id]) => id === q.get("stage")) ? q.get("stage") : "later" };
}

export default function Run({ present }) {
  const [{ poison, task, stage }, setSel] = useState(initial);
  const [runs, setRuns] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function go() {
    setBusy(true); setError(""); setRuns(null);
    const p = POISONS[poison];
    const base = { task: TASKS[task].text, stage, variant: p.id === "unsigned" ? "clean" : p.id };
    try {
      const [ungoverned, pinned] = await Promise.all([runVictim({ ...base, mode: "ungoverned" }), runVictim({ ...base, mode: "pinned", requireSignatures: p.id === "unsigned" })]);
      setRuns({ ungoverned, pinned });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <h1>Run the delegation</h1>
      <p className="lede">Pick a harmless task and a card. The offline generalist (no model) reads the Agent Card the way a trusting agent does and returns the message it would send, once through an ungoverned client and once through a pinned client.</p>
      <StoryPanel mode="run" present={present} />
      <form className="card controls" onSubmit={(e) => { e.preventDefault(); go(); }}>
        <label>Card
          <select value={poison} onChange={(e) => setSel((s) => ({ ...s, poison: Number(e.target.value), task: POISONS[Number(e.target.value)].task }))}>
            {POISONS.map((p, i) => <option key={p.id} value={i}>{p.label}</option>)}
          </select>
        </label>
        <label>Task
          <select value={task} onChange={(e) => setSel((s) => ({ ...s, task: Number(e.target.value) }))}>
            {TASKS.map((t, i) => <option key={t.text} value={i}>{t.text} ({t.note})</option>)}
          </select>
        </label>
        <label>When
          <select value={stage} onChange={(e) => setSel((s) => ({ ...s, stage: e.target.value }))}>
            {STAGES.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
          </select>
        </label>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? "Running..." : "Run both clients"}</button>
      </form>
      {error && <p role="alert" className="alert">Could not run: {error}</p>}
      {runs && (
        <div className="cols">
          <Column title="Ungoverned client" run={runs.ungoverned} other={runs.pinned} />
          <Column title="Pinned client" run={runs.pinned} other={runs.ungoverned} />
        </div>
      )}
    </>
  );
}
