import { z } from "zod";

// Document: what we store and retrieve from Supabase pgvector
export const DocumentSchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  embedding: z.array(z.number()).optional(), // 1536-dim vector (text-embedding-3-small)
  metadata: z.object({
    source: z.string(),      // URL or document title
    chunkIndex: z.number(),  // position of this chunk in the original document
    sessionId: z.string(),   // ties documents to a research session
  }),
});

export type Document = z.infer<typeof DocumentSchema>;
