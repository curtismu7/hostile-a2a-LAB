// What the Help dialog says. Plain, and as hedged as the rest of the lab (rule 2): what was measured, what is simulated, what is UNVERIFIED.
export const HELP_SECTIONS = [
  {
    heading: "What this lab is",
    body: [
      "A deliberately hostile A2A specialist serves a poisoned Agent Card; an offline delegating generalist shows what the card makes it do; a pinned-card client is shown side by side with an ungoverned one.",
      "The point: nothing in A2A discovery inspects card text — it arrives byte for byte. A defense has to sit where the card is consumed. The server serves payloads and never scores or blocks."
    ]
  },
  {
    heading: "What was measured, and what was not",
    body: [
      "Simulated in this process: the hostile server, the generalist, the victim, the pinned client's scanner and pin checks, and the run records. Both stories (The card told my agent to include my token; The agent I trusted changed overnight) are fixtures.",
      "Every off-box address is a reserved .invalid or example name; nothing is sent anywhere. Card signatures are not verified here — the pinned client's signature policy is the lab's own model.",
      "UNVERIFIED: whether any shipping A2A client behaves like the pinned client here. This page models what a defence could do, not what a product does today. Pinning notices change; this lab does not judge content beyond its scripted rules."
    ]
  },
  {
    heading: "How to use the page",
    body: [
      "Pages (left nav): Poison gallery, Run the delegation, Card round trip, Honest limits, Diagram. The header has the Mock/Real select, theme, font size, Present, Talk track, Help and Reset.",
      "Poison gallery lists each poison with what catches it — the scanner column and the pinning column are the lab's two modelled defences. Variants include Poisoned description and refund skill, Instruction hidden in invisible characters, Clean first, poisoned later (rug-pull), The url moves to another origin later, and A clean card (an honest card, for comparison).",
      "Run the delegation: pick a card, then Run both clients. The result is labelled POISON LANDED, BLOCKED, or WITHHELD BY POLICY for each of the Pinned client and ungoverned columns.",
      "Card round trip shows the raw card bytes and the pin check side by side. Present (P key) shows presenter notes; Reset clears the workspace."
    ]
  },
  {
    heading: "Mock and Real",
    body: [
      "Mock is the whole demo and the only mode. Real is not available: this app has no live version — an offline hostile server and an offline victim, no model, no network. The Real choice is disabled with that explanation.",
      "No cryptography runs here: signatures and hashes are modelled as comparisons, not verified with real keys."
    ]
  }
];
