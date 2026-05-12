import { Annotation } from "@langchain/langgraph";
import type { AgentMessage } from "@/schemas/agent";

// ─── Why two separate state definitions? ────────────────────────────────────
//
// You already have GraphStateSchema in src/schemas/agent.ts (Zod).
// This file defines GraphAnnotation — LangGraph's own runtime state object.
//
// They are NOT duplicates. They serve different jobs:
//
//   Zod schema (schemas/agent.ts)
//     → validates data at the API boundary (when a request comes in)
//     → gives you TypeScript types via z.infer<>
//
//   LangGraph Annotation (this file)
//     → tells the graph HOW to merge partial updates from each node
//     → every node returns { field: newValue }, and the reducer decides
//       whether to REPLACE the old value or APPEND to it
//
// Rule of thumb: Zod guards the door, Annotation runs the room.
// ────────────────────────────────────────────────────────────────────────────

export const GraphAnnotation = Annotation.Root({

  // query: set once at the start, never changes.
  // No reducer needed — default behaviour is "last write wins" (replace).
  query: Annotation<string>({
    reducer: (_, update) => update,
    default: () => "",
  }),

  // messages: a running log of everything every agent has said.
  // Reducer APPENDS — we never want to lose earlier messages.
  // Why? The Critic and Synthesizer need the full conversation history
  // to understand why previous drafts were rejected.
  messages: Annotation<AgentMessage[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // searchResults: the raw Tavily results from the current iteration.
  // Reducer REPLACES — we want the freshest search results each loop,
  // not an ever-growing blob of stale + fresh results mixed together.
  searchResults: Annotation<unknown[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),

  // ragContext: the chunks retrieved from Supabase pgvector.
  // Reducer REPLACES — same reasoning as searchResults above.
  ragContext: Annotation<unknown[]>({
    reducer: (_, update) => update,
    default: () => [],
  }),

  // finalReport: the Synthesizer's output.
  // Reducer REPLACES — each synthesis pass overwrites the previous draft.
  // The full draft history is preserved in `messages` if we ever need it.
  finalReport: Annotation<string | undefined>({
    reducer: (_, update) => update,
    default: () => undefined,
  }),

  // iterationCount: the Critic's circuit breaker.
  // Reducer ADDS — nodes return { iterationCount: 1 } to mean "increment by 1".
  // Why add instead of replace? A node should never need to know the current
  // count to increment it — that would require reading state before writing,
  // making nodes stateful. Additive reducers keep nodes pure and simple.
  iterationCount: Annotation<number>({
    reducer: (current, update) => current + update,
    default: () => 0,
  }),

});

// Export the inferred TypeScript type.
// Every node function will be typed as:
//   (state: GraphState) => Partial<GraphState>
export type GraphState = typeof GraphAnnotation.State;
