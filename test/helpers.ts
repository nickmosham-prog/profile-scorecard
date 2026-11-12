import { roleKeywords, type CheckContext } from "../src/checks/shared";
import { rubric } from "../src/rubric";
import type { Answers, CategoryResult, Profile } from "../src/types";

export function profile(overrides: Partial<Profile> = {}): Profile {
  return { headline: "", about: "", experience: [], skills: [], education: [], extras: {}, ...overrides };
}

export function ctx(targetRole = "Financial Analyst", answers: Answers = {}): CheckContext {
  return { rubric, keywords: roleKeywords(targetRole, rubric), answers };
}

// Points earned by one check inside a category result.
export function earned(result: CategoryResult, id: string): number {
  const f = result.findings.find((x) => x.id === id);
  if (!f) throw new Error(`no finding ${id}`);
  return f.pointsEarned;
}
