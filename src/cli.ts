import { Command } from "commander";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { createAiScorer, type AiScorer } from "./ai";
import { fileCache } from "./ai/cache";
import { createModelCall, createStructuredCall } from "./ai/client";
import { generatePaidReport, PaidReportWireSchema } from "./ai/paidReport";
import { compareModels } from "./compare";
import { costUsd, LIMITS, MODELS, type Usage } from "./config";
import { buildBlocks, renderMarkdown, renderPdf } from "./paidReport";
import { parseProfile } from "./parse";
import { extractPdfText, PdfReadError } from "./parse/pdf";
import { formatJson, formatMarkdown, formatText } from "./report";
import { rubric } from "./rubric";
import { scoreText } from "./score";
import { AnswersSchema, type Answers } from "./types";

// Stops with a plain-English message instead of a stack trace.
function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const PASTE_INSTEAD = "Copy the text of the profile into a .txt file and score that instead.";

async function readProfileFile(file: string): Promise<string> {
  // Hard rule: input is only ever a local file the user supplies.
  if (/^https?:\/\//i.test(file)) {
    fail("This tool never fetches profiles from the web. Paste the profile text into a .txt file and pass that instead.");
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch {
    fail(`Could not read "${file}". Check the file name and try again.`);
  }

  let text: string;
  if (/\.pdf$/i.test(file)) {
    try {
      text = await extractPdfText(new Uint8Array(bytes));
    } catch (error) {
      const reason = error instanceof PdfReadError ? error.message : "This PDF could not be read.";
      fail(`${reason} ${PASTE_INSTEAD}`);
    }
    // A PDF that opens but is not a profile gives text with no sections in it.
    const p = parseProfile(text);
    if (!p.about && p.experience.length === 0 && p.skills.length === 0 && p.education.length === 0) {
      fail(`No profile sections (Summary, Experience, Education, Skills) were found in this PDF. ${PASTE_INSTEAD}`);
    }
  } else {
    text = bytes.toString("utf8");
  }

  if (!text.trim()) fail(`"${file}" is empty.`);
  if (text.length > LIMITS.maxInputChars) {
    fail(`"${file}" is ${text.length} characters; the limit is ${LIMITS.maxInputChars}.`);
  }
  return text;
}

function readAnswersFile(file: string): Answers {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    fail(`Could not read "${file}" as JSON.`);
  }
  const parsed = AnswersSchema.safeParse(raw);
  if (!parsed.success) fail(`"${file}" is not a valid answers file: ${parsed.error.issues[0].message}`);
  return parsed.data;
}

// The six things pasted text cannot tell us. Pressing Enter skips a question.
async function askQuestionnaire(isPdf: boolean): Promise<Answers> {
  // Questions go to stderr so that --json output on stdout stays clean.
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const yesNo = async (q: string): Promise<boolean | undefined> => {
    const a = (await rl.question(`${q} (y/n, Enter to skip): `)).trim().toLowerCase();
    return a.startsWith("y") ? true : a.startsWith("n") ? false : undefined;
  };
  const count = async (q: string): Promise<number | undefined> => {
    const a = (await rl.question(`${q} (number, Enter to skip): `)).trim();
    return /^\d+$/.test(a) ? Number(a) : undefined;
  };
  console.error("A few questions about things that are not in the profile text:");
  const answers: Answers = {
    hasPhoto: await yesNo("Do you have a professional profile photo?"),
    hasBanner: await yesNo("Do you have a custom banner image?"),
    hasCustomUrl: await yesNo("Have you set a custom profile URL?"),
    featuredCount: await count("How many items are in your Featured section?"),
    recommendationsCount: await count("How many recommendations have you received?"),
    activeLast30Days: await yesNo("Have you posted or commented in the last 30 days?"),
    // The exported PDF lists only the top 3 skills, so the full count has to be asked.
    skillsCount: isPdf ? await count("How many skills are listed on your profile in total?") : undefined,
  };
  rl.close();
  // Drop skipped questions so they are reported as "not answered".
  return AnswersSchema.parse(JSON.parse(JSON.stringify(answers)));
}

// The key comes from a .env file in this folder (never committed) or from the environment.
function loadEnv(): void {
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env file is fine; the key may already be in the environment.
  }
}

// Builds the AI scorer, or explains why it cannot run.
function buildAiScorer(onUsage?: (usage: Usage) => void): AiScorer {
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) {
    return async () => ({
      scores: {},
      problem: "no API key found; copy .env.example to .env and add your key, or pass --no-ai",
    });
  }
  return createAiScorer({ call: createModelCall(MODELS.freeScore, onUsage), model: MODELS.freeScore, rubric, cache: fileCache() });
}

const program = new Command();
program.name("profile-scorecard").description("Scores a professional-network profile 0-100 against a best-practice rubric.");

program
  .command("score")
  .argument("<file>", "the profile: a .txt file of pasted text, or an exported .pdf")
  .requiredOption("--target-role <role>", 'the role you want to be found for, e.g. "Financial Analyst"')
  .option("--answers <file>", "JSON file with questionnaire answers (skips the questions)")
  .option("--no-ai", "rule-based checks only; nothing is sent to the Claude API")
  .option("--json", "print machine-readable JSON")
  .option("--markdown", "print markdown")
  .action(async (file: string, opts: { targetRole: string; answers?: string; ai: boolean; json?: boolean; markdown?: boolean }) => {
    const text = await readProfileFile(file);
    let answers: Answers = {};
    if (opts.answers) answers = readAnswersFile(opts.answers);
    else if (process.stdin.isTTY) answers = await askQuestionnaire(/\.pdf$/i.test(file));

    const result = await scoreText(text, opts.targetRole, answers, opts.ai ? buildAiScorer() : undefined);
    console.log(opts.json ? formatJson(result) : opts.markdown ? formatMarkdown(result) : formatText(result));
  });

program
  .command("report")
  .description("write the full paid report (rewrites and step-by-step fixes) as markdown and PDF")
  .argument("<file>", "the profile: a .txt file of pasted text, or an exported .pdf")
  .requiredOption("--target-role <role>", 'the role you want to be found for, e.g. "Financial Analyst"')
  .option("--answers <file>", "JSON file with questionnaire answers (skips the questions)")
  .option("--out <name>", "name for the output files, without extension", "report")
  .option("--client <name>", "the client's name, printed on the cover and page headers")
  .action(async (file: string, opts: { targetRole: string; answers?: string; out: string; client?: string }) => {
    const text = await readProfileFile(file);
    loadEnv();
    if (!process.env.ANTHROPIC_API_KEY) fail("The report needs the Claude API. Copy .env.example to .env and add your key.");
    let answers: Answers = {};
    if (opts.answers) answers = readAnswersFile(opts.answers);
    else if (process.stdin.isTTY) answers = await askQuestionnaire(/\.pdf$/i.test(file));

    // Add up what every request for this profile costs.
    let scoringCost = 0;
    const result = await scoreText(text, opts.targetRole, answers, buildAiScorer((u) => (scoringCost += costUsd(u))));
    const outcome = await generatePaidReport(
      {
        model: MODELS.paidReport,
        alreadySpentUsd: scoringCost,
        makeCall: (onUsage) =>
          createStructuredCall({
            model: MODELS.paidReport,
            schema: PaidReportWireSchema,
            maxTokens: LIMITS.reportMaxOutputTokens,
            effort: "medium",
            onUsage,
          }),
      },
      parseProfile(text),
      result,
    );

    // The log holds the time and the cost only, never anything from the profile.
    mkdirSync("logs", { recursive: true });
    appendFileSync("logs/report-costs.csv", `${new Date().toISOString()},${outcome.report ? "ok" : "failed"},${outcome.costUsd.toFixed(4)}\n`);
    console.error(`Cost for this profile: $${outcome.costUsd.toFixed(4)} (limit $${LIMITS.maxReportCostUsd.toFixed(2)})`);

    if (!outcome.report) fail(`The report could not be written (${outcome.problem}). You were not left with a partial report.`);
    const blocks = buildBlocks(result, outcome.report, { client: opts.client });
    writeFileSync(`${opts.out}.md`, renderMarkdown(blocks));
    writeFileSync(`${opts.out}.pdf`, await renderPdf(blocks));
    console.log(`Wrote ${opts.out}.md and ${opts.out}.pdf`);
  });

program
  .command("compare")
  .description("score a folder of profiles with both models and write docs/model-ab.md")
  .argument("<folder>", "folder of .txt profiles")
  .requiredOption("--target-role <role>", "the role to score every profile against")
  .action(async (folder: string, opts: { targetRole: string }) => {
    loadEnv();
    if (!process.env.ANTHROPIC_API_KEY) fail("No API key found. Copy .env.example to .env and add your key.");
    console.log(`Wrote ${await compareModels(folder, opts.targetRole)}`);
  });

program.parseAsync().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
