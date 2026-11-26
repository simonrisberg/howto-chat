import { Ollama, type Message } from "ollama";
import { OLLAMA_HOST, OLLAMA_MODEL, OLLAMA_NUM_CTX, OLLAMA_THINK } from "@/lib/config";
import { embedQuery } from "@/lib/embed";
import { search, type SearchHit } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ollama = new Ollama({ host: OLLAMA_HOST });

const SYSTEM = `You are the HOWTO assistant for a team. You answer questions using the team's HOWTO documents.

Each user turn includes <documents> retrieved from the HOWTO collection by search. Some of them may be irrelevant to the question.
- Base your answer only on those documents. If they don't contain the answer, say so plainly and don't guess.
- Cite the documents you used inline, like [1] or [2], matching the document index.
- Keep steps, quantities, warnings and the order of instructions exactly as the documents state them.
- Answer in the same language as the user's question.
- Use short markdown: numbered lists for steps, bold for warnings.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

function formatDocs(hits: SearchHit[]): string {
  return hits
    .map(
      (h, i) =>
        `<document index="${i + 1}" source="${h.source}" title="${h.title}"${h.location ? ` location="${h.location}"` : ""}>\n${h.text}\n</document>`,
    )
    .join("\n");
}

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: ChatMessage[] };
  const last = messages.at(-1);
  if (!last || last.role !== "user" || !last.content.trim()) {
    return Response.json({ error: "Last message must be a non-empty user message." }, { status: 400 });
  }

  // Include the previous user question so follow-ups like "and how long does it boil?" still retrieve well.
  const prevUser = messages.slice(0, -1).findLast((m) => m.role === "user")?.content ?? "";
  let hits: SearchHit[];
  try {
    hits = await search(await embedQuery(`${prevUser}\n${last.content}`.trim()));
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }

  // Earlier turns go through as plain text; only the newest turn carries retrieved documents.
  const chatMessages: Message[] = [
    { role: "system", content: SYSTEM },
    ...messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: `<documents>\n${formatDocs(hits)}\n</documents>\n\nQuestion: ${last.content}` },
  ];

  const sources = hits.map((h, i) => ({
    index: i + 1,
    source: h.source,
    title: h.title,
    location: h.location,
    score: Number(h.score.toFixed(3)),
  }));

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      send({ type: "sources", sources });
      try {
        const stream = await ollama.chat({
          model: OLLAMA_MODEL,
          messages: chatMessages,
          stream: true,
          think: OLLAMA_THINK,
          options: { num_ctx: OLLAMA_NUM_CTX, temperature: 0.2 },
        });
        req.signal.addEventListener("abort", () => stream.abort());
        for await (const part of stream) {
          if (part.message.content) send({ type: "text", text: part.message.content });
        }
      } catch (err) {
        const e = err as Error & { cause?: { code?: string }; status_code?: number };
        const msg =
          e.cause?.code === "ECONNREFUSED" || /fetch failed/i.test(e.message)
            ? `Can't reach Ollama at ${OLLAMA_HOST}. Is it running? (\`ollama serve\`)`
            : e.status_code === 404
              ? `Model "${OLLAMA_MODEL}" isn't installed. Run \`ollama pull ${OLLAMA_MODEL}\` or set OLLAMA_MODEL.`
              : `Ollama error: ${e.message}`;
        if (e.name !== "AbortError") send({ type: "error", error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
