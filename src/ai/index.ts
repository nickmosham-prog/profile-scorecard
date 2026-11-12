import { RUBRIC_VERSION } from "../config";
import type { Rubric } from "../rubric";
import type { Profile } from "../types";
import { cacheKey, type AiCache } from "./cache";
import { describeError, type ModelCall } from "./client";
import { buildSystemPrompt, buildUserMessage, PROMPT_VERSION } from "./prompt";
import { AI_CATEGORIES, AiSubScoreSchema, type AiResults } from "./schema";

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

const NONE: AiResults = { headline: null, about: null, experience: null };

// Checks each category's sub-score on its own, so one bad entry does not
// throw away two good ones.
function validate(raw: unknown): AiResults {
  const out: AiResults = {};
  for (const id of AI_CATEGORIES) {
    const candidate = (raw as Record<string, unknown> | null | undefined)?.[id];
    const parsed = AiSubScoreSchema.safeParse(candidate);
    out[id] = parsed.success ? parsed.data : null;
  }
  return out;
}

const complete = (r: AiResults) => AI_CATEGORIES.every((id) => r[id]);

// Asks the model for the three sub-scores. Never throws: any failure comes
// back as "unavailable" plus a reason, and the rule-based score still works.
export function createAiScorer(deps: AiDeps): AiScorer {
  return async (profile, targetRole) => {
    const key = cacheKey(profile, targetRole, RUBRIC_VERSION, deps.model, PROMPT_VERSION);
    const cached = deps.cache?.get(key);
    if (cached) {
      const scores = validate(cached);
      if (complete(scores)) return { scores };
    }

    const system = buildSystemPrompt(deps.rubric);
    const user = buildUserMessage(profile, targetRole);

    let scores: AiResults = NONE;
    let problem: string | undefined;
    // First try, then retry once if the reply was missing or invalid.
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        scores = validate(await deps.call(system, user));
        problem = complete(scores) ? undefined : "the model's reply did not match the required format";
      } catch (error) {
        scores = NONE;
        problem = describeError(error);
      }
      if (complete(scores)) break;
    }

    // Only complete results are saved, so a temporary failure is not remembered.
    if (complete(scores)) deps.cache?.set(key, scores);
    return { scores, problem };
  };
}
