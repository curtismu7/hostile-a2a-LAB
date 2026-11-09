// Host check and same-origin writes (the family rule; reference: token-workbench-LAB server/src/safety.js).
//  - Host: loopback (any port) always, plus each LAB_ALLOWED_HOSTS name with this app's port (the name the family
//    lab-proxy sends). Anything else gets 403 host_not_allowed (DNS-rebinding defence).
//  - A write (anything but GET/HEAD/OPTIONS) with an Origin header is accepted only when the Origin is the http loopback
//    origin identical to Host, or, on an allowed LAB_ALLOWED_HOSTS Host only, when Origin === X-Forwarded-Proto://X-Forwarded-Host
//    (the lab-proxy's own origin). Every other Origin gets 403 bad_origin. A write with no Origin header is not a browser
//    cross-site request and passes, as in token-workbench.
const OCTET = '(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)';
const LOOPBACK_V4 = new RegExp(`^127\\.${OCTET}\\.${OCTET}\\.${OCTET}$`);
export function isLoopbackName(host) {
  const h = String(host).toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h === '::1' || LOOPBACK_V4.test(h);
}

// "localhost", "127.x.y.z" or "[::1]", optionally ":port" (1-65535). Returns the normalised host string or null.
const LOOPBACK_HOST_RE = /^(localhost|127(?:\.\d{1,3}){3}|\[::1\])(?::(\d{1,5}))?$/i;
export function loopbackHost(hostHeader) {
  const m = LOOPBACK_HOST_RE.exec(String(hostHeader ?? '').trim());
  if (!m || !isLoopbackName(m[1])) return null;
  if (m[2] !== undefined && (Number(m[2]) < 1 || Number(m[2]) > 65535)) return null;
  return String(hostHeader).trim().toLowerCase();
}

export const parseLabHosts = (v) => String(v ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);

// The exact Host values (name:port) the lab-proxy may send. Only these may vouch for a forwarded origin.
export const proxyHostSet = (labHosts, port) => new Set(labHosts.map((n) => `${n}:${port}`));

const hostOf = (req) => String(req.headers.host ?? '').trim().toLowerCase();

export function makeHostGuard(proxyHosts) {
  return function labHostGuard(req, res, next) {
    const host = hostOf(req);
    if (host && (loopbackHost(host) || proxyHosts.has(host))) return next();
    return res.status(403).json({ error: 'host_not_allowed', message: 'this server answers loopback Host headers and its LAB_ALLOWED_HOSTS names only' });
  };
}

// Behind the lab-proxy the browser's Origin is the proxy's (https://local.ping-devops.com:8443) while Host is this lab's
// own name. X-Forwarded-Host/-Proto are believed only when Host is one of those names, so a request that did not come
// through the proxy (a loopback Host, or any other Host) cannot use them.
export function isProxiedSameOrigin(headers, proxyHosts) {
  const xfh = String(headers['x-forwarded-host'] || '').trim().toLowerCase();
  const xfp = String(headers['x-forwarded-proto'] || '').trim().toLowerCase();
  return proxyHosts.has(String(headers.host || '').trim().toLowerCase()) && xfh !== '' && (xfp === 'https' || xfp === 'http')
    && headers.origin === `${xfp}://${xfh}`;
}

export function isLoopbackSameOrigin(headers) {
  const host = loopbackHost(headers.host);
  let u = null;
  try { u = new URL(headers.origin); } catch { return false; }
  return Boolean(host) && u.protocol === 'http:' && isLoopbackName(u.hostname) && !u.username && !u.password
    && u.origin === headers.origin && u.host.toLowerCase() === host;
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
// `extraSame(headers)` lets an app accept one more same-origin shape (the gallery's hosted build); default none.
export function makeOriginGuard(proxyHosts, extraSame = () => false) {
  return function sameOriginWrites(req, res, next) {
    if (READ_METHODS.has(req.method) || req.headers.origin === undefined) return next();
    if (isLoopbackSameOrigin(req.headers) || isProxiedSameOrigin(req.headers, proxyHosts) || extraSame(req.headers)) return next();
    return res.status(403).json({ error: 'bad_origin', message: 'this server accepts same-origin writes only' });
  };
}
