import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

// This server serves hostile payloads: every published port must be bound to loopback on the host.
// A small line parser (no YAML dependency): the list items under each `ports:` key. Copied from hostile-mcp.
export function publishedPorts(text) {
  const out = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)ports:\s*$/.exec(lines[i]);
    if (!m) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const item = /^\s*-\s*["']?([^"'\s#]+)["']?/.exec(lines[j]);
      if (!item || lines[j].search(/\S/) <= m[1].length) break;
      out.push(item[1]);
    }
  }
  return out;
}
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('docker-compose.yml publishes only on 127.0.0.1', () => {
  const ports = publishedPorts(read('docker-compose.yml'));
  assert.ok(ports.length > 0, 'the parser found the published port');
  for (const p of ports) assert.match(p, /^127\.0\.0\.1:/, `${p} must start with 127.0.0.1:`);
});

test('the parser flags an unbound or wildcard publish', () => {
  for (const bad of ['- "4901:4901"', '- "0.0.0.0:4901:4901"', '- 4901']) {
    const ports = publishedPorts(`services:\n  a:\n    ports:\n      ${bad}\n`);
    assert.equal(ports.length, 1);
    assert.doesNotMatch(ports[0], /^127\.0\.0\.1:/);
  }
});

test('compose hardens the container and the Dockerfile is Node 22, non-root', () => {
  const c = read('docker-compose.yml');
  assert.match(c, /read_only:\s*true/);
  assert.match(c, /cap_drop:\s*\[ALL\]/);
  assert.match(c, /no-new-privileges:true/);
  assert.match(c, /\/api\/health/);
  const d = read('Dockerfile');
  assert.match(d, /FROM node:22/);
  assert.match(d, /^USER node$/m);
  assert.match(d, /HOSTILE_BIND=0\.0\.0\.0/);
});

test('no port in the compose file or Dockerfile is one of the off-limits ports', () => {
  const text = read('docker-compose.yml') + read('Dockerfile');
  for (const bad of ['8080', '5173', '18080', '19080', '19090', '3900', '4400', '4510', '4600', '4601', '4701', '8898']) assert.doesNotMatch(text, new RegExp(`[:"= ]${bad}\\b`), bad);
});
