import { getJob } from "@/lib/store";
import { restoreCv } from "@/lib/tasks";

/** Lista poprzednich wersji CV (najnowsza pierwsza). */
export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]/history">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return Response.json({ error: "Nie znaleziono" }, { status: 404 });
  return Response.json([...(job.cvHistory ?? [])].reverse());
}

/** Przywróć wersję. Body: { at: string } */
export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[id]/history">) {
  const { id } = await ctx.params;
  const { at } = (await req.json()) as { at?: string };
  const job = await getJob(id);
  if (!job) return Response.json({ error: "Nie znaleziono" }, { status: 404 });
  if (job.task?.status === "running") return Response.json({ error: "Poczekaj, aż Claude skończy" }, { status: 409 });
  if (!at) return Response.json({ error: "Złe dane" }, { status: 400 });
  try {
    await restoreCv(id, at);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
}
