import { expect, test } from "vitest";
import { STORIES, VERTICALS, DEFAULT_VERTICAL, verticalById, storyForMode } from "./stories.js";
import { fillAll, tokensIn } from "./fill.js";
import { validateStory, validateVertical } from "./storySchema.js";

const MODES = ["gallery", "run", "roundtrip", "limits", "diagram"];

test("both stories and all three packs are valid", () => {
  expect(STORIES.map((s) => s.id)).toEqual(["S21", "S22"]);
  expect(STORIES.map((s) => s.title)).toEqual(["The card told my agent to include my token", "The agent I trusted changed overnight"]);
  expect(VERTICALS.map((v) => v.id).sort()).toEqual(["airlines", "banking", "generic"]);
  for (const s of STORIES) expect(validateStory(s, { modes: MODES, stepRange: [1, 6] })).toEqual([]);
  for (const v of VERTICALS) expect(validateVertical(v)).toEqual([]);
});

test("every token in every story resolves in every vertical", () => {
  for (const s of STORIES) for (const v of VERTICALS) {
    const filled = JSON.stringify(fillAll(s, v));
    expect(filled, `${s.id} in ${v.id}`).not.toContain("missing:");
    for (const t of tokensIn(s)) expect(t.startsWith("vocab.") ? v.vocab[t.slice(6)] : v.cast[t]).toBeTruthy();
  }
});

test("the stories sit on their pages and the banking pack changes the wording", () => {
  expect(storyForMode("roundtrip").id).toBe("S22");
  for (const m of ["gallery", "run", "diagram"]) expect(storyForMode(m).id).toBe("S21");
  expect(storyForMode("limits")).toBeNull();
  const banking = VERTICALS.find((v) => v.id === "banking");
  expect(JSON.stringify(fillAll(STORIES[0], banking))).toContain("the bank");
});

test("no story invents a real credential: the only token named is the fake placeholder", () => {
  const all = JSON.stringify(STORIES);
  expect(all).toContain("FAKE-TOKEN-NOT-REAL");
  expect(all).not.toMatch(/eyJ|Bearer [A-Za-z0-9]{12,}/);
});

test("a story with a missing token or bad shape is reported", () => {
  expect(validateStory({ id: "S21" }).length).toBeGreaterThan(3);
  expect(JSON.stringify(fillAll({ a: "{{nobody}}" }, VERTICALS[0]))).toContain("missing: nobody");
});

test("the default vertical is airlines (AirGuard Airlines), and an unknown id falls back to it", () => {
  expect(DEFAULT_VERTICAL).toBe("airlines");
  expect(verticalById("airlines").displayName).toBe("AirGuard Airlines");
  expect(verticalById("no-such-pack").id).toBe("airlines");
  expect(verticalById(undefined).id).toBe("airlines");
  expect(verticalById("generic").id).toBe("generic");
});

test("the airline run reads as AirGuard Airlines and carries no other brand, bank or retail wording", () => {
  const airline = VERTICALS.find((v) => v.id === "airlines");
  const text = JSON.stringify([STORIES.map((s) => fillAll(s, airline)), airline]);
  expect(text).toContain("AirGuard Airlines");
  expect(text).toContain("refund a booking");
  const RETIRED = [/Meridian/, /Skyline Air/, /Northwind/, /Contoso/, /Tessera/, /Fabrikam/, /Harbor/, /Vellum/, /Super Banking/, /the bank\b/, /treasury/i, /refund an order/, /Lena\b/, /Mark\b/];
  for (const re of RETIRED) expect(text, String(re)).not.toMatch(re);
  expect(text).not.toContain("missing:");
});
