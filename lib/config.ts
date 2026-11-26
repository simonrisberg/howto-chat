import os from "node:os";
import path from "node:path";

function expandHome(p: string): string {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

// The HOWTO documents live in the repo by default; override to read from somewhere else.
export const HOWTO_DIR = path.resolve(expandHome(process.env.HOWTO_DIR ?? "./howto"));
export const VECTOR_DB_DIR = path.resolve(expandHome(process.env.VECTOR_DB_DIR ?? "./data/lancedb"));
export const TABLE_NAME = "howto_chunks";

// Everything model-related is served by Ollama (`ollama list` shows what's installed).
export const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";

// Multilingual embedding model (Swedish + English). Changing it requires `npm run ingest`.
export const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "bge-m3";

// Chat model.
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "qwen3.5:4b";
// Thinking makes qwen slower but sometimes more careful. "true"/"false".
export const OLLAMA_THINK = process.env.OLLAMA_THINK === "true";
// Context window for the chat model; must fit the system prompt + retrieved chunks + history.
export const OLLAMA_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX ?? 8192);
export const TOP_K = 6;
