import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import type { Usage } from "../config";
import { AiWireSchema } from "./schema";

// One request to Claude. Returns whatever JSON came back (still unchecked), or
// throws. Kept separate from the rest so tests can swap in a fake.
export type ModelCall = (system: string, user: string) => Promise<unknown>;

interface CallOptions {
  model: string;
  schema: z.ZodType;
  maxTokens: number;
  effort: "low" | "medium";
  onUsage?: (usage: Usage) => void; // called after every request, for cost logging
}

export function createStructuredCall(options: CallOptions): ModelCall {
  // Reads ANTHROPIC_API_KEY from the environment.
  const client = new Anthropic();
  return async (system, user) => {
    const response = await client.messages.parse({
      model: options.model,
      max_tokens: options.maxTokens,
      output_config: { effort: options.effort, format: zodOutputFormat(options.schema) },
      system,
      messages: [{ role: "user", content: user }],
    });
    options.onUsage?.({
      model: options.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    });
    // A refusal or a cut-off reply is not usable.
    if (response.stop_reason !== "end_turn") throw new Error(`model stopped early (${response.stop_reason})`);
    return response.parsed_output;
  };
}

// The free score: a short task, so "low" effort keeps cost and wait time down.
export function createModelCall(model: string, onUsage?: (usage: Usage) => void): ModelCall {
  return createStructuredCall({ model, schema: AiWireSchema, maxTokens: 4000, effort: "low", onUsage });
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
