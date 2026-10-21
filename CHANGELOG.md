# Changelog

## 0.1.0 (in progress)

- HA0: scaffold; server ported from AI-DEMO2 `standalone/hostile-a2a-agent` (golden-wire test); card variants and the per-session card rug-pull; card scanner rules; pinned-card client; offline delegating victim; API and `GET /api/health` (`demo-health/1`); doctor; CI. Web UI not built yet (HA1 below).
- HA1: web UI: poison gallery, side-by-side delegation run (ungoverned vs pinned), card round trip with field diff and [U+XXXX] chips, honest limits (card signature verification NOT implemented), story engine with two stories and three vertical packs, ReactFlow diagram (drag, Simulate, Reset, speed), presenter toggle, themes. New card variant `hidden-rug-pull`. `npm run e2e` drives the built app in a real browser.
