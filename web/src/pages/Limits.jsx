// Structure copied from hostile-mcp (web/src/pages/Limits.jsx), adapted for Agent Cards.
import React, { useEffect, useState } from "react";
import { getCatalog } from "../lib/api.js";
import { PoisonCard } from "./Gallery.jsx";

// Which catalog rows prove each limit. A limit with no row says so rather than inventing evidence.
export const PROOF = {
  "signatures-not-verified": ["unsigned-card"],
  "first-use-poison": ["description-injection", "skill-exfiltration", "hidden-characters"],
  "semantic-manipulation": ["plain-language-steering"],
  "well-behaved-malicious": ["well-behaved-malicious"],
  "result-injection": ["result-injection"],
};
const RUN = { "first-use-poison": "#/run?poison=poisoned&stage=first", "semantic-manipulation": "#/run?poison=plain-language", "well-behaved-malicious": "#/run?poison=clean" };

export default function Limits() {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { getCatalog().then(setCatalog).catch((e) => setError(e.message)); }, []);
  return (
    <>
      <h2>Honest limits</h2>
      <p className="lede">Pinning notices change and the scanner knows its rules. Neither judges intent. A person or a runtime control must limit what an approved card can do.</p>
      <p className="callout" role="note" data-testid="signature-note"><strong>Card signature verification is NOT implemented in this demo.</strong> Checking a signature needs the signer's key and a decision about who may sign; fetching the key from the card's own claimed issuer would be a network call and would let the card vouch for itself. The signature check is a stub that fails closed: with a signatures-required policy every card is reported as unsigned-policy, signed or not, and no card is ever reported as verified.</p>
      {error && <p role="alert" className="alert">Could not load the catalog: {error}</p>}
      {!catalog && !error && <p className="muted">Loading the catalog...</p>}
      {catalog && (
        <>
          <section className="card" aria-labelledby="catches-h">
            <h3 id="catches-h">What it does catch</h3>
            <ul>{catalog.pinningCatches.map((c) => <li key={c.id}>{c.text}</li>)}</ul>
          </section>
          {catalog.pinningLimits.map((l) => {
            const rows = (PROOF[l.id] || []).map((id) => catalog.items.find((i) => i.id === id)).filter(Boolean);
            return (
              <section key={l.id} className="card limit" aria-labelledby={`lim-${l.id}`} data-testid={`limit-${l.id}`}>
                <h3 id={`lim-${l.id}`}>{l.text}</h3>
                {rows.length ? (
                  <>
                    <p className="muted small">Catalog rows that show it:</p>
                    <div className="grid">{rows.map((i) => <PoisonCard key={i.id} item={i} />)}</div>
                    {RUN[l.id] && <p><a href={RUN[l.id]}>Run it</a> and watch the result.</p>}
                  </>
                ) : <p className="muted small">No catalog row; this follows from how the pinned client works.</p>}
              </section>
            );
          })}
          {catalog.scannerLimits?.length > 0 && (
            <section className="card" aria-labelledby="scan-lim-h">
              <h3 id="scan-lim-h">What the scanner does not do</h3>
              <ul>{catalog.scannerLimits.map((l) => <li key={l.id}>{l.text}</li>)}</ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
