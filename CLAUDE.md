# CLAUDE.md: hostile-a2a LAB

Tier: Demo. A deliberately hostile A2A specialist serves a poisoned Agent Card; an offline delegating "generalist" shows what the card makes it do; a pinned-card client is shown beside an ungoverned one (story: "the card told my agent to include my token"). Catalog item D7. Node 26, Express server (`server/`), React + Vite page (`web/`), loopback only, in-memory sessions. Repo: https://github.com/curtismu7/hostile-a2a-LAB. Read `README.md` first; the rulebook is `~/Development/STANDALONE-RULES.md` (skill `standalone-demo`).

## Run and test
- `npm ci`, `npm test` (server + web + script tests), `npm run doctor`, `npm start`. Docker: `docker compose up --build -d`, publishes `127.0.0.1` only.
- Run suites on the Air (`air-test`), not on this Mac.
- `GET /api/health` answers `demo-health/1` for the shelf.

## Rules that bite
- Offline only: no outbound call of any kind. The Agent Card payloads are static data; the wire output is pinned by tests.
- Nothing in A2A discovery inspects card text — the demo's point. Defense sits where the card is consumed (the pinned client), never in the server.
- `web/src/standalone-ui.css` is the vendored shared stylesheet (AI-DEMO-Standalone canonical; hash pinned in `scripts/standalone-ui.sha256`). Do not edit it. UI patterns: `AI-DEMO-Standalone/shared/STANDALONE-UI-PATTERNS.md`; check with that repo's `scripts/check-ui-patterns.sh`.
- The secrets gate (`npm run check:forbidden`, CI job with the owner's secret) fails on a string from the owner's list. No identifiers from other projects; `.invalid` hosts only.
- `web/src/run-observability/*`, `server/src/runObservability.js` (the CORE: no imports, no network) and `scripts/run-observability-checkPin.mjs` are vendored byte for byte from AI-DEMO-Standalone `shared/run-observability` (pin: `run-observability.sha256`, checked by `server/test/run-observability.test.js`). Never edit them; this lab reads no logs, so it does not vendor `runObservabilityReaders.js` and the safety test exempts nothing for them.
- Node 26 only. CI is GitHub-hosted. Docker is OrbStack, never Docker Desktop.
- Never edit the shared `~/Development/AI-DEMO2` checkout; it is a read-only source.
- Do not use `crypto.generateKeyPairSync('ec')` or async EC `generateKeyPair` (SIGABRT on Node 20 CI); use `createECDH` + `createPrivateKey`.
- No AI attribution anywhere (owner, 2026-11-07): no Co-Authored-By trailer and no "Generated with" line in commits, PR bodies or files; CI runs `scripts/check-no-ai-attribution.sh`.

## Default story
The default vertical is `airlines` (AirGuard Airlines, a fictional airline; `DEFAULT_VERTICAL` in `web/src/story/stories.js`). The server has no packs: the card fixtures are a refunds specialist that refunds a booking. Generic and Banking stay selectable. Retired names (Meridian Air, Skyline Air, Northwind, Contoso, Tessera, Fabrikam, Harbor, Vellum, Super Banking) are guarded by tests; do not bring them back.

## Shelf
`docs/shelf-entry.json` registers this app. Run the parent's `scripts/check-drift.sh <this clone>` before a PR.
