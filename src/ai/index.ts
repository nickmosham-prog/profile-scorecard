import { RUBRIC_VERSION } from "../config";
import type { Rubric } from "../rubric";
import type { Profile } from "../types";
import { cacheKey, type AiCache } from "./cache";
import { describeError, type ModelCall } from "./client";
import { buildSystemPrompt, buildUserMessage, PROMPT_VERSION, sectionText } from "./prompt";
import { AI_CATEGORIES, AiSubScoreSchema, type AiCategory, type AiResults, type AiSubScore } from "./schema";

export interface AiOutcome {
  scores: AiResults; // null for any category the AI could not score
  problem?: string; // plain-English reason, when something went wrong
}

export interface AiDeps {
  call: ModelCall;
  model: string;
  rubric: Rubric;
  cache?: AiCache;
}

// A function that scores a profile with AI. score.ts accepts any function of
// this shape, which is how tests run without the network.
export type AiScorer = (profile: Profile, targetRole: string) => Promise<AiOutcome>;

interface SectionOutcome {
  score: AiSubScore | null;
  problem?: string;
}

// Scores one section. Never throws: any failure comes back as null plus a reason.
async function scoreSection(deps: AiDeps, profile: Profile, targetRole: string, category: AiCategory): Promise<SectionOutcome> {
  const key = cacheKey(RUBRIC_VERSION, deps.model, PROMPT_VERSION, targetRole, category, sectionText(profile, category));
  const cached = AiSubScoreSchema.safeParse(deps.cache?.get(key));
  if (cached.success) return { score: cached.data };

  const system = buildSystemPrompt(deps.rubric, category);
  const user = buildUserMessage(profile, targetRole, category);

  let problem = "";
  // First try, then retry once if the reply was missing or invalid.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const parsed = AiSubScoreSchema.safeParse(await deps.call(system, user));
      if (parsed.success) {
        // Only valid results are saved, so a temporary failure is not remembered.
        deps.cache?.set(key, parsed.data);
        return { score: parsed.data };
      }
      problem = "the model's reply did not match the required format";
    } catch (error) {
      problem = describeError(error);
    }
  }
  return { score: null, problem };
}

// Asks the model for the three sub-scores, one request per section, at the same time.
export function createAiScorer(deps: AiDeps): AiScorer {
  return async (profile, targetRole) => {
    const outcomes = await Promise.all(AI_CATEGORIES.map((c) => scoreSection(deps, profile, targetRole, c)));
    const scores: AiResults = {};
    AI_CATEGORIES.forEach((c, i) => (scores[c] = outcomes[i].score));
    return { scores, problem: outcomes.find((o) => o.problem)?.problem };
  };
}
