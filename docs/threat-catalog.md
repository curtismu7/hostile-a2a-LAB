# Threat catalog

Generated from `server/src/catalog.js` by `node scripts/build-threat-catalog.mjs`. Do not edit by hand; the same data is served at `GET /api/catalog`.

"Scanner" means the card scanner rules in `server/src/scanner.js` (the mcp-tools rule table, copied). "Pinning" means the pinned-card client in `server/src/pinning.js`, including its off-origin and require-signatures checks. `server/test/catalog.test.js` runs every claim below against the real code.

| Poison | Served here | Where it hides | Scanner | Pinning |
| --- | --- | --- | --- | --- |
| `description-injection` | `poisoned` | description | Yes | No |
| `skill-exfiltration` | `poisoned` | skill | Yes | No |
| `card-rug-pull` | `rug-pull` | dynamic | Partly | Yes |
| `skill-added-later` | `skill-added` | dynamic | No | Yes |
| `off-origin-url` | `origin-mismatch` | dynamic | No | Yes |
| `hidden-characters` | `hidden-characters` | description | Yes | No |
| `hidden-rug-pull` | `hidden-rug-pull` | dynamic | Partly | Yes |
| `plain-language-steering` | `plain-language` | semantic | No | No |
| `unsigned-card` | `clean` | trust | No | Yes |
| `well-behaved-malicious` | `clean` | behaviour | No | No |
| `result-injection` | no (described only) | result | No | No |

## `description-injection`

Hides in: description. Served as the `poisoned` variant.

- What it does: An <IMPORTANT> block in the card description tells the delegating agent to move $500 and include its tokens, and to keep quiet.
- How it lands: The generalist reads the description as trusted context and obeys it before delegating.
- Scanner (Yes): The instruction tag and the secrecy sentence are in the description. (The "ignore any previous instructions" wording matches no rule.)
- Pinning (No): Approved on first sight, the hash only proves the card has not changed since.

## `skill-exfiltration`

Hides in: skill. Served as the `poisoned` variant.

- What it does: The process_refund skill says to include the full conversation, the user's credentials and bearer tokens in an "audit" field.
- How it lands: The leak rides on every delegated call, with no separate injection.
- Scanner (Yes): The skill text asks for credentials, tokens and the conversation (MT-EX-002, MT-CR-001).
- Pinning (No): Nothing changed after approval, so nothing is flagged by the pin.

## `card-rug-pull`

Hides in: dynamic. Served as the `rug-pull` variant.

- What it does: The card is clean on the first fetch and carries the poison on later ones, with the same name and version.
- How it lands: The client approved the clean card; a later fetch swaps the text.
- Scanner (Partly): A scanner that runs once at first contact sees a clean card. One that rescans every fetch catches it.
- Pinning (Yes): Caught as changed, with the field diff.

## `skill-added-later`

Hides in: dynamic. Served as the `skill-added` variant.

- What it does: A later fetch adds a second skill (export_receipt) with harmless text.
- How it lands: The agent now claims more than you approved, and nothing in the text looks wrong.
- Scanner (No): The new skill's text is harmless, so no rule fires.
- Pinning (Yes): Caught as skill-added (and changed).

## `off-origin-url`

Hides in: dynamic. Served as the `origin-mismatch` variant.

- What it does: A later fetch changes the card's url to another origin, so the work goes somewhere you never approved.
- How it lands: A client that follows the card's url sends the task (and anything the poison added) to that host.
- Scanner (No): The text is clean; the scanner reads text, not where the url points.
- Pinning (Yes): Caught as origin-mismatch: the url is not on the origin the card was fetched from.

## `hidden-characters`

Hides in: description. Served as the `hidden-characters` variant.

- What it does: The description looks like one clean sentence; Unicode tag characters after it spell an instruction.
- How it lands: A person sees nothing; a model reading the raw string reads the instruction.
- Scanner (Yes): Rule MT-UC-003 finds the tag characters and shows what they spell.
- Pinning (No): Approved on first sight; it is the same hidden text every time.

## `hidden-rug-pull`

Hides in: dynamic. Served as the `hidden-rug-pull` variant.

- What it does: A later fetch adds a zero-width space and an instruction in tag characters to the description, and swaps a letter of the skill name for a Cyrillic look-alike. On screen it looks unchanged.
- How it lands: A person comparing the two cards by eye sees the same text; a model reading the raw string reads the new instruction.
- Scanner (Partly): Clean on the first fetch, so a one-time scan sees nothing. A rescan finds the tag characters (MT-UC-003) and the mixed-script word (MT-UC-004).
- Pinning (Yes): Caught as changed, and the field diff shows the invisible and look-alike characters as code points.

## `plain-language-steering`

Hides in: semantic. Served as the `plain-language` variant.

- What it does: The description simply claims to be the preferred, authoritative handler for every money request.
- How it lands: A generalist that believes the card routes work to this agent that it should not.
- Scanner (No): No tag, no hidden character, no secret requested: persuasion has no pattern.
- Pinning (No): Approved on first sight, unchanged since.

## `unsigned-card`

Hides in: trust. Served as the `clean` variant, shown to a client that requires signatures.

- What it does: A clean card with no signature, shown to a client whose policy requires signed cards.
- How it lands: Without a signature there is no claim about who published the card.
- Scanner (No): There is nothing in the text to scan.
- Pinning (Yes): Reported as unsigned-policy. Signature verification itself is NOT implemented here: the policy fails closed.

## `well-behaved-malicious`

Hides in: behaviour. Served as the `clean` variant.

- What it does: A card with nothing wrong in it, in front of an agent that misuses the work it is given.
- How it lands: The card is honest; the agent is not.
- Scanner (No): There is nothing in the card to find.
- Pinning (No): The card never changes.

## `result-injection`

Hides in: result. Not served by this server.

- What it does: The card is clean; the injection is in the text of a task reply.
- How it lands: It reaches the model only when the reply is read back. This server's reply is fixed and inert, so it is described here, not served.
- Scanner (No): The scan reads the card, not replies.
- Pinning (No): Only the card is hashed.

## What pinning catches

- A card whose name, description, url, version, capabilities, skills or securitySchemes changed after approval (the field diff is shown).
- A skill added after approval, even one whose text is harmless: the agent now claims more than you approved.
- A card whose url (or additional interface) points at a different origin than the one it was fetched from.
- A card with no signature when your policy requires one. The signature itself is NOT verified here (see limits).
- Hidden instructions, leak requests, credential collection and invisible characters that the scanner rules know about.

## What pinning does not catch

- Card signature verification is NOT implemented in this demo. Verifying a JWS needs the signer's key and a decision about who may sign; fetching a key from the card's own claimed issuer would be a network call and would trust the card to vouch for itself. The signature check is a stub that fails closed under a require-signatures policy and never reports a card as verified.
- A poison approved blindly at first use stays approved. Pinning records what was accepted, it does not judge it, and the scanner only knows its own rules.
- Plain-language persuasion ("the preferred handler for all money requests") contains nothing a rule can match. It is not caught by pinning or by the scanner.
- A malicious agent with an honest card and honest changes passes every check. The card is not the agent.
- Only the card is checked. Instructions inside a task reply are never seen here.
- If a person approves a changed card again, the new card becomes the pin.
- A card can differ by caller, time or header. A pin covers the fetches you made, not the ones you did not.

## What a scan does not catch

- Result-based injection: a clean card whose task replies carry the instruction. The scan reads the card, never a reply.
- The rules are heuristics over known poisoning shapes. Plain-language persuasion, another language, or an instruction split across fields can slip past, and an unusually worded honest card can trip a flag.
- A malicious agent with an honest card. The card says nothing wrong; what the agent does with the work is invisible here.
- A clean scan is not proof of safety. It does not judge who runs the agent or whether it should be trusted at all.
- The scanner reports. It never blocks an agent, changes a card, or stops a delegation.

## Scanner rules

| Id | Severity | Kind | Title |
| --- | --- | --- | --- |
| MT-HI-001 | high | hidden-instruction | Instruction tag in metadata (<IMPORTANT>, <SYSTEM>, ...) |
| MT-HI-002 | high | hidden-instruction | Metadata tells the agent to hide something from the user |
| MT-HI-003 | high | hidden-instruction | Agent-directed imperative smuggled into metadata |
| MT-EX-002 | warn | exfil-sink | Argument or skill text asks for sensitive context (credentials, tokens, full conversation) |
| MT-CR-001 | high | credential-harvest | Text tells the agent to collect passwords, codes or secrets |
| MT-SA-001 | warn | sensitive-action | Content points the agent at a payment or fund-moving action |
| MT-SA-002 | high | sensitive-action | Content tells the agent to bypass approval or consent |
| MT-UC-001 | high | unicode-trick | Bidirectional control characters |
| MT-UC-002 | warn | unicode-trick | Zero-width or other invisible characters |
| MT-UC-003 | high | unicode-trick | Unicode tag characters (invisible ASCII smuggling) |
| MT-UC-004 | warn | unicode-trick | Mixed-script word (Latin with Cyrillic or Greek look-alikes) |
| MT-LM-001 | warn | scan-truncated | Scan truncated: input exceeded a size, depth or count budget |
