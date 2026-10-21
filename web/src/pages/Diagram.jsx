// Structure copied from hostile-mcp (web/src/pages/Diagram.jsx), adapted for the A2A path:
// specialist agent card -> generalist -> pin/scan check -> delegate.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, Handle, Position, ReactFlow, applyNodeChanges, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import StoryPanel from "../story/StoryPanel.jsx";

// Boxes are draggable; Simulate walks one run, Reset puts everything back, the speed control sets the pace. The step
// caption under the diagram says in words what the picture shows, so the diagram is never the only carrier.
export const START = [
  { id: "card", position: { x: 0, y: 110 }, data: { title: "Specialist agent card", sub: "Served at the well-known path. The server never blocks." } },
  { id: "client", position: { x: 280, y: 110 }, data: { title: "Client", sub: "Fetches the card" } },
  { id: "check", position: { x: 560, y: 110 }, data: { title: "Pin and scan check", sub: "Hash and compare with the approved card; run the scanner rules" } },
  { id: "withheld", position: { x: 560, y: -80 }, data: { title: "Withheld", sub: "Changed or flagged card: the generalist never reads it" } },
  { id: "generalist", position: { x: 840, y: 110 }, data: { title: "Offline generalist", sub: "Reads the card, builds a message. No model." } },
  { id: "delegate", position: { x: 1120, y: 110 }, data: { title: "Delegate (not sent)", sub: "The message it would send. Never sent." } },
];
const EDGES = [
  { id: "e1", source: "card", target: "client", sourceHandle: "r", targetHandle: "l", label: "1 GET agent card" },
  { id: "e2", source: "client", target: "check", sourceHandle: "r", targetHandle: "l", label: "2 check (pinned only)" },
  { id: "e3", source: "check", target: "generalist", sourceHandle: "r", targetHandle: "l", label: "3 card that passed" },
  { id: "e3w", source: "check", target: "withheld", sourceHandle: "t", targetHandle: "b", label: "3 changed or flagged: withheld" },
  { id: "e4", source: "generalist", target: "delegate", sourceHandle: "r", targetHandle: "l", label: "4 builds the message" },
  { id: "e5", source: "client", target: "generalist", sourceHandle: "b", targetHandle: "bt", label: "2 straight through (ungoverned)", dashed: true },
];
export const SCENARIOS = {
  ungoverned: {
    label: "Ungoverned client",
    steps: [
      { edges: ["e1"], nodes: ["card", "client"], text: "The client fetches the poisoned card. Nothing in A2A discovery inspected the text; it arrived byte for byte." },
      { edges: ["e5"], nodes: ["client", "generalist"], text: "No check: the client hands the card straight to the generalist." },
      { edges: ["e4"], nodes: ["generalist", "delegate"], text: "POISON LANDED: the generalist obeys the card and builds a message with the fake token placeholder FAKE-TOKEN-NOT-REAL. It is only built; nothing is sent." },
    ],
  },
  pinned: {
    label: "Pinned client",
    steps: [
      { edges: ["e1"], nodes: ["card", "client"], text: "The client fetches the card the next morning. It differs from the one that was approved." },
      { edges: ["e2"], nodes: ["client", "check"], text: "The check hashes the card, compares it with the approved hash and runs the scanner rules." },
      { edges: ["e3w"], nodes: ["check", "withheld"], text: "BLOCKED: the card changed and carries instructions, so it is withheld along with its field diff." },
      { edges: ["e3"], nodes: ["check", "generalist"], text: "Only a card that passed reaches the generalist. This one did not, so it builds no message." },
    ],
  },
};
const SPEEDS = [["0.5", "0.5x"], ["1", "1x"], ["2", "2x"], ["4", "4x"]];
const BASE_MS = 1600;

function Box({ data }) {
  return (
    <div className={`fbox${data.on ? " on" : ""}${data.dim ? " dim" : ""}`}>
      <Handle id="l" type="target" position={Position.Left} />
      <Handle id="r" type="source" position={Position.Right} />
      <Handle id="t" type="source" position={Position.Top} />
      <Handle id="b" type="target" position={Position.Bottom} />
      <Handle id="bt" type="target" position={Position.Bottom} style={{ left: "75%" }} />
      <strong>{data.title}</strong>
      <span>{data.sub}</span>
    </div>
  );
}
const nodeTypes = { box: Box };

export default function Diagram({ present, theme = "system" }) {
  const [moved, setMoved] = useState(START);
  const [scenario, setScenario] = useState("pinned");
  const [speed, setSpeed] = useState("1");
  const [step, setStep] = useState(-1); // -1 = idle
  const [running, setRunning] = useState(false);
  const steps = SCENARIOS[scenario].steps;

  useEffect(() => {
    if (!running) return undefined;
    if (step >= steps.length - 1) { setRunning(false); return undefined; }
    const t = setTimeout(() => setStep((s) => s + 1), BASE_MS / Number(speed));
    return () => clearTimeout(t);
  }, [running, step, steps.length, speed]);

  const simulate = () => { setStep(0); setRunning(true); };
  const reset = () => { setRunning(false); setStep(-1); setMoved(START); };
  const pickScenario = (s) => { setScenario(s); setRunning(false); setStep(-1); };
  const onNodesChange = useCallback((changes) => setMoved((n) => applyNodeChanges(changes, n)), []);

  const cur = step >= 0 ? steps[step] : null;
  const nodes = useMemo(() => moved.map((n) => ({ ...n, type: "box", data: { ...n.data, on: !!cur?.nodes.includes(n.id), dim: !!cur && !cur.nodes.includes(n.id) } })), [moved, cur]);
  const edges = useMemo(() => EDGES.map(({ dashed, ...e }) => ({
    ...e,
    animated: !!cur?.edges.includes(e.id),
    className: `${cur?.edges.includes(e.id) ? "edge-on" : ""}${dashed ? " edge-dashed" : ""}`,
    markerEnd: { type: MarkerType.ArrowClosed },
  })), [cur]);

  return (
    <>
      <h2>How the pin sits in the path</h2>
      <p className="lede">Nothing in A2A discovery inspects card text, so a defence has to sit where the card is consumed. Drag any box. Simulate runs a poisoned card through the chosen client.</p>
      <div className="card controls">
        <label>Client
          <select value={scenario} onChange={(e) => pickScenario(e.target.value)}>
            {Object.entries(SCENARIOS).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
          </select>
        </label>
        <label>Speed
          <select value={speed} onChange={(e) => setSpeed(e.target.value)}>
            {SPEEDS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </label>
        <button type="button" className="btn primary" onClick={simulate} disabled={running}>Simulate</button>
        <button type="button" className="btn" onClick={reset}>Reset</button>
      </div>
      <div className="flow-wrap" role="group" aria-label="Diagram of the specialist agent card, client, pin and scan check, generalist and the message it would send. Boxes can be dragged.">
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} colorMode={theme}
          fitView fitViewOptions={{ padding: 0.12 }} nodesConnectable={false} proOptions={{ hideAttribution: true }} minZoom={0.2}>
          <Background />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <p className="caption" role="status" aria-live="polite" data-testid="caption">
        {cur ? `Step ${step + 1} of ${steps.length}: ${cur.text}` : "Press Simulate to walk one run through the diagram."}
      </p>
      <StoryPanel mode="diagram" present={present} />
    </>
  );
}
