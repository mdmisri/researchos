import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { CHAT_MODEL } from "@/lib/openai";
import { retrieveChunks } from "@/rag/retrieval";
import type { GraphState } from "@/graph/state";
import type { AgentMessage } from "@/schemas/agent";

// The Synthesizer's job: take everything the Researcher found,
// retrieve the most relevant pieces via RAG, and write a coherent report.
//
// It does NOT search the web — that's the Researcher's job.
// It does NOT judge quality — that's the Critic's job.
// Single responsibility: read context, write report.

const model = new ChatOpenAI({
  model: CHAT_MODEL,
  temperature: 0.3, // slight creativity for writing quality, but still grounded
});

export async function synthesizerNode(
  state: GraphState
): Promise<Partial<GraphState>> {

  // ── Step 1: Retrieve the most relevant chunks via RAG ───────────────────
  // We don't dump ALL stored chunks into the prompt — that would be thousands
  // of tokens. Instead, we ask pgvector "what's most relevant to the query?"
  // and get back the top 5 chunks. This is the R in RAG.
  const relevantChunks = await retrieveChunks(state.query, {
    topK: 5,
    similarityThreshold: 0.65, // slightly lower than default — synthesis benefits
                                // from broader context than strict retrieval
  });

  // Format chunks into a readable context block for the prompt
  const ragContext = relevantChunks
    .map((c, i) => `[Source ${i + 1}: ${c.source}]\n${c.content}`)
    .join("\n\n---\n\n");

  // Also include the Critic's feedback if this is a refinement loop
  // The Critic's message will be in state.messages if iterationCount > 0
  const criticFeedback = state.messages
    .filter((m) => m.role === "critic")
    .map((m) => m.content)
    .join("\n");

  // ── Step 2: Write the report ─────────────────────────────────────────────
  const response = await model.invoke([
    new SystemMessage(
      `You are a research synthesizer. Write a comprehensive, well-structured research report.
       - Use only the provided source material — do not invent facts
       - Cite sources inline using [Source N] notation
       - Structure: Executive Summary → Key Findings → Analysis → Conclusion
       - Be specific with data points, dates, and numbers when available
       ${criticFeedback ? `\n\nPrevious draft was rejected for these reasons — address them:\n${criticFeedback}` : ""}`
    ),
    new HumanMessage(
      `Research Query: ${state.query}

       Source Material:
       ${ragContext || "No RAG context available — use search results from state."}

       ${state.finalReport ? `Previous draft to improve upon:\n${state.finalReport}` : "Write the initial report."}`
    ),
  ]);

  const report =
    typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

  const agentMessage: AgentMessage = {
    role: "synthesizer",
    content: `Report written. Length: ${report.length} chars. Iteration: ${state.iterationCount + 1}`,
    timestamp: new Date().toISOString(),
  };

  return {
    messages: [agentMessage],
    finalReport: report,           // replaces previous draft (replace reducer)
    ragContext: relevantChunks,    // stores what was used — Critic can inspect this
  };
}
