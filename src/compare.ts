import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAiScorer } from "./ai";
import { createModelCall } from "./ai/client";
import { AI_CATEGORIES } from "./ai/schema";
import { MODELS } from "./config";
import { parseProfile } from "./parse";
import { rubric } from "./rubric";

// Phase 2 owner task: run the same profiles through both models and write the
// sub-scores side by side, so the model choice rests on evidence.
// No cache is used here: every profile is scored fresh by both models.
export async function compareModels(dir: string, targetRole: string, outFile = "docs/model-ab.md"): Promise<string> {
  const files = readdirSync(dir).filter((f) => f.endsWith(".txt")).sort();
  if (files.length === 0) throw new Error(`No .txt profiles found in "${dir}".`);

  const models = [MODELS.freeScore, MODELS.paidReport];
  const scorers = models.map((model) => createAiScorer({ call: createModelCall(model), model, rubric }));

  const rows: string[] = [];
  let compared = 0;
  let totalGap = 0;
  let bigGaps = 0;
  for (const file of files) {
    const profile = parseProfile(readFileSync(join(dir, file), "utf8"));
    const [a, b] = await Promise.all(scorers.map((score) => score(profile, targetRole)));
    for (const id of AI_CATEGORIES) {
      const x = a.scores[id]?.score;
      const y = b.scores[id]?.score;
      const gap = x !== undefined && y !== undefined ? Math.abs(x - y) : undefined;
      if (gap !== undefined) {
        compared++;
        totalGap += gap;
        if (gap >= 2) bigGaps++;
      }
      rows.push(`| ${file} | ${id} | ${x ?? "unavailable"} | ${y ?? "unavailable"} | ${gap ?? "-"} |`);
    }
    console.error(`compared ${file}`);
  }

  const out = [
    "# Model comparison: free-score model vs paid-report model",
    "",
    `Profiles: ${files.length}. Target role: ${targetRole}. Rubric v${rubric.version}.`,
    "",
    `- Sub-scores compared: ${compared}`,
    `- Average gap: ${compared ? (totalGap / compared).toFixed(2) : "n/a"} points (out of 10)`,
    `- Gaps of 2 or more: ${bigGaps}`,
    "",
    `| Profile | Section | ${models[0]} | ${models[1]} | Gap |`,
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
    "Owner's decision: (write which model to use for the free score, and why)",
    "",
  ].join("\n");

  mkdirSync(join(outFile, ".."), { recursive: true });
  writeFileSync(outFile, out);
  return outFile;
}
