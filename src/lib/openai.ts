import OpenAI from "openai";

// Singleton pattern — one client for the entire app, not one per request.
// Why: the OpenAI SDK manages connection pooling and retry logic internally.
// Creating a new instance per API call wastes memory and loses those benefits.
let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

// Model constants — centralised so a single change propagates everywhere.
//
// CHAT_MODEL: used by all agents for reasoning.
//   gpt-4o-mini chosen over gpt-4o because:
//   - 15–20x cheaper per token (critical for multi-step agentic loops)
//   - Still strong at instruction-following and JSON output
//   - With $4 credits, 4o-mini gives ~4M tokens vs ~200k for 4o
//   Change to "gpt-4o" here if you need stronger reasoning on hard queries.
//
// EMBED_MODEL: used by the RAG pipeline to turn text into vectors.
//   text-embedding-3-small is OpenAI's cheapest + fastest embedding model.
//   It outputs 1536-dim vectors, which Supabase pgvector handles natively.
export const CHAT_MODEL = "gpt-4o-mini" as const;
export const EMBED_MODEL = "text-embedding-3-small" as const;
