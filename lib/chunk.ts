const MAX_CHARS = 1500;
const OVERLAP = 200;

/** Split long text into overlapping windows, preferring paragraph/sentence boundaries. */
export function window(text: string): string[] {
  const clean = text.replace(/\n{3,}/g, "\n\n").trim();
  if (clean.length <= MAX_CHARS) return clean ? [clean] : [];
  const out: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + MAX_CHARS, clean.length);
    if (end < clean.length) {
      const slice = clean.slice(start, end);
      const cut = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "));
      if (cut > MAX_CHARS * 0.5) end = start + cut + 1;
    }
    out.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - OVERLAP;
  }
  return out;
}

export type Section = { location: string; text: string };

/** Split markdown by headings, keeping the heading path as location. */
export function splitMarkdown(md: string): { title: string | null; sections: Section[] } {
  const lines = md.split("\n");
  const stack: string[] = [];
  const sections: Section[] = [];
  let buf: string[] = [];
  let title: string | null = null;
  let inFence = false;

  const flush = () => {
    const text = buf.join("\n").trim();
    if (text) for (const w of window(text)) sections.push({ location: stack.join(" › "), text: w });
    buf = [];
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const m = !inFence && /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      const level = m[1].length;
      const heading = m[2].trim();
      if (level === 1 && !title) title = heading;
      stack.length = level - 1;
      stack[level - 1] = heading;
      buf.push(line);
    } else {
      buf.push(line);
    }
  }
  flush();
  return { title, sections };
}
