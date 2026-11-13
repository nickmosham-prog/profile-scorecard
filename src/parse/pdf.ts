import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";
import { isDateLine, isSectionHeader } from "./index";

// Turns an exported profile PDF into plain text that parseProfile understands.
//
// A profile export has two columns: a narrow sidebar (contact, top skills,
// certifications) and a main column (name, headline, summary, experience,
// education). Read naively, the two get mixed together, so this file sorts
// every piece of text into its column first, using its position on the page.

// Thrown for any PDF we cannot use. The message is safe to show to the user.
export class PdfReadError extends Error {}

interface Fragment {
  page: number;
  x: number; // left edge
  y: number; // distance from the bottom of the page
  right: number;
  height: number; // font size, roughly
  text: string;
}

async function readFragments(data: Uint8Array): Promise<Fragment[]> {
  let doc;
  try {
    doc = await getDocument({ data, verbosity: VerbosityLevel.ERRORS, useSystemFonts: true }).promise;
  } catch (error) {
    const name = (error as { name?: string })?.name;
    if (name === "PasswordException") throw new PdfReadError("This PDF is password-protected.");
    throw new PdfReadError("This file could not be opened as a PDF.");
  }

  const fragments: Fragment[] = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const content = await (await doc.getPage(pageNo)).getTextContent();
    let current: Fragment | undefined;
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      // Pieces on the same line that nearly touch belong to the same fragment.
      if (current && Math.abs(current.y - y) < 2 && x - current.right < 15 && x >= current.x) {
        current.text += (x - current.right > 1 ? " " : "") + item.str;
        current.right = x + item.width;
        current.height = Math.max(current.height, item.height);
      } else {
        current = { page: pageNo, x, y, right: x + item.width, height: item.height, text: item.str };
        fragments.push(current);
      }
    }
  }
  await doc.cleanup();
  return fragments;
}

// Finds where the main column starts, if the page has two columns. Lines in a
// column all start at the same left edge, so the two most common left edges
// are the two columns.
function findColumnBoundary(fragments: Fragment[]): number | undefined {
  const counts = new Map<number, number>();
  for (const f of fragments) {
    const bucket = Math.round(f.x / 4) * 4;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const [first, second] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (!first || !second || second[1] < 3 || Math.abs(first[0] - second[0]) < 100) return undefined;
  return Math.max(first[0], second[0]) - 10;
}

// Reading order: page by page, top to bottom. A blank line marks a visible gap.
//
// `joinWrapped` is for the sidebar. There a long skill or certification name
// ("Information Technology Infrastructure") wraps onto a second line, and would
// otherwise be read as two entries. A wrapped line sits one line-height below
// the line above it; separate entries sit further apart. The Contact block is
// excluded because its separate items are packed as tightly as wrapped lines.
function toLines(fragments: Fragment[], joinWrapped = false): string[] {
  const sorted = [...fragments].sort((a, b) => a.page - b.page || b.y - a.y || a.x - b.x);
  const lines: string[] = [];
  let section = "";
  sorted.forEach((f, i) => {
    const prev = sorted[i - 1];
    const text = f.text.replace(/\s+/g, " ").trim();
    if (isSectionHeader(text)) section = text.toLowerCase().replace(/:$/, "");
    const gap = prev && prev.page === f.page ? prev.y - f.y : 0;

    // Contact items are packed tightly, so only a line cut at a hyphen (a web
    // address wrapped mid-word) is joined there.
    const cutAtHyphen = (lines[lines.length - 1] ?? "").endsWith("-");
    const wrapped =
      (joinWrapped || cutAtHyphen) &&
      (section !== "contact" || cutAtHyphen) &&
      prev !== undefined &&
      gap > 2 &&
      gap < 1.4 * Math.max(prev.height, f.height) &&
      !isSectionHeader(text) &&
      !isSectionHeader(prev.text.trim());
    if (wrapped) {
      const last = lines[lines.length - 1];
      lines[lines.length - 1] = last.endsWith("-") ? last + text : `${last} ${text}`;
      return;
    }
    if (prev && prev.page === f.page && gap > 1.9 * Math.max(prev.height, f.height)) lines.push("");
    lines.push(text);
  });
  return lines;
}

// Repairs three things real exports do to text: they leave HTML codes such as
// "&amp;" in place, they drop the line breaks between paragraphs (giving
// "true cost.Catching those"), and they run bullet points together.
export function tidyPdfLine(line: string): string {
  return line
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/([a-z0-9)][.!?:])([A-Z])/g, "$1\n$2")
    .replace(/(\S)\s*•\s*/g, "$1\n• ");
}

// A PDF breaks long sentences across lines. Left alone, "…variance analysis"
// and "for 5 departments." would count as two separate statements. A line is
// glued to the one before it when that one stops mid-sentence and this one
// starts like a continuation (lowercase letter or digit).
function unwrap(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    const continues =
      prev && line && !/[.!?:]$/.test(prev) && /^[a-z0-9]/.test(line) && !isDateLine(line) && !isSectionHeader(prev);
    if (continues) out[out.length - 1] = `${prev} ${line}`;
    else out.push(line);
  }
  return out;
}

export async function extractPdfText(data: Uint8Array): Promise<string> {
  const fragments = (await readFragments(data)).filter((f) => !/^page \d+ of \d+$/i.test(f.text.trim()));
  if (fragments.length === 0) {
    throw new PdfReadError("This PDF has no selectable text (it may be a scan or an image).");
  }

  // The name is the biggest text on the first page.
  const heights = fragments.map((f) => f.height).sort((a, b) => a - b);
  const typical = heights[Math.floor(heights.length / 2)];
  const name = fragments.filter((f) => f.page === 1).reduce((a, b) => (b.height > a.height ? b : a));
  const hasBigName = name.height >= 1.5 * typical;

  const boundary = findColumnBoundary(fragments);
  let main = fragments;
  let side: Fragment[] = [];
  if (boundary !== undefined) {
    const right = fragments.filter((f) => f.x >= boundary);
    const left = fragments.filter((f) => f.x < boundary);
    // The main column is whichever one holds the name.
    [main, side] = hasBigName && name.x < boundary ? [left, right] : [right, left];
  }

  const mainLines = unwrap(toLines(main)).flatMap((l) => tidyPdfLine(l).split("\n"));
  const sideLines = toLines(side, true);

  // Without a clearly larger name there is nothing more to work out: hand the
  // lines over as they are (name on line 1, headline on line 2).
  const nameIndex = hasBigName ? mainLines.indexOf(name.text.replace(/\s+/g, " ").trim()) : -1;
  if (nameIndex < 0) return [...mainLines, "", ...sideLines].join("\n");

  // Between the name and the first section heading sit the headline (which may
  // wrap over several lines) and then the location.
  let firstHeader = mainLines.findIndex((l, i) => i > nameIndex && isSectionHeader(l));
  if (firstHeader < 0) firstHeader = mainLines.length;
  const intro = mainLines.slice(nameIndex + 1, firstHeader).filter(Boolean);
  const headline = (intro.length >= 2 ? intro.slice(0, -1) : intro).join(" ");

  return [mainLines[nameIndex], `Headline: ${headline}`, "", ...mainLines.slice(firstHeader), "", ...sideLines].join("\n");
}
