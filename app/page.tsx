"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

type Source = { index: number; source: string; title: string; location: string; score: number };
type Msg = { role: "user" | "assistant"; content: string; sources?: Source[]; error?: string };

const SUGGESTIONS = [
  { title: "Hur lagar jag stark kyckling?", sub: "Steg för steg" },
  { title: "Vad ska jag förbereda kvällen innan?", sub: "Inför middagen" },
];

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" />
    </svg>
  );
}
function NewChatIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function DocIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z M14 3v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function Sources({ sources, content }: { sources: Source[]; content: string }) {
  // Show only the documents the answer cites ([1], [2]…); if it cites none, show the best match.
  const cited = new Set([...content.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const shown = cited.size ? sources.filter((s) => cited.has(s.index)) : sources.slice(0, 1);
  // One chip per file/location, in retrieval order.
  const seen = new Set<string>();
  const unique = shown.filter((s) => {
    const key = `${s.source}|${s.location}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <div className="sources">
      {unique.map((s) => (
        <span key={s.index} className="chip" title={`${s.title} · relevance ${s.score}`}>
          <DocIcon />
          <span className="chip-name">{s.source.split("/").pop()}</span>
          {s.location && <span className="chip-loc">{s.location}</span>}
        </span>
      ))}
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  busy,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  busy: boolean;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy) onStop();
        else onSubmit();
      }}
    >
      <textarea
        ref={ref}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!busy) onSubmit();
          }
        }}
        placeholder="Ask anything about your HOWTOs"
        rows={1}
        aria-label="Message"
      />
      <button
        type="submit"
        className="send"
        disabled={!busy && !value.trim()}
        aria-label={busy ? "Stop generating" : "Send message"}
      >
        {busy ? <StopIcon /> : <SendIcon />}
      </button>
    </form>
  );
}

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function reset() {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history: Msg[] = [...messages, { role: "user", content: q }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const update = (fn: (m: Msg) => Msg) =>
      setMessages((prev) => (prev.length ? [...prev.slice(0, -1), fn(prev[prev.length - 1])] : prev));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        // Only send successful turns back as history.
        body: JSON.stringify({
          messages: history.filter((m) => !m.error && m.content).map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok || !res.body) {
        const { error } = await res.json().catch(() => ({ error: res.statusText }));
        update((m) => ({ ...m, error }));
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "sources") update((m) => ({ ...m, sources: ev.sources }));
          else if (ev.type === "text") update((m) => ({ ...m, content: m.content + ev.text }));
          else if (ev.type === "error") update((m) => ({ ...m, error: ev.error }));
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") update((m) => ({ ...m, error: (err as Error).message }));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  const composer = (autoFocus?: boolean) => (
    <Composer
      value={input}
      onChange={setInput}
      onSubmit={() => ask(input)}
      onStop={() => abortRef.current?.abort()}
      busy={busy}
      autoFocus={autoFocus}
    />
  );

  const empty = messages.length === 0;

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">HOWTO Chat</span>
        {!empty && (
          <button className="icon-btn" onClick={reset} aria-label="New chat" title="New chat">
            <NewChatIcon />
          </button>
        )}
      </header>

      {empty ? (
        <main className="welcome">
          <h1>What do you want to know?</h1>
          {composer(true)}
          <div className="suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s.title} className="suggestion" onClick={() => ask(s.title)}>
                <span className="s-title">{s.title}</span>
                <span className="s-sub">{s.sub}</span>
              </button>
            ))}
          </div>
        </main>
      ) : (
        <>
          <main className="thread">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="row user">
                  <div className="bubble">{m.content}</div>
                </div>
              ) : (
                <div key={i} className="row assistant">
                  {m.content ? (
                    <div className="markdown">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                  ) : (
                    !m.error && <span className="pulse" aria-label="Generating" />
                  )}
                  {m.error && <div className="error">{m.error}</div>}
                  {m.sources && m.sources.length > 0 && m.content && <Sources sources={m.sources} content={m.content} />}
                </div>
              ),
            )}
            <div ref={bottomRef} />
          </main>
          <footer className="dock">
            {composer()}
            <p className="hint">Answers come from your HOWTO documents via a local model. Check important details.</p>
          </footer>
        </>
      )}
    </div>
  );
}
