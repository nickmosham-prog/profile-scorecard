import { getCategory, getCheck } from "../rubric";
import type { CategoryResult, Profile } from "../types";
import { categoryResult, yesNoFinding, type CheckContext } from "./shared";

export function checkCustomUrl(_profile: Profile, ctx: CheckContext): CategoryResult {
  const category = getCategory(ctx.rubric, "customUrl");
  return categoryResult(category, [
    yesNoFinding(getCheck(category, "customUrl.set"), ctx.answers.hasCustomUrl, "Has a custom profile URL.", "Still using the default profile URL."),
  ]);
}
