# hostile-a2a

Tier: Demo. Hostile A2A agent demo (catalog item D7). A deliberately hostile A2A specialist serves a **poisoned Agent Card**; an
offline delegating "generalist" shows what the card makes it do; a **pinned-card client** is shown side by side with an
ungoverned one, telling the story "the card told my agent to include my token".

The point: nothing in A2A discovery inspects card text. It arrives byte for byte. A defense sits where the card is
**consumed**. The server serves payloads and never blocks.

## Status

Built and tested: the hostile server (wire output checked byte for byte against the source), the offline delegating
generalist, the pinned-card client, the card scanner rules, the API and `GET /api/health` (`demo-health/1`), the web UI
(poison gallery, side-by-side delegation run, card round trip with field diff, honest limits, ReactFlow diagram with
movable boxes / Simulate / Reset / speed, stories S21 and S22 with three vertical packs, light and dark), Docker,
the SE shelf entry, the Learning Hub content pack, and a browser e2e script.

Last run: 75 server tests, 27 web tests and 14 script tests pass (`npm test`), `npm run build` passes, and `npm run e2e`
(45 checks) passes against both the host-run app and the Docker container, in a real Chromium.

Not verified:

- The e2e script is documented, not run by CI. It needs a Playwright Chromium (`npx playwright install chromium`).
- The Docker image and compose file were built and run on OrbStack and checked by content (health, the page, a card
  round trip through the API, the payload safety scan, non-root, read-only, loopback-only publish, and the e2e script
  against the container). That is a manual check, not CI. CI only parses the compose file for the loopback-only port.
- The shelf check (the entry shows `ready` on a running shelf) was a manual run against `/Users/cmuir/Development/demo-shelf`
  with a temporary data directory, not a test in this repo.
- The mcp-tools integration test is skipped when that checkout (or its `node_modules`) is absent.
- The generalist is a deterministic stand-in, not a model: it shows what a client that obeys card text would do, not how
  often a real model is fooled.
- Card signature verification is **not implemented** (see below).

## Run

```bash
npm install
npm run doctor     # preflight, no network
npm run build      # the server serves web/dist
npm start          # http://127.0.0.1:4750/  (PORT in .env to change)
npm test           # server (node:test), web (vitest), content pack, docs, compose, mcp-tools integration
npm run e2e        # real-browser run on a temporary server (port 4943); screenshots in .data/e2e-screenshots (git-ignored)
```

`npm run e2e -- http://127.0.0.1:4750` drives a server that is already running instead.

### Docker (OrbStack)

```bash
HOST_PORT=4750 docker compose up --build -d     # http://127.0.0.1:4750  (HOST_PORT defaults to 4750)
docker compose down
```

The image is Node 22 and runs as the non-root `node` user, read-only, all capabilities dropped. Inside the container the
server listens on all interfaces (`HOSTILE_BIND`, the explicit opt-in); `docker-compose.yml` publishes
`127.0.0.1:HOST_PORT:4750` only, and `scripts/compose.test.mjs` fails if that changes.

### SE shelf, Learning Hub, scanner

- Shelf: merge `docs/shelf-entry.json` into the shelf's `.data/demos.local.json` (edit `composeFile` to your checkout path).
  With the app running on 4750 the shelf shows it as `ready` from `/api/health`.
- Learning Hub: `content-pack.json`; regenerate and validate with `npm run content-pack` (ajv against
  `docs/content-pack.schema.json`). The pack lists no sources: this repo has no public documentation URL it can verify.
- Scanner: `cd ../mcp-tools && npm run scan -- --card http://127.0.0.1:4750/.well-known/agent-card.json` flags the hidden
  instruction and the exfil skill. See [docs/pairing.md](docs/pairing.md).

Hostile endpoints at the root: `GET /.well-known/agent-card.json` (the poisoned card), `POST /a2a/jsonrpc`
(`message/send`, a fixed fake reply), `GET /variants/:variant/.well-known/agent-card.json`,
`GET /rugpull/:sid/.well-known/agent-card.json` (clean on the first GET per `sid`, poisoned after).

API: `GET /api/health`, `/api/catalog`, `/api/victim-rules`, `/api/safety-scan`; `POST /api/run-victim`
(`{task, mode: ungoverned|pinned, stage: first|later, variant?, requireSignatures?}`); the three-step flow
`POST /api/card-session/new`, `/:id/approve`, `/:id/compare`, `DELETE /:id`.

## What pinning and scanning catch, and do not

Catch: a card that changed after approval (with a field diff), a skill added later, a card whose `url` is on a different
origin than the one it was fetched from, an unsigned card under a require-signatures policy, and hidden instructions,
leak requests and invisible characters that a scanner rule exists for.

Do **not** catch: a poison approved blindly at first use that no rule knows, semantic manipulation in plain language, a
malicious but well-behaved agent, and result-based injection in task replies.

**Card signature verification is NOT implemented.** Verifying a JWS needs the signer's key and a decision about who may
sign; fetching a key from the card's own claimed issuer would be a network call and would let the card vouch for itself.
The check is a stub that fails closed under a require-signatures policy and never reports a card as verified.

## Docs

[architecture](docs/architecture.md), [safety](docs/safety.md) (every rule and the test that enforces it),
[threat catalog](docs/threat-catalog.md) (generated from `server/src/catalog.js`), [honest limits](docs/limits.md),
[how it pairs with Hostile MCP, mcp-tools and the Privilege demo](docs/pairing.md).

## Safety

See [docs/safety.md](docs/safety.md). Loopback bind only (`HOSTILE_BIND` to opt out), no outbound request of any kind,
every off-box host in every payload is a reserved name, `message/send` is inert, the victim sends nothing and shows
only the placeholder `FAKE-TOKEN-NOT-REAL`.

## Provenance

Server and card payloads: AI-DEMO2 `standalone/hostile-a2a-agent` (MIT). Scanner rule table: `mcp-tools` (from AI-DEMO2
`standalone/mcp-scanner`). Pattern: `hostile-mcp`. Code is copied with source headers, never imported across repos.
See [LICENSE](LICENSE).
