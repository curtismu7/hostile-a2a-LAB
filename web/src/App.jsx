// Copied from hostile-mcp (web/src/App.jsx) and adapted. Not imported across repos.
import React, { useEffect, useState } from "react";
import ShelfLink from "./components/ShelfLink.jsx";
import Gallery from "./pages/Gallery.jsx";
import Run from "./pages/Run.jsx";
import RoundTrip from "./pages/RoundTrip.jsx";
import Limits from "./pages/Limits.jsx";
import Diagram from "./pages/Diagram.jsx";
import ModeToggle from "./components/ModeToggle.jsx";
import { getInfo, setMode } from "./lib/api.js";

// Hash-routed pages (no router dependency). The banner is always on screen: this server is hostile on purpose.
export const PAGES = [
  ["gallery", "Poison gallery", Gallery],
  ["run", "Run the delegation", Run],
  ["roundtrip", "Card round trip", RoundTrip],
  ["limits", "Honest limits", Limits],
  ["diagram", "Diagram", Diagram],
];
const read = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* not remembered */ } };
const pageFromHash = () => {
  const id = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return PAGES.some(([p]) => p === id) ? id : "gallery";
};

export default function App() {
  const [page, setPage] = useState(pageFromHash);
  const [theme, setTheme] = useState(() => (["light", "dark"].includes(read("hostile-a2a.theme", "")) ? read("hostile-a2a.theme", "") : "system"));
  const [present, setPresent] = useState(() => read("hostile-a2a.present", "0") === "1");
  const [info, setInfo] = useState(null);

  useEffect(() => {
    const on = () => setPage(pageFromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => { getInfo().then(setInfo, () => {}); }, []);
  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    if (present) document.documentElement.dataset.present = "1"; else delete document.documentElement.dataset.present;
  }, [present]);

  const setThemeValue = (t) => { setTheme(t); write("hostile-a2a.theme", t); };
  const togglePresent = () => { write("hostile-a2a.present", present ? "0" : "1"); setPresent(!present); };
  // Rule 19: the Mock/Real toggle. The server's answer is what the toggle shows (a refusal leaves it unchanged).
  const selectMode = async (source) => { try { setInfo(await setMode(source)); } catch { /* refused: the toggle keeps the server's last answer */ } };
  const Page = PAGES.find(([id]) => id === page)[2];

  const source = info?.source === "real" ? "real" : "mock";

  return (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <header className="shell-bar">
        <span className="shell-brand"><span className="shell-logo" aria-hidden="true">P</span> Hostile A2A</span>
        <nav className="shell-nav" aria-label="Pages">
          {PAGES.map(([id, label]) => <a key={id} href={`#/${id}`} aria-current={id === page ? "page" : undefined}>{label}</a>)}
        </nav>
        <span className="shell-right">
          <ShelfLink />
          <ModeToggle info={info} onSelect={selectMode} />
          <button type="button" className="btn" aria-pressed={present} onClick={togglePresent}>Present</button>
          <label className="shell-theme">Theme
            <select value={theme} onChange={(e) => setThemeValue(e.target.value)} data-testid="theme">
              <option value="system">Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </span>
      </header>
      <main className="page" id="main" tabIndex={-1}>
        <div className="banner" role="note" data-testid="banner" data-state={source === "real" ? "live" : "mock"}>
          <strong>{source === "real" ? "REAL mode. " : "MOCK mode. "}This A2A agent is deliberately hostile.</strong> Every card is shown as inert text, its replies are inert, and the generalist only returns the message it would send. Nothing is sent anywhere, and every off-box address is a reserved <code>.invalid</code> or example name.
        </div>
        <Page present={present} theme={theme} />
        <p className="muted small" data-admin-only>The server serves cards and never scores or blocks. Pinning notices change; it does not judge content. Card signatures are not verified here.</p>
      </main>
    </>
  );
}
