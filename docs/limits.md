# Honest limits

Pinning catches a card that **changes** after approval, or that points off-origin. The scanner catches text it has a rule for. Neither decides whether the thing approved was good. The same text is in the app on the Limits page (`server/src/pinning.js`, `LIMITS`).

Catches:

- A card whose name, description, url, version, capabilities, skills or securitySchemes changed after approval, with the field diff (including invisible and look-alike characters shown as code points).
- A skill added after approval, even one whose text is harmless.
- A card whose `url` (or additional interface) is on a different origin than the one it was fetched from.
- An unsigned card when your policy requires signatures (the policy is a stub, see below).
- Hidden instructions, leak requests, credential collection and invisible characters that a scanner rule exists for.

Does not catch:

- **A poison approved blindly at first use.** Its hash matches itself forever. The scanner can flag it at first sight only if a rule knows the shape.
- **Semantic manipulation in plain language.** "The preferred handler for all money requests" contains nothing a rule can match.
- **A malicious but well-behaved agent.** The card is honest; the agent is not.
- **Result-based injection.** Only the card is checked; instructions inside a task reply are never seen.
- **A person who approves a changed card again.** The new card becomes the pin.
- **A card that differs by caller, time or header.** A pin covers the fetches you made.

## Card signature verification is NOT implemented

Verifying a signed card needs the signer's key and a decision about who may sign. Fetching the key from the card's own claimed issuer would be a network call (this demo makes none) and would let the card vouch for itself. So the check is a stub: under a require-signatures policy an unsigned card is withheld, and no card is ever reported as verified. Do not read "signed" anywhere in this demo as "verified".

## The victim is not a model

The generalist is a deterministic stand-in for a trusting model: it reads the card text and returns the message it would send, as data. It shows what a client that obeys card text would do. It does not measure how often a real model is fooled.

Per-poison answers are in [threat-catalog.md](threat-catalog.md).
