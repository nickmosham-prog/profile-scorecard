import { getCategory, getCheck, param } from "../rubric";
import type { CategoryResult, Profile } from "../types";
import { categoryResult, containsTerm, finding, matchedTerms, type CheckContext } from "./shared";

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(\+?\d[\d\s().-]{8,}\d)/;

export function checkAbout(profile: Profile, ctx: CheckContext): CategoryResult {
  const category = getCategory(ctx.rubric, "about");
  const about = profile.about.trim();

  // Length.
  const lengthCheck = getCheck(category, "about.length");
  const len = about.length;
  const min = param(lengthCheck, "min");
  const max = param(lengthCheck, "max");
  let lengthFraction = 0;
  let lengthMessage = len === 0 ? "No About section found." : `About is only ${len} characters.`;
  if (len >= min && len <= max) {
    lengthFraction = 1;
    lengthMessage = `About is ${len} characters (target ${min}-${max}).`;
  } else if (len > max) {
    lengthFraction = 2 / 3;
    lengthMessage = `About is ${len} characters, over the ${max}-character limit.`;
  } else if (len >= param(lengthCheck, "okMin")) {
    lengthFraction = 2 / 3;
    lengthMessage = `About is ${len} characters; the target is ${min}-${max}.`;
  } else if (len >= param(lengthCheck, "thinMin")) {
    lengthFraction = 1 / 3;
    lengthMessage = `About is ${len} characters; the target is ${min}-${max}.`;
  }

  // Keywords early: only the opening lines show before "see more".
  const earlyCheck = getCheck(category, "about.keywordsEarly");
  const opening = about
    .split("\n")
    .filter((l) => l.trim())
    .slice(0, 2)
    .join(" ")
    .slice(0, param(earlyCheck, "maxChars"));
  const hits = matchedTerms(opening, [...ctx.keywords.roleWords, ...ctx.keywords.related]);
  const earlyFraction = Math.min(1, hits.length / param(earlyCheck, "fullAt"));
  const earlyMessage = hits.length
    ? `Opening lines contain: ${hits.join(", ")}.`
    : "Opening lines contain none of the target-role keywords.";

  // Contact line or call to action.
  const ctaCheck = getCheck(category, "about.callToAction");
  const hasCta =
    EMAIL.test(about) || PHONE.test(about) || ctx.rubric.callToActionPhrases.some((p) => containsTerm(about, p));
  const ctaMessage = hasCta ? "About includes a contact line or call to action." : "About has no contact line or call to action.";

  return categoryResult(category, [
    finding(lengthCheck, lengthFraction, lengthMessage),
    finding(earlyCheck, earlyFraction, earlyMessage),
    finding(ctaCheck, hasCta ? 1 : 0, ctaMessage),
  ]);
}
