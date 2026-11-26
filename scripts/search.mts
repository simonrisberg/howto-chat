// Debug helper: npm run search -- "din fråga"
import { config } from "dotenv";
config({ path: [".env.local", ".env"], quiet: true });
import { embedQuery } from "../lib/embed";
import { search } from "../lib/store";

const q = process.argv.slice(2).join(" ");
const hits = await search(await embedQuery(q));
for (const h of hits) console.log(`${h.score.toFixed(3)}  ${h.source} [${h.location}]  ${h.text.slice(0, 80).replace(/\n/g, " ")}…`);
