import * as lancedb from "@lancedb/lancedb";
import { TABLE_NAME, TOP_K, VECTOR_DB_DIR } from "./config";

export type Chunk = {
  id: string;
  source: string; // path relative to HOWTO_DIR
  folder: string; // top-level folder ("" for files in the root)
  title: string;
  location: string; // heading path or "page N"
  text: string;
};

export type ChunkRow = Chunk & { vector: number[] };
export type SearchHit = Chunk & { score: number };

export async function replaceAll(rows: ChunkRow[]) {
  const db = await lancedb.connect(VECTOR_DB_DIR);
  await db.createTable(TABLE_NAME, rows, { mode: "overwrite" });
}

export async function search(vector: number[], k = TOP_K): Promise<SearchHit[]> {
  const db = await lancedb.connect(VECTOR_DB_DIR);
  const names = await db.tableNames();
  if (!names.includes(TABLE_NAME)) {
    throw new Error("Vector database is empty. Run `npm run ingest` first.");
  }
  const table = await db.openTable(TABLE_NAME);
  const vectorField = (await table.schema()).fields.find((f) => f.name === "vector");
  const storedDim = (vectorField?.type as { listSize?: number } | undefined)?.listSize;
  if (storedDim && storedDim !== vector.length) {
    throw new Error(
      `The vector database was built with a different embedding model (${storedDim} dims, current model gives ${vector.length}). Run \`npm run ingest\`.`,
    );
  }
  const rows = await table.vectorSearch(vector).distanceType("cosine").limit(k).toArray();
  return rows.map((r) => ({
    id: r.id,
    source: r.source,
    folder: r.folder,
    title: r.title,
    location: r.location,
    text: r.text,
    score: 1 - r._distance,
  }));
}
