import { promises as fs } from "fs";
import { listSources, saveSources, sourcePath } from "@/lib/store";

export async function GET(_req: Request, ctx: RouteContext<"/api/sources/[id]">) {
  const { id } = await ctx.params;
  const s = (await listSources()).find((x) => x.id === id);
  if (!s) return new Response("Not found", { status: 404 });
  const data = await fs.readFile(sourcePath(id));
  return new Response(data, { headers: { "Content-Type": "application/pdf" } });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/sources/[id]">) {
  const { id } = await ctx.params;
  const sources = await listSources();
  if (!sources.some((s) => s.id === id)) return Response.json({ error: "Nie ma takiego pliku" }, { status: 404 });
  await fs.rm(sourcePath(id), { force: true });
  await saveSources(sources.filter((s) => s.id !== id));
  return Response.json({ ok: true });
}
