import { z } from "zod";

// AgentMessage: the unit of communication between agents in the LangGraph
export const AgentMessageSchema = z.object({
  role: z.enum(["researcher", "synthesizer", "critic", "orchestrator"]),
  content: z.string(),
  timestamp: z.string().datetime(),
});

// GraphState: the shared mutable state passed through every node in the LangGraph.
// This is the "working memory" of the entire multi-agent run.
// Every node reads from and writes to this object.
export const GraphStateSchema = z.object({
  query: z.string(),
  messages: z.array(AgentMessageSchema),
  searchResults: z.array(z.unknown()),   // populated by the Researcher agent
  ragContext: z.array(z.unknown()),       // populated by the RAG retrieval step
  finalReport: z.string().optional(),    // populated by the Synthesizer agent
  iterationCount: z.number().default(0), // used by Critic to gate refinement loops
});

export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type GraphState = z.infer<typeof GraphStateSchema>;
