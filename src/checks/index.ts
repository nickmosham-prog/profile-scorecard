import type { CategoryResult, Profile } from "../types";
import { checkAbout } from "./about";
import { checkActivity } from "./activity";
import { checkCompleteness } from "./completeness";
import { checkCustomUrl } from "./customUrl";
import { checkExperience } from "./experience";
import { checkFeatured } from "./featured";
import { checkHeadline } from "./headline";
import { checkPhotoBanner } from "./photoBanner";
import { checkRecommendations } from "./recommendations";
import type { CheckContext } from "./shared";
import { checkSkills } from "./skills";

// Runs every category's checks, in the same order as the rubric table.
export function runAllChecks(profile: Profile, ctx: CheckContext): CategoryResult[] {
  return [
    checkHeadline(profile, ctx),
    checkAbout(profile, ctx),
    checkExperience(profile, ctx),
    checkSkills(profile, ctx),
    checkPhotoBanner(profile, ctx),
    checkCustomUrl(profile, ctx),
    checkFeatured(profile, ctx),
    checkRecommendations(profile, ctx),
    checkCompleteness(profile, ctx),
    checkActivity(profile, ctx),
  ];
}
