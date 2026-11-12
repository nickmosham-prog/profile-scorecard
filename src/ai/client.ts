import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AiWireSchema } from "./schema";

// One request to Claude. Returns whatever JSON came back (still unchecked), or
// throws. Kept separate from the rest so tests can swap in a fake.
export type ModelCall = (system: string, user: string) => Promise<unknown>;

export function createModelCall(model: string): ModelCall {
  // Reads ANTHROPIC_API_KEY from the environment.
  const client = new Anthropic();
  return async (system, user) => {
    const response = await client.messages.parse({
      model,
      max_tokens: 4000,
      // "low" keeps cost and wait time down; this is a short scoring task.
      output_config: { effort: "low", format: zodOutputFormat(AiWireSchema) },
      system,
      messages: [{ role: "user", content: user }],
    });
    // A refusal or a cut-off reply is not a usable score.
    if (response.stop_reason !== "end_turn") throw new Error(`model stopped early (${response.stop_reason})`);
    return response.parsed_output;
  };
}

// Turns an SDK error into one plain sentence for the report's notes.
export function describeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return "the API key was rejected";
  if (error instanceof Anthropic.PermissionDeniedError) return "the API key is not allowed to use this model";
  if (error instanceof Anthropic.NotFoundError) return "the model was not found";
  if (error instanceof Anthropic.RateLimitError) return "the API rate limit or spend limit was reached";
  if (error instanceof Anthropic.APIConnectionError) return "could not reach the API";
  if (error instanceof Anthropic.APIError) return `the API returned an error (${error.status})`;
  return error instanceof Error ? error.message : "unknown error";
}
