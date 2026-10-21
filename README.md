# hostile-a2a

Hostile A2A agent demo (catalog item D7). A deliberately hostile A2A specialist serves a **poisoned Agent Card**; an
offline delegating "generalist" shows what the card makes it do; a **pinned-card client** is shown side by side with an
ungoverned one, telling the story "the card told my agent to include my token".

The point: nothing in A2A discovery inspects card text. It arrives byte for byte. A defense sits where the card is
**consumed**. The server serves payloads and never blocks.

## Status (step HA0)

Built and tested: the hostile server (ported, wire output checked byte for byte against the source), the offline victim,
the pinned-card client, the card scanner rules, the API and `GET /api/health` (`demo-health/1`), `npm run doctor`, CI.

**Not built yet:** the interactive web UI. `web/` is a skeleton (banner, theme tokens, inert-text component, API status).
There is no ReactFlow diagram, story, Learn pack, Dockerfile or shelf entry yet. Nothing here has been run in a browser.

## Run

```bash
npm install
npm run doctor     # preflight, no network
npm start          # http://127.0.0.1:4901/  (PORT in .env to change)
npm test           # server (node:test) + web (vitest)
npm run build      # web
```

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

## Safety

See [docs/safety.md](docs/safety.md). Loopback bind only (`HOSTILE_BIND` to opt out), no outbound request of any kind,
every off-box host in every payload is a reserved name, `message/send` is inert, the victim sends nothing and shows
only the placeholder `FAKE-TOKEN-NOT-REAL`.

## Provenance

Server and card payloads: AI-DEMO2 `standalone/hostile-a2a-agent` (MIT). Scanner rule table: `mcp-tools` (from AI-DEMO2
`standalone/mcp-scanner`). Pattern: `hostile-mcp`. Code is copied with source headers, never imported across repos.
See [LICENSE](LICENSE).
