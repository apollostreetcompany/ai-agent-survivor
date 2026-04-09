import { generateText, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";

export type LlmProvider = "anthropic" | "openai";

let model: LanguageModel;

/** Initialize the LLM client from environment */
export function initLlm(): void {
  const provider = (process.env.LLM_PROVIDER || "anthropic") as LlmProvider;
  const apiKey = process.env.LLM_API_KEY;

  if (!apiKey) {
    throw new Error("LLM_API_KEY is required");
  }

  switch (provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey });
      model = anthropic(process.env.LLM_MODEL || "claude-sonnet-4-20250514");
      break;
    }
    case "openai": {
      const openai = createOpenAI({ apiKey });
      model = openai(process.env.LLM_MODEL || "gpt-4o");
      break;
    }
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  console.log(`LLM initialized: ${provider} / ${process.env.LLM_MODEL || "default"}`);
}

/** Generate a text response from the LLM */
export async function think(prompt: string, systemPrompt?: string): Promise<string> {
  const result = await generateText({
    model,
    system: systemPrompt,
    prompt,
    maxTokens: 4096,
  });

  return result.text;
}

/** Generate a response with structured context */
export async function reason(params: {
  task: string;
  context: string;
  memories?: string;
  systemPrompt?: string;
}): Promise<string> {
  const fullPrompt = [
    `## Current Task\n${params.task}`,
    params.context ? `## Context\n${params.context}` : "",
    params.memories ? `## Relevant Memories\n${params.memories}` : "",
    `## Instructions\nAnalyze the task, use your context and memories, and provide your response. Be precise and actionable.`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return think(fullPrompt, params.systemPrompt);
}

/** Get the model instance for advanced usage */
export function getModel(): LanguageModel {
  return model;
}
