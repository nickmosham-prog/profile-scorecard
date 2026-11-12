import { getCategory, getCheck } from "../rubric";
import type { CategoryResult, Profile } from "../types";
import { categoryResult, finding, type CheckContext } from "./shared";

export function checkCompleteness(profile: Profile, ctx: CheckContext): CategoryResult {
  const category = getCategory(ctx.rubric, "completeness");

  const hasEducation = profile.education.length > 0;
  const hasCerts = Boolean(profile.extras.certifications);

  const core: Array<[string, boolean]> = [
    ["headline", profile.headline.trim() !== ""],
    ["About", profile.about.trim() !== ""],
    ["experience", profile.experience.length > 0],
    ["skills", profile.skills.length > 0],
  ];
  const missing = core.filter(([, present]) => !present).map(([name]) => name);

  return categoryResult(category, [
    finding(getCheck(category, "completeness.education"), hasEducation ? 1 : 0, hasEducation ? "Education is filled in." : "No Education section found."),
    finding(getCheck(category, "completeness.certifications"), hasCerts ? 1 : 0, hasCerts ? "Certifications are listed." : "No certifications found."),
    finding(
      getCheck(category, "completeness.coreSections"),
      (core.length - missing.length) / core.length,
      missing.length ? `Missing core sections: ${missing.join(", ")}.` : "All core sections are present.",
    ),
  ]);
}
