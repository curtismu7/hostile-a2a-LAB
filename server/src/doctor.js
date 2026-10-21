// Preflight checks shared by `npm run doctor` and GET /api/health. Synchronous, no network, never prints a secret.
// Each check: { id, level: 'pass' | 'info' | 'fail', detail }.
import { scanPayloads } from './corpus.js';
import { assertBindAllowed, bindHost } from './safety.js';

export function runChecks({ env = process.env } = {}) {
  const checks = [];
  const add = (id, level, detail) => checks.push({ id, level, detail });

  const major = Number(process.versions.node.split('.')[0]);
  add('node', major >= 20 ? 'pass' : 'fail', `v${process.versions.node} (need >= 20)`);

  try { add('bind', 'pass', `${assertBindAllowed(bindHost(env), env)}${env.HOSTILE_BIND ? ' (HOSTILE_BIND opt-in)' : ' (loopback)'}`); }
  catch (e) { add('bind', 'fail', e.message); }

  const bad = scanPayloads();
  add('payload-hosts', bad.length ? 'fail' : 'pass',
    bad.length ? `non-reserved hosts in payloads: ${bad.map((b) => `${b.where}: ${b.hosts.join(', ')}`).join('; ')}` : 'every off-box host in every payload is .invalid, .example or the apex of example.com/net/org');

  add('outbound', 'pass', 'no outbound settings (the server and the victim make no outbound request)');
  add('signatures', 'info', 'card signature verification is NOT implemented (a require-signatures policy fails closed)');
  return checks;
}

export const allPassed = (checks) => checks.every((c) => c.level !== 'fail');
