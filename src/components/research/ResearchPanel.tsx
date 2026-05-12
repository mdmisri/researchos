"use client";

import { useState } from "react";

type AgentEvent = {
  type: "status" | "agent_done" | "done" | "error";
  data: Record<string, unknown>;
  timestamp: string;
};

type AgentName = "researcher" | "synthesizer" | "critic";

const AGENT_META: Record<AgentName, { label: string; icon: string; color: string }> = {
  researcher: { label: "Researcher", icon: "🔍", color: "bg-blue-500" },
  synthesizer: { label: "Synthesizer", icon: "✍️", color: "bg-violet-500" },
  critic:      { label: "Critic",      icon: "🧠", color: "bg-amber-500" },
};

// ── Lightweight markdown renderer ────────────────────────────────────────────
// We don't add react-markdown as a dependency to keep it simple.
// Handles: # headings, **bold**, - bullet lists, numbered lists, paragraphs.
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let key = 0;

  const flushList = () => {
    if (listBuffer.length === 0) return;
    const Tag = listType === "ol" ? "ol" : "ul";
    elements.push(
      <Tag key={key++} className={listType === "ol"
        ? "list-decimal list-inside space-y-1 my-3 text-gray-700"
        : "list-disc list-inside space-y-1 my-3 text-gray-700"}>
        {listBuffer.map((item, i) => (
          <li key={i} className="leading-relaxed">{applyInline(item)}</li>
        ))}
      </Tag>
    );
    listBuffer = [];
    listType = null;
  };

  const applyInline = (s: string): React.ReactNode => {
    // Bold: **text**
    const parts = s.split(/\*\*(.*?)\*\*/g);
    return parts.map((p, i) =>
      i % 2 === 1 ? <strong key={i} className="font-semibold text-gray-900">{p}</strong> : p
    );
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) { flushList(); elements.push(<div key={key++} className="h-2" />); continue; }

    // Headings
    if (line.startsWith("### ")) { flushList(); elements.push(<h3 key={key++} className="text-base font-bold text-gray-900 mt-5 mb-1">{line.slice(4)}</h3>); continue; }
    if (line.startsWith("## "))  { flushList(); elements.push(<h2 key={key++} className="text-lg font-bold text-gray-900 mt-6 mb-2 border-b border-gray-200 pb-1">{line.slice(3)}</h2>); continue; }
    if (line.startsWith("# "))   { flushList(); elements.push(<h1 key={key++} className="text-xl font-bold text-gray-900 mt-6 mb-2">{line.slice(2)}</h1>); continue; }

    // Bullet list
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (listType !== "ul") { flushList(); listType = "ul"; }
      listBuffer.push(line.slice(2)); continue;
    }

    // Numbered list
    const numMatch = line.match(/^\d+\.\s+(.+)/);
    if (numMatch) {
      if (listType !== "ol") { flushList(); listType = "ol"; }
      listBuffer.push(numMatch[1]); continue;
    }

    // Paragraph
    flushList();
    elements.push(<p key={key++} className="text-gray-700 leading-relaxed my-2">{applyInline(line)}</p>);
  }

  flushList();
  return elements;
}

export default function ResearchPanel() {
  const [query, setQuery] = useState("");
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [report, setReport] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentName | null>(null);

  const addEvent = (event: AgentEvent) => setEvents((prev) => [...prev, event]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || isRunning) return;

    setEvents([]);
    setReport(null);
    setError(null);
    setIsRunning(true);
    setActiveAgent("researcher");

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      if (!response.ok) throw new Error(`Request failed: ${response.statusText}`);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const event: AgentEvent = JSON.parse(line);
            addEvent(event);

            if (event.type === "agent_done") {
              const agent = event.data.agent as AgentName;
              if (agent === "researcher") setActiveAgent("synthesizer");
              if (agent === "synthesizer") setActiveAgent("critic");
              if (agent === "critic") setActiveAgent(null);
            }
            if (event.type === "done" && event.data.report) setReport(event.data.report as string);
            if (event.type === "error") setError(event.data.message as string);
          } catch { /* skip malformed */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsRunning(false);
      setActiveAgent(null);
    }
  }

  const agentEvents = events.filter((e) => e.type === "agent_done");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700 bg-slate-900 bg-opacity-80 px-6 py-4 flex items-center gap-3">
        <div>
          <h1 className="text-sm font-bold text-white">ResearchOS</h1>
          <p className="text-xs text-slate-400">Autonomous multi-agent research</p>
        </div>
        <div className="ml-auto flex gap-2">
          {(["researcher", "synthesizer", "critic"] as AgentName[]).map((a) => (
            <span key={a} className={`rounded-full px-2 py-0.5 text-xs font-medium transition-all ${
              activeAgent === a
                ? `${AGENT_META[a].color} text-white shadow-lg`
                : "bg-slate-700 text-slate-400"
            }`}>
              {AGENT_META[a].icon} {AGENT_META[a].label}
            </span>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">

        {/* Search box */}
        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you want to research? e.g. 'Latest advances in quantum computing'"
            className="w-full rounded-xl border border-slate-600 bg-slate-800 px-5 py-4 pr-36 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-30"
            disabled={isRunning}
          />
          <button
            type="submit"
            disabled={isRunning || !query.trim()}
            className="absolute right-2 top-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-40"
          >
            {isRunning ? "Running…" : "Research →"}
          </button>
        </form>

        {/* Agent pipeline progress */}
        {isRunning && (
          <div className="rounded-xl border border-slate-700 bg-slate-800 bg-opacity-60 p-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-400">Agent Pipeline</p>
            <div className="flex items-center gap-3">
              {(["researcher", "synthesizer", "critic"] as AgentName[]).map((a, i) => {
                const done = agentEvents.some((e) => e.data.agent === a);
                const active = activeAgent === a;
                return (
                  <div key={a} className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full text-lg transition-all ${
                      done ? "bg-green-500 bg-opacity-20 ring-2 ring-green-500" :
                      active ? `${AGENT_META[a].color} bg-opacity-20 ring-2 ring-current shadow-lg` :
                      "bg-slate-700"
                    }`}>
                      {done ? "✓" : AGENT_META[a].icon}
                    </div>
                    <div>
                      <p className={`text-xs font-semibold ${active ? "text-white" : done ? "text-green-400" : "text-slate-500"}`}>
                        {AGENT_META[a].label}
                      </p>
                      <p className="text-xs text-slate-500">{active ? "Running…" : done ? "Done" : "Waiting"}</p>
                    </div>
                    {i < 2 && <div className="h-px w-8 bg-slate-600" />}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Event log */}
        {agentEvents.length > 0 && (
          <div className="space-y-2">
            {agentEvents.map((ev, i) => {
              const agent = ev.data.agent as AgentName;
              const meta = AGENT_META[agent] ?? { icon: "⚙️", label: agent, color: "bg-slate-500" };
              return (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-800 bg-opacity-50 px-4 py-3">
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${meta.color} text-white`}>{meta.icon}</span>
                  <span className="text-sm font-medium text-slate-300">{meta.label}</span>
                  <span className="text-sm text-slate-400">{String(ev.data.message ?? "")}</span>
                  <span className="ml-auto text-xs text-slate-600">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-800 bg-red-900 bg-opacity-30 px-5 py-4 text-sm text-red-400">
            ❌ {error}
          </div>
        )}

        {/* Report */}
        {report && (
          <div className="rounded-xl border border-slate-700 bg-slate-800 bg-opacity-80 p-8">
            <div className="mb-6 flex items-center gap-3 border-b border-slate-700 pb-4">
              <span className="text-2xl">📋</span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Research Report</p>
                <p className="text-sm font-medium text-white">{query}</p>
              </div>
            </div>
            <div className="text-sm">{renderMarkdown(report)}</div>
          </div>
        )}

        {/* Empty state */}
        {!isRunning && !report && events.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-5xl mb-4">🔬</p>
            <p className="text-slate-400 text-sm">Enter a research topic above to start</p>
            <p className="text-slate-600 text-xs mt-2">Powered by gpt-4o-mini · Tavily · pgvector</p>
          </div>
        )}
      </div>
    </div>
  );
}