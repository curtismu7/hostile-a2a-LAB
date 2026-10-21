#!/usr/bin/env node
// Real-browser run of the host-run app: every page, both clients, the card round trip (including the invisible change),
// the diagram (drag, Simulate, Reset, speed), light / dark / narrow. Screenshots go to .data/e2e-screenshots (git-ignored).
// Not run by CI. Pattern copied from hostile-mcp (scripts/e2e.mjs).
//
//   npm run build            (once; the server serves web/dist)
//   npm run e2e              starts the server on E2E_PORT (default 4943), drives it, stops it
//   npm run e2e -- <url>     drives a server that is already running
//
// Uses the Chromium the installed Playwright resolves (`npx playwright install chromium` if missing). The server makes
// no outbound request, and neither does this.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shots = path.join(root, '.data', 'e2e-screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const check = (ok, what) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`); if (!ok) failures++; };

const given = process.argv.slice(2).find((a) => a.startsWith('http'));
const port = Number(process.env.E2E_PORT) || 4943;
const base = given ? given.replace(/\/$/, '') : `http://127.0.0.1:${port}`;

let server;
if (!given) {
  if (!fs.existsSync(path.join(root, 'web', 'dist', 'index.html'))) { console.error('Run `npm run build` first.'); process.exit(2); }
  server = spawn(process.execPath, ['server/src/index.js'], { cwd: root, env: { ...process.env, PORT: String(port), HOSTILE_BIND: '' }, stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up yet */ } await sleep(250); }
}
fs.rmSync(shots, { recursive: true, force: true });
fs.mkdirSync(shots, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const shot = (name) => page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });
  const go = async (hash) => { await page.goto(`${base}/#/${hash}`); await page.reload(); };
  const text = (id) => page.getByTestId(id).innerText();
  const external = [];
  const errors = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (u.origin !== new URL(base).origin && !/^(data|blob):/.test(r.url())) external.push(r.url()); });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // Keyboard order: the skip link is the first stop, then the nav; Enter on it moves focus to <main>.
  await go('gallery');
  await page.keyboard.press('Tab');
  check((await page.evaluate(() => document.activeElement.textContent)) === 'Skip to content', 'the first Tab stop is the skip link');
  await page.keyboard.press('Enter');
  check(await page.evaluate(() => document.activeElement.id) === 'main', 'the skip link moves focus to the main region');

  // Gallery
  await go('gallery');
  await page.getByTestId('poison-card-rug-pull').waitFor();
  check((await text('banner')).toLowerCase().includes('deliberately hostile'), 'banner says the agent is hostile on purpose');
  check((await page.locator('[data-testid^="poison-"]').count()) === 11, 'gallery shows eleven poisons');
  check((await text('poison-hidden-rug-pull')).includes('Caught by pinning'), 'the hidden rug-pull row is caught by pinning');
  check((await text('poison-plain-language-steering')).includes('Neither'), 'plain-language steering is caught by neither');
  check((await text('story-panel')).includes('The card told my agent to include my token'), 'the gallery carries the token story');
  await shot('1-gallery');

  // Side-by-side run: day-one poison, then the rug-pull the morning after, then the unsigned policy.
  await go('run');
  await page.getByRole('button', { name: 'Run both clients' }).click();
  await page.getByTestId('result-pinned').waitFor();
  check((await text('result-ungoverned')) === 'POISON LANDED', 'ungoverned: the poisoned card lands');
  check((await text('result-pinned')) === 'BLOCKED', 'pinned: the scanner rules block the poisoned card');
  check((await text('col-ungoverned')).includes('FAKE-TOKEN-NOT-REAL'), 'the message carries the fake token placeholder');
  check((await text('col-ungoverned')).includes('Sent: false'), 'the message is marked not sent');
  check((await page.locator('[data-testid=col-ungoverned] mark').count()) > 0, 'poisoned text is highlighted');
  await shot('2a-run-poisoned');
  await go('run?poison=plain-language');
  await page.getByRole('button', { name: 'Run both clients' }).click();
  await page.getByTestId('result-pinned').waitFor();
  check((await text('result-pinned')) === 'POISON LANDED', 'plain-language steering lands even through the pinned client (the honest limit)');
  await go('run?poison=unsigned');
  await page.getByRole('button', { name: 'Run both clients' }).click();
  await page.getByTestId('result-pinned').waitFor();
  check((await text('result-pinned')) === 'WITHHELD BY POLICY', 'unsigned card is withheld by the signature policy');
  check((await text('col-pinned')).includes('NOT implemented'), 'the page says signature verification is not implemented');
  await shot('2b-run-unsigned');

  // Card round trip, each way the card can change. The hidden change is the one that looks identical on screen.
  for (const [variant, finding] of [['rug-pull', 'changed'], ['hidden-rug-pull', 'changed'], ['skill-added', 'skill-added'], ['origin-mismatch', 'origin-mismatch']]) {
    await go('roundtrip');
    await page.getByLabel('What changes').selectOption(variant);
    await page.getByRole('button', { name: /Approve fetch #1/ }).click();
    await page.getByTestId('step1').waitFor();
    if (variant === 'rug-pull') await shot('3a-roundtrip-approved');
    await page.getByRole('button', { name: 'Fetch the card again (#2)' }).click();
    await page.getByTestId('step2').waitFor();
    if (variant === 'rug-pull') await shot('3b-roundtrip-card2');
    await page.getByRole('button', { name: 'Compare the two clients' }).click();
    await page.getByTestId('step3').waitFor();
    check((await text('rt-pinned')).includes('REFUSED'), `${variant}: pinned client refuses`);
    check((await text('step3')).includes(finding), `${variant}: the finding ${finding} is shown`);
    check((await text('rt-ungoverned')).includes('ACCEPTED'), `${variant}: ungoverned client accepts`);
    check((await text('step3')).includes('Hash before'), `${variant}: both hashes are shown`);
    if (variant === 'hidden-rug-pull') {
      const chips = await page.locator('[data-testid=step3] table .chip').allInnerTexts();
      check(chips.includes('[U+200B]') && chips.some((c) => c.startsWith('[U+E00')) && chips.includes('[U+0440]'), `hidden rug-pull: invisible and look-alike characters appear as chips (${chips.length})`);
    }
    await shot(`3c-roundtrip-${variant}`);
  }
  await page.getByRole('button', { name: 'Reset the flow' }).click();
  await page.getByRole('button', { name: /Approve fetch #1/ }).and(page.locator(':enabled')).waitFor({ timeout: 5000 }).catch(() => {});
  check(await page.getByRole('button', { name: /Approve fetch #1/ }).isEnabled(), 'reset returns the flow to step 1');

  // Limits
  await go('limits');
  await page.getByTestId('limit-signatures-not-verified').waitFor();
  check((await text('signature-note')).includes('NOT implemented'), 'limits page says card signature verification is not implemented');
  await shot('4-limits');

  // Diagram: drag a box, Simulate with the speed control, Reset puts the box back.
  await go('diagram');
  await sleep(800); // let fitView settle before measuring
  const node = page.locator('.react-flow__node').filter({ hasText: 'Offline generalist' });
  const before = await node.boundingBox();
  await page.mouse.move(before.x + before.width / 2, before.y + 10);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 40, before.y + 90, { steps: 6 });
  await page.mouse.up();
  const after = await node.boundingBox();
  check(Math.abs(after.y - before.y) > 40, 'a diagram box can be dragged');
  await page.getByLabel('Speed').selectOption('4');
  await page.getByRole('button', { name: 'Simulate' }).click();
  await sleep(1800);
  check((await text('caption')).includes('Step 4 of 4'), 'Simulate walks to the last step at 4x');
  await shot('5a-diagram-dragged');
  await page.getByRole('button', { name: 'Reset' }).click();
  await sleep(500);
  const reset = await node.boundingBox();
  check(Math.abs(reset.y - before.y) < 3 && (await text('caption')).includes('Press Simulate'), 'Reset puts the box and the caption back');

  // Light / dark / narrow
  await go('run?poison=rug-pull');
  await page.getByRole('button', { name: 'Run both clients' }).click();
  await page.getByTestId('result-pinned').waitFor();
  await page.emulateMedia({ colorScheme: 'dark' });
  await shot('6a-run-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.getByRole('button', { name: /^Theme:/ }).click();
  check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'the theme button forces light');
  await page.getByRole('button', { name: /^Theme:/ }).click();
  await shot('6b-run-forced-dark');
  await page.setViewportSize({ width: 375, height: 800 });
  for (const hash of ['gallery', 'run?poison=rug-pull', 'roundtrip', 'limits', 'diagram']) {
    await go(hash);
    await sleep(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 0, `narrow (375px): ${hash.split('?')[0]} has no horizontal page scroll`);
    await shot(`7-narrow-${hash.split('?')[0]}`);
  }

  check(external.length === 0, `no request left the app origin${external.length ? `: ${external.join(', ')}` : ''}`);
  check(errors.length === 0, `no console or page errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} finally {
  await browser.close();
  server?.kill();
}
console.log(failures ? `\n${failures} check(s) FAILED` : `\nall checks passed; screenshots in ${path.relative(root, shots)}`);
process.exit(failures ? 1 : 0);
