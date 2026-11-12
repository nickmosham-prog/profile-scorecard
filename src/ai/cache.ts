import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Profile } from "../types";
import type { AiResults } from "./schema";

// Same input + same rubric version must give the same score. The model is not
// perfectly repeatable, so the first answer for a given input is saved and
// reused from then on.

export interface AiCache {
  get(key: string): AiResults | undefined;
  set(key: string, value: AiResults): void;
}

// Everything that could change the model's answer goes into the key.
export function cacheKey(profile: Profile, targetRole: string, rubricVersion: string, model: string, promptVersion: string): string {
  const normalise = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const text = [
    profile.headline,
    profile.about,
    ...profile.experience.map((r) => [...r.heading, r.dates, r.description].join(" ")),
  ]
    .map(normalise)
    .join("\n");
  return createHash("sha256")
    .update(JSON.stringify([rubricVersion, model, promptVersion, normalise(targetRole), text]))
    .digest("hex");
}

// One small JSON file per result, named by the hash. The file holds the AI's
// reasons, quotes and rewrites (not the full profile). The folder is in
// .gitignore; delete it at any time to clear the cache.
export function fileCache(dir = ".cache/ai"): AiCache {
  return {
    get(key) {
      try {
        return JSON.parse(readFileSync(join(dir, `${key}.json`), "utf8")) as AiResults;
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
