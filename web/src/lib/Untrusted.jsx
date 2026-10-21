// Copied from hostile-mcp (web/src/lib/Untrusted.jsx) and adapted: [U+XXXX] chips render inside Untrusted too, the
// fake-credential placeholders are highlighted, and Revealed also shows Cyrillic and Greek look-alike letters as code
// points. Not imported across repos.
import React from "react";

// Everything the hostile server sends is untrusted by definition. It is only ever rendered as React text nodes
// (never innerHTML), so markup in a payload is shown, not run. The <mark> highlight is derived from the text by
// pattern and wraps text nodes only.
const HOT = /<IMPORTANT>[\s\S]*?<\/IMPORTANT>|ignore (?:all )?(?:previous|prior) instructions[\s\S]*|FAKE-[A-Z]+(?:-[A-Z]+)*-NOT-REAL|https?:\/\/[^\s"',]+|[\w.+-]+@[\w.-]+\.[a-z]+/gi;
const CHIP = /(\[U\+[0-9A-F]{4,6}\])/;
const LOOKALIKE = /[\p{Script=Cyrillic}\p{Script=Greek}]/gu;

export function segments(text) {
  const s = String(text ?? "");
  const out = [];
  let last = 0;
  for (const m of s.matchAll(HOT)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), hot: false });
    out.push({ text: m[0], hot: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last), hot: false });
  return out;
}

const chip = (key, text) => <span key={key} className="chip" title="Invisible or look-alike character">{text}</span>;

function pieces(text, highlight) {
  return String(text ?? "").split(CHIP).flatMap((p, i) => {
    if (i % 2) return [chip(`c${i}`, p)];
    if (!highlight) return [<React.Fragment key={`t${i}`}>{p}</React.Fragment>];
    return segments(p).map((s, j) => (s.hot ? <mark key={`m${i}-${j}`} title="Flagged: instruction, off-box address or credential placeholder">{s.text}</mark> : <React.Fragment key={`t${i}-${j}`}>{s.text}</React.Fragment>));
  });
}

/** Inert text with suspicious spans highlighted. Highlight carries a title and the text itself, not colour alone. */
export function Untrusted({ text, block = false }) {
  const Tag = block ? "pre" : "span";
  return <Tag className={`untrusted${block ? " untrusted--block" : ""}`} data-testid="untrusted">{pieces(text, true)}</Tag>;
}

/** Text from the server's revealed copy: each [U+XXXX] chip is a visible, styled text node, everything else is inert text. */
export function Revealed({ text, block = false }) {
  const Tag = block ? "pre" : "span";
  const shown = String(text ?? "").replace(LOOKALIKE, (c) => `[U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}]`);
  return <Tag className={`untrusted${block ? " untrusted--block" : ""}`} data-testid="revealed">{pieces(shown, false)}</Tag>;
}

export const pretty = (value) => JSON.stringify(value, null, 2);
