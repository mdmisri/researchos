import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { CHAT_MODEL } from "@/lib/openai";
import { tavilySearchTool } from "@/tools/tavily";
import { chunkText } from "@/rag/chunking";
import { embedChunks } from "@/rag/embeddings";
import { storeChunks } from "@/rag/retrieval";
import type { GraphState } from "@/graph/state";
import type { AgentMessage } from "@/schemas/agent";

// ─── Why is this a "node" not a "chain"? ────────────────────────────────────
//
// In LangGraph, a "node" is just a function:
//   (state: GraphState) => Partial<GraphState>
//
// It reads whatever it needs from state, does its work, and returns
// ONLY the fields it changed. LangGraph merges those changes using
// the reducers we defined in graph/state.ts.
//
// This means the Researcher never touches `finalReport` or `iterationCount`
// — it just returns { messages, searchResults, ragContext }.
// Clean separation: each agent owns exactly its slice of the state.
// ─────────────────────────────────────────────────────────────────────────────

// Bind the tool to the model so the LLM can decide to call it.
// `bindTools` tells OpenAI: "you may call these tools in your response."
// The LLM then returns either plain text OR a tool_call — LangGraph handles both.
const model = new ChatOpenAI({
  model: CHAT_MODEL,
  temperature: 0, // 0 = deterministic — research needs facts, not creativity
}).bindTools([tavilySearchTool]);

export async function researcherNode(
  state: GraphState
): Promise<Partial<GraphState>> {
  const sessionId = crypto.randomUUID(); // ties this run's chunks together in Supabase

  // ── Step 1: Ask the LLM what to search for ──────────────────────────────
  // We give the model the query and let it decide the best search terms.
  // Why not just pass the raw query to Tavily directly?
  // Because user queries are often vague ("tell me about AI"). The LLM
  // reformulates them into precise, searchable questions.
  const response = await model.invoke([
    new SystemMessage(
      `You are a research agent. Your job is to find accurate, current information.
       Use the web_search tool to search for information relevant to the query.
       Make 2-3 targeted searches to gather comprehensive information.
       Be specific in your search queries — avoid vague terms.`
    ),
    new HumanMessage(`Research this topic thoroughly: ${state.query}`),
  ]);

  // ── Step 2: Execute any tool calls the LLM requested ────────────────────
  // If the model decided to call web_search, response.tool_calls will be populated.
  // We execute each one and collect the raw search results.
  const searchResults: unknown[] = [];

  if (response.tool_calls && response.tool_calls.length > 0) {
    for (const toolCall of response.tool_calls) {
      if (toolCall.name === "web_search") {
        // Execute the tool call manually — we're not using an agent executor
        // because we want fine-grained control over what happens with results
        const result = await tavilySearchTool.invoke(toolCall.args);
        const parsed = JSON.parse(result);
        searchResults.push(parsed);

        // ── Step 3: Chunk, embed, and store what we found ─────────────────
        // For each search result, we extract the content, chunk it,
        // embed it, and store it in Supabase so the Synthesizer can
        // retrieve the most relevant pieces via RAG.
        if (parsed.results) {
          for (const item of parsed.results) {
            if (!item.content || item.content.length < 100) continue; // skip stubs

            const chunks = chunkText(item.content, item.url, {
              chunkSize: 300,      // smaller chunks for web snippets (they're already short)
              chunkOverlap: 30,
            });

            if (chunks.length === 0) continue;

            const embedded = await embedChunks(chunks);
            await storeChunks(
              embedded.map((c) => ({
                content: c.content,
                embedding: c.embedding,
                source: c.source,
                chunkIndex: c.chunkIndex,
                sessionId,
              }))
            );
          }
        }
      }
    }
  }

  // ── Step 4: Return only the fields this node changed ─────────────────────
  // messages uses an APPEND reducer → we return an array with one new message
  // searchResults uses a REPLACE reducer → we return the full new results array
  const agentMessage: AgentMessage = {
    role: "researcher",
    content: `Completed research. Found ${searchResults.length} search result sets. Stored chunks in vector DB.`,
    timestamp: new Date().toISOString(),
  };

  return {
    messages: [agentMessage],       // appended to existing messages by reducer
    searchResults,                   // replaces previous searchResults by reducer
    ragContext: [],                  // reset — Synthesizer will fill this via retrieval
  };
}
