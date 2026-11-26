# HOWTO Chat

Ask questions about the team's HOWTO documents. Documents are split into chunks, embedded with `bge-m3` (multilingual, via Ollama) and stored in a local
vector database (LanceDB). Each question retrieves the closest chunks and a local LLM served by Ollama answers from
them with citations. Everything runs on your machine: no API keys.

```
howto/ ──► npm run ingest ──► chunks ──► embeddings (Ollama bge-m3) ──► LanceDB (./data)
                                                                                              │
Chat UI ──► /api/chat ──► embed question ──► top-6 chunks ──► Ollama (qwen3.5:4b) ──► streamed answer + sources
```

## Setup

```bash
npm install
ollama pull qwen3.5:4b       # chat model, any Ollama chat model works (OLLAMA_MODEL)
ollama pull bge-m3           # embedding model (OLLAMA_EMBED_MODEL)
cp .env.example .env.local
npm run ingest               # (re)build the vector DB from HOWTO_DIR
npm run dev                  # http://localhost:3000
```

- Documents live in [`howto/`](howto/) in this repo. Add them there in any folder structure and commit them with the code.
  `HOWTO_DIR` in `.env.local` can point somewhere else if needed.
- Supported: `.md`, `.markdown`, `.txt`, `.pdf`.
  Other files (e.g. `.pages`) are skipped and listed in the ingest output.
- Re-run `npm run ingest` whenever the documents change. It rebuilds the table from scratch.
- `npm run search -- "din fråga"` shows which chunks a question retrieves (no LLM call).

## Files

- `scripts/ingest.mts`: walks the folder, extracts text (PDF via unpdf), chunks, embeds, writes LanceDB
- `lib/chunk.ts`: markdown is split by heading, long sections into ~1500-char windows
- `lib/embed.ts`: embeddings via Ollama (`bge-m3`). After changing the embedding model, re-run `npm run ingest`
- `lib/store.ts`: LanceDB read/write
- `app/api/chat/route.ts`: retrieval + Ollama streaming (NDJSON: `sources`, `text`, `error` events)
- `app/page.tsx`: chat UI
