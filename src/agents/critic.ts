import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { CHAT_MODEL } from "@/lib/openai";
import { z } from "zod";
import type { GraphState } from "@/graph/state";
import type { AgentMessage } from "@/schemas/agent";

// ─── The Critic's role ───────────────────────────────────────────────────────
//
// The Critic does ONE thing: decide whether the current report is good enough.
//
// It returns a structured verdict — not free text — so the graph's conditional
// edge can read it programmatically and decide which node to route to next.
//
// This is the key architectural pattern: agents communicate via STATE,
// not by calling each other. The Critic doesn't call the Synthesizer.
// It writes to state, and the GRAPH decides what happens next.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 3; // hard circuit breaker — matches what we discussed in state.ts

// Structured output schema — we force the LLM to return JSON matching this shape.
// Why structured output instead of free text?
// The conditional edge in the graph needs to read `verdict` programmatically.
// Free text like "I think this report needs more work" can't be parsed reliably.
// Zod + structured output = machine-readable decisions.
const CriticVerdictSchema = z.object({
  verdict: z.enum(["approve", "reject"]),
  reasoning: z.string(),         // human-readable explanation (shown in UI)
  specificGaps: z.array(z.string()), // concrete list of what's missing (fed back to Synthesizer)
  qualityScore: z.number().min(0).max(10), // numeric score for logging/debugging
});

type CriticVerdict = z.infer<typeof CriticVerdictSchema>;

const model = new ChatOpenAI({
  model: CHAT_MODEL,
  temperature: 0, // verdicts must be deterministic — same report = same decision
}).withStructuredOutput(CriticVerdictSchema); // forces JSON output matching the schema

export async function criticNode(
  state: GraphState
): Promise<Partial<GraphState>> {

  // ── Circuit breaker — always checked FIRST ──────────────────────────────
  // If we've already looped MAX_ITERATIONS times, approve regardless of quality.
  // Why check here and not just in the edge?
  // Checking here lets us log the forced approval and include it in messages,
  // so the user can see WHY the loop ended. The edge only routes — it doesn't log.
  if (state.iterationCount >= MAX_ITERATIONS) {
    const agentMessage: AgentMessage = {
      role: "critic",
      content: `Max iterations (${MAX_ITERATIONS}) reached. Approving report to prevent infinite loop. Final quality may be suboptimal.`,
      timestamp: new Date().toISOString(),
    };

    return {
      messages: [agentMessage],
      // iterationCount NOT incremented here — we're done, no point
    };
  }

  // ── Evaluate the report ─────────────────────────────────────────────────
  const verdict: CriticVerdict = await model.invoke([
    new SystemMessage(
      `You are a research quality critic. Evaluate the research report strictly.

       Approve ONLY if ALL of these are true:
       - Claims are supported by cited sources
       - Key aspects of the query are addressed
       - No obvious factual gaps or contradictions
       - Report has clear structure (summary, findings, analysis, conclusion)

       Reject if ANY of these are true:
       - Missing citations or unsupported claims
       - Major aspects of the query unaddressed
       - Report is too short (under 300 words) or too shallow
       - Contradictory information without resolution

       Be specific in specificGaps — vague feedback like "needs more detail"
       is not actionable. Say "missing statistics on X" or "no coverage of Y aspect".`
    ),
    new HumanMessage(
      `Original Query: ${state.query}

       Report to evaluate:
       ${state.finalReport ?? "No report generated yet."}

       This is iteration ${state.iterationCount + 1} of ${MAX_ITERATIONS}.`
    ),
  ]);

  const agentMessage: AgentMessage = {
    role: "critic",
    content: verdict.verdict === "approve"
      ? `Approved. Score: ${verdict.qualityScore}/10. ${verdict.reasoning}`
      : `Rejected. Score: ${verdict.qualityScore}/10. Gaps: ${verdict.specificGaps.join(", ")}`,
    timestamp: new Date().toISOString(),
  };

  return {
    messages: [agentMessage],
    // The conditional edge reads the LAST message from the critic to decide routing.
    // We don't store verdict separately — it's embedded in the message content.
    // The edge function will check agentMessage.content for "Approved" vs "Rejected".
    //
    // Why not add a `verdict` field to GraphState?
    // Because it's transient — only needed for routing, not for downstream agents.
    // Adding ephemeral routing signals to shared state is a smell.
    iterationCount: verdict.verdict === "reject" ? 1 : 0,
    // Additive reducer: returning 1 increments by 1. Returning 0 keeps it the same.
    // On approve, we don't increment — the graph will end anyway.
  };
}
