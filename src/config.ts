import rubricJson from "./rubric.json";

// Model IDs live here and nowhere else (see CLAUDE.md). Not used until Phase 2.
export const MODELS = {
  freeScore: "claude-haiku-5-5",
  paidReport: "claude-sonnet-5-5",
} as const;

// US dollars per million tokens (input, output). Used only to log what each
// profile cost. Check these against the Anthropic pricing page now and then.
export const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};

export interface Usage {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export function costUsd(usage: Usage): number {
  const price = PRICES[usage.model];
  if (!price) throw new Error(`config.ts has no price for model "${usage.model}"`);
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1_000_000;
}

export const LIMITS = {
  // The paid report must cost under this per profile (CLAUDE.md, Phase 4).
  maxReportCostUsd: 0.1,
  // The most the report model may write in one reply, thinking included.
  reportMaxOutputTokens: 6000,
  // A real profile is a few thousand characters. Anything far beyond this is
  // not a profile, and in the web phase it would cost API money.
  maxInputChars: 50_000,
};

// The version is edited in rubric.json, next to the weights it describes.
// Bump it whenever the rubric changes: Phase 2 caches AI results by it.
export const RUBRIC_VERSION: string = rubricJson.version;

export const DISCLAIMER =
  "This score follows a best-practice rubric. It is a guide, not LinkedIn's ranking " +
  "algorithm, and a higher score does not guarantee more visibility. " +
  "This tool is not affiliated with LinkedIn.";
