// Structure copied from hostile-mcp (web/src/pages/RugPull.jsx), adapted for a card round trip:
// 1 approve fetch #1, 2 come back later (fetch #2), 3 compare. Each step is a real call against a per-visit session.
import React, { useEffect, useRef, useState } from "react";
import { approve, compare, endSession, newSession, runVictim } from "../lib/api.js";
import { Revealed, Untrusted, pretty } from "../lib/Untrusted.jsx";
import StoryPanel from "../story/StoryPanel.jsx";
import { outcome } from "./Run.jsx";

export const CHANGES = [
  { id: "rug-pull", label: "Instructions appear in the description and the skill", task: "Please refund my last order" },
  { id: "hidden-rug-pull", label: "An invisible instruction and a look-alike letter appear", task: "Please refund my last order" },
  { id: "skill-added", label: "A second skill is added", task: "Export a receipt for my refund" },
  { id: "origin-mismatch", label: "The url moves to another origin", task: "Please refund my last order" },
];

function CardBlock({ card }) {
  return (
    <>
      <dl className="kv">
        <dt>url</dt><dd><Revealed text={card.url} /></dd>
        <dt>sha256</dt><dd><code>{card.sha256}</code> (first 12)</dd>
      </dl>
      <Untrusted text={card.descriptionRevealed} block />
      <p className="small">Skills: {card.skills.map((s) => s.id).join(", ")}</p>
    </>
  );
}

export default function RoundTrip({ present }) {
  const [variant, setVariant] = useState(CHANGES[0].id);
  const [step, setStep] = useState(0); // steps completed
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState({});
  const sessionId = useRef(null);
  useEffect(() => () => { if (sessionId.current) endSession(sessionId.current); }, []);
  const change = CHANGES.find((c) => c.id === variant);

  async function act(fn) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const approveFirst = () => act(async () => {
    const first = await newSession(variant);
    sessionId.current = first.sessionId;
    const approval = await approve(first.sessionId);
    setState({ first, approval });
    setStep(1);
  });
  const comeBack = () => act(async () => {
    const second = await compare(sessionId.current);
    setState((s) => ({ ...s, second }));
    setStep(2);
  });
  const doCompare = () => act(async () => {
    const base = { task: change.task, stage: "later", variant };
    const [ungoverned, pinned] = await Promise.all([runVictim({ ...base, mode: "ungoverned" }), runVictim({ ...base, mode: "pinned" })]);
    setState((s) => ({ ...s, ungoverned, pinned }));
    setStep(3);
  });
  const reset = async () => {
    if (sessionId.current) await endSession(sessionId.current);
    sessionId.current = null; setState({}); setStep(0); setError("");
  };

  const { first, approval, second, ungoverned, pinned } = state;
  const check = second?.check;
  const diffRow = (d) => (
    <tr key={d.path}><th scope="row"><code>{d.path}</code><br /><span className="muted small">{d.change}</span></th>
      <td><Revealed text={d.beforeRevealed ?? "(none)"} block /></td><td><Revealed text={d.afterRevealed ?? "(none)"} block /></td></tr>
  );

  return (
    <>
      <StoryPanel mode="roundtrip" present={present} />
      <h2>Card round trip: the agent changed overnight</h2>
      <p className="lede">Three steps against the real hostile server. It answers fetch #1 with a clean card and every later fetch with a changed one. Choose how it changes before you start.</p>
      <div className="card controls">
        <label>What changes
          <select value={variant} onChange={(e) => setVariant(e.target.value)} disabled={step > 0}>
            {CHANGES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="alert">Something went wrong: {error}</p>}
      <ol className="flow">
        <li className="card" aria-current={step === 0 ? "step" : undefined}>
          <h3><span className="story__n">1</span> Approve fetch #1</h3>
          <p>The card is clean. The pinned client hashes name, description, url, version, capabilities, skills and security schemes, and trusts them from now on.</p>
          <button type="button" className="btn primary" onClick={approveFirst} disabled={busy || step !== 0}>Approve fetch #1 (pin it)</button>
          {first && (
            <div data-testid="step1">
              <h4>Fetch #{first.fetchNumber}</h4>
              <CardBlock card={first.card} />
              <p className="small">Pinned sha256 <code>{approval.pin.sha256}</code></p>
            </div>
          )}
        </li>
        <li className="card" aria-current={step === 1 ? "step" : undefined}>
          <h3><span className="story__n">2</span> Come back later</h3>
          <p>The next morning the client fetches the same well-known path again.</p>
          <button type="button" className="btn primary" onClick={comeBack} disabled={busy || step !== 1}>Fetch the card again (#2)</button>
          {second && (
            <div data-testid="step2">
              <h4>Fetch #{second.fetchNumber}</h4>
              <CardBlock card={second.card} />
            </div>
          )}
        </li>
        <li className="card" aria-current={step === 2 ? "step" : undefined}>
          <h3><span className="story__n">3</span> Compare</h3>
          <p>Run the same task through both clients with card #2 as the server now serves it.</p>
          <button type="button" className="btn primary" onClick={doCompare} disabled={busy || step !== 2}>Compare the two clients</button>
          {pinned && check && (
            <div data-testid="step3">
              <h4>What changed</h4>
              <ul className="badges" aria-label="Findings">{check.findings.map((f) => <li key={f} className="pill no">{f}</li>)}</ul>
              {check.diff?.length > 0 && (
                <div className="table-wrap"><table><thead><tr><th>Field</th><th>Approved (before)</th><th>Served now (after)</th></tr></thead>
                  <tbody>{check.diff.map(diffRow)}</tbody></table></div>
              )}
              {check.offOriginUrls && <p className="small">Off-origin url: <Untrusted text={check.offOriginUrls.join(", ")} /></p>}
              <p className="small">Invisible characters and non-Latin look-alike letters are shown as <span className="chip">[U+XXXX]</span> code points.</p>
              <dl className="hashes">
                <dt>Hash before</dt><dd><code>{check.pinnedSha256}</code></dd>
                <dt>Hash after</dt><dd><code>{check.sha256}</code></dd>
              </dl>
              <div className="cols">
                <div className="card col" data-testid="rt-pinned">
                  <h4>Pinned client</h4>
                  <p className={`verdict ${outcome(pinned, ungoverned).level}`} role="status">REFUSED: {check.verdict}</p>
                  <p>{outcome(pinned, ungoverned).label}. {pinned.victim.delegation ? "It still built a message." : "No message was built."}</p>
                </div>
                <div className="card col" data-testid="rt-ungoverned">
                  <h4>Ungoverned client</h4>
                  <p className={`verdict ${outcome(ungoverned, pinned).level}`} role="status">ACCEPTED: {outcome(ungoverned, pinned).label}</p>
                  {ungoverned.victim.delegation
                    ? <><p className="small">Message it would send (not sent):</p><Untrusted text={pretty(ungoverned.victim.delegation.request)} block /></>
                    : <p>No message.</p>}
                </div>
              </div>
              <p className="muted small">Pinning caught this because the card changed. Had it been poisoned on day one, the same hash would have matched. See the limits page.</p>
            </div>
          )}
        </li>
      </ol>
      <button type="button" className="btn" onClick={reset} disabled={busy || step === 0}>Reset the flow</button>
    </>
  );
}
