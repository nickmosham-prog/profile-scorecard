import { z } from "zod";

// ---- Profile: what the parser produces -------------------------------------

export interface Role {
  heading: string[]; // title and company lines, in the order they were pasted
  dates: string;
  description: string;
}

export interface Profile {
  headline: string;
  about: string;
  experience: Role[];
  skills: string[];
  education: string[];
  extras: Record<string, string>; // any other section, keyed by lowercase header
}

// ---- Questionnaire: things the pasted text cannot tell us -------------------

// Every field is optional. An unanswered question earns 0 points and is
// reported as "not answered" rather than guessed.
export const AnswersSchema = z
  .object({
    hasPhoto: z.boolean(),
    hasBanner: z.boolean(),
    hasCustomUrl: z.boolean(),
    featuredCount: z.number().int().min(0),
    recommendationsCount: z.number().int().min(0),
    activeLast30Days: z.boolean(),
    // Only asked for PDF input: the export lists just the top 3 skills.
    skillsCount: z.number().int().min(0),
  })
  .partial()
  .strict();
export type Answers = z.infer<typeof AnswersSchema>;

// ---- Check results ----------------------------------------------------------

export type Basis = "documented" | "consistent-with-documented" | "convention";

export interface Finding {
  id: string;
  label: string;
  basis: Basis;
  pointsEarned: number;
  pointsMax: number;
  message: string; // what we found
  fix: string; // what to do about it
}

export interface CategoryResult {
  category: string;
  label: string;
  pointsEarned: number;
  pointsMax: number; // max of the deterministic checks only
  findings: Finding[];
}
