import { Ollama } from "ollama";
import { OLLAMA_EMBED_MODEL, OLLAMA_HOST } from "./config";

const ollama = new Ollama({ host: OLLAMA_HOST });

// bge-m3 needs no query/passage prefixes; Ollama returns L2-normalized vectors.
async function embed(input: string[]): Promise<number[][]> {
  try {
    const res = await ollama.embed({ model: OLLAMA_EMBED_MODEL, input, truncate: true });
    return res.embeddings;
  } catch (err) {
    const e = err as Error & { status_code?: number };
    if (e.status_code === 404) {
      throw new Error(`Embedding model "${OLLAMA_EMBED_MODEL}" isn't installed. Run \`ollama pull ${OLLAMA_EMBED_MODEL}\`.`);
    }
    if (/fetch failed|ECONNREFUSED/i.test(e.message)) {
      throw new Error(`Can't reach Ollama at ${OLLAMA_HOST}. Is it running? (\`ollama serve\`)`);
    }
    throw err;
  }
}

export const embedPassages = (texts: string[]) => embed(texts);
export const embedQuery = async (text: string) => (await embed([text]))[0];
