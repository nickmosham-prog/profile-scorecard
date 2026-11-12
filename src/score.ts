import { getAiSubScores } from "./ai";
import type { AiResults, AiSubScore } from "./ai/schema";
import { runAllChecks } from "./checks";
import { roleKeywords } from "./checks/shared";
import { DISCLAIMER } from "./config";
import { parseProfile } from "./parse";
import { rubric as defaultRubric, type Rubric } from "./rubric";
import type { Answers, Basis, CategoryResult, Finding } from "./types";

export interface CategoryScore {
  category: string;
  label: string;
  pointsEarned: number;
  pointsMax: number; // the category's full weight in the rubric
  aiStatus: "not-used" | "scored" | "unavailable";
  ai: AiSubScore | null;
  findings: Finding[];
}

export interface Fix {
  category: string;
  label: string;
  potentialGain: number; // points still available from this one item
  fix: string;
  basis: Basis | "ai-judgement";
}

export interface ScoreResult {
  rubricVersion: string;
  targetRole: string;
  total: number; // 0-100 integer
  band: string;
  categories: CategoryScore[];
  topFixes: Fix[];
  rewrites: { headline: string | null; about: string | null };
  notes: string[];
  disclaimer: string;
}

// Combines the deterministic check results with the AI sub-scores.
// The final number is computed here, in code, never by the model.
export function combine(
  checkResults: CategoryResult[],
  ai: AiResults,
  targetRole: string,
  rubric: Rubric = defaultRubric,
): ScoreResult {
  const fixes: Fix[] = [];
  const categories: CategoryScore[] = checkResults.map((result) => {
    const config = rubric.categories.find((c) => c.id === result.category);
    if (!config) throw new Error(`rubric.json has no category "${result.category}"`);
    const aiScore = config.aiWeight > 0 ? (ai[config.id] ?? null) : null;

    // When a category has an AI part but the AI score is unavailable, the
    // deterministic checks are stretched to cover the whole category. That
    // keeps the total on a 0-100 scale instead of capping it at 80.
    const stretch = config.aiWeight > 0 && !aiScore ? config.points / result.pointsMax : 1;
    let earned = result.pointsEarned * stretch;

    for (const f of result.findings) {
      fixes.push({
        category: config.label,
        label: f.label,
        potentialGain: (f.pointsMax - f.pointsEarned) * stretch,
        fix: f.fix,
        basis: f.basis,
      });
    }

    if (aiScore) {
      earned += (aiScore.score / 10) * config.aiWeight;
      fixes.push({
        category: config.label,
        label: `${config.label} quality (AI-judged)`,
        potentialGain: ((10 - aiScore.score) / 10) * config.aiWeight,
        fix: aiScore.reason,
        basis: "ai-judgement",
      });
    }

    return {
      category: config.id,
      label: config.label,
      pointsEarned: earned,
      pointsMax: config.points,
      aiStatus: config.aiWeight === 0 ? "not-used" : aiScore ? "scored" : "unavailable",
      ai: aiScore,
      findings: result.findings,
    };
  });

  // Round once, at the very end.
  const total = Math.round(categories.reduce((sum, c) => sum + c.pointsEarned, 0));
  const band = rubric.bands.find((b) => total >= b.min && total <= b.max)?.label ?? "unknown";

  // Array.sort is stable, so ties keep rubric order and output stays repeatable.
  const topFixes = fixes
    .filter((f) => f.potentialGain > 0.001)
    .sort((a, b) => b.potentialGain - a.potentialGain)
    .slice(0, 3);

  const notes: string[] = [];
  if (categories.some((c) => c.aiStatus === "unavailable")) {
    notes.push(
      "AI score unavailable: Headline, About, and Experience were scored on the rule-based checks only, scaled to each category's full weight.",
    );
  }
  if (categories.some((c) => c.findings.some((f) => f.message.startsWith("Not answered")))) {
    notes.push("Some questionnaire items were not answered and earned 0 points.");
  }

  return {
    rubricVersion: rubric.version,
    targetRole,
    total,
    band,
    categories,
    topFixes,
    rewrites: { headline: ai.headline?.rewrite ?? null, about: ai.about?.rewrite ?? null },
    notes,
    disclaimer: DISCLAIMER,
  };
}

// The whole pipeline: text in, score out. The web app will call this same function.
export async function scoreText(text: string, targetRole: string, answers: Answers = {}): Promise<ScoreResult> {
  const profile = parseProfile(text);
  const ctx = { rubric: defaultRubric, keywords: roleKeywords(targetRole, defaultRubric), answers };
  const checkResults = runAllChecks(profile, ctx);
  const ai = await getAiSubScores(profile, targetRole);
  return combine(checkResults, ai, targetRole);
}
