// Nodes are just the agent functions re-exported with graph-friendly names.
// Keeping this layer thin means the graph definition stays readable —
// it just lists names, not implementations.

export { researcherNode as researcher } from "@/agents/researcher";
export { synthesizerNode as synthesizer } from "@/agents/synthesizer";
export { criticNode as critic } from "@/agents/critic";
