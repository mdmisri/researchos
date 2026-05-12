import { getOpenAIClient } from "@/lib/openai";
import { EMBED_MODEL } from "@/lib/openai";
import type { Chunk } from "@/rag/chunking";

// ─── What is an embedding? ───────────────────────────────────────────────────
//
// An embedding is a fixed-length array of floats (1536 numbers for text-embedding-3-small)
// that represents the *meaning* of a piece of text in vector space.
//
// Texts with similar meanings produce vectors that point in similar directions.
// "dog" and "puppy" → vectors close together.
// "dog" and "quarterly earnings" → vectors far apart.
//
// This is how RAG retrieval works: embed the query, embed all chunks, find
// the chunks whose vectors are closest to the query vector.
// ─────────────────────────────────────────────────────────────────────────────

// How many chunks to embed in one API call.
// OpenAI allows up to 2048 inputs per request, but we batch at 100 for two reasons:
//   1. Keeps memory pressure low — 100 × 1536 floats is manageable
//   2. If one batch fails, we only lose 100 chunks, not the entire document
const BATCH_SIZE = 100;

export type EmbeddedChunk = Chunk & {
  embedding: number[]; // 1536-dimensional vector from text-embedding-3-small
};

// ─── embedChunks ─────────────────────────────────────────────────────────────
//
// Takes an array of Chunks and returns the same chunks with an `embedding` field added.
//
// I considered two approaches:
//
//   1. Embed one chunk at a time — simple loop, easy to read.
//      Rejected: N chunks = N API calls = slow and expensive.
//      OpenAI charges per token regardless, but latency multiplies.
//
//   2. Batch all chunks in one call (chosen) — one API call per BATCH_SIZE chunks.
//      The OpenAI embeddings API accepts an array of strings, so we can embed
//      100 chunks in the same time as 1.
//
// ─────────────────────────────────────────────────────────────────────────────
export async function embedChunks(chunks: Chunk[]): Promise<EmbeddedChunk[]> {
  if (chunks.length === 0) return [];

  const client = getOpenAIClient();
  const embeddedChunks: EmbeddedChunk[] = [];

  // Process in batches to avoid overwhelming the API or running out of memory
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    // Send all chunk contents in one API call
    const response = await client.embeddings.create({
      model: EMBED_MODEL,           // "text-embedding-3-small" — 1536 dims, cheapest
      input: batch.map((c) => c.content),
      encoding_format: "float",    // we want raw floats, not base64
    });

    // OpenAI returns embeddings in the same order as the input array.
    // We zip them back together with the original chunk data.
    for (let j = 0; j < batch.length; j++) {
      embeddedChunks.push({
        ...batch[j],
        embedding: response.data[j].embedding,
      });
    }
  }

  return embeddedChunks;
}

// ─── embedQuery ──────────────────────────────────────────────────────────────
//
// Embeds a single query string for retrieval.
// Kept separate from embedChunks because:
//   - queries are always single strings (no batching needed)
//   - we call this at query time, not at indexing time
//   - makes the call site cleaner: const vec = await embedQuery("...")
//
export async function embedQuery(query: string): Promise<number[]> {
  const client = getOpenAIClient();

  const response = await client.embeddings.create({
    model: EMBED_MODEL,
    input: query,
    encoding_format: "float",
  });

  // response.data[0].embedding is the 1536-dim vector for this query
  return response.data[0].embedding;
}
