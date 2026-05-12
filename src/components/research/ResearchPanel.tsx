"use client";

import { useState } from "react";

type AgentEvent = {
  type: "status" | "agent_done" | "done" | "error";
  data: Record<string, unknown>;
  timestamp: string;
};

type AgentName = "researcher" | "synthesizer" | "critic";

const AGENT_META: Record<AgentName, { label: string; icon: string; ring: string; bg: string; dot: string }> = {
  researcher: {
    label: "Researcher",
    icon: "🔍",
    ring: "ring-blue-500",
    bg: "bg-blue-500/20",
    dot: "bg-blue-400",
  },
  synthesizer: {
    label: "Synthesizer",
    icon: "✍️",
    ring: "ring-violet-500",
    bg: "bg-violet-500/20",
    dot: "bg-violet-400",
  },
  critic: {
    label: "Critic",
    icon: "🧠",
    ring: "ring-amber-500",
    bg: "bg-amber-500/20",
    dot: "bg-amber-400",
  },
};

const AGENTS: AgentName[] = ["researcher", "synthesizer", "critic"];

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
      <Tag
        key={key++}
        className={
          listType === "ol"
            ? "list-decimal list-inside space-y-1.5 my-3 text-white/70"
            : "list-disc list-inside space-y-1.5 my-3 text-white/70"
        }
      >
        {listBuffer.map((item, i) => (
          <li key={i} className="leading-relaxed">
            {applyInline(item)}
          </li>
        ))}
      </Tag>
    );
    listBuffer = [];
    listType = null;
  };

  const applyInline = (s: string): React.ReactNode => {
    const parts = s.split(/\*\*(.*?)\*\*/g);
    return parts.map((p, i) =>
      i % 2 === 1 ? (
        <strong key={i} className="font-semibold text-white">
          {p}
        </strong>
      ) : (
        p
      )
    );
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      elements.push(<div key={key++} className="h-2" />);
      continue;
    }
    if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h3 key={key++} className="text-sm font-bold text-white mt-5 mb-1">
          {line.slice(4)}
        </h3>
      );
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h2
          key={key++}
          className="text-base font-bold text-white mt-6 mb-2 border-b border-white/10 pb-1"
        >
          {line.slice(3)}
        </h2>
      );
      continue;
    }
    if (line.startsWith("# ")) {
      flushList();
      elements.push(
        <h1 key={key++} className="text-lg font-bold text-white mt-6 mb-2">
          {line.slice(2)}
        </h1>
      );
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listBuffer.push(line.slice(2));
      continue;
    }
    const numMatch = line.match(/^\d+\.\s+(.+)/);
    if (numMatch) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listBuffer.push(numMatch[1]);
      continue;
    }
    flushList();
    elements.push(
      <p key={key++} className="text-white/70 leading-relaxed my-2">
        {applyInline(line)}
      </p>
    );
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
            if (event.type === "done" && event.data.report)
              setReport(event.data.report as string);
            if (event.type === "error") setError(event.data.message as string);
          } catch {
            /* skip malformed */
          }
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
    <div className="min-h-screen bg-[#060d1f] font-sans">
      {/* Ambient background glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-32 -top-32 h-80 w-80 rounded-full bg-blue-600 opacity-[0.07] blur-3xl" />
        <div className="absolute -left-20 top-1/2 h-64 w-64 rounded-full bg-violet-600 opacity-[0.05] blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-48 w-48 rounded-full bg-blue-800 opacity-[0.06] blur-3xl" />
      </div>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#060d1f]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center px-4 py-3 sm:px-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-500/30">
              <span className="text-[11px] font-black text-white">R</span>
            </div>
            <div>
              <p className="text-sm font-bold leading-none text-white">ResearchOS</p>
              <p className="mt-0.5 hidden text-[10px] leading-none text-white/30 sm:block">
                Multi-agent research
              </p>
            </div>
          </div>

          {/* Agent status — dots on mobile, pills on desktop */}
          <div className="ml-auto flex items-center gap-2">
            <div className="flex gap-1.5 sm:hidden">
              {AGENTS.map((a) => (
                <div
                  key={a}
                  className={`h-2 w-2 rounded-full transition-all duration-300 ${
                    activeAgent === a
                      ? `${AGENT_META[a].dot} animate-pulse`
                      : "bg-white/15"
                  }`}
                />
              ))}
            </div>
            <div className="hidden gap-1.5 sm:flex">
              {AGENTS.map((a) => (
                <span
                  key={a}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-all duration-300 ${
                    activeAgent === a
                      ? `${AGENT_META[a].bg} ${AGENT_META[a].ring} border-transparent ring-1 text-white`
                      : "border-white/[0.06] bg-white/[0.03] text-white/35"
                  }`}
                >
                  {AGENT_META[a].icon} {AGENT_META[a].label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main className="relative mx-auto max-w-4xl space-y-4 px-4 py-6 sm:space-y-5 sm:px-6 sm:py-10">

        {/* Search */}
        <form onSubmit={handleSubmit} className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What do you want to research?"
            disabled={isRunning}
            className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] px-5 pb-[4.5rem] pt-4 text-sm text-white placeholder-white/25 backdrop-blur-sm transition focus:border-blue-500/40 focus:outline-none focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60 sm:pb-4 sm:pr-36"
          />
          <button
            type="submit"
            disabled={isRunning || !query.trim()}
            className="absolute bottom-2 left-2 right-2 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-blue-500 disabled:opacity-40 sm:bottom-auto sm:left-auto sm:right-2 sm:top-2 sm:w-auto"
          >
            {isRunning ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Running…
              </>
            ) : (
              "Research →"
            )}
          </button>
        </form>

        {/* Agent Pipeline */}
        {isRunning && (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 backdrop-blur-sm sm:p-5">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-white/30">
              Agent Pipeline
            </p>
            <div className="flex items-center">
              {AGENTS.map((a, i) => {
                const done = agentEvents.some((e) => e.data.agent === a);
                const active = activeAgent === a;
                return (
                  <div key={a} className="flex flex-1 items-center gap-2 sm:gap-3">
                    <div
                      className={`relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm transition-all duration-500 sm:h-10 sm:w-10 sm:text-base ${
                        done
                          ? "bg-green-500/15 ring-1 ring-green-500/50 text-green-400"
                          : active
                          ? `${AGENT_META[a].bg} ring-2 ${AGENT_META[a].ring} text-white`
                          : "bg-white/[0.04] ring-1 ring-white/10 text-white/30"
                      }`}
                    >
                      {active && (
                        <span
                          className={`absolute inset-0 animate-ping rounded-full opacity-20 ${AGENT_META[a].bg}`}
                        />
                      )}
                      <span className="relative">{done ? "✓" : AGENT_META[a].icon}</span>
                    </div>
                    <div className="hidden min-w-0 sm:block">
                      <p
                        className={`truncate text-xs font-medium ${
                          active ? "text-white" : done ? "text-green-400" : "text-white/30"
                        }`}
                      >
                        {AGENT_META[a].label}
                      </p>
                      <p className="truncate text-[10px] text-white/20">
                        {active ? "Running…" : done ? "Done" : "Waiting"}
                      </p>
                    </div>
                    {i < 2 && (
                      <div
                        className={`mx-1 h-px flex-1 transition-all duration-700 sm:mx-2 ${
                          done ? "bg-green-500/30" : "bg-white/8"
                        }`}
                      />
                    )}
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
              const meta = AGENT_META[agent] ?? {
                icon: "⚙️",
                label: agent,
                bg: "bg-white/10",
                ring: "",
                dot: "",
              };
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-4 py-3"
                >
                  <span
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs ${meta.bg} text-white`}
                  >
                    {meta.icon}
                  </span>
                  <span className="flex-shrink-0 text-sm font-medium text-white/60">
                    {meta.label}
                  </span>
                  <span className="truncate text-sm text-white/35">
                    {String(ev.data.message ?? "")}
                  </span>
                  <span className="ml-auto flex-shrink-0 text-xs text-white/20">
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.06] px-5 py-4 text-sm text-red-400">
            ❌ {error}
          </div>
        )}

        {/* Report */}
        {report && (
          <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm">
            <div className="flex items-center gap-3 border-b border-white/[0.06] px-5 py-4 sm:px-8 sm:py-5">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
                <span className="text-base">📋</span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/30">
                  Research Report
                </p>
                <p className="truncate text-sm font-medium text-white/80">{query}</p>
              </div>
            </div>
            <div className="px-5 py-5 text-sm sm:px-8 sm:py-6">{renderMarkdown(report)}</div>
          </div>
        )}

        {/* Empty state */}
        {!isRunning && !report && events.length === 0 && (
          <div className="py-16 text-center sm:py-24">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.04] text-4xl">
              🔬
            </div>
            <p className="text-sm text-white/40">Enter a research topic above to get started</p>
            <p className="mt-2 text-xs text-white/20">Powered by gpt-4o-mini · Tavily · pgvector</p>
          </div>
        )}
      </main>
    </div>
  );
}
