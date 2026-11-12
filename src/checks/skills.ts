import { getCategory, getCheck, param } from "../rubric";
import type { CategoryResult, Profile } from "../types";
import { categoryResult, containsTerm, finding, type CheckContext } from "./shared";

export function checkSkills(profile: Profile, ctx: CheckContext): CategoryResult {
  const category = getCategory(ctx.rubric, "skills");
  const skills = profile.skills;

  const countCheck = getCheck(category, "skills.count");
  const fullAt = param(countCheck, "fullAt");
  const countMessage = skills.length ? `${skills.length} skills listed (target ${fullAt}+).` : "No skills found.";

  // "Top 3" means the first three in the order they were pasted.
  const topCheck = getCheck(category, "skills.top3");
  const terms = [...ctx.keywords.roleWords, ...ctx.keywords.related];
  const top3 = skills.slice(0, 3);
  const relevant = top3.filter((s) => terms.some((t) => containsTerm(s, t)));
  const topMessage = top3.length
    ? `${relevant.length} of your top 3 skills (${top3.join(", ")}) match the target role.`
    : "No skills found.";

  return categoryResult(category, [
    finding(countCheck, skills.length / fullAt, countMessage),
    finding(topCheck, relevant.length / 3, topMessage),
  ]);
}
