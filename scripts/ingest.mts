import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import fs from "node:fs/promises";
import path from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import { HOWTO_DIR } from "../lib/config";
import { splitMarkdown, window, type Section } from "../lib/chunk";
import { embedPassages } from "../lib/embed";
import { replaceAll, type Chunk, type ChunkRow } from "../lib/store";

const SUPPORTED = new Set([".md", ".markdown", ".txt", ".pdf"]);

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}

async function readSections(file: string): Promise<{ title: string | null; sections: Section[] }> {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(await fs.readFile(file)));
    const { text: pages } = await extractText(pdf, { mergePages: false });
    const sections: Section[] = [];
    pages.forEach((p, i) => window(p).forEach((t) => sections.push({ location: `page ${i + 1}`, text: t })));
    const firstLine = pages[0]?.split("\n").find((l) => l.trim())?.trim() ?? null;
    return { title: firstLine, sections };
  }
  const raw = await fs.readFile(file, "utf8");
  return ext === ".txt" ? { title: null, sections: window(raw).map((t) => ({ location: "", text: t })) } : splitMarkdown(raw);
}

async function main() {
  console.log(`Ingesting from ${HOWTO_DIR}`);
  const chunks: Chunk[] = [];
  const skipped: string[] = [];

  for await (const file of walk(HOWTO_DIR)) {
    const rel = path.relative(HOWTO_DIR, file);
    if (!SUPPORTED.has(path.extname(file).toLowerCase())) {
      skipped.push(rel);
      continue;
    }
    const { title, sections } = await readSections(file);
    const docTitle = title ?? path.basename(file, path.extname(file));
    const folder = rel.includes(path.sep) ? rel.split(path.sep)[0] : "";
    sections.forEach((s, i) =>
      chunks.push({ id: `${rel}#${i}`, source: rel, folder, title: docTitle, location: s.location, text: s.text }),
    );
    console.log(`  ${rel}: ${sections.length} chunk(s)`);
  }

  if (skipped.length) console.log(`Skipped unsupported files: ${skipped.join(", ")}`);
  if (!chunks.length) throw new Error("No supported documents found.");

  // Prefix the doc title so each chunk carries its context into the embedding.
  const rows: ChunkRow[] = [];
  const BATCH = 16;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const vectors = await embedPassages(batch.map((c) => `${c.title}\n${c.location}\n${c.text}`));
    batch.forEach((c, j) => rows.push({ ...c, vector: vectors[j] }));
  }

  await replaceAll(rows);
  console.log(`Stored ${rows.length} chunks from ${new Set(rows.map((r) => r.source)).size} file(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
