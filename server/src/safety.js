// Safety rules for a deliberately hostile server. Pure functions, no I/O.
// Pattern copied from hostile-mcp (server/src/safety.js), adapted for A2A.
//  1. Bind loopback only, unless HOSTILE_BIND is set.
//  2. Every off-box host named in any payload is a reserved, non-resolvable name (RFC 2606 / RFC 6761): the .invalid
//     TLD, the .example TLD, or the apex of example.com / example.net / example.org (never a subdomain). No real host,
//     no public IP. Loopback is the server itself, not off-box, so it is allowed.

export function isLoopbackHost(host) {
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || /^127(\.\d{1,3}){3}$/.test(h);
}

export function bindHost(env = process.env) { return env.HOSTILE_BIND || '127.0.0.1'; }

export function assertBindAllowed(host, env = process.env) {
  if (isLoopbackHost(host) || env.HOSTILE_BIND) return host;
  throw new Error(`refusing to bind ${host}: this server serves hostile payloads and listens on loopback only. Set HOSTILE_BIND to opt in.`);
}

export function isReservedHost(host) {
  const h = String(host).toLowerCase().replace(/\.$/, '');
  // The .invalid and .example TLDs (any depth), and only the APEX of example.com/net/org: a subdomain of those can
  // resolve if someone controls the zone.
  return /(^|\.)(invalid|example)$/.test(h) || /^example\.(com|net|org)$/.test(h);
}

const NETWORK_URL = /\b(?:https?|wss?|ftp|sftp|ssh|smtp|tcp|udp):\/\/([^\s/?#"'<>\\]+)/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g;
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
const BARE_DOMAIN = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi;

const stripAuthority = (a) => a.replace(/^[^@]*@/, '').replace(/:\d+$/, '');

// Unicode tag characters (U+E0000 block) spell ASCII invisibly. Decode them so a hidden host cannot hide in them.
export function decodeTags(text) {
  return [...String(text)].map((c) => { const cp = c.codePointAt(0) - 0xE0000; return cp >= 0x20 && cp < 0x7F ? String.fromCharCode(cp) : ''; }).join('');
}

// Every off-box hostname or IP found in `text` (and in any tag-encoded text inside it) that is not a reserved name.
export function scanHosts(text) {
  const found = new Set();
  const raw = String(text);
  const hidden = decodeTags(raw);
  for (const s of hidden ? [raw, hidden] : [raw]) {
    for (const m of s.matchAll(NETWORK_URL)) found.add(stripAuthority(m[1]).toLowerCase());
    for (const m of s.matchAll(EMAIL)) found.add(m[1].toLowerCase());
    for (const m of s.matchAll(IPV4)) found.add(m[0]);
    for (const m of s.matchAll(BARE_DOMAIN)) found.add(m[0].toLowerCase());
  }
  return [...found].filter((h) => !isReservedHost(h) && !isLoopbackHost(h)).sort();
}
