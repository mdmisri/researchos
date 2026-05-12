import { getServerClient } from "@/lib/supabase";
import { embedQuery } from "@/rag/embeddings";
import { z } from "zod";

// ─── How pgvector similarity search works ───────────────────────────────────
//
// Supabase's pgvector extension adds a `vector` column type and operators like:
//   <=>   cosine distance   (most common for text embeddings)
//   <->   euclidean distance
//   <#>   negative dot product
//
// We use cosine distance because text-embedding-3-small is trained to produce
// unit-norm vectors — for unit vectors, cosine similarity = dot product,
// which is what the model optimises for.
//
// The actual search runs as a Postgres function (match_documents) that we'll
// create in Supabase. We call it via RPC. See: supabase/migrations/001_setup.sql
// ─────────────────────────────────────────────────────────────────────────────

const RetrievalConfigSchema = z.object({
  // How many chunks to return. More = richer context but larger prompt = more tokens.
  // 5 is a good default: enough signal, won't overflow the context window.
  topK: z.number().min(1).max(20).default(5),

  // Minimum similarity score (0–1). Chunks below this threshold are discarded
  // even if they're the "best" matches — they're just not relevant enough.
  // Why 0.7? Below that, cosine similarity scores on text-embedding-3-small
  // tend to be noise rather than genuine semantic overlap.
  similarityThreshold: z.number().min(0).max(1).default(0.7),

  // Optionally scope retrieval to one research session.
  // Without this, a new query could surface chunks from a completely different
  // user's research run — a data leak.
  sessionId: z.string().uuid().optional(),
});

export type RetrievalConfig = z.infer<typeof RetrievalConfigSchema>;

// The shape of what Supabase returns from match_documents RPC
const MatchedChunkSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  source: z.string(),
  chunk_index: z.number(),
  similarity: z.number(), // cosine similarity score 0–1 (higher = more relevant)
});

export type MatchedChunk = z.infer<typeof MatchedChunkSchema>;

// ─── retrieveChunks ──────────────────────────────────────────────────────────
//
// The full retrieval pipeline in one function:
//   1. Embed the query string → 1536-dim vector
//   2. Call Supabase RPC `match_documents` with that vector
//   3. Validate and return the matched chunks
//
// We use `getServerClient()` (service role) here — NOT the anon client.
// Why? The embeddings table uses RLS to restrict reads by sessionId.
// The agent runs server-side in a Next.js API route, so using service role
// is safe — it never reaches the browser.
//
export async function retrieveChunks(
  query: string,
  config: Partial<RetrievalConfig> = {}
): Promise<MatchedChunk[]> {
  const { topK, similarityThreshold, sessionId } =
    RetrievalConfigSchema.parse(config);

  // Step 1: embed the query using the SAME model used to embed the chunks.
  // Model mismatch here = vectors in different spaces = garbage results.
  const queryEmbedding = await embedQuery(query);

  // Step 2: call the Postgres function that does the vector search.
  // `rpc` calls a Postgres function by name and passes arguments as an object.
  const supabase = getServerClient();

  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: queryEmbedding,   // the 1536-dim vector we just generated
    match_threshold: similarityThreshold,
    match_count: topK,
    filter_session_id: sessionId ?? null, // null = search across all sessions
  });

  if (error) {
    throw new Error(`pgvector retrieval failed: ${error.message}`);
  }

  // Step 3: validate the raw Supabase response.
  // Postgres returns untyped JSON — Zod gives us runtime safety here.
  const parsed = z.array(MatchedChunkSchema).safeParse(data);

  if (!parsed.success) {
    throw new Error(`Unexpected shape from match_documents: ${parsed.error.message}`);
  }

  return parsed.data;
}

// ─── storeChunks ─────────────────────────────────────────────────────────────
//
// Inserts embedded chunks into Supabase so they can be retrieved later.
// Called by the Researcher agent after it scrapes and embeds a source.
//
export async function storeChunks(
  chunks: Array<{
    content: string;
    embedding: number[];
    source: string;
    chunkIndex: number;
    sessionId: string;
  }>
): Promise<void> {
  const supabase = getServerClient();

  // Map to the exact column names in the `documents` table
  const rows = chunks.map((c) => ({
    content: c.content,
    embedding: c.embedding,
    source: c.source,
    chunk_index: c.chunkIndex,
    session_id: c.sessionId,
  }));

  const { error } = await supabase.from("documents").insert(rows);

  if (error) {
    throw new Error(`Failed to store chunks in Supabase: ${error.message}`);
  }
}
