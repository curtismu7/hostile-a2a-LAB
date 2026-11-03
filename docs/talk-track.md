# Talk track

The say-aloud lines for each story, as they appear in the app (StoryPanel). Choose the vertical in the panel; the cast names follow it.

## S21 — The card told my agent to include my token

Goal: {{lena}} asks her assistant to refund an order. The assistant hands the work to a refunds specialist agent that {{vocab.org}} found through its Agent Card.

Control: A defence sits where the card is consumed: {{mark}}'s client pins the approved card, rechecks every fetch and runs the scanner rules, and withholds a card that changed or carries instructions.

### 1. The assistant reads the card

Say: “A card is the agent describing itself. We are reading what a stranger wrote about itself.”

Why it matters: The text goes to a model as context, so whoever writes the card is talking to the model.

### 2. The card gives orders

Say: “Nobody asked the card for orders. It gave them anyway, and the model cannot tell the card from {{lena}}.”

Why it matters: An instruction inside data is still an instruction to a model.

### 3. The delegation message

Say: “Here is the message. The token is in it because the card said to put it there.”

Why it matters: The leak rides on the ordinary delegated call, so no separate attack step is visible.

On the blocked path, say: “The card never reached the model, so there is no message to leak anything.”

### 4. Where the control sits

Say: “Defend where the card is consumed, because that is the only place that sees both the card and the policy.”

Why it matters: Servers serve payloads and never block, by design here.

### 5. What this does not catch

Say: “This catches what it has a rule for and what changed. It does not judge intent.”

Why it matters: Overstating a control is how it ends up trusted past what it can do.

## S22 — The agent I trusted changed overnight

Goal: {{mark}} reviews the refunds specialist's Agent Card for {{vocab.org}} and approves it. It should keep describing exactly what was approved.

Control: A pinned-card client hashes name, description, url, version, capabilities, skills and security schemes when {{mark}} approves, compares every later fetch, and shows the field diff.

### 1. Approve the clean card

Say: “Approval is a snapshot. We keep the fingerprint of what was approved.”

Why it matters: Without a recorded fingerprint there is nothing to compare tomorrow's card against.

### 2. Come back later

Say: “Same agent, same address. The protocol raised no hand.”

Why it matters: Nothing in A2A signals a changed card, so the client has to notice.

### 3. Compare

Say: “A hash tells us that it changed. The diff tells us what.”

Why it matters: A reviewer needs the change, not just an alarm.

On the blocked path, say: “Refused until a person has looked at the diff.”

### 4. Read the change

Say: “These are different cards, even where the text looks the same.”

Why it matters: Characters a person cannot see are the same characters a model can read.

### 5. Say what pinning does not catch

Say: “Pinning catches the change. It cannot catch what was already wrong when we said yes.”

Why it matters: Overstating a control is how it gets trusted past what it can do.

