import type { Profile, Role } from "../types";

// Turns pasted profile text into a Profile object.
// Design rule: never throw on odd layouts. Anything we do not recognise ends
// up in `extras` or is simply left empty, and the checks score it as missing.

// Section header (lowercase) -> where its content goes.
const HEADERS: Record<string, string> = {
  about: "about",
  summary: "about",
  experience: "experience",
  "work experience": "experience",
  education: "education",
  skills: "skills",
  "top skills": "skills",
  "licenses & certifications": "certifications",
  "licenses and certifications": "certifications",
  certifications: "certifications",
  recommendations: "recommendations",
  featured: "featured",
  activity: "activity",
  projects: "projects",
  "volunteer experience": "volunteering",
  volunteering: "volunteering",
  "honors & awards": "honors",
  "honors-awards": "honors",
  languages: "languages",
  contact: "contact",
  publications: "publications",
  courses: "courses",
  interests: "interests",
  organizations: "organizations",
};

export function isSectionHeader(line: string): boolean {
  return line.trim().toLowerCase().replace(/:$/, "") in HEADERS;
}

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE = `(?:${MONTH}\\s+)?(?:19|20)\\d{2}`;
// A line that starts with a date range, e.g. "Jan 2022 - Present · 2 yrs".
const DATE_RANGE = new RegExp(`^\\W*${DATE}\\s*(?:[-–—]|to)\\s*(?:present|current|now|${DATE})`, "i");

export function isDateLine(line: string): boolean {
  return line.length < 80 && DATE_RANGE.test(line);
}

function cleanLines(text: string): string[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => !/^page \d+ of \d+$/i.test(l));
  // Copying from a web page often repeats each line twice in a row.
  return lines.filter((l, i) => l === "" || l !== lines[i - 1]);
}

function blocks(lines: string[]): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line === "") {
      if (current.length) out.push(current);
      current = [];
    } else {
      current.push(line);
    }
  }
  if (current.length) out.push(current);
  return out;
}

function looksLikeHeadingLine(line: string): boolean {
  return line !== "" && line.length < 100 && !/[.!?]$/.test(line) && !/^[-•*▪]/.test(line);
}

function looksLikeLocation(line: string): boolean {
  return line.length < 60 && !/[.!?]$/.test(line) && (line.includes(",") || /remote|hybrid|on-site/i.test(line));
}

function parseExperience(lines: string[]): Role[] {
  const dateIdx = lines.map((l, i) => (isDateLine(l) ? i : -1)).filter((i) => i >= 0);

  // No recognisable dates: fall back to "one blank-line-separated block per role".
  if (dateIdx.length === 0) {
    return blocks(lines).map((b) => ({ heading: [b[0]], dates: "", description: b.slice(1).join("\n") }));
  }

  // Each date line anchors a role. Title/company are the (up to 2) short lines
  // directly above it; the description is everything below it until the next
  // role's heading starts.
  const starts = dateIdx.map((d, k) => {
    const floor = k === 0 ? 0 : dateIdx[k - 1] + 1;
    let start = d;
    while (start > floor && d - start < 2 && looksLikeHeadingLine(lines[start - 1])) start--;
    return start;
  });

  return dateIdx.map((d, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : lines.length;
    const body = lines.slice(d + 1, end).filter((l) => l !== "");
    if (body.length && looksLikeLocation(body[0])) body.shift();
    return { heading: lines.slice(starts[k], d), dates: lines[d], description: body.join("\n") };
  });
}

function parseSkills(lines: string[]): string[] {
  const seen = new Set<string>();
  const skills: string[] = [];
  for (const line of lines) {
    if (/endorse/i.test(line)) continue; // "Endorsed by 3 colleagues", "12 endorsements"
    for (const part of line.split(/[,•·|;]/)) {
      const skill = part.replace(/^[-*▪\s]+/, "").trim();
      const key = skill.toLowerCase();
      if (skill && skill.length <= 60 && !seen.has(key)) {
        seen.add(key);
        skills.push(skill);
      }
    }
  }
  return skills;
}

function parseHeadline(preamble: string[]): string {
  const lines = preamble.filter((l) => l !== "");
  const labelled = lines.find((l) => /^headline\s*:/i.test(l));
  if (labelled) return labelled.replace(/^headline\s*:\s*/i, "");
  // Pasted profiles start with the name, then the headline.
  return lines[1] ?? "";
}

export function parseProfile(text: string): Profile {
  const lines = cleanLines(String(text ?? ""));

  const sections: Record<string, string[]> = {};
  const preamble: string[] = [];
  let current: string[] = preamble;
  for (const line of lines) {
    const key = HEADERS[line.toLowerCase().replace(/:$/, "")];
    if (key) {
      current = sections[key] ??= [];
    } else {
      current.push(line);
    }
  }

  const known = new Set(["about", "experience", "education", "skills"]);
  const extras: Record<string, string> = {};
  for (const [key, value] of Object.entries(sections)) {
    const body = value.join("\n").trim();
    if (!known.has(key) && body) extras[key] = body;
  }

  return {
    headline: parseHeadline(preamble),
    about: (sections.about ?? []).join("\n").trim(),
    experience: parseExperience(sections.experience ?? []),
    skills: parseSkills(sections.skills ?? []),
    education: blocks(sections.education ?? []).map((b) => b.join("\n")),
    extras,
  };
}
