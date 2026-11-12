import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countQuantifiedStatements } from "../src/checks/experience";
import { parseProfile } from "../src/parse";
import { extractPdfText, PdfReadError } from "../src/parse/pdf";
import { scoreText } from "../src/score";

// These PDFs are synthetic: generated to imitate the two-column layout of a
// profile export. They are not real exports.
const load = (file: string) => new Uint8Array(readFileSync(join(__dirname, "fixtures", file)));
const fromTxt = parseProfile(readFileSync(join(__dirname, "fixtures", "06-strong-finance.txt"), "utf8"));

describe("PDF import", () => {
  it("separates the sidebar from the main column and finds every section", async () => {
    const p = parseProfile(await extractPdfText(load("profile-two-column.pdf")));
    expect(p.headline).toBe(fromTxt.headline);
    expect(p.about.length).toBeGreaterThan(700);
    expect(p.about).toContain("sample.six@example.com");
    expect(p.experience.map((r) => r.heading)).toEqual([
      ["Example Foods", "Financial Analyst"],
      ["Example Accounting Partners", "Staff Accountant"],
    ]);
    expect(p.skills).toEqual(["Financial Modeling", "Forecasting", "Excel"]);
    expect(p.education).toHaveLength(1);
    expect(p.extras.certifications).toContain("FMVA");
    expect(p.about).not.toContain("Top Skills");
  });

  it("rejoins sentences that the PDF broke across lines", async () => {
    const p = parseProfile(await extractPdfText(load("profile-two-column.pdf")));
    const count = (roles: typeof p.experience) => roles.reduce((n, r) => n + countQuantifiedStatements(r.description), 0);
    expect(count(p.experience)).toBe(count(fromTxt.experience));
  });

  it("reads a profile that runs over two pages and drops the page footers", async () => {
    const text = await extractPdfText(load("profile-two-page.pdf"));
    expect(text).not.toMatch(/page \d+ of \d+/i);
    const p = parseProfile(text);
    expect(p.experience).toHaveLength(2);
    // This fixture has wide line spacing, so the school and degree lines may split into two entries.
    expect(p.education.join(" ")).toContain("Example University");
    expect(p.skills).toHaveLength(3);
  });

  it("reads a plain single-column PDF", async () => {
    const p = parseProfile(await extractPdfText(load("profile-single-column.pdf")));
    expect(p.headline).toBe(fromTxt.headline);
    expect(p.experience).toHaveLength(2);
    expect(p.skills.length).toBe(fromTxt.skills.length);
  });

  it("scores the PDF close to the same profile as text, once the skill count is supplied", async () => {
    const answers = { skillsCount: fromTxt.skills.length };
    const pdf = await scoreText(await extractPdfText(load("profile-two-column.pdf")), "Financial Analyst", answers);
    const txt = await scoreText(readFileSync(join(__dirname, "fixtures", "06-strong-finance.txt"), "utf8"), "Financial Analyst");
    expect(Math.abs(pdf.total - txt.total)).toBeLessThanOrEqual(3);
  });

  it("rejects a PDF with no text and a file that is not a PDF, with a clear reason", async () => {
    await expect(extractPdfText(load("no-text.pdf"))).rejects.toThrow(PdfReadError);
    await expect(extractPdfText(load("no-text.pdf"))).rejects.toThrow(/no selectable text/);
    await expect(extractPdfText(load("not-a-pdf.pdf"))).rejects.toThrow(/could not be opened/);
    await expect(extractPdfText(new Uint8Array())).rejects.toThrow(PdfReadError);
  });
});
