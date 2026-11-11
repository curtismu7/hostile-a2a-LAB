// Structure copied from hostile-mcp (web/src/pages/Gallery.jsx), adapted for Agent Card poisons.
import React, { useEffect, useState } from "react";
import { getCatalog } from "../lib/api.js";
import { Untrusted } from "../lib/Untrusted.jsx";
import StoryPanel from "../story/StoryPanel.jsx";

// Card poisons grouped by where they hide. The badges come straight from the catalog data (scanner / pinning answers).
export const CATEGORIES = [
  ["description", "Instructions in the card text"],
  ["skill", "Instructions in a skill"],
  ["dynamic", "Changes after approval"],
  ["semantic", "Persuasion in plain language"],
  ["trust", "Trust and signatures"],
  ["behaviour", "A card that is honest"],
  ["result", "Instructions in a task reply"],
];
const WORD = { yes: "", partial: " (partly)" };

export function badgesFor(item) {
  const b = [];
  if (item.pinning.catches !== "no") b.push({ id: "pin", level: item.pinning.catches, text: `Caught by pinning${WORD[item.pinning.catches]}` });
  if (item.scanner.catches !== "no") b.push({ id: "scan", level: item.scanner.catches, text: `Caught by the scanner${WORD[item.scanner.catches]}` });
  if (!b.length) b.push({ id: "neither", level: "no", text: "Neither: needs a human or a runtime control" });
  return b;
}

export const runLink = (item) => `#/run?poison=${item.requireSignatures ? "unsigned" : item.variant}`;

// `as` is the card's heading level: h4 under the gallery's h3 category, h3 under the limits page's h2 sections.
export function PoisonCard({ item, as: Heading = "h4" }) {
  return (
    <article className="poison" data-testid={`poison-${item.id}`}>
      <Heading><code>{item.id}</code> {!item.servedHere && <span className="muted small">described, not served</span>}</Heading>
      <dl>
        <dt>What it does</dt><dd><Untrusted text={item.what} /></dd>
        <dt>How it lands</dt><dd><Untrusted text={item.how} /></dd>
      </dl>
      <ul className="badges" aria-label="Which control catches it">
        {badgesFor(item).map((b) => <li key={b.id} className={`pill ${b.level}`}>{b.text}</li>)}
      </ul>
      <p className="muted small"><strong>Pinning:</strong> {item.pinning.note} <strong>Scanner:</strong> {item.scanner.note}</p>
      {item.servedHere && <p className="small"><a href={runLink(item)}>Run it through both clients</a></p>}
    </article>
  );
}

export default function Gallery({ present }) {
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { getCatalog().then(setCatalog).catch((e) => setError(e.message)); }, []);
  return (
    <>
      <h1>Card poison gallery</h1>
      <p className="lede">Every poison the server can put in an Agent Card, grouped by where it hides. The badges say which control would catch it, taken from the catalog data. Nothing here is executed.</p>
      <StoryPanel mode="gallery" present={present} />
      {error && <p role="alert" className="alert">Could not load the catalog: {error}</p>}
      {!catalog && !error && <p className="muted">Loading the catalog...</p>}
      {catalog && CATEGORIES.map(([id, title]) => {
        const items = catalog.items.filter((i) => i.category === id);
        if (!items.length) return null;
        return (
          <section key={id} className="card" aria-labelledby={`cat-${id}`}>
            <h3 id={`cat-${id}`}>{title}</h3>
            <div className="grid">{items.map((i) => <PoisonCard key={i.id} item={i} />)}</div>
          </section>
        );
      })}
    </>
  );
}
