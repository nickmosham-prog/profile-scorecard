import { getCategory, getCheck, param } from "../rubric";
import type { CategoryResult, Profile } from "../types";
import { categoryResult, countFinding, type CheckContext } from "./shared";

export function checkRecommendations(_profile: Profile, ctx: CheckContext): CategoryResult {
  const category = getCategory(ctx.rubric, "recommendations");
  const check = getCheck(category, "recommendations.count");
  return categoryResult(category, [
    countFinding(check, ctx.answers.recommendationsCount, param(check, "fullAt"), "recommendation(s) received"),
  ]);
}
