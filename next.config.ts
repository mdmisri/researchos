import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `serverComponentsExternalPackages` was moved out of `experimental` in Next.js 15.1.
  // These packages run in Node.js only — marking them external prevents Next.js
  // from attempting to bundle them for the browser (they use Node APIs like `net`, `fs`).
  serverExternalPackages: [
    "@langchain/langgraph",
    "@langchain/core",
    "openai",
  ],
};

export default nextConfig;