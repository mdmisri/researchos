// tools/ wraps external capabilities into LangChain-compatible tool objects.
// Why wrap? LangGraph agents call tools via a standard interface —
// the agent doesn't know or care whether the tool hits an MCP server, a REST API,
// or runs locally. Swapping Tavily for another search provider = change one file here.

// Exports:
// - tavilySearchTool: web search via Tavily API
// - vectorSearchTool: semantic search over Supabase pgvector (coming with RAG)

export { tavilySearchTool } from "./tavily";
