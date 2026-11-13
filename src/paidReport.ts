import PDFDocument from "pdfkit";
import { MAX_FIXES, type PaidReport } from "./ai/paidReport";
import type { ScoreResult } from "./score";

// Lays out the paid report. Both formats are built from the same list of
// blocks, so the markdown file and the PDF always say the same thing.
// The PDF follows consulting-report conventions: a cover, a full-sentence
// "action title" on every page that states the takeaway, numbered exhibits
// with a source line, and a restrained navy-and-grey palette.

export interface ReportOptions {
  client?: string; // printed on the cover and in the page headers
  date?: Date; // printed on the cover; passed in so tests are repeatable
  // Combine the fixes that belong to the same area (for example three separate
  // About checks) into one item, so a profile with many gaps gets a short,
  // readable list instead of the first six of fifteen.
  groupByArea?: boolean;
}

interface ReportFix {
  category: string;
  label: string;
  potentialGain: number;
  fix: string;
  basis: string;
}

const MAX_GROUPS = 10;

function groupFixes(fixes: ReportFix[]): ReportFix[] {
  const groups = new Map<string, ReportFix[]>();
  for (const f of fixes) groups.set(f.category, [...(groups.get(f.category) ?? []), f]);
  return [...groups.values()]
    .map((list): ReportFix =>
      list.length === 1
        ? list[0]
        : {
            category: list[0].category,
            label: list.map((f) => f.label).join("; "),
            potentialGain: list.reduce((total, f) => total + f.potentialGain, 0),
            fix: list.map((f) => f.fix).join(" "),
            basis: list.every((f) => f.basis === list[0].basis) ? list[0].basis : "mixed",
          },
    )
    .sort((a, b) => b.potentialGain - a.potentialGain);
}

type Block =
  | { kind: "cover"; client?: string; role: string; total: number; band: string; date: string; rubricVersion: string; disclaimer: string }
  | { kind: "section"; eyebrow: string; title: string } // starts a new page
  | { kind: "stats"; items: Array<{ value: string; label: string }> }
  | { kind: "subheading" | "text" | "note"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "meters"; title: string; rows: Array<{ label: string; earned: number; max: number }>; source: string }
  | { kind: "table"; head: string[]; widths: number[]; rows: string[][] }
  | { kind: "compare"; rows: Array<{ role: string; before: string; after: string }> }
  | { kind: "boxed"; label: string; text: string; footnote?: string }
  | { kind: "options"; items: string[] };

const VERIFY =
  "The rewrites below are AI suggestions built only from the profile's own text. Check every fact and fill in each [bracketed placeholder] before publishing.";

const BASIS_LABEL: Record<string, string> = {
  documented: "Documented",
  "consistent-with-documented": "Consistent with documented",
  convention: "Convention",
  "ai-judgement": "AI-judged",
  mixed: "Mixed",
};

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const points = (n: number) => n.toFixed(1);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildBlocks(result: ScoreResult, report: PaidReport, options: ReportOptions = {}): Block[] {
  const fixes = options.groupByArea ? groupFixes(result.fixes).slice(0, MAX_GROUPS) : result.fixes.slice(0, MAX_FIXES);
  const sum = (list: typeof fixes) => list.reduce((total, f) => total + f.potentialGain, 0);
  const available = sum(fixes);
  const who = options.client?.trim() || "This profile";
  const date = (options.date ?? new Date()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const blocks: Block[] = [
    {
      kind: "cover",
      client: options.client?.trim() || undefined,
      role: result.targetRole,
      total: result.total,
      band: result.band,
      date,
      rubricVersion: result.rubricVersion,
      disclaimer: result.disclaimer,
    },
  ];

  // ---- Executive summary ----------------------------------------------------
  const lead = `${who} scores ${result.total} out of 100 for ${result.targetRole} (${result.band})`;
  blocks.push({
    kind: "section",
    eyebrow: "Executive summary",
    title: fixes.length
      ? `${lead}, with ${plural(fixes.length, "fix", "fixes")} worth up to ${Math.round(available)} more rubric points`
      : `${lead}; nothing is left to fix on this rubric`,
  });
  blocks.push({
    kind: "stats",
    items: [
      { value: String(result.total), label: "Score out of 100" },
      { value: capital(result.band), label: "Band" },
      { value: `+${Math.round(available)}`, label: "Points available" },
    ],
  });
  blocks.push({ kind: "subheading", text: "Summary" }, { kind: "text", text: report.overview });
  blocks.push({
    kind: "meters",
    title: "Exhibit 1: Points earned by category",
    rows: result.categories.map((c) => ({ label: c.label, earned: c.pointsEarned, max: c.pointsMax })),
    source: `Source: Profile Scorecard best-practice rubric v${result.rubricVersion}`,
  });

  // ---- Fixes ------------------------------------------------------------------
  if (fixes.length) {
    const firstThree = fixes.slice(0, 3);
    blocks.push({
      kind: "section",
      eyebrow: "Priority fixes",
      title:
        fixes.length <= 3
          ? `${plural(fixes.length, "fix", "fixes")} account for all ${Math.round(available)} points still available`
          : `The first three fixes are worth ${Math.round(sum(firstThree))} of the ${Math.round(available)} points still available`,
    });
    blocks.push({
      kind: "table",
      head: ["#", "Area", "What to improve", "Points", "Basis"],
      widths: [24, 112, 206, 48, 102],
      rows: fixes.map((f, i) => [String(i + 1), f.category, f.label, `+${points(f.potentialGain)}`, BASIS_LABEL[f.basis] ?? f.basis]),
    });
    blocks.push({
      kind: "note",
      text:
        "Fixes are ranked by the rubric points each could still add, calculated in code. " +
        (options.groupByArea ? "Fixes in the same area are combined. " : "") +
        "Points are rubric points, not a prediction of views or results.",
    });
    fixes.forEach((fix, i) => {
      blocks.push({ kind: "subheading", text: `${i + 1}. ${fix.category}: +${points(fix.potentialGain)} points available` });
      blocks.push({ kind: "text", text: fix.fix });
      const steps = report.fix_steps[i]?.steps;
      if (steps?.length) blocks.push({ kind: "bullets", items: steps });
    });
  }

  // ---- Rewrites ---------------------------------------------------------------
  blocks.push({ kind: "section", eyebrow: "Rewrites", title: "Ready-to-edit text, built only from facts already in the profile" });
  blocks.push({ kind: "note", text: VERIFY });
  blocks.push({ kind: "subheading", text: "Headline options" }, { kind: "options", items: report.headline_options });
  blocks.push({ kind: "subheading", text: "About section" });
  blocks.push({
    kind: "boxed",
    label: "Suggested About section",
    text: report.about_rewrite,
    footnote: `${report.about_rewrite.length.toLocaleString("en-US")} characters (target 1,500 to 2,600)`,
  });
  if (report.experience_rewrites.length) {
    blocks.push({ kind: "subheading", text: "Experience bullets" });
    blocks.push({ kind: "compare", rows: report.experience_rewrites });
  }

  // ---- Appendix ---------------------------------------------------------------
  blocks.push({ kind: "section", eyebrow: "Appendix", title: "How this score was built" });
  blocks.push({
    kind: "text",
    text:
      "The score is out of 100 and is calculated in code from the rubric. Rule-based checks cover length, keywords, counts and completeness. For the headline, About and experience sections an AI model also rates quality against written anchors. Items that are not in the profile text (photo, banner, custom URL, Featured, recommendations, recent activity) are the client's own answers.",
  });
  blocks.push({
    kind: "table",
    head: ["Basis", "Meaning"],
    widths: [150, 342],
    rows: [
      ["Documented", "Stated by the platform."],
      ["Consistent with documented", "Follows from platform guidance."],
      ["Convention", "Common recruiter and career-coach advice."],
      ["AI-judged", "A quality rating from an AI model against written scoring anchors."],
    ],
  });
  blocks.push({ kind: "note", text: result.disclaimer });
  for (const n of result.notes) blocks.push({ kind: "note", text: n });
  return blocks;
}

// ---- Markdown -------------------------------------------------------------------

export function renderMarkdown(blocks: Block[]): string {
  return (
    blocks
      .map((b) => {
        switch (b.kind) {
          case "cover":
            return [
              "# Profile Scorecard: Search visibility review",
              [b.client && `Prepared for: ${b.client}`, `Target role: ${b.role}`, b.date].filter(Boolean).join("  \n"),
              `**Score: ${b.total} / 100 (${b.band})**`,
            ].join("\n\n");
          case "section":
            return `## ${b.title}`;
          case "stats":
            return b.items.map((i) => `**${i.value}** ${i.label}`).join("  \n");
          case "subheading":
            return `### ${b.text}`;
          case "note":
            return `*${b.text}*`;
          case "text":
            return b.text;
          case "bullets":
            return b.items.map((i) => `- ${i}`).join("\n");
          case "meters":
            return [`**${b.title}**`, "| Category | Points | Max |", "| --- | --- | --- |", ...b.rows.map((r) => `| ${r.label} | ${points(r.earned)} | ${r.max} |`), `*${b.source}*`].join("\n");
          case "table":
            return [`| ${b.head.join(" | ")} |`, `| ${b.head.map(() => "---").join(" | ")} |`, ...b.rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
          case "compare":
            return b.rows.map((r) => `**${r.role}**\n\n- Before: ${r.before}\n- After: ${r.after}`).join("\n\n");
          case "boxed":
            return [`> **${b.label}**`, ...b.text.split("\n").map((l) => `> ${l}`), b.footnote ? `\n*${b.footnote}*` : ""].join("\n");
          case "options":
            return b.items.map((i, n) => `${n + 1}. ${i} *(${i.length} characters)*`).join("\n");
        }
      })
      .join("\n\n") + "\n"
  );
}

// ---- PDF --------------------------------------------------------------------------

const C = {
  ink: "#0B1F33",
  body: "#26384C",
  muted: "#6B7A8C",
  rule: "#D5DCE4",
  navy: "#0B2A4A",
  accent: "#1F6FB8",
  accentLight: "#8FC0EE",
  track: "#E3E8EE",
  panel: "#F3F5F8",
};
const PAGE_W = 612;
const PAGE_H = 792;
const M = { left: 60, right: 60, top: 80, bottom: 70 };
const W = PAGE_W - M.left - M.right;

// The PDF's built-in fonts cover Western European characters only. Anything
// else (emoji, other scripts) is replaced so the file never fails to build.
function printable(text: string): string {
  return text.replace(/[^\x20-\x7E -ÿ–—‘’“”•…\n]/g, "?");
}

export function renderPdf(blocks: Block[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      autoFirstPage: false,
      bufferPages: true, // lets us add headers and page numbers once the page count is known
      margins: { top: M.top, bottom: M.bottom, left: M.left, right: M.right },
      info: { Title: "Profile Scorecard Report" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const limit = () => PAGE_H - M.bottom;
    const newPage = () => {
      doc.addPage();
      doc.x = M.left;
      doc.y = M.top;
    };
    // Starts a new page when the next element would not fit on this one.
    const ensure = (height: number) => {
      if (doc.y + height > limit()) newPage();
    };
    const heightOf = (text: string, font: string, size: number, width: number, lineGap = 0) => {
      doc.font(font).fontSize(size);
      return doc.heightOfString(printable(text), { width, lineGap });
    };
    // Body text in which [bracketed placeholders] stand out in bold blue, so the
    // reader cannot miss what still has to be filled in.
    const writeRich = (text: string, x: number, y: number, width: number, font: string, size: number, color: string, lineGap: number) => {
      const parts = printable(text).split(/(\[[^\]]*\])/).filter(Boolean);
      parts.forEach((part, i) => {
        const placeholder = part.startsWith("[") && part.endsWith("]");
        doc.font(placeholder ? "Helvetica-Bold" : font).fontSize(size).fillColor(placeholder ? C.accent : color);
        const opts = { width, lineGap, continued: i < parts.length - 1 };
        if (i === 0) doc.text(part, x, y, opts);
        else doc.text(part, opts);
      });
    };
    const hairline = (y: number, color = C.rule, weight = 0.5) =>
      doc.moveTo(M.left, y).lineTo(M.left + W, y).lineWidth(weight).strokeColor(color).stroke();

    let cover: Extract<Block, { kind: "cover" }> | undefined;

    for (const b of blocks) {
      switch (b.kind) {
        case "cover": {
          cover = b;
          doc.addPage();
          doc.rect(0, 0, PAGE_W, 330).fill(C.navy);
          doc.rect(M.left, 112, 40, 3).fill(C.accentLight);
          doc.font("Helvetica-Bold").fontSize(9).fillColor(C.accentLight).text("PROFILE SCORECARD", M.left, 130, { characterSpacing: 2.2, width: W });
          doc.font("Times-Bold").fontSize(36).fillColor("#FFFFFF").text("Search visibility review", M.left, 156, { width: W });
          doc.font("Helvetica").fontSize(13).fillColor("#C9D6E4").text(printable(`Best-practice review for ${b.role} roles`), M.left, 214, { width: W });

          doc.font("Times-Bold").fontSize(110).fillColor(C.navy);
          const scoreText = String(b.total);
          doc.text(scoreText, M.left, 372, { lineBreak: false });
          const scoreWidth = doc.widthOfString(scoreText);
          doc.font("Helvetica").fontSize(22).fillColor(C.muted).text("/ 100", M.left + scoreWidth + 10, 440, { lineBreak: false });
          doc.font("Helvetica-Bold").fontSize(10).fillColor(C.accent).text(printable(b.band.toUpperCase()), M.left, 492, { characterSpacing: 1.6, lineBreak: false });

          const details: Array<[string, string]> = [
            ["Prepared for", b.client ?? "Client"],
            ["Target role", b.role],
            ["Date", b.date],
          ];
          const colW = W / 3;
          details.forEach(([label, value], i) => {
            const x = M.left + i * colW;
            doc.rect(x, 580, colW - 14, 1).fill(C.rule);
            doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.muted).text(label.toUpperCase(), x, 590, { characterSpacing: 1, width: colW - 14, lineBreak: false });
            doc.font("Helvetica").fontSize(10.5).fillColor(C.ink).text(printable(value), x, 604, { width: colW - 14 });
          });
          doc.font("Helvetica-Oblique").fontSize(8).fillColor(C.muted).text(printable(`Rubric v${b.rubricVersion}. Confidential: prepared for the named client only.`), M.left, 676, { width: W });
          break;
        }

        case "section": {
          newPage();
          doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C.accent).text(printable(b.eyebrow.toUpperCase()), M.left, doc.y, { characterSpacing: 1.4, width: W });
          doc.moveDown(0.4);
          doc.font("Times-Bold").fontSize(21).fillColor(C.navy).text(printable(b.title), { width: W, lineGap: 2 });
          doc.y += 8;
          hairline(doc.y, C.navy, 1);
          doc.y += 16;
          break;
        }

        case "stats": {
          const gap = 18;
          const w = (W - gap * (b.items.length - 1)) / b.items.length;
          const h = 76;
          ensure(h + 14);
          const y = doc.y;
          b.items.forEach((item, i) => {
            const x = M.left + i * (w + gap);
            const long = item.value.length > 8;
            doc.rect(x, y, w, 2.5).fill(C.navy);
            doc.font("Times-Bold").fontSize(long ? 22 : 34).fillColor(C.navy).text(printable(item.value), x, y + (long ? 18 : 10), { width: w, lineBreak: false });
            doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.muted).text(printable(item.label.toUpperCase()), x, y + 56, { characterSpacing: 1, width: w, lineBreak: false });
          });
          doc.x = M.left;
          doc.y = y + h + 14;
          break;
        }

        case "subheading": {
          ensure(120); // keeps a heading together with the start of what it introduces
          doc.moveDown(0.5);
          doc.font("Helvetica-Bold").fontSize(11.5).fillColor(C.navy).text(printable(b.text), M.left, doc.y, { width: W });
          doc.moveDown(0.35);
          break;
        }

        case "text": {
          ensure(heightOf(b.text, "Helvetica", 10, W, 3.5) > 600 ? 40 : Math.min(heightOf(b.text, "Helvetica", 10, W, 3.5) + 4, 600));
          writeRich(b.text, M.left, doc.y, W, "Helvetica", 10, C.body, 3.5);
          doc.moveDown(0.6);
          break;
        }

        case "note": {
          ensure(heightOf(b.text, "Helvetica-Oblique", 8.5, W, 2) + 6);
          doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(C.muted).text(printable(b.text), M.left, doc.y, { width: W, lineGap: 2 });
          doc.moveDown(0.6);
          break;
        }

        case "bullets": {
          for (const item of b.items) {
            ensure(heightOf(item, "Helvetica", 9.8, W - 16, 3) + 6);
            const y = doc.y;
            doc.rect(M.left + 2, y + 4.5, 3, 3).fill(C.accent);
            writeRich(item, M.left + 16, y, W - 16, "Helvetica", 9.8, C.body, 3);
            doc.y += 3;
          }
          doc.moveDown(0.5);
          break;
        }

        case "meters": {
          const rowH = 24;
          ensure(40 + b.rows.length * rowH + 24);
          doc.font("Helvetica-Bold").fontSize(9.5).fillColor(C.ink).text(printable(b.title), M.left, doc.y, { width: W });
          doc.y += 8;
          hairline(doc.y, C.navy, 0.75);
          const trackX = M.left + 226;
          const trackW = 170;
          let y = doc.y + 8;
          for (const r of b.rows) {
            doc.font("Helvetica").fontSize(9.5).fillColor(C.body).text(printable(r.label), M.left, y + 1, { width: 216, lineBreak: false, ellipsis: true });
            doc.roundedRect(trackX, y + 4, trackW, 6, 3).fill(C.track);
            const share = Math.max(0, Math.min(1, r.earned / r.max));
            if (share > 0) doc.roundedRect(trackX, y + 4, Math.max(4, trackW * share), 6, 3).fill(C.navy);
            doc.font("Helvetica-Bold").fontSize(9.5).fillColor(C.ink).text(`${points(r.earned)} / ${r.max}`, trackX + trackW + 12, y + 1, { width: 80, align: "right", lineBreak: false });
            y += rowH;
            hairline(y - 6, "#EEF1F5", 0.5);
          }
          doc.font("Helvetica").fontSize(7.5).fillColor(C.muted).text(printable(b.source), M.left, y + 2, { width: W, lineBreak: false });
          doc.x = M.left;
          doc.y = y + 22;
          break;
        }

        case "table": {
          const pad = 8;
          const xs: number[] = [];
          b.widths.reduce((x, w) => (xs.push(x), x + w), M.left);
          const textX = (i: number) => xs[i] + (i === 0 ? 0 : pad);
          const textW = (i: number) => b.widths[i] - (i === 0 ? 0 : pad) - 4;
          const cellFont = (i: number) => (i === 0 || b.head[i] === "Points" ? "Helvetica-Bold" : "Helvetica");
          const cellColor = (i: number) => (i === 0 ? (b.head[0] === "#" ? C.accent : C.ink) : b.head[i] === "Points" ? C.navy : C.body);

          ensure(60);
          let y = doc.y;
          b.head.forEach((h, i) => doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.muted).text(printable(h.toUpperCase()), textX(i), y, { characterSpacing: 1, width: textW(i), lineBreak: false }));
          hairline(y + 14, C.navy, 1);
          y += 20;
          for (const row of b.rows) {
            const h = Math.max(...row.map((c, i) => heightOf(c, cellFont(i), 9, textW(i), 2))) + 12;
            if (y + h > limit()) {
              newPage();
              y = doc.y;
            }
            row.forEach((c, i) => doc.font(cellFont(i)).fontSize(9).fillColor(cellColor(i)).text(printable(c), textX(i), y + 3, { width: textW(i), lineGap: 2 }));
            y += h;
            hairline(y - 3);
          }
          doc.x = M.left;
          doc.y = y + 10;
          break;
        }

        case "options": {
          b.items.forEach((item, i) => {
            const h = heightOf(item, "Helvetica", 10, W - 40, 3) + 16;
            ensure(h);
            const y = doc.y;
            doc.font("Times-Bold").fontSize(16).fillColor(C.accent).text(String.fromCharCode(65 + i), M.left, y + 2, { width: 24, lineBreak: false });
            writeRich(item, M.left + 32, y + 4, W - 32, "Helvetica", 10, C.ink, 3);
            const bottom = doc.y;
            doc.font("Helvetica").fontSize(7.5).fillColor(C.muted).text(`${item.length} characters (limit 220)`, M.left + 32, bottom + 2, { width: W - 32, lineBreak: false });
            hairline(bottom + 16);
            doc.x = M.left;
            doc.y = bottom + 22;
          });
          break;
        }

        case "boxed": {
          // The text can run to a page or more, so it is split between paragraphs
          // and the grey panel is drawn once per page it lands on.
          const innerW = W - 36;
          const paras = b.text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
          const gap = 10;
          const heights = paras.map((p) => heightOf(p, "Helvetica", 9.8, innerW, 3.5));
          ensure(Math.min(30 + (heights[0] ?? 0) + 40, 300));

          const segments: Array<{ paras: string[]; top: number; height: number }> = [];
          let room = limit() - doc.y;
          let current = { paras: [] as string[], top: 30, height: 30 };
          paras.forEach((para, i) => {
            if (current.paras.length > 0 && current.height + heights[i] + gap + 28 > room) {
              segments.push(current);
              room = limit() - M.top;
              current = { paras: [], top: 16, height: 16 };
            }
            current.paras.push(para);
            current.height += heights[i] + gap;
          });
          current.height += b.footnote ? 20 : 6;
          segments.push(current);

          segments.forEach((seg, n) => {
            if (n > 0) newPage();
            const y = doc.y;
            doc.rect(M.left, y, W, seg.height).fill(C.panel);
            doc.rect(M.left, y, 3, seg.height).fill(C.accent);
            if (n === 0) doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.accent).text(printable(b.label.toUpperCase()), M.left + 18, y + 14, { characterSpacing: 1.2, width: innerW, lineBreak: false });
            let ty = y + seg.top;
            seg.paras.forEach((para) => {
              writeRich(para, M.left + 18, ty, innerW, "Helvetica", 9.8, C.ink, 3.5);
              ty = doc.y + gap;
            });
            if (n === segments.length - 1 && b.footnote) doc.font("Helvetica").fontSize(7.5).fillColor(C.muted).text(printable(b.footnote), M.left + 18, y + seg.height - 16, { width: innerW, lineBreak: false });
            doc.x = M.left;
            doc.y = y + seg.height + 14;
          });
          break;
        }

        case "compare": {
          const gap = 12;
          const colW = (W - gap) / 2;
          const pad = 10;
          const caption = 14; // room for the small BEFORE / AFTER label inside each panel
          const innerW = colW - pad * 2 - 3;
          for (const r of b.rows) {
            const roleH = heightOf(r.role, "Helvetica-Bold", 8.5, W, 2) + 4;
            const h = Math.max(heightOf(r.before, "Helvetica", 9.2, innerW, 2.5), heightOf(r.after, "Helvetica", 9.2, innerW, 2.5)) + pad * 2 + caption + 4;
            ensure(roleH + h + 10);
            doc.font("Helvetica-Bold").fontSize(8.5).fillColor(C.ink).text(printable(r.role), M.left, doc.y, { width: W, lineGap: 2 });
            const y = doc.y + 4;
            const x2 = M.left + colW + gap;
            doc.rect(M.left, y, colW, h).fill(C.panel);
            doc.rect(x2, y, colW, h).lineWidth(0.75).strokeColor(C.rule).stroke();
            doc.rect(x2, y, 3, h).fill(C.accent);
            doc.font("Helvetica-Bold").fontSize(6.5).fillColor(C.muted).text("BEFORE", M.left + pad, y + pad, { characterSpacing: 1, width: innerW, lineBreak: false });
            doc.font("Helvetica-Bold").fontSize(6.5).fillColor(C.accent).text("AFTER (SUGGESTED)", x2 + pad + 3, y + pad, { characterSpacing: 1, width: innerW, lineBreak: false });
            writeRich(r.before, M.left + pad, y + pad + caption, colW - pad * 2, "Helvetica", 9.2, C.body, 2.5);
            writeRich(r.after, x2 + pad + 3, y + pad + caption, innerW, "Helvetica", 9.2, C.ink, 2.5);
            doc.x = M.left;
            doc.y = y + h + 12;
          }
          break;
        }
      }
    }

    // Header, footer and page number on every page after the cover.
    const range = doc.bufferedPageRange();
    for (let i = range.start + 1; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0; // otherwise text this low would open a new page
      doc.font("Helvetica-Bold").fontSize(7.5).fillColor(C.muted).text("PROFILE SCORECARD", M.left, 34, { characterSpacing: 1.6, lineBreak: false });
      if (cover?.client) doc.text(printable(`PREPARED FOR ${cover.client.toUpperCase()}`), M.left, 34, { characterSpacing: 1, width: W, align: "right", lineBreak: false });
      hairline(50);
      hairline(PAGE_H - 52);
      doc.font("Helvetica").fontSize(7).fillColor(C.muted);
      doc.text(printable(`Best-practice rubric v${cover?.rubricVersion ?? ""}. A guide, not a guarantee of results. Not affiliated with LinkedIn.`), M.left, PAGE_H - 42, { width: W - 60, lineBreak: false });
      doc.font("Helvetica-Bold").text(String(i + 1), M.left, PAGE_H - 42, { width: W, align: "right", lineBreak: false });
    }
    doc.end();
  });
}
