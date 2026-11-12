import PDFDocument from "pdfkit";
import { MAX_FIXES, type PaidReport } from "./ai/paidReport";
import type { ScoreResult } from "./score";

// Lays out the paid report. Both formats are built from the same list of
// blocks, so the markdown file and the PDF always say the same thing.

type Block =
  | { kind: "title" | "heading" | "subheading" | "text" | "note"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "bars"; rows: Array<{ label: string; earned: number; max: number }> };

const VERIFY =
  "The rewrites below are AI suggestions built only from your own profile text. Check every fact and fill in any [bracketed placeholders] before you use them.";

export function buildBlocks(result: ScoreResult, report: PaidReport): Block[] {
  const blocks: Block[] = [
    { kind: "title", text: "Profile Scorecard Report" },
    { kind: "text", text: `Target role: ${result.targetRole}` },
    { kind: "heading", text: `Score: ${result.total} / 100 (${result.band})` },
    { kind: "text", text: report.overview },
    { kind: "heading", text: "Score breakdown" },
    { kind: "bars", rows: result.categories.map((c) => ({ label: c.label, earned: c.pointsEarned, max: c.pointsMax })) },
    { kind: "heading", text: "Your fixes, most valuable first" },
  ];

  const fixes = result.fixes.slice(0, MAX_FIXES);
  if (fixes.length === 0) blocks.push({ kind: "text", text: "Nothing left to fix on this rubric." });
  fixes.forEach((fix, i) => {
    blocks.push({ kind: "subheading", text: `${i + 1}. ${fix.category}: +${fix.potentialGain.toFixed(1)} points available` });
    blocks.push({ kind: "text", text: `${fix.fix} (basis: ${fix.basis})` });
    const steps = report.fix_steps[i]?.steps;
    if (steps?.length) blocks.push({ kind: "bullets", items: steps });
  });

  blocks.push({ kind: "heading", text: "Rewrites" }, { kind: "note", text: VERIFY });
  blocks.push({ kind: "subheading", text: "Headline options" }, { kind: "bullets", items: report.headline_options });
  blocks.push({ kind: "subheading", text: "About section" }, { kind: "text", text: report.about_rewrite });
  if (report.experience_rewrites.length) {
    blocks.push({ kind: "subheading", text: "Experience" });
    for (const r of report.experience_rewrites) {
      blocks.push({ kind: "text", text: r.role });
      blocks.push({ kind: "bullets", items: [`Before: ${r.before}`, `After: ${r.after}`] });
    }
  }

  blocks.push({ kind: "heading", text: "About this report" });
  blocks.push({
    kind: "note",
    text:
      'Each fix is labelled with its basis: "documented" means stated by the platform, "consistent-with-documented" means it follows from platform guidance, and "convention" means common recruiter and career-coach advice. ' +
      result.disclaimer,
  });
  for (const n of result.notes) blocks.push({ kind: "note", text: n });
  return blocks;
}

export function renderMarkdown(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.kind) {
        case "title":
          return `# ${b.text}`;
        case "heading":
          return `## ${b.text}`;
        case "subheading":
          return `### ${b.text}`;
        case "note":
          return `*${b.text}*`;
        case "text":
          return b.text;
        case "bullets":
          return b.items.map((i) => `- ${i}`).join("\n");
        case "bars":
          return ["| Category | Points | Max |", "| --- | --- | --- |", ...b.rows.map((r) => `| ${r.label} | ${r.earned.toFixed(1)} | ${r.max} |`)].join("\n");
      }
    })
    .join("\n\n") + "\n";
}

// The PDF's built-in fonts cover Western European characters only. Anything
// else (emoji, other scripts) is replaced so the file never fails to build.
function printable(text: string): string {
  return text.replace(/[^\x20-\x7E -ÿ–—‘’“”•…\n]/g, "?");
}

export function renderPdf(blocks: Block[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "LETTER", margin: 54, info: { Title: "Profile Scorecard Report" } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const width = doc.page.width - 108;
    for (const b of blocks) {
      switch (b.kind) {
        case "title":
          doc.font("Helvetica-Bold").fontSize(22).fillColor("#111").text(printable(b.text)).moveDown(0.3);
          break;
        case "heading":
          doc.moveDown(0.8).font("Helvetica-Bold").fontSize(15).fillColor("#111").text(printable(b.text)).moveDown(0.3);
          break;
        case "subheading":
          doc.moveDown(0.5).font("Helvetica-Bold").fontSize(11.5).fillColor("#111").text(printable(b.text)).moveDown(0.2);
          break;
        case "text":
          doc.font("Helvetica").fontSize(10.5).fillColor("#222").text(printable(b.text), { width, lineGap: 2 }).moveDown(0.4);
          break;
        case "note":
          doc.font("Helvetica-Oblique").fontSize(9).fillColor("#555").text(printable(b.text), { width, lineGap: 2 }).moveDown(0.4);
          break;
        case "bullets":
          doc.font("Helvetica").fontSize(10.5).fillColor("#222");
          for (const item of b.items) doc.text(`•  ${printable(item)}`, { width, indent: 0, lineGap: 2 }).moveDown(0.25);
          break;
        case "bars":
          doc.font("Helvetica").fontSize(10).fillColor("#222");
          for (const r of b.rows) {
            if (doc.y > doc.page.height - 90) doc.addPage();
            const y = doc.y;
            doc.text(printable(r.label), 54, y, { width: 240, lineBreak: false });
            doc.rect(300, y + 1, 160, 8).fill("#ddd");
            doc.rect(300, y + 1, 160 * Math.max(0, Math.min(1, r.earned / r.max)), 8).fill("#2a6");
            doc.fillColor("#222").text(`${r.earned.toFixed(1)} / ${r.max}`, 470, y, { width: 80, lineBreak: false });
            doc.x = 54;
            doc.y = y + 16;
          }
          break;
      }
    }
    doc.end();
  });
}
