import { fileURLToPath } from 'node:url';
import { startHttpServer } from './app.js';
import { allPassed, runChecks } from './doctor.js';

// Local runs read the repo-root .env (real env vars win).
try { process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url))); } catch { /* no .env */ }

const checks = runChecks();
if (!allPassed(checks)) {
  for (const c of checks.filter((x) => x.level === 'fail')) console.error(`[hostile-a2a] refusing to start: ${c.id}: ${c.detail}`);
  process.exit(1);
}
const { url, cardUrl } = await startHttpServer();
console.log(`[hostile-a2a] poisoned A2A v0.3.0 Agent Card at ${cardUrl} (loopback unless HOSTILE_BIND is set)`);
console.log(`[hostile-a2a] JSON-RPC: POST ${url}a2a/jsonrpc | API: ${url}api/health`);
