# Safety

This repo holds hostile content on purpose, so it is built to be inert. Each rule names the test that enforces it.

| Rule | Enforced by (`server/test/`) |
| --- | --- |
| Binds `127.0.0.1` only; refuses another address unless `HOSTILE_BIND` is set. | `safety.test.js`: "binds loopback by default...", "a started server is actually listening on loopback only". |
| Makes no outbound request of any kind (server, victim, API). | `safety.test.js`: "the server and the victim make no outbound request" (the guard in `netguard.js` blocks every non-loopback socket, DNS lookup and fetch and records attempts; zero recorded), "the guard itself works" (it trips on all three), "server source has no outbound code path". `api.test.js` runs under the same guard. |
| Every off-box host in every payload is reserved: `.invalid`, `.example`, or the apex of example.com/net/org (never a subdomain, never a real host or IP). Loopback is the server itself. | `safety.test.js`: "reserved hosts...", "the host scanner finds real hosts..." (including hosts hidden in tag characters), "every payload names only reserved hosts", "everything the server sends over the wire names only reserved hosts, even for a spoofed Host header". `npm run doctor`, `GET /api/health` and `GET /api/safety-scan` run the same scan. |
| `message/send` is inert: a fixed fake reply that touches nothing and calls nothing. | `safety.test.js`: "message/send is inert". |
| The victim never sends or executes anything; it returns the message it would send, as data. | `victim.test.js`: "executed and sent are false, always", "deterministic and side-effect free". |
| No real tokens: where a poison asks for a token the victim shows `FAKE-TOKEN-NOT-REAL`. | `victim.test.js`: "no real token ever appears". |
| Hostile input (huge, deeply nested, prototype-pollution keys, unicode tricks) is handled, not executed. | `scanner.test.js`, `pinning.test.js`, `victim.test.js`, `api.test.js` (413 on a huge body). |

Deviations from the source server, all for safety: the card `url` uses the `Host` header only when it is loopback or a
reserved name; the `message/send` reply echoes at most 200 characters and withholds text that names a non-reserved host;
JSON bodies are capped. The golden-wire test proves the card and a normal reply are otherwise byte-identical to the source.

## Not covered

A real A2A client you point at this server will read the hostile payloads. Whether it obeys them is that client's
behaviour. Use a throwaway client with no real tools attached.
