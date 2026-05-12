import { z } from "zod";

// ResearchRequest: what the user submits via the UI
export const ResearchRequestSchema = z.object({
  query: z.string().min(10, "Query must be at least 10 characters"),
  depth: z.enum(["quick", "deep"]).default("deep"),
  sessionId: z.string().uuid().optional(), // for resuming a prior research run
});

// ResearchStatus: the shape of SSE events streamed back to the browser
export const ResearchStatusSchema = z.object({
  type: z.enum(["thinking", "searching", "synthesizing", "done", "error"]),
  message: z.string(),
  data: z.unknown().optional(), // partial results while streaming
});

// Derive TypeScript types directly from schemas — zero duplication
export type ResearchRequest = z.infer<typeof ResearchRequestSchema>;
export type ResearchStatus = z.infer<typeof ResearchStatusSchema>;
