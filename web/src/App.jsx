import React, { useEffect, useState } from "react";

// HA0 skeleton: the web UI (card gallery, side-by-side run, three-step flow, ReactFlow diagram) is a later step.
// This page only proves the build, the theme tokens and the API link, and says so.
export default function App() {
  const [health, setHealth] = useState(null);
  useEffect(() => {
    let live = true;
    fetch("/api/health").then((r) => r.json()).then((h) => live && setHealth(h)).catch(() => live && setHealth({ state: "unreachable" }));
    return () => { live = false; };
  }, []);
  return (
    <>
      <div className="banner" role="note" data-testid="banner">This is a deliberately hostile demo server. Everything it sends is shown as inert text.</div>
      <main className="page" id="main">
        <h1>Hostile A2A</h1>
        <p className="muted">The server, victim, pinned-card client and API are built and tested. The interactive UI is not built yet.</p>
        <p data-testid="health">API status: <strong>{health ? health.state : "checking"}</strong></p>
      </main>
    </>
  );
}
