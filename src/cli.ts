import { Command } from "commander";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { LIMITS } from "./config";
import { formatJson, formatMarkdown, formatText } from "./report";
import { scoreText } from "./score";
import { AnswersSchema, type Answers } from "./types";

// Stops with a plain-English message instead of a stack trace.
function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function readProfileFile(file: string): string {
  // Hard rule: input is only ever a local file the user supplies.
  if (/^https?:\/\//i.test(file)) {
    fail("This tool never fetches profiles from the web. Paste the profile text into a .txt file and pass that instead.");
  }
  if (/\.pdf$/i.test(file)) {
    fail("PDF import is not built yet (Phase 3). Paste the profile text into a .txt file and pass that instead.");
  }
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    fail(`Could not read "${file}". Check the file name and try again.`);
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
async function askQuestionnaire(): Promise<Answers> {
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
  };
  rl.close();
  // Drop skipped questions so they are reported as "not answered".
  return AnswersSchema.parse(JSON.parse(JSON.stringify(answers)));
}

const program = new Command();
program.name("profile-scorecard").description("Scores a professional-network profile 0-100 against a best-practice rubric.");

program
  .command("score")
  .argument("<file>", "text file containing the pasted profile")
  .requiredOption("--target-role <role>", 'the role you want to be found for, e.g. "Financial Analyst"')
  .option("--answers <file>", "JSON file with questionnaire answers (skips the questions)")
  .option("--json", "print machine-readable JSON")
  .option("--markdown", "print markdown")
  .action(async (file: string, opts: { targetRole: string; answers?: string; json?: boolean; markdown?: boolean }) => {
    const text = readProfileFile(file);
    let answers: Answers = {};
    if (opts.answers) answers = readAnswersFile(opts.answers);
    else if (process.stdin.isTTY) answers = await askQuestionnaire();

    const result = await scoreText(text, opts.targetRole, answers);
    console.log(opts.json ? formatJson(result) : opts.markdown ? formatMarkdown(result) : formatText(result));
  });

program.parseAsync().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
