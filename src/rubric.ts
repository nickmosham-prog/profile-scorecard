import { z } from "zod";
import rubricJson from "./rubric.json";

// Validates rubric.json on startup so a typo while tuning weights produces a
// clear error instead of a silently wrong score.

const CheckSchema = z.object({
  id: z.string(),
  label: z.string(),
  points: z.number().positive(),
  basis: z.enum(["documented", "consistent-with-documented", "convention"]),
  fix: z.string(),
  params: z.record(z.string(), z.number()),
});
export type CheckConfig = z.infer<typeof CheckSchema>;

const CategorySchema = z
  .object({
    id: z.string(),
    label: z.string(),
    points: z.number().positive(),
    aiWeight: z.number().min(0),
    checks: z.array(CheckSchema).min(1),
  })
  .refine(
    (c) => c.checks.reduce((sum, check) => sum + check.points, 0) + c.aiWeight === c.points,
    { message: "check points + aiWeight must equal the category's points" },
  );
export type CategoryConfig = z.infer<typeof CategorySchema>;

const RubricSchema = z
  .object({
    version: z.string(),
    bands: z.array(z.object({ min: z.number(), max: z.number(), label: z.string() })),
    roleStopWords: z.array(z.string()),
    roleKeywordFamilies: z.array(
      z.object({ triggers: z.array(z.string()), keywords: z.array(z.string()) }),
    ),
    genericHeadlinePhrases: z.array(z.string()),
    callToActionPhrases: z.array(z.string()),
    categories: z.array(CategorySchema),
  })
  .refine((r) => r.categories.reduce((sum, c) => sum + c.points, 0) === 100, {
    message: "category points must add up to 100",
  });
export type Rubric = z.infer<typeof RubricSchema>;

export function parseRubric(raw: unknown): Rubric {
  return RubricSchema.parse(raw);
}

export const rubric: Rubric = parseRubric(rubricJson);

export function getCategory(r: Rubric, id: string): CategoryConfig {
  const category = r.categories.find((c) => c.id === id);
  if (!category) throw new Error(`rubric.json has no category "${id}"`);
  return category;
}

export function getCheck(category: CategoryConfig, id: string): CheckConfig {
  const check = category.checks.find((c) => c.id === id);
  if (!check) throw new Error(`rubric.json has no check "${id}"`);
  return check;
}

export function param(check: CheckConfig, name: string): number {
  const value = check.params[name];
  if (value === undefined) throw new Error(`rubric.json check "${check.id}" is missing param "${name}"`);
  return value;
}
