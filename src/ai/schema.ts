import { z } from "zod";

// The shape every AI sub-score must have (CLAUDE.md, "Scoring design" step 3).
// Phase 2 validates the model's reply against this before using it.
export const AiSubScoreSchema = z.object({
  score: z.number().int().min(0).max(10),
  reason: z.string(),
  evidence_quote: z.string(),
  rewrite: z.string(),
});
export type AiSubScore = z.infer<typeof AiSubScoreSchema>;

// Category id -> sub-score. A missing or null entry means "AI score unavailable".
export type AiResults = Record<string, AiSubScore | null | undefined>;
