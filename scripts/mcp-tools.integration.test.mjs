// Scans THIS server's poisoned Agent Card with the mcp-tools app's own scanner CLI (a separate repo, only read).
// Starts this server on a free loopback port, runs `node server/src/scanner/cli.js --card <url> --json` from the
// mcp-tools checkout and asserts it flags the hidden instruction and the exfil skill. Both processes talk over
// loopback only. Skipped, loudly, when the checkout is not there (set MCP_TOOLS_SRC; default ../mcp-tools).
// Needs mcp-tools' dependencies installed (npm install there). Nothing in that repo is modified.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { scanCard } from '../server/src/scanner.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.resolve(process.env.MCP_TOOLS_SRC || path.join(ROOT, '..', 'mcp-tools'));
const CLI = path.join(SRC, 'server', 'src', 'scanner', 'cli.js');
const present = fs.existsSync(CLI) && fs.existsSync(path.join(SRC, 'node_modules'));

const freePort = () => new Promise((resolve) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
async function waitFor(url, ms = 20_000) {
  const end = Date.now() + ms;
  for (;;) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    if (Date.now() > end) throw new Error(`${url} did not come up`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

test('the mcp-tools scanner flags this server\'s card: the hidden instruction and the exfil skill',
  { skip: present ? false : `mcp-tools checkout not found at ${SRC} (set MCP_TOOLS_SRC)`, timeout: 60_000 }, async () => {
    const port = await freePort();
    const env = { ...process.env, PORT: String(port) };
    delete env.HOSTILE_BIND;
    const server = spawn(process.execPath, ['server/src/index.js'], { cwd: ROOT, env, stdio: 'ignore' });
    try {
      await waitFor(`http://127.0.0.1:${port}/api/health`);
      const cardUrl = `http://127.0.0.1:${port}/.well-known/agent-card.json`;
      let out;
      try { out = execFileSync(process.execPath, [CLI, '--card', cardUrl, '--json'], { cwd: SRC, encoding: 'utf8' }); }
      catch (e) { out = e.stdout; assert.equal(e.status, 1, `scanner exit ${e.status}: ${e.stderr}`); } // exit 1 = findings
      const report = JSON.parse(out);
      assert.equal(report.schema, 'scan-report/1');
      assert.equal(report.input.card, true);
      const has = (subjectPrefix, ruleId) => report.findings.some((f) => f.subject.startsWith(subjectPrefix) && f.ruleId === ruleId);
      assert.ok(has('card:', 'MT-HI-001'), 'hidden-instruction: <IMPORTANT> block in the card description');
      assert.ok(has('card:', 'MT-HI-002'), 'hidden-instruction: keep it from the user');
      assert.ok(has('skill:process_refund', 'MT-EX-002'), 'exfil-sink: the skill asks for the conversation and tokens');
      assert.equal(report.scanner.enforcement, 'none', 'the scanner reports; it never blocks');

      // The copy of the rule table in this repo agrees on those three findings.
      const mine = scanCard(JSON.parse(await (await fetch(cardUrl)).text())).findings.map((f) => `${f.subject}|${f.ruleId}`);
      for (const f of report.findings.filter((x) => ['MT-HI-001', 'MT-HI-002', 'MT-EX-002'].includes(x.ruleId))) assert.ok(mine.some((m) => m.endsWith(`|${f.ruleId}`)), `${f.ruleId} also fires in this repo's copy`);
    } finally { server.kill(); }
  });
