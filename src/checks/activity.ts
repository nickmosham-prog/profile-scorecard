import { getCategory, getCheck } from "../rubric";
import type { CategoryResult, Profile } from "../types";
import { categoryResult, yesNoFinding, type CheckContext } from "./shared";

export function checkActivity(_profile: Profile, ctx: CheckContext): CategoryResult {
  const category = getCategory(ctx.rubric, "activity");
  return categoryResult(category, [
    yesNoFinding(
      getCheck(category, "activity.recent"),
      ctx.answers.activeLast30Days,
      "Posted or commented in the last 30 days.",
      "No posts or comments in the last 30 days.",
    ),
  ]);
}
