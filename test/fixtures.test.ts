import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatText } from "../src/report";
import { scoreText } from "../src/score";
import expected from "./fixtures/expected.json";

const read = (file: string) => readFileSync(join(__dirname, "fixtures", file), "utf8");

describe("fixture profiles", () => {
  it("has 10 fixtures", () => {
    expect(expected.fixtures).toHaveLength(10);
  });

  for (const fx of expected.fixtures) {
    it(`${fx.file} scores between ${fx.min} and ${fx.max}`, async () => {
      const result = await scoreText(read(fx.file), fx.targetRole, fx.answers);
      expect(result.total).toBeGreaterThanOrEqual(fx.min);
      expect(result.total).toBeLessThanOrEqual(fx.max);
    });

    it(`${fx.file} gives identical output when run twice`, async () => {
      const first = formatText(await scoreText(read(fx.file), fx.targetRole, fx.answers));
      const second = formatText(await scoreText(read(fx.file), fx.targetRole, fx.answers));
      expect(second).toBe(first);
    });
  }
});
