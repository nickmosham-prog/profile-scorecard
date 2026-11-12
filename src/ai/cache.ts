import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AiSubScore } from "./schema";

// Same input + same rubric version must give the same score. The model is not
// perfectly repeatable, so the first answer for a given section is saved and
// reused from then on.

export interface AiCache {
  get(key: string): unknown;
  set(key: string, value: AiSubScore): void;
}

// Everything that could change the model's answer goes into the key.
// `parts` are: rubric version, model, prompt version, target role, category, section text.
export function cacheKey(...parts: string[]): string {
  const normalised = parts.map((s) => s.replace(/\s+/g, " ").trim().toLowerCase());
  return createHash("sha256").update(JSON.stringify(normalised)).digest("hex");
}

// One small JSON file per result, named by the hash. The file holds the AI's
// reason, quote and rewrite for one section (not the full profile). The folder
// is in .gitignore; delete it at any time to clear the cache.
export function fileCache(dir = ".cache/ai"): AiCache {
  return {
    get(key) {
      try {
        return JSON.parse(readFileSync(join(dir, `${key}.json`), "utf8"));
      } catch {
        return undefined; // not cached yet, or unreadable: just ask the model again
      }
    },
    set(key, value) {
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${key}.json`), JSON.stringify(value, null, 2));
      } catch {
        // A cache that cannot be written is not worth failing the score over.
      }
    },
  };
}
