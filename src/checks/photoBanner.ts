import { getCategory, getCheck } from "../rubric";
import type { CategoryResult, Profile } from "../types";
import { categoryResult, yesNoFinding, type CheckContext } from "./shared";

// Self-reported: neither image appears in pasted text or the exported PDF.
export function checkPhotoBanner(_profile: Profile, ctx: CheckContext): CategoryResult {
  const category = getCategory(ctx.rubric, "photoBanner");
  return categoryResult(category, [
    yesNoFinding(getCheck(category, "photoBanner.photo"), ctx.answers.hasPhoto, "Has a profile photo.", "No profile photo."),
    yesNoFinding(getCheck(category, "photoBanner.banner"), ctx.answers.hasBanner, "Has a custom banner.", "No custom banner."),
  ]);
}
