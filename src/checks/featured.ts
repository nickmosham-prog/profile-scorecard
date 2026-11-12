import { getCategory, getCheck, param } from "../rubric";
import type { CategoryResult, Profile } from "../types";
import { categoryResult, countFinding, type CheckContext } from "./shared";

export function checkFeatured(_profile: Profile, ctx: CheckContext): CategoryResult {
  const category = getCategory(ctx.rubric, "featured");
  const check = getCheck(category, "featured.items");
  return categoryResult(category, [countFinding(check, ctx.answers.featuredCount, param(check, "fullAt"), "Featured item(s)")]);
}
