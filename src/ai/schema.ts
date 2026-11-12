import { z } from "zod";

// The shape every AI sub-score must have (CLAUDE.md, "Scoring design" step 3).
// A reply that does not match exactly is thrown away, so a model that is
// tricked into answering "score: 100" cannot move the result.
export const AiSubScoreSchema = z.object({
  score: z.number().int().min(0).max(10),
  reason: z.string().min(1).max(600),
  evidence_quote: z.string().max(600),
  rewrite: z.string().max(3000),
});
export type AiSubScore = z.infer<typeof AiSubScoreSchema>;

// The categories the model scores. Must match the categories in rubric.json
// that have an aiWeight.
export const AI_CATEGORIES = ["headline", "about", "experience"] as const;
export type AiCategory = (typeof AI_CATEGORIES)[number];

// What we ask the API to return. Number ranges are checked by AiSubScoreSchema
// afterwards rather than here, so the request schema stays simple.
const WireSubScore = z.object({
  score: z.number(),
  reason: z.string(),
  evidence_quote: z.string(),
  rewrite: z.string(),
});
export const AiBatchWireSchema = z.object({
  headline: WireSubScore,
  about: WireSubScore,
  experience: WireSubScore,
});

// Category id -> sub-score. A missing or null entry means "AI score unavailable".
export type AiResults = Record<string, AiSubScore | null | undefined>;
