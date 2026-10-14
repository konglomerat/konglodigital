/** Run via the backend Payload CLI. Local only; default is a read-only preview. */
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { WERKBEREICHE } from "../src/lib/werkbereiche.ts";
import { createWerkbereichDraft } from "../src/lib/werkbereich-content.ts";

const database = new URL(process.env.POSTGRES_URL || "postgres://invalid");
if (!["127.0.0.1", "localhost"].includes(database.hostname) || database.pathname !== "/konglo_cms_workareas_local") {
  throw new Error("Dieses Vorbereitungsskript darf nur konglo_cms_workareas_local auf localhost verwenden.");
}
const backendRoot = process.env.PAYLOAD_PROJECT_DIR || process.cwd();
const requireBackend = createRequire(path.join(backendRoot, "package.json"));
const { getPayload } = await import(pathToFileURL(requireBackend.resolve("payload")).href);
const { default: config } = await import(pathToFileURL(path.join(backendRoot, "src/payload.config.ts")).href);
const payload = await getPayload({ config });
try {
  for (const area of WERKBEREICHE) {
    const existing = await payload.find({ collection: "pages", draft: true, depth: 0, limit: 1,
      where: { or: [{ werkbereich: { equals: area.slug } }, { slug: { in: [area.slug, `werkbereich-${area.slug}`, `werkbereiche-${area.slug}`] } }] },
    });
    if (existing.docs.length) { console.log(`Vorhanden: ${area.name}`); continue; }
    if (!process.argv.includes("write")) { console.log(`Würde Entwurf anlegen: ${area.name}`); continue; }
    await payload.create({ collection: "pages", draft: true, context: { disableRevalidate: true }, data: createWerkbereichDraft(area) });
    console.log(`Entwurf angelegt: ${area.name}`);
  }
} finally { await payload.db.destroy(); }
