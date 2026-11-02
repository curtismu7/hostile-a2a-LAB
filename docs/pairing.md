# How this demo pairs with the others

| Demo | Role |
| --- | --- |
| **Hostile A2A (this repo, D7)** | The attack on agent discovery: a poisoned Agent Card, and the pinned-card client that detects change where the card is consumed. |
| **Hostile MCP** (`/Users/cmuir/Development/hostile-mcp`, D6) | The same attack on tool metadata. Same shape (payloads served, never blocked; offline victim; pinning), different protocol: MCP tool descriptions and schemas instead of an Agent Card. Run both to show the pattern is the protocol-independent point. |
| **mcp-tools** (`/Users/cmuir/Development/mcp-tools`, D3/D4) | The scanner. It can scan this server's card (`--card`), and this repo copies its rule table. See below. |
| **Privilege demo** (separate product) | Controls what an agent may do on the wire. Pinning here only detects a change in what a card claims; it does not decide whether a delegated call is allowed. |

## Scan this server's card with the mcp-tools scanner

```bash
npm start                                   # in this repo: http://127.0.0.1:4750/
cd ../mcp-tools && npm run scan -- --card http://127.0.0.1:4750/.well-known/agent-card.json
```

Expected (verified, scanner reports and never blocks): `MT-HI-001` and `MT-HI-002` on the card description (instruction tag; keep it from the user) and `MT-EX-002` on the `process_refund` skill (asks for the full conversation and tokens). The scanner does not read where the card's `url` points, so it cannot see the off-origin variant; that is pinning's job.

`scripts/mcp-tools.integration.test.mjs` does exactly this on a free port and asserts those three findings. It is skipped when the mcp-tools checkout (default `../mcp-tools`, or `MCP_TOOLS_SRC`) is absent or has no `node_modules`. Nothing in the mcp-tools repo is modified.
