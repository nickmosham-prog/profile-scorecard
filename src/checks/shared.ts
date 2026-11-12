import type { CategoryConfig, CheckConfig, Rubric } from "../rubric";
import type { Answers, CategoryResult, Finding } from "../types";

export interface RoleKeywords {
  roleWords: string[]; // the words of the target role itself, e.g. ["financial", "analyst"]
  related: string[]; // skills and terms that go with that kind of role
}

// Everything a check needs besides the profile itself.
export interface CheckContext {
  rubric: Rubric;
  keywords: RoleKeywords;
  answers: Answers;
}

// `fraction` is how much of the check's points were earned, from 0 to 1.
export function finding(check: CheckConfig, fraction: number, message: string): Finding {
  const clamped = Math.max(0, Math.min(1, fraction));
  return {
    id: check.id,
    label: check.label,
    basis: check.basis,
    pointsEarned: check.points * clamped,
    pointsMax: check.points,
    message,
    fix: check.fix,
  };
}

export function categoryResult(category: CategoryConfig, findings: Finding[]): CategoryResult {
  return {
    category: category.id,
    label: category.label,
    pointsEarned: findings.reduce((sum, f) => sum + f.pointsEarned, 0),
    pointsMax: findings.reduce((sum, f) => sum + f.pointsMax, 0),
    findings,
  };
}

// ---- Keyword matching -------------------------------------------------------

// Whole-term match, so "ops" does not match "laptops".
export function containsTerm(text: string, term: string): boolean {
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text.toLowerCase());
}

export function matchedTerms(text: string, terms: string[]): string[] {
  return terms.filter((t) => containsTerm(text, t));
}

export function roleKeywords(targetRole: string, rubric: Rubric): RoleKeywords {
  const roleWords = [
    ...new Set(
      targetRole
        .toLowerCase()
        .split(/[^a-z0-9&+#]+/)
        .filter((w) => w && !rubric.roleStopWords.includes(w)),
    ),
  ];
  const related = new Set<string>();
  for (const family of rubric.roleKeywordFamilies) {
    if (family.triggers.some((t) => roleWords.includes(t))) {
      for (const k of family.keywords) if (!roleWords.includes(k)) related.add(k);
    }
  }
  return { roleWords, related: [...related] };
}

// ---- Self-reported answers --------------------------------------------------

// A yes/no questionnaire answer. Unanswered earns 0 and says so, rather than guessing.
export function yesNoFinding(check: CheckConfig, answer: boolean | undefined, yes: string, no: string): Finding {
  if (answer === undefined) return finding(check, 0, "Not answered, so no points were given.");
  return finding(check, answer ? 1 : 0, answer ? yes : no);
}

// A count answer, with full marks at `fullAt`.
export function countFinding(check: CheckConfig, count: number | undefined, fullAt: number, noun: string): Finding {
  if (count === undefined) return finding(check, 0, "Not answered, so no points were given.");
  return finding(check, count / fullAt, `${count} ${noun} (full marks at ${fullAt}+).`);
}
