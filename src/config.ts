import rubricJson from "./rubric.json";

// Model IDs live here and nowhere else (see CLAUDE.md). Not used until Phase 2.
export const MODELS = {
  freeScore: "claude-haiku-5-5",
  paidReport: "claude-sonnet-5-5",
} as const;

export const LIMITS = {
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
