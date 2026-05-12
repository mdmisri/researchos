import { z } from "zod";

// ─── Why do we chunk? ────────────────────────────────────────────────────────
//
// Embedding models have a token limit (~8000 tokens for text-embedding-3-small).
// More importantly: embedding a full document produces ONE vector that represents
// the "average" meaning of the entire text. That average is useless for retrieval —
// if someone asks about paragraph 7, the full-document vector won't surface it.
//
// Chunking breaks text into small, semantically focused pieces so each vector
// represents ONE idea. Retrieval then finds the exact chunk that answers the query.
// ─────────────────────────────────────────────────────────────────────────────

// Config schema — validated at call time so bad configs fail loudly, not silently.
const ChunkConfigSchema = z.object({
  // chunkSize: target word count per chunk.
  // 500 words ≈ 650 tokens — well within the 8000 token embedding limit,
  // but large enough to contain a full coherent idea.
  chunkSize: z.number().min(50).max(2000).default(500),

  // chunkOverlap: how many words to repeat between adjacent chunks.
  // Why overlap at all? So sentences at chunk boundaries aren't split in half.
  // A sentence cut across two chunks appears fully in NEITHER — overlap fixes that.
  // Rule of thumb: overlap = ~10% of chunkSize.
  chunkOverlap: z.number().min(0).max(500).default(50),
});

export type ChunkConfig = z.infer<typeof ChunkConfigSchema>;

// A Chunk is what gets embedded and stored in Supabase.
export const ChunkSchema = z.object({
  content: z.string(),
  chunkIndex: z.number(),    // position in the original document (0-based)
  source: z.string(),        // URL or document identifier — preserved for citations
  wordCount: z.number(),
});

export type Chunk = z.infer<typeof ChunkSchema>;

// ─── Core chunking function ──────────────────────────────────────────────────
//
// I considered three chunking strategies:
//
//   1. Fixed character count  — simple, but cuts mid-word constantly. Messy.
//   2. Sentence-aware (NLP)   — cleanest boundaries, but adds heavy dependencies
//                               (compromise: natural language toolkit, spaCy port).
//   3. Fixed word count with overlap (chosen) — simple, fast, good enough.
//      Words are a better unit than characters (never mid-word) and don't need
//      a parser. The overlap handles boundary bleed. This is what most production
//      RAG systems start with before optimising.
//
// ─────────────────────────────────────────────────────────────────────────────
export function chunkText(
  text: string,
  source: string,
  config: Partial<ChunkConfig> = {}
): Chunk[] {
  // Validate and fill defaults — unknown callers might pass bad values
  const { chunkSize, chunkOverlap } = ChunkConfigSchema.parse(config);

  // Split on whitespace — preserves word boundaries, ignores HTML/markdown
  const words = text.trim().split(/\s+/);

  if (words.length === 0) return [];

  const chunks: Chunk[] = [];
  // step: how far to advance the window each iteration.
  // We advance by (chunkSize - chunkOverlap) so the overlap region is shared
  // between the current chunk and the next one.
  const step = chunkSize - chunkOverlap;
  let chunkIndex = 0;

  for (let start = 0; start < words.length; start += step) {
    const end = Math.min(start + chunkSize, words.length);
    const chunkWords = words.slice(start, end);

    // Skip tiny trailing chunks — less than 20 words has almost no semantic signal
    // and wastes embedding API credits.
    if (chunkWords.length < 20) break;

    chunks.push(
      ChunkSchema.parse({
        content: chunkWords.join(" "),
        chunkIndex,
        source,
        wordCount: chunkWords.length,
      })
    );

    chunkIndex++;

    // If this chunk reached the end of the document, stop.
    if (end === words.length) break;
  }

  return chunks;
}
