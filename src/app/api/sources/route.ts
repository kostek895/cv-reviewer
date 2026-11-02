import { promises as fs } from "fs";
import { SOURCES_DIR, listSources, newId, saveSources, sourcePath } from "@/lib/store";

export async function GET() {
  return Response.json(await listSources());
}

export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return Response.json({ error: "Brak plików" }, { status: 400 });
  await fs.mkdir(SOURCES_DIR, { recursive: true });
  const sources = await listSources();
  const added = [];
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith(".pdf")) continue;
    const id = newId();
    await fs.writeFile(sourcePath(id), Buffer.from(await f.arrayBuffer()));
    const s = { id, fileName: f.name, uploadedAt: new Date().toISOString() };
    sources.push(s);
    added.push(s);
  }
  await saveSources(sources);
  return Response.json(added);
}
