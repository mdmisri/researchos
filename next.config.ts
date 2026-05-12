import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // We use Server-Sent Events (SSE) for streaming agent output to the browser.
  // Long-running SSE connections require we disable response buffering —
  // without this, Next.js would wait for the full response before sending anything.
  experimental: {
    serverComponentsExternalPackages: [
      // LangGraph runs in Node.js, not the Edge runtime.
      // Marking it external prevents Next.js from bundling it for the browser.
      "@langchain/langgraph",
      "@langchain/core",
      "openai",
    ],
  },
};

export default nextConfig;
