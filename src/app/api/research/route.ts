import { NextRequest } from "next/server";
import { researchGraph } from "@/graph";
import { ResearchRequestSchema } from "@/schemas/research";

// ─── Why Server-Sent Events (SSE) instead of regular JSON? ──────────────────
//
// A research run takes 30–90 seconds. With regular POST → JSON response:
//   - The browser shows a loading spinner for 90 seconds
//   - If the connection drops, you lose everything
//   - Users have no idea what's happening
//
// With SSE:
//   - We stream progress events as each agent finishes
//   - The browser updates in real time: "Researching... Synthesizing... Done"
//   - One-directional: server → browser (unlike WebSockets, no browser→server)
//   - Built into every browser, no library needed on the client
//
// SSE format: each event is a line starting with "data: " followed by JSON,
// terminated by two newlines (\n\n).
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── 1. Validate the request body ─────────────────────────────────────────
  const body = await req.json();
  const parsed = ResearchRequestSchema.safeParse(body);

  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: parsed.error.flatten() }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { query, depth } = parsed.data;

  // ── 2. Create a streaming response ───────────────────────────────────────
  // ReadableStream lets us push data to the browser incrementally.
  // The controller.enqueue() calls happen asynchronously as the graph runs.
  const stream = new ReadableStream({
    async start(controller) {
      // Helper to send an SSE event — keeps the format consistent
      const sendEvent = (type: string, data: unknown) => {
        const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
        // SSE format: "data: {json}\n\n"
        controller.enqueue(new TextEncoder().encode(`data: ${payload}\n\n`));
      };

      try {
        sendEvent("status", { message: "Starting research..." });

        // ── 3. Stream the graph execution ─────────────────────────────────
        // .streamEvents() runs the graph and emits events after each node completes.
        // We iterate over those events and forward relevant ones to the browser.
        const eventStream = researchGraph.streamEvents(
          {
            query,
            messages: [],
            searchResults: [],
            ragContext: [],
            finalReport: undefined,
            iterationCount: 0,
          },
          {
            version: "v2",
            // configurable: { depth } // pass depth to nodes if needed later
          }
        );

        for await (const event of eventStream) {
          // LangGraph emits many internal events — we only forward node completions
          if (event.event === "on_chain_end" && event.name) {
            const nodeName = event.name;

            if (nodeName === "researcher") {
              sendEvent("agent_done", { agent: "researcher", message: "Research complete. Synthesizing..." });
            }
            if (nodeName === "synthesizer") {
              sendEvent("agent_done", { agent: "synthesizer", message: "Report drafted. Reviewing quality..." });
            }
            if (nodeName === "critic") {
              const output = event.data?.output;
              const lastMsg = output?.messages?.[output.messages.length - 1];
              const approved = lastMsg?.content?.startsWith("Approved");

              sendEvent("agent_done", {
                agent: "critic",
                message: approved ? "Report approved!" : "Requesting improvements...",
                approved,
              });
            }
          }
        }

        // ── 4. Get the final state and send the report ────────────────────
        // After streamEvents completes, invoke once more to get final state.
        // Why? streamEvents doesn't return final state directly.
        const finalState = await researchGraph.invoke({
          query,
          messages: [],
          searchResults: [],
          ragContext: [],
          finalReport: undefined,
          iterationCount: 0,
        });

        sendEvent("done", {
          report: finalState.finalReport,
          iterationCount: finalState.iterationCount,
        });

      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        sendEvent("error", { message });
      } finally {
        // Always close the stream — without this the browser hangs forever
        controller.close();
      }
    },
  });

  // ── 5. Return with SSE headers ────────────────────────────────────────────
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",  // SSE must never be cached
      "Connection": "keep-alive",   // keep the HTTP connection open
      "X-Accel-Buffering": "no",    // disable nginx buffering (common gotcha in prod)
    },
  });
}
