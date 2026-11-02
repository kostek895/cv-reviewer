import { getProfileTask, listSources } from "@/lib/store";
import { startImport } from "@/lib/tasks";

export async function POST(req: Request) {
  const { ids } = (await req.json()) as { ids?: string[] };
  const sources = await listSources();
  const valid = (ids?.length ? ids : sources.map((s) => s.id)).filter((id) => sources.some((s) => s.id === id));
  if (!valid.length) return Response.json({ error: "Najpierw wgraj CV w PDF" }, { status: 400 });
  if ((await getProfileTask())?.status === "running") return Response.json({ error: "Import już trwa" }, { status: 409 });
  await startImport(valid);
  return Response.json({ ok: true });
}
