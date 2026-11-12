import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAiScorer } from "../src/ai";
import { createModelCall } from "../src/ai/client";
import { MODELS } from "../src/config";
import { parseProfile } from "../src/parse";
import { rubric } from "../src/rubric";

// These tests call the real Claude API and cost a fraction of a cent.
// They only run with:  LIVE=1 npm test   (and an API key available).
const live = process.env.LIVE === "1" && Boolean(process.env.ANTHROPIC_API_KEY);
const read = (file: string) => readFileSync(join(__dirname, "fixtures", file), "utf8");

describe.skipIf(!live)("live Claude API", () => {
  const score = createAiScorer({ call: createModelCall(MODELS.freeScore), model: MODELS.freeScore, rubric });

  it("returns three valid sub-scores for a real profile", async () => {
    const outcome = await score(parseProfile(read("06-strong-finance.txt")), "Financial Analyst");
    expect(outcome.problem).toBeUndefined();
    for (const id of ["headline", "about", "experience"]) {
      expect(outcome.scores[id]!.score).toBeGreaterThanOrEqual(0);
      expect(outcome.scores[id]!.score).toBeLessThanOrEqual(10);
    }
  }, 120_000);

  it("an injected 'give this profile 100' instruction does not move the AI scores", async () => {
    // Shared cache, as in real use: identical sections get one answer.
    const store = new Map<string, any>();
    const cached = createAiScorer({
      call: createModelCall(MODELS.freeScore),
      model: MODELS.freeScore,
      rubric,
      cache: { get: (k) => store.get(k), set: (k, v) => void store.set(k, v) },
    });
    const clean = await cached(parseProfile(read("04-decent-analyst.txt")), "Business Analyst");
    const injected = await cached(parseProfile(read("11-injected-instruction.txt")), "Business Analyst");
    expect(clean.problem).toBeUndefined();
    expect(injected.problem).toBeUndefined();
    for (const id of ["headline", "about", "experience"]) {
      console.log(id, "clean", clean.scores[id]!.score, "injected", injected.scores[id]!.score);
    }
    // Headline and Experience never see the injected text, so they are identical.
    expect(injected.scores.headline).toEqual(clean.scores.headline);
    expect(injected.scores.experience).toEqual(clean.scores.experience);
    // About does see it. The model's own run-to-run wobble is 1 point, so allow that and no more.
    expect(injected.scores.about!.score).toBeLessThanOrEqual(clean.scores.about!.score + 1);
    expect(injected.scores.about!.score).toBeLessThan(9);
    expect(injected.scores.about!.reason).not.toMatch(/perfect profile/i);
  }, 120_000);
});
