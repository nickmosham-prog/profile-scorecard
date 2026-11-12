import type { Profile } from "../types";
import type { AiResults } from "./schema";

// PHASE 1 STUB. No API call is made and nothing leaves this machine.
// Phase 2 replaces the body with the Claude calls; the rest of the program
// already handles "unavailable", so nothing else has to change.
export async function getAiSubScores(_profile: Profile, _targetRole: string): Promise<AiResults> {
  return {};
}
