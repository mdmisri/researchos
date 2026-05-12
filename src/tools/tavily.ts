import { tool } from "@langchain/core/tools";
import { tavily } from "@tavily/core";
import { z } from "zod";

// ─── Why wrap Tavily as a LangChain tool? ───────────────────────────────────
//
// LangGraph agents don't call APIs directly. They call "tools" — objects with
// a standard interface: { name, description, schema, call() }.
//
// The agent's LLM reads `name` and `description` to decide WHEN to use this tool.
// It reads `schema` to know WHAT arguments to pass.
// LangGraph handles calling the function and returning the result back to the LLM.
//
// This means: the agent never sees Tavily. It sees a tool called "web_search".
// Tomorrow you could swap Tavily for Perplexity or SerpAPI by changing only this file.
// ────────────────────────────────────────────────────────────────────────────

// Input schema — Zod validates what the LLM sends before we hit the network.
// If the LLM hallucinates a bad argument (e.g. maxResults: "lots"), Zod catches it
// before we waste an API call.
const TavilyInputSchema = z.object({
  query: z
    .string()
    .min(3)
    .describe("The specific search query. Be precise — vague queries waste API credits."),
  maxResults: z
    .number()
    .min(1)
    .max(10)
    .default(5)
    .describe("Number of search results to return. Use 3-5 for speed, 10 for deep research."),
});

// Output schema — shapes what we give back to the agent.
// We strip raw HTML and keep only what the agent can reason over.
const TavilyResultSchema = z.object({
  answer: z.string().optional(),   // Tavily's own AI-generated summary of results
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      content: z.string(),         // cleaned snippet (no HTML)
      score: z.number(),           // Tavily's relevance score 0–1
    })
  ),
});

export type TavilyResult = z.infer<typeof TavilyResultSchema>;

// Singleton — we reuse the same Tavily client across all tool calls.
// Why: avoids re-reading the API key and re-initialising on every search.
let tavilyClient: ReturnType<typeof tavily> | null = null;

function getTavilyClient() {
  if (!tavilyClient) {
    if (!process.env.TAVILY_API_KEY) {
      throw new Error("TAVILY_API_KEY is not set");
    }
    tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });
  }
  return tavilyClient;
}

// The tool itself — `tool()` from LangChain wires together the schema,
// description, and implementation into one object the agent can call.
export const tavilySearchTool = tool(
  async ({ query, maxResults }): Promise<string> => {
    const client = getTavilyClient();

    const response = await client.search(query, {
      maxResults,
      // "advanced" uses Tavily's deeper crawl — better for research tasks.
      // "basic" is faster and cheaper for simple factual lookups.
      searchDepth: "advanced",
      // Ask Tavily to also return its own synthesised answer.
      // This gives the agent a quick summary on top of the raw results.
      includeAnswer: true,
    });

    // Validate the raw Tavily response against our schema.
    // Why validate OUTPUT, not just input? Third-party APIs can change their
    // response shape without warning. Zod catches that at runtime rather than
    // letting a malformed object silently corrupt the agent's reasoning.
    const parsed = TavilyResultSchema.safeParse(response);

    if (!parsed.success) {
      // Return a descriptive error string — the agent will see this as the tool
      // result and can decide to retry or proceed with what it has.
      return `Search failed: unexpected response shape — ${parsed.error.message}`;
    }

    // Return JSON string, not an object.
    // LangChain tools must return strings — the LLM treats the result as text.
    return JSON.stringify(parsed.data);
  },
  {
    name: "web_search",
    // This description is read by the LLM to decide when to call this tool.
    // Be specific: vague descriptions cause the agent to call tools at wrong times.
    description:
      "Search the web for current, factual information on a topic. " +
      "Use for recent events, statistics, technical documentation, or any " +
      "information that may have changed after your training cutoff.",
    schema: TavilyInputSchema,
  }
);
