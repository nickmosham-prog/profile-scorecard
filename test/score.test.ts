import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import type { AiSubScore } from "../src/ai/schema";
import { runAllChecks } from "../src/checks";
import { formatJson, formatMarkdown, formatText } from "../src/report";
import { parseRubric, rubric } from "../src/rubric";
import rubricJson from "../src/rubric.json";
import { combine, scoreText } from "../src/score";
import { ctx, profile } from "./helpers";

const ai = (score: number): AiSubScore => ({ score, reason: "r", evidence_quote: "q", rewrite: "better text" });

describe("rubric.json", () => {
  it("adds up to 100 points and every check has a basis", () => {
    expect(rubric.categories.reduce((s, c) => s + c.points, 0)).toBe(100);
    for (const c of rubric.categories) for (const k of c.checks) expect(k.basis).toBeTruthy();
  });

  it("is rejected when the weights no longer add up", () => {
    const broken = structuredClone(rubricJson);
    broken.categories[0].points = 99;
    expect(() => parseRubric(broken)).toThrow();
  });
});

describe("combine", () => {
  const empty = runAllChecks(profile(), ctx());

  it("scores an empty profile 0 and labels it needs work", () => {
    const r = combine(empty, {}, "Financial Analyst");
    expect(r.total).toBe(0);
    expect(r.band).toBe("needs work");
  });

  it("marks AI categories unavailable when there is no AI score, without crashing", () => {
    const r = combine(empty, {}, "x");
    expect(r.categories.find((c) => c.category === "headline")!.aiStatus).toBe("unavailable");
    expect(r.categories.find((c) => c.category === "skills")!.aiStatus).toBe("not-used");
    expect(r.notes.join(" ")).toContain("AI score unavailable");
  });

  it("adds AI sub-score / 10 x AI weight when an AI score is present", () => {
    const r = combine(empty, { headline: ai(10), about: ai(5), experience: ai(0) }, "x");
    // headline 6, about 3, experience 0
    expect(r.total).toBe(9);
    expect(r.rewrites.headline).toBe("better text");
  });

  it("returns at most 3 fixes, biggest gain first", () => {
    const r = combine(empty, {}, "x");
    expect(r.topFixes).toHaveLength(3);
    expect(r.topFixes[0].potentialGain).toBeGreaterThanOrEqual(r.topFixes[1].potentialGain);
    expect(r.topFixes[1].potentialGain).toBeGreaterThanOrEqual(r.topFixes[2].potentialGain);
  });

  it("never lets a category exceed its weight", () => {
    for (const c of combine(empty, { headline: ai(10) }, "x").categories) {
      expect(c.pointsEarned).toBeLessThanOrEqual(c.pointsMax);
    }
  });
});

describe("report formats", () => {
  it("text, markdown and JSON all carry the score, the basis labels and the disclaimer", async () => {
    const result = await scoreText("Name\nFinancial Analyst\nAbout\nHello", "Financial Analyst", { hasPhoto: true });
    const text = formatText(result);
    expect(text).toContain(`SCORE: ${result.total} / 100`);
    expect(text).toContain("[convention]");
    expect(text).toContain("not affiliated with LinkedIn");
    expect(text).toContain("best-practice");
    expect(formatMarkdown(result)).toContain("## Top 3 fixes");
    expect(JSON.parse(formatJson(result)).total).toBe(result.total);
  });

  it("does not echo the pasted profile text back in JSON", async () => {
    const secret = "my-private-sentence-xyz";
    const result = await scoreText(`Name\nTitle\nAbout\n${secret} ${"filler ".repeat(100)}`, "Analyst");
    expect(formatJson(result)).not.toContain(secret);
  });
});

describe("command line", () => {
  const run = (...args: string[]) =>
    execFileSync("npx", ["tsx", "src/cli.ts", "score", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const fixture = "test/fixtures/06-strong-finance.txt";

  it("prints the same output twice and valid JSON with --json", () => {
    const first = run(fixture, "--target-role", "Financial Analyst");
    expect(run(fixture, "--target-role", "Financial Analyst")).toBe(first);
    expect(first).toContain("TOP 3 FIXES");
    const json = JSON.parse(run(fixture, "--target-role", "Financial Analyst", "--json"));
    expect(json.topFixes).toHaveLength(3);
  }, 60_000);

  it("refuses URLs and explains that PDF import is not built yet", () => {
    expect(() => run("https://example.com/in/someone", "--target-role", "x")).toThrow(/never fetches/);
    expect(() => run("profile.pdf", "--target-role", "x")).toThrow(/Phase 3/);
  }, 60_000);
});
