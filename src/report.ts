import type { ScoreResult } from "./score";

// Formats a ScoreResult for people (text, markdown) or programs (JSON).
// None of these include the pasted profile text itself.

const pts = (n: number) => n.toFixed(1);

function bar(earned: number, max: number, width = 10): string {
  const filled = Math.round((earned / max) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function rewriteLines(result: ScoreResult): string[] {
  if (!result.rewrites.headline && !result.rewrites.about) {
    return ["Not available yet: rewrites come from the AI step, which is switched on in Phase 2."];
  }
  const lines: string[] = [];
  if (result.rewrites.headline) lines.push(`Headline: ${result.rewrites.headline}`);
  if (result.rewrites.about) lines.push(`About opening: ${result.rewrites.about}`);
  return lines;
}

export function formatJson(result: ScoreResult): string {
  return JSON.stringify(result, null, 2);
}

export function formatText(result: ScoreResult): string {
  const out: string[] = [];
  out.push(`PROFILE SCORECARD  (best-practice rubric v${result.rubricVersion})`);
  out.push(`Target role: ${result.targetRole}`);
  out.push("");
  out.push(`SCORE: ${result.total} / 100  (${result.band})`);
  out.push("");
  out.push("BREAKDOWN");
  for (const c of result.categories) {
    out.push(`${c.label.padEnd(40)} ${bar(c.pointsEarned, c.pointsMax)}  ${pts(c.pointsEarned).padStart(4)} / ${c.pointsMax}`);
    for (const f of c.findings) {
      const mark = f.pointsEarned >= f.pointsMax ? "ok" : "--";
      out.push(`   ${mark} ${f.message}  [${f.basis}]`);
    }
    if (c.ai) out.push(`   AI ${c.ai.score}/10: ${c.ai.reason}`);
  }
  out.push("");
  out.push("TOP 3 FIXES");
  if (result.topFixes.length === 0) out.push("Nothing left to fix on this rubric.");
  result.topFixes.forEach((f, i) => {
    out.push(`${i + 1}. (+${pts(f.potentialGain)} pts) ${f.category}: ${f.fix}  [${f.basis}]`);
  });
  out.push("");
  out.push("REWRITE SUGGESTIONS");
  out.push(...rewriteLines(result));
  if (result.notes.length) {
    out.push("");
    out.push("NOTES");
    for (const n of result.notes) out.push(`- ${n}`);
  }
  out.push("");
  out.push('Basis labels: "documented" = stated by the platform; "consistent-with-documented" = follows from');
  out.push('platform guidance; "convention" = common recruiter and career-coach advice.');
  out.push(result.disclaimer);
  return out.join("\n");
}

export function formatMarkdown(result: ScoreResult): string {
  const out: string[] = [];
  out.push(`# Profile Scorecard`);
  out.push("");
  out.push(`**Score: ${result.total} / 100 (${result.band})**  `);
  out.push(`Target role: ${result.targetRole}  `);
  out.push(`Best-practice rubric v${result.rubricVersion}`);
  out.push("");
  out.push("## Breakdown");
  out.push("");
  out.push("| Category | Points | Max |");
  out.push("| --- | --- | --- |");
  for (const c of result.categories) out.push(`| ${c.label} | ${pts(c.pointsEarned)} | ${c.pointsMax} |`);
  out.push("");
  for (const c of result.categories) {
    out.push(`### ${c.label}`);
    for (const f of c.findings) out.push(`- ${f.message} *(${f.basis})*`);
    if (c.ai) out.push(`- AI ${c.ai.score}/10: ${c.ai.reason}`);
    out.push("");
  }
  out.push("## Top 3 fixes");
  out.push("");
  if (result.topFixes.length === 0) out.push("Nothing left to fix on this rubric.");
  result.topFixes.forEach((f, i) => {
    out.push(`${i + 1}. **+${pts(f.potentialGain)} pts, ${f.category}:** ${f.fix} *(${f.basis})*`);
  });
  out.push("");
  out.push("## Rewrite suggestions");
  out.push("");
  for (const l of rewriteLines(result)) out.push(l);
  if (result.notes.length) {
    out.push("");
    out.push("## Notes");
    out.push("");
    for (const n of result.notes) out.push(`- ${n}`);
  }
  out.push("");
  out.push(`*${result.disclaimer}*`);
  return out.join("\n");
}
