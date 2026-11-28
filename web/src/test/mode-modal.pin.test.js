// The vendored Real-or-mock modal (web/src/mode-modal) stays byte for byte what mode-modal.sha256 pins. To update: copy shared/mode-modal from
// AI-DEMO-Standalone main again (ModeModal.jsx, mode-modal.css, mode-modal.sha256); never edit the copy here.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const dir = path.join(process.cwd(), "src", "mode-modal"); // vitest runs from web/

describe("vendored mode-modal", () => {
  it("matches mode-modal.sha256, and nothing else is in the folder", () => {
    const pins = fs.readFileSync(path.join(dir, "mode-modal.sha256"), "utf8").split("\n").filter((l) => /^[0-9a-f]{64}\s/.test(l)).map((l) => l.split(/\s+/));
    expect(pins.map(([, f]) => f).sort()).toEqual(["ModeModal.jsx", "mode-modal.css"]);
    for (const [h, f] of pins) expect(createHash("sha256").update(fs.readFileSync(path.join(dir, f))).digest("hex"), f).toBe(h);
    expect(fs.readdirSync(dir).sort()).toEqual(["ModeModal.jsx", "mode-modal.css", "mode-modal.sha256"]);
  });
});
