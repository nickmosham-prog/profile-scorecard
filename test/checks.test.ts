import { describe, expect, it } from "vitest";
import { checkAbout } from "../src/checks/about";
import { checkActivity } from "../src/checks/activity";
import { checkCompleteness } from "../src/checks/completeness";
import { checkCustomUrl } from "../src/checks/customUrl";
import { checkExperience, countQuantifiedStatements } from "../src/checks/experience";
import { checkFeatured } from "../src/checks/featured";
import { checkHeadline } from "../src/checks/headline";
import { runAllChecks } from "../src/checks";
import { checkPhotoBanner } from "../src/checks/photoBanner";
import { checkRecommendations } from "../src/checks/recommendations";
import { containsTerm, roleKeywords } from "../src/checks/shared";
import { checkSkills } from "../src/checks/skills";
import { rubric } from "../src/rubric";
import { ctx, earned, profile } from "./helpers";

const role = (description: string) => ({ heading: ["Analyst"], dates: "2020 - 2022", description });

describe("keyword helpers", () => {
  it("matches whole terms only", () => {
    expect(containsTerm("I sell laptops", "ops")).toBe(false);
    expect(containsTerm("Ops lead", "ops")).toBe(true);
    expect(containsTerm("FP&A and budgeting", "fp&a")).toBe(true);
  });

  it("builds role words and related keywords", () => {
    const k = roleKeywords("Senior Financial Analyst", rubric);
    expect(k.roleWords).toEqual(["financial", "analyst"]);
    expect(k.related).toContain("forecasting");
    expect(k.related).toContain("sql");
  });

  it("ignores the prefix in Co-Founder, Co-Owner and similar titles", () => {
    expect(roleKeywords("Co-Founder", rubric).roleWords).toEqual(["founder"]);
  });

  it("has no related keywords for a role outside the launch families", () => {
    expect(roleKeywords("Registered Nurse", rubric).related).toEqual([]);
  });
});

describe("headline", () => {
  const good = "Financial Analyst | FP&A, Forecasting and Financial Modeling | Helping consumer brands plan ahead with confidence";

  it("gives full marks to a long, keyworded, specific headline", () => {
    const r = checkHeadline(profile({ headline: good }), ctx());
    expect(r.pointsEarned).toBe(9);
    expect(r.pointsMax).toBe(9);
  });

  it("scores length in steps", () => {
    const len = (h: string) => earned(checkHeadline(profile({ headline: h }), ctx()), "headline.length");
    expect(len("")).toBe(0);
    expect(len("Student")).toBe(0.75);
    expect(len("x".repeat(50))).toBe(1.5);
    expect(len("x".repeat(100))).toBe(3);
    expect(len("x".repeat(221))).toBe(1.5);
  });

  it("gives half the keyword points for the role alone", () => {
    const r = checkHeadline(profile({ headline: "Financial Analyst at Example Co" }), ctx());
    expect(earned(r, "headline.keywords")).toBe(2);
  });

  it("gives no keyword points when nothing matches", () => {
    const r = checkHeadline(profile({ headline: "Registered Nurse in pediatric care" }), ctx());
    expect(earned(r, "headline.keywords")).toBe(0);
  });

  it("judges on role words alone when the role has no keyword family", () => {
    const r = checkHeadline(profile({ headline: "Registered Nurse in pediatric care" }), ctx("Registered Nurse"));
    expect(earned(r, "headline.keywords")).toBe(4);
  });

  it("penalises generic wording and bare titles", () => {
    const generic = (h: string) => earned(checkHeadline(profile({ headline: h }), ctx()), "headline.notGeneric");
    expect(generic("Seeking opportunities in finance and accounting")).toBe(0);
    expect(generic("Student")).toBe(1);
    expect(generic("Analyst who builds forecasts")).toBe(2);
    expect(generic("")).toBe(0);
  });
});

describe("about", () => {
  const about = (text: string) => checkAbout(profile({ about: text }), ctx());

  it("scores length against the 1,500-2,600 target", () => {
    const len = (n: number) => earned(about("x".repeat(n)), "about.length");
    expect(len(0)).toBe(0);
    expect(len(200)).toBe(0);
    expect(len(500)).toBe(1);
    expect(len(1000)).toBe(2);
    expect(len(1500)).toBe(3);
    expect(len(2600)).toBe(3);
    expect(len(3000)).toBe(2);
  });

  it("looks for keywords only in the first two lines", () => {
    const early = about("Financial analyst focused on forecasting.\nSecond line.\nThird line.");
    expect(earned(early, "about.keywordsEarly")).toBe(3);
    const late = about("I like people.\nI like dogs.\nFinancial analyst focused on forecasting.");
    expect(earned(late, "about.keywordsEarly")).toBe(0);
  });

  it("detects an email, a phone number, or a call to action", () => {
    const cta = (t: string) => earned(about(t), "about.callToAction");
    expect(cta("Write to me at a.b@example.com")).toBe(3);
    expect(cta("Call (555) 010-2030 any time")).toBe(3);
    expect(cta("Feel free to reach out.")).toBe(3);
    expect(cta("I grew revenue 20% in 2023.")).toBe(0);
  });
});

describe("experience", () => {
  it("counts quantified statements and ignores years", () => {
    expect(countQuantifiedStatements("Joined in 2021. Grew sales 20%. Managed $2M budget.\nLed 5 people")).toBe(3);
    expect(countQuantifiedStatements("Started 2019 and left 2022.")).toBe(0);
    // Found on a real profile: names with digits in them are not results.
    expect(countQuantifiedStatements("Called contacts of COVID-19 patients.\nAssisted with the R03 grant process.")).toBe(0);
    expect(countQuantifiedStatements("Managed a 10-company portfolio.\nSupported a $19.3M grant.\nTrained 4 COVID-19 investigators.")).toBe(3);
  });

  it("scores the share of roles with a real description", () => {
    const long = "Owned the monthly forecast and variance reporting for the whole business unit.";
    const r = checkExperience(profile({ experience: [role(long), role("")] }), ctx());
    expect(earned(r, "experience.descriptions")).toBe(2);
  });

  it("gives full quantified marks at 5 results and scales below", () => {
    const five = role("Cut cost 10%.\nSaved $5K.\nLed 3 people.\nShipped 40 reports.\nGrew usage 2x.");
    expect(earned(checkExperience(profile({ experience: [five] }), ctx()), "experience.quantified")).toBe(4);
    const two = role("Cut cost 10%.\nSaved $5K.\nWorked hard.");
    expect(earned(checkExperience(profile({ experience: [two] }), ctx()), "experience.quantified")).toBeCloseTo(1.6);
  });

  it("scores target-role keywords in titles and descriptions", () => {
    const kw = (heading: string, description: string, target = "Financial Analyst") =>
      earned(checkExperience(profile({ experience: [{ heading: [heading], dates: "", description }] }), ctx(target)), "experience.keywords");
    expect(kw("Financial Analyst", "Built forecasting models in Excel.")).toBe(4);
    expect(kw("Clerk", "Used Excel and SQL daily.")).toBe(2);
    expect(kw("Charge Nurse", "Cared for pediatric patients.")).toBe(0);
    // A role outside the keyword families is judged on its own words.
    expect(kw("Registered Nurse", "Cared for pediatric patients.", "Registered Nurse")).toBe(4);
  });

  it("gives zero when there is no experience", () => {
    expect(checkExperience(profile(), ctx()).pointsEarned).toBe(0);
  });
});

describe("skills", () => {
  it("scales the count up to 30", () => {
    const n = (count: number) =>
      earned(checkSkills(profile({ skills: Array.from({ length: count }, (_, i) => `Skill ${i}`) }), ctx()), "skills.count");
    expect(n(0)).toBe(0);
    expect(n(15)).toBe(3);
    expect(n(30)).toBe(6);
    expect(n(45)).toBe(6);
  });

  it("uses the self-reported count when it is higher than what the text shows", () => {
    const three = profile({ skills: ["Excel", "SQL", "Tableau"] });
    const r = checkSkills(three, ctx("Financial Analyst", { skillsCount: 30 }));
    expect(earned(r, "skills.count")).toBe(6);
    expect(r.findings[0].message).toContain("self-reported");
    expect(earned(checkSkills(three, ctx("Financial Analyst", { skillsCount: 1 })), "skills.count")).toBeCloseTo(0.6);
  });

  it("does not claim a PDF has 3 skills when the total was not given", () => {
    const three = profile({ skills: ["Excel", "SQL", "Tableau"] });
    const pdf = checkSkills(three, { ...ctx("Financial Analyst"), source: "pdf" });
    expect(earned(pdf, "skills.count")).toBe(0);
    expect(pdf.findings[0].message).toMatch(/^Not answered/);
    expect(pdf.findings[0].message).not.toContain("3 skills listed");
    // With the total supplied, or for pasted text, the count is used as before.
    expect(earned(checkSkills(three, { ...ctx("Financial Analyst", { skillsCount: 30 }), source: "pdf" }), "skills.count")).toBe(6);
    expect(earned(checkSkills(three, { ...ctx("Financial Analyst"), source: "text" }), "skills.count")).toBeCloseTo(0.6);
  });

  it("checks whether the first three skills fit the role", () => {
    const top = (skills: string[]) => earned(checkSkills(profile({ skills }), ctx()), "skills.top3");
    expect(top(["Financial Modeling", "Excel", "Forecasting", "Cooking"])).toBe(4);
    expect(top(["Cooking", "Excel", "Juggling"])).toBeCloseTo(4 / 3);
    expect(top(["Cooking", "Juggling", "Singing", "Excel"])).toBe(0);
  });
});

describe("self-reported categories", () => {
  it("photo and banner", () => {
    expect(checkPhotoBanner(profile(), ctx("x", { hasPhoto: true, hasBanner: true })).pointsEarned).toBe(8);
    expect(checkPhotoBanner(profile(), ctx("x", { hasPhoto: true, hasBanner: false })).pointsEarned).toBe(5);
    expect(checkPhotoBanner(profile(), ctx("x", {})).pointsEarned).toBe(0);
  });

  it("custom URL", () => {
    expect(checkCustomUrl(profile(), ctx("x", { hasCustomUrl: true })).pointsEarned).toBe(4);
    expect(checkCustomUrl(profile(), ctx("x", { hasCustomUrl: false })).pointsEarned).toBe(0);
  });

  it("featured needs one item", () => {
    expect(checkFeatured(profile(), ctx("x", { featuredCount: 0 })).pointsEarned).toBe(0);
    expect(checkFeatured(profile(), ctx("x", { featuredCount: 1 })).pointsEarned).toBe(6);
    expect(checkFeatured(profile(), ctx("x", { featuredCount: 9 })).pointsEarned).toBe(6);
  });

  it("recommendations scale up to 3", () => {
    expect(checkRecommendations(profile(), ctx("x", { recommendationsCount: 1 })).pointsEarned).toBeCloseTo(8 / 3);
    expect(checkRecommendations(profile(), ctx("x", { recommendationsCount: 3 })).pointsEarned).toBe(8);
    expect(checkRecommendations(profile(), ctx("x", { recommendationsCount: 10 })).pointsEarned).toBe(8);
  });

  it("activity", () => {
    expect(checkActivity(profile(), ctx("x", { activeLast30Days: true })).pointsEarned).toBe(8);
    expect(checkActivity(profile(), ctx("x", { activeLast30Days: false })).pointsEarned).toBe(0);
  });

  it("says so when a question was not answered", () => {
    expect(checkActivity(profile(), ctx("x", {})).findings[0].message).toMatch(/^Not answered/);
  });
});

describe("completeness", () => {
  it("gives full marks when everything is present", () => {
    const full = profile({
      headline: "h",
      about: "a",
      experience: [role("d")],
      skills: ["s"],
      education: ["Example University"],
      extras: { certifications: "FMVA" },
    });
    expect(checkCompleteness(full, ctx()).pointsEarned).toBe(6);
  });

  it("gives zero for an empty profile and partial credit for partial sections", () => {
    expect(checkCompleteness(profile(), ctx()).pointsEarned).toBe(0);
    const half = checkCompleteness(profile({ headline: "h", skills: ["s"] }), ctx());
    expect(earned(half, "completeness.coreSections")).toBe(1);
  });
});

describe("all checks together", () => {
  it("returns one result per rubric category, in rubric order, with matching maximums", () => {
    const results = runAllChecks(profile(), ctx());
    expect(results.map((r) => r.category)).toEqual(rubric.categories.map((c) => c.id));
    for (const r of results) {
      const c = rubric.categories.find((x) => x.id === r.category)!;
      expect(r.pointsMax).toBe(c.points - c.aiWeight);
      expect(r.pointsEarned).toBeGreaterThanOrEqual(0);
    }
  });
});
