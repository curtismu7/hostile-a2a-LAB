# Hostile A2A LAB

Tier: Demo. Hostile A2A agent demo (catalog item D7). A deliberately hostile A2A specialist serves a **poisoned Agent Card**; an

Repo: https://github.com/curtismu7/hostile-a2a-LAB
offline delegating "generalist" shows what the card makes it do; a **pinned-card client** is shown side by side with an
ungoverned one, telling the story "the card told my agent to include my token".

The point: nothing in A2A discovery inspects card text. It arrives byte for byte. A defense sits where the card is
**consumed**. The server serves payloads and never blocks.

## Run from a clone

Prerequisites: Node 26. Docker (OrbStack) only for the Docker form.

```
git clone https://github.com/curtismu7/hostile-a2a-LAB.git
cd hostile-a2a-LAB
npm ci
npm run build
npm run doctor
npm start
```

## Ports, and what to do if the port is taken

```
Ports: hostile-a2a-LAB listens on 4750 (set with PORT, default 4750).
Port range for this app: 4700-4799.

If the port is taken:
1. Find what is using it:
   lsof -iTCP:4750 -sTCP:LISTEN -n -P
2. If it is an old copy of this app, stop that process: kill <PID>.
3. If it is something else, stop it, or start this app on another port:
   PORT=<other port> npm start
```

Other variable: `HOST_PORT=4750` (Docker host port). Keep both inside 4700-4799.

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
- The shelf check (the entry shows `ready` on a running shelf) was a manual run against the local demo-shelf clone
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

Host check and same-origin writes: the demo API (`/api/*`) answers loopback Host headers plus each `LAB_ALLOWED_HOSTS` name
(comma-separated, no port) on `PORT`; every other Host gets 403. Docker defaults `LAB_ALLOWED_HOSTS` to
`hostile-a2a.local.ping-devops.com`, the Host the family lab-proxy (`https://local.ping-devops.com:8443/hostile-a2a/`) sends. A
write with an Origin header is accepted only from the loopback origin matching Host, or, on a `LAB_ALLOWED_HOSTS` Host only, when
Origin equals `X-Forwarded-Proto://X-Forwarded-Host` (the proxy's origin); every other Origin gets 403. The hostile endpoints
below are deliberately left open: they are the attacker's server, fetched by other A2A clients (the scanner, a victim agent) under
any Host, they name only loopback or reserved hosts whatever Host says, and they hold no state worth forging.

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

---

## What a run leaves behind (observability, rule 27)

Under the Run result the page shows **What each layer logged for this run**: the shared run-observability panel (vendored byte for byte from
AI-DEMO-Standalone `shared/run-observability`, pinned by `web/src/run-observability/run-observability.sha256`, checked by `server/test/run-observability.test.js`).
It is an excerpt: ids, tokens and addresses are masked.

- **Mock only.** Every row is tagged `simulated`: the lab's mock computed it. The page sends one run id with both `run-victim` calls; the server writes one stdout
  line per event and keeps the same events, each with the time on its stdout line, per workspace (the last 20 runs). `POST /api/run-observability {runId}` builds the
  record from those stored events: nothing is re-run and no time is adjusted. **Time = when the lab computed it** (the time on its stdout line); events of one
  `run-victim` call share one time. None of it is read from a product log.
- **Only the pinned client decides.** Its verdict is `allowed` (passed) or `refused` (withheld). Every other row (the specialist serving the card, the pinned
  client's trust-on-first-use approval, what the generalist built, even a poisoned message) is `info`: for information, never a pass.
- **Real record: reserved, not offered.** The Run scenario is offline in both modes (the Privilege gateway check, `POST /api/gateway-check`, is a separate Real
  call and is not part of the run result), and the shared panel has no reader or matcher for this lab's decision lines. So the server answers 409 to a Real record
  request and the page says so. When the panel gains a reader or matcher for this lab (a change to the shared panel first), a Real record can read the lines
  below from Elasticsearch. Nothing is faked and no Elasticsearch setting is read today.
- **The lab's own server logs what it did for a run**, one timestamped line to container stdout, no tokens, no card text, no task:
  `2026-11-22T10:00:00.000Z hostile-a2a event actor=pinned-client outcome=withheld client=pinned variant=rug-pull stage=later findings=changed,scanner-finding`
  (actors `hostile-specialist`, `pinned-client`, `generalist-ungoverned`, `generalist-behind-pin`; written by `run-victim` and the round trip's compare step).

| Layer | In this lab |
|---|---|
| Person | `not-logged`: no sign-in in this lab |
| Agent | the generalist's step (only when the card reached it), `simulated`, for information |
| Authorize | `not-logged`: no PingOne Authorize in this lab |
| Privilege | `not-logged`: no Privilege in the Mock run |
| Agent gateway | the pinned client's approval (info) and verdict (allowed or refused), `simulated`. The lane title is the panel's; the pinned client is the lab's own gate, not a gateway product (the page says so under the panel) |
| Resource server | the hostile specialist serving its Agent Card, `simulated`, for information |

**Where the logs live and where they can stream.** The lab's event lines live in the container's stdout. A collector (`shared/ping-log-collector`) can ship them to
Elasticsearch (`demo-logs-hostile-a2a`) and on to a SIEM. Not in any log today: PingOne Authorize decisions (the PingOne audit API, not read by the panel),
PingFederate `audit.log` (not shipped), and gateway refusal and block lines (unconfirmed shapes). No Elasticsearch settings are in this lab's `.env` or compose file,
and the Docker socket is never mounted.

## Real mode: through the PingOne Privilege gateway

Real mode here is one live call through the SE PingOne Privilege gateway (its URL is the
`HAA_GW_URL` value in the shared settings file) with an agent access key from the same settings
file (`~/Development/.env`, or the file `STANDALONE_ENV` names).

**Privilege objects this lab uses:**

| Object | Value |
|---|---|
| Gateway | the SE PingOne Privilege gateway: URL from `HAA_GW_URL` in the shared settings file (it runs on the SE cluster) |
| Door (Agentic App) | `hostile-a2a` — client path `/hostile-a2a/mcp` |
| Caller | agent access key `HAA_GW_KEY_LAB_AGENT` (write-only, never shown) |
| Backend | `aggregate` = the gateway's MCP aggregate over `opensearch` (9 tools) + `banking-mcp` (33 tools); `aggregate-limited` = the same members with a tool filter |

**What runs in Real:** the **Privilege gateway check** (`POST /api/gateway-check`, card on the
page) — one live `tools/list` through the door with the key, then one `tools/call` probe of a
tool no policy grants, so you see the gateway's own refusal shape. The gateway's words come
back unaltered (keys scrubbed). Settings keys: `HAA_GW_URL`, `HAA_GW_APPS`,
`HAA_GW_KEY_<NAME>` (optional `HAA_GW_VERSION`).
