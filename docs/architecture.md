# Architecture

One Node process (Express, ESM) serves the hostile A2A endpoints at the root, the demo API under `/api` and the built web app. There is no database: card sessions are in memory.

```
 A2A client --GET /.well-known/agent-card.json | POST /a2a/jsonrpc --> hostile server  (server/src/hostile.js, card.js)
                                                                        serves payloads, never scores or blocks
 web UI -------/api/*------------------------------------------------> demo API  (server/src/app.js)
                                                                        |-- session.js   in-memory card sessions (own fetch counter, own pins)
                                                                        |-- scenario.js  the S21 run
                                                                        |-- victim.js    offline deterministic generalist
                                                                        |-- pinning.js   pinned-card client (trust on first use)
                                                                        |-- scanner.js   card scanner rules
                                                                        `-- catalog.js, safety.js, corpus.js, health.js, doctor.js
```

| Piece | File | Job |
| --- | --- | --- |
| Hostile server | `server/src/hostile.js`, `card.js` | The poisoned card, the variants, the per-session card rug-pull, and an inert `message/send`. Copied from the source demo; the wire output is checked byte for byte (`server/test/golden.test.js`). |
| Generalist (victim) | `server/src/victim.js` | A stand-in for a trusting model. Reads the card text and returns the message it would send, with a reason each. Rules at `GET /api/victim-rules`. No LLM, no execution, nothing sent. |
| Pinned-card client | `server/src/pinning.js` | `approve(card)` pins a hash; `check(card)` returns findings and a verdict, with the field diff. |
| Scanner | `server/src/scanner.js`, `scanner-unicode.js` | The mcp-tools rules that apply to card text, copied. Reports; never blocks. |
| Sessions | `server/src/session.js` | Fetch #1 is clean for the rug-pull variants, later fetches carry the change. Per session, so the UI flow repeats without a restart. |
| Safety / corpus | `server/src/safety.js`, `corpus.js` | Loopback rule, reserved-host rule, payload scan over every card variant at every fetch number plus the fake reply. |
| Health | `server/src/health.js`, `doctor.js` | `GET /api/health`, contract `demo-health/1`, state cached 60 s from the doctor checks. |
| Web | `web/src/` | Gallery, run, round trip, limits, diagram, stories S21 and S22. |

## Canonicalisation

A card's pin is `sha256` over a canonical form of `name, description, url, version, capabilities, skills[id, name, description, inputModes, outputModes], securitySchemes`. Anything else on the card is not hashed (see `docs/limits.md`).

## Verdicts

`origin-mismatch`, `unsigned-policy`, `skill-added`, `changed`, `scanner-finding`, `unpinned`, `ok`, most severe first. `verdict` is the first that applies; `findings` lists all of them.

## Where defences sit

Nothing in A2A discovery inspects card text, so a defence can only sit where the card is consumed: in the client, or a gateway in front of it. This server never scores or blocks, by design; if it did, the demo would show a defence that real hostile servers do not provide.
