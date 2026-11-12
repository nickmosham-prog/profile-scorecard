import { describe, expect, it } from "vitest";
import { parseProfile } from "../src/parse";

const SAMPLE = `Sample Person
Financial Analyst | FP&A
Los Angeles, California

About
I build forecasts.
Email me: a@example.com

Experience
Financial Analyst
Example Foods · Full-time
Jan 2022 - Present · 2 yrs
Los Angeles, California, United States
Own the forecast for 5 departments.
Saved 10 hours a month.

Staff Accountant
Example Partners
2019 - 2021

Education
Example University
BS Finance

Skills
Excel
SQL, Tableau
Excel
Endorsed by 3 colleagues

Licenses & Certifications
FMVA

Hobbies
Chess`;

describe("parseProfile", () => {
  const p = parseProfile(SAMPLE);

  it("takes the second line as the headline", () => {
    expect(p.headline).toBe("Financial Analyst | FP&A");
  });

  it("prefers an explicit Headline: label", () => {
    expect(parseProfile("Name\nHeadline: Ops Lead\nSomething else").headline).toBe("Ops Lead");
  });

  it("reads the About section, and Summary as the same thing", () => {
    expect(p.about).toContain("I build forecasts.");
    expect(parseProfile("Name\nTitle\nSummary\nHello there").about).toBe("Hello there");
  });

  it("splits experience into roles at each date line", () => {
    expect(p.experience).toHaveLength(2);
    expect(p.experience[0].heading).toEqual(["Financial Analyst", "Example Foods · Full-time"]);
    expect(p.experience[0].dates).toContain("Jan 2022");
    expect(p.experience[1].heading).toEqual(["Staff Accountant", "Example Partners"]);
  });

  it("keeps the description and drops the location line", () => {
    expect(p.experience[0].description).toBe("Own the forecast for 5 departments.\nSaved 10 hours a month.");
    expect(p.experience[1].description).toBe("");
  });

  it("splits roles that have no blank line between them", () => {
    const text = "N\nH\nExperience\nCo A\nAnalyst\nMarch 2022 - Present (2 years)\nDid things well.\nCo B\nClerk\nMay 2019 - February 2022\nFiled things.";
    const roles = parseProfile(text).experience;
    expect(roles).toHaveLength(2);
    expect(roles[0].description).toBe("Did things well.");
    expect(roles[1].heading).toEqual(["Co B", "Clerk"]);
  });

  it("falls back to blank-line blocks when there are no dates", () => {
    const roles = parseProfile("N\nH\nExperience\nBarista\nMade coffee.\n\nCashier\nRan a till.").experience;
    expect(roles.map((r) => r.heading[0])).toEqual(["Barista", "Cashier"]);
  });

  it("splits, de-duplicates, and cleans skills", () => {
    expect(p.skills).toEqual(["Excel", "SQL", "Tableau"]);
  });

  it("puts certifications and unknown text where checks can find them", () => {
    expect(p.extras.certifications).toContain("FMVA");
    expect(p.education).toHaveLength(1);
  });

  it("removes doubled lines and page markers", () => {
    const messy = parseProfile("Name\nName\nAnalyst\nAnalyst\nSummary\nPage 1 of 2\nHello");
    expect(messy.headline).toBe("Analyst");
    expect(messy.about).toBe("Hello");
  });

  it("never crashes on empty or junk input", () => {
    for (const junk of ["", "   \n\n", "~~~ ### ???", "Experience", "Skills\n\n\nAbout", "\u0000\u0001￿", "a".repeat(10000)]) {
      expect(() => parseProfile(junk)).not.toThrow();
    }
    expect(parseProfile("").headline).toBe("");
    // @ts-expect-error deliberately wrong type
    expect(() => parseProfile(undefined)).not.toThrow();
  });
});
