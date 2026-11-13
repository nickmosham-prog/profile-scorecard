import { getCategory, getCheck, param } from "../rubric";
import type { CategoryResult, Profile } from "../types";
import { categoryResult, containsTerm, finding, type CheckContext } from "./shared";

export function checkSkills(profile: Profile, ctx: CheckContext): CategoryResult {
  const category = getCategory(ctx.rubric, "skills");
  const skills = profile.skills;

  const countCheck = getCheck(category, "skills.count");
  const fullAt = param(countCheck, "fullAt");
  // An exported PDF shows only the top 3 skills, so for PDFs the user is asked
  // for the real number. The larger of the two counts is used.
  const reported = ctx.answers.skillsCount ?? 0;
  const count = Math.max(skills.length, reported);
  const source = reported > skills.length ? " (self-reported)" : "";
  const countMessage = count ? `${count} skills listed${source} (target ${fullAt}+).` : "No skills found.";

  // "Top 3" means the first three in the order they were pasted.
  const topCheck = getCheck(category, "skills.top3");
  const terms = [...ctx.keywords.roleWords, ...ctx.keywords.related];
  const top3 = skills.slice(0, 3);
  const relevant = top3.filter((s) => terms.some((t) => containsTerm(s, t)));
  const topMessage = top3.length
    ? `${relevant.length} of your top 3 skills (${top3.join(", ")}) match the target role.`
    : "No skills found.";

  // A PDF shows only the top 3 skills. Without the owner's total, "3 skills
  // listed" would be false, so the count is reported as not answered instead.
  const pdfWithoutCount = ctx.source === "pdf" && ctx.answers.skillsCount === undefined;
  const countFinding = pdfWithoutCount
    ? finding(countCheck, 0, "Not answered: a PDF lists only the top 3 skills, so the total count is needed. No points were given.")
    : finding(countCheck, count / fullAt, countMessage);

  return categoryResult(category, [
    countFinding,
    finding(topCheck, relevant.length / 3, topMessage),
  ]);
}
