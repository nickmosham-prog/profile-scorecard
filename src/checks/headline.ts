import { getCategory, getCheck, param } from "../rubric";
import type { CategoryResult, Profile } from "../types";
import { categoryResult, containsTerm, finding, matchedTerms, type CheckContext } from "./shared";

export function checkHeadline(profile: Profile, ctx: CheckContext): CategoryResult {
  const category = getCategory(ctx.rubric, "headline");
  const headline = profile.headline.trim();
  const { roleWords, related } = ctx.keywords;

  // Length: the site cuts headlines off at the limit, and a very short one wastes search space.
  const lengthCheck = getCheck(category, "headline.length");
  const len = headline.length;
  const limit = param(lengthCheck, "limit");
  let lengthFraction = 0.25;
  let lengthMessage = `Headline is only ${len} characters.`;
  if (len === 0) {
    lengthFraction = 0;
    lengthMessage = "No headline found.";
  } else if (len > limit) {
    lengthFraction = 0.5;
    lengthMessage = `Headline is ${len} characters, over the ${limit}-character limit, so it will be cut off.`;
  } else if (len >= param(lengthCheck, "goodMin")) {
    lengthFraction = 1;
    lengthMessage = `Headline is ${len} of ${limit} characters.`;
  } else if (len >= param(lengthCheck, "okMin")) {
    lengthFraction = 0.5;
    lengthMessage = `Headline is ${len} of ${limit} characters; there is room for more keywords.`;
  }

  // Keywords: half the points for the target role itself, half for related terms.
  const keywordCheck = getCheck(category, "headline.keywords");
  const roleHits = matchedTerms(headline, roleWords);
  const relatedHits = matchedTerms(headline, related);
  const roleFraction = roleWords.length ? roleHits.length / roleWords.length : 0;
  const relatedFraction = Math.min(1, relatedHits.length / param(keywordCheck, "relatedFullAt"));
  // If we have no related-keyword list for this role, judge on the role words alone.
  const keywordFraction = related.length ? (roleFraction + relatedFraction) / 2 : roleFraction;
  const hits = [...roleHits, ...relatedHits];
  const keywordMessage = hits.length
    ? `Headline contains: ${hits.join(", ")}.`
    : "Headline contains none of the target-role keywords.";

  // Generic wording.
  const genericCheck = getCheck(category, "headline.notGeneric");
  const genericHit = ctx.rubric.genericHeadlinePhrases.find((p) => containsTerm(headline, p));
  const words = headline.split(/\s+/).filter(Boolean).length;
  let genericFraction = 1;
  let genericMessage = "Headline is specific.";
  if (len === 0) {
    genericFraction = 0;
    genericMessage = "No headline found.";
  } else if (genericHit) {
    genericFraction = 0;
    genericMessage = `Headline uses generic wording ("${genericHit}").`;
  } else if (words < param(genericCheck, "minWords")) {
    genericFraction = 0.5;
    genericMessage = "Headline is just a bare title.";
  }

  return categoryResult(category, [
    finding(lengthCheck, lengthFraction, lengthMessage),
    finding(keywordCheck, keywordFraction, keywordMessage),
    finding(genericCheck, genericFraction, genericMessage),
  ]);
}
