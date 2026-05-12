// rag/ is the full retrieval-augmented generation pipeline.
// It has three sub-stages — each in its own folder:
//
//   chunking/    → split raw text into overlapping chunks
//   embeddings/  → turn chunks into 1536-dim vectors via OpenAI text-embedding-3-small
//   retrieval/   → cosine similarity search against Supabase pgvector
//
// Why split these? Each stage can be tested and swapped independently.
// e.g. we can change the embedding model without touching chunking logic.

export {};
