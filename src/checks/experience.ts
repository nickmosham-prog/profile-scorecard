import { getCategory, getCheck, param } from "../rubric";
import type { CategoryResult, Profile } from "../types";
import { categoryResult, finding, type CheckContext } from "./shared";

// Counts sentences or bullet lines that contain a number. Four-digit years are
// removed first, so "Joined in 2021" does not count as a quantified result.
export function countQuantifiedStatements(text: string): number {
  return text
    .split(/\n|(?<=[.!?])\s+/)
    .map((s) => s.replace(/\b(19|20)\d{2}\b/g, ""))
    .filter((s) => /\d/.test(s)).length;
}

export function checkExperience(profile: Profile, ctx: CheckContext): CategoryResult {
  const category = getCategory(ctx.rubric, "experience");
  const roles = profile.experience;

  const descCheck = getCheck(category, "experience.descriptions");
  const described = roles.filter((r) => r.description.trim().length >= param(descCheck, "minChars")).length;
  const descMessage = roles.length
    ? `${described} of ${roles.length} roles have a description.`
    : "No experience entries found.";

  const quantCheck = getCheck(category, "experience.quantified");
  const quantified = roles.reduce((sum, r) => sum + countQuantifiedStatements(r.description), 0);
  const fullAt = param(quantCheck, "fullAt");
  const quantMessage = `Found ${quantified} quantified result${quantified === 1 ? "" : "s"} (target ${fullAt}+).`;

  return categoryResult(category, [
    finding(descCheck, roles.length ? described / roles.length : 0, descMessage),
    finding(quantCheck, quantified / fullAt, quantMessage),
  ]);
}
