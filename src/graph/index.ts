import { StateGraph } from "@langchain/langgraph";
import { GraphAnnotation } from "@/graph/state";
import { researcher, synthesizer, critic } from "@/graph/nodes";
import { routeAfterCritic } from "@/graph/edges";

// ─── The compiled graph ──────────────────────────────────────────────────────
//
// This file is the only place that knows the full flow:
//   START → researcher → synthesizer → critic → (approve: END | reject: researcher)
//
// Every other file is ignorant of this flow — agents don't know their neighbours.
// That's the point: changing the flow means only changing this file.
// ─────────────────────────────────────────────────────────────────────────────

const graph = new StateGraph(GraphAnnotation)
  // Register nodes — name must match what routeAfterCritic returns
  .addNode("researcher", researcher)
  .addNode("synthesizer", synthesizer)
  .addNode("critic", critic)

  // Fixed edges — always happen in this order
  .addEdge("__start__", "researcher")   // entry point
  .addEdge("researcher", "synthesizer") // after research, always synthesize
  .addEdge("synthesizer", "critic")     // after synthesis, always critique

  // Conditional edge — after critic, route based on verdict
  .addConditionalEdges("critic", routeAfterCritic, {
    researcher: "researcher",  // reject → loop back
    __end__: "__end__",        // approve → end the graph
  });

// Compile turns the graph definition into a runnable object.
// After compile, the graph is immutable — you can't add more nodes.
// Why compile? LangGraph validates the graph structure (no orphan nodes,
// no missing edges) and optimises the execution plan.
export const researchGraph = graph.compile();

// Export the state type so API routes can type their streaming responses
export type { GraphState } from "@/graph/state";
