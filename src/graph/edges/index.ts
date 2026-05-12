import type { GraphState } from "@/graph/state";

// ─── Conditional edge: after the Critic runs, where do we go? ───────────────
//
// A conditional edge is a function that reads state and returns a node NAME (string).
// LangGraph uses that string to decide which node to execute next.
//
// This is the ONLY place routing logic lives.
// Agents don't call each other — they write to state and the edge decides.
// ─────────────────────────────────────────────────────────────────────────────

export function routeAfterCritic(state: GraphState): "researcher" | "__end__" {
  const messages = state.messages;

  // Find the most recent critic message
  const lastCriticMessage = [...messages]
    .reverse()
    .find((m) => m.role === "critic");

  if (!lastCriticMessage) {
    // No critic message yet — shouldn't happen, but default to ending safely
    return "__end__";
  }

  // The Critic embeds its verdict in the message content (see critic.ts)
  // "Approved." → end the graph
  // "Rejected." → loop back to Researcher for another pass
  if (lastCriticMessage.content.startsWith("Approved")) {
    return "__end__";
  }

  // Also end if max iterations reached (Critic logs "Max iterations" message)
  if (lastCriticMessage.content.startsWith("Max iterations")) {
    return "__end__";
  }

  return "researcher"; // loop: Researcher → Synthesizer → Critic → ...
}
