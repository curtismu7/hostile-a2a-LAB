// Copied from hostile-mcp (web/src/App.jsx) and adapted. Not imported across repos.
import React, { useEffect, useState } from "react";
import fs from "node:fs";
import ShelfLink from "./components/ShelfLink.jsx";
import VerifyMark from "./components/VerifyMark.jsx";
import Gallery from "./pages/Gallery.jsx";
import Run from "./pages/Run.jsx";
import RoundTrip from "./pages/RoundTrip.jsx";
import Limits from "./pages/Limits.jsx";
import Diagram from "./pages/Diagram.jsx";
import TopMenu, { applyFontSize } from "./top-menu/TopMenu.jsx";
import TalkTrackDialog from "./talk-track/TalkTrackDialog.jsx";
import HelpDialog from "./help-dialog/HelpDialog.jsx";
import { HELP_SECTIONS } from "./helpContent";
import { pageTalkSteps } from "./story/StoryPanel";
import { getInfo, resetSessions, setMode } from "./lib/api.js";
import PrivilegeCheck from "./privilege-check/PrivilegeCheck.jsx";
import ModeModal from "./mode-modal/ModeModal.jsx";

// Version for the TopMenu About button: read once from the lab root package.json.
const LAB_VERSION = (() => { try { return JSON.parse(fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8")).version || null; } catch { return null; } })();

// The Real-or-mock modal's lines (shared mode-modal). The old banner also said, on every page, that this agent is hostile on purpose: that sentence lives here now.
export const MODE_LINES = {
  mock: "This A2A agent is deliberately hostile. Every card and reply is shown as inert text, the generalist only returns the message it would send, and nothing is sent anywhere.",
  real: "This A2A agent is still deliberately hostile and every card and reply stays inert text. Only the Privilege gateway check is live: one real tools/list and one refused tools/call probe through the door.",
};

// Hash-routed pages (no router dependency).
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
  const [fontStep, setFontStep] = useState(() => { const f = read("hostile-a2a.font", "M"); return ["S", "M", "L"].includes(f) ? f : "M"; });
  const [present, setPresent] = useState(() => read("hostile-a2a.present", "0") === "1");
  const [talkOpen, setTalkOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
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
  useEffect(() => { applyFontSize(fontStep); write("hostile-a2a.font", fontStep); }, [fontStep]);

  const setThemeValue = (t) => { setTheme(t); write("hostile-a2a.theme", t); };
  const togglePresent = () => { write("hostile-a2a.present", present ? "0" : "1"); setPresent(!present); };
  // Rule 19: the Mock/Real toggle. The server's answer is what the toggle shows (a refusal leaves it unchanged).
  const selectMode = async (source) => { try { setInfo(await setMode(source)); } catch { /* refused: the toggle keeps the server's last answer */ } };
  const [notice, setNotice] = useState("");
  const reset = async () => { try { await resetSessions(); setNotice("Reset: every card session is gone; the fixtures never change."); } catch { setNotice("Reset failed."); } };
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
          <span className="mode-toggle" style={{ display: "contents" }}>
            <TopMenu
            mode={{ value: source, onChange: selectMode, realAvailable: info ? info.realAvailable : null, realHint: "Real is not available: this app has no live version (an offline hostile server and an offline victim, no model, no network). Mock is the whole demo." }}
            theme={{ value: theme, onChange: setThemeValue }}
            fontSize={{ value: fontStep, onChange: setFontStep }}
            present={{ active: present, onToggle: togglePresent }}
            talkTrack={{ active: talkOpen, onToggle: () => setTalkOpen((v) => !v) }}
            help={{ onClick: () => setHelpOpen(true), title: "What this lab is, and what is simulated" }}
            version={LAB_VERSION}
            onReset={reset}
          >
            <ShelfLink />
            <VerifyMark id="hostile-a2a" />
          </TopMenu>
          </span>
        </span>
      </header>
      <main className="page" id="main" tabIndex={-1}>
        {page === "run" || page === "roundtrip" || page === "diagram" ? <PrivilegeCheck /> : <PrivilegeCheck primaryRetry />}
        <Page present={present} theme={theme} source={source} />
        {notice && <p className="muted small" role="status" data-testid="notice">{notice}</p>}
        <p className="muted small" data-admin-only>The server serves cards and never scores or blocks. Pinning notices change; it does not judge content. Card signatures are not verified here.</p>
      </main>
      <ModeModal mode={source} lines={MODE_LINES} storageKey="ha-mode" />
      <TalkTrackDialog isOpen={talkOpen} onClose={() => setTalkOpen(false)} talk={pageTalkSteps()} />
      <HelpDialog isOpen={helpOpen} onClose={() => setHelpOpen(false)} sections={HELP_SECTIONS} docsUrl="https://github.com/curtismu7/hostile-a2a-LAB#readme" />

    </>
  );
}
