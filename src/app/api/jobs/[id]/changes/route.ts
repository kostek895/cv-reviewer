import { getJob } from "@/lib/store";
import { decideChange } from "@/lib/tasks";

/** Zostaw albo cofnij automatyczną poprawkę CV. Body: { changeId: string | "all", op: "keep" | "revert" } */
export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[id]/changes">) {
  const { id } = await ctx.params;
  const { changeId, op } = (await req.json()) as { changeId?: string; op?: string };
  const job = await getJob(id);
  if (!job) return Response.json({ error: "Nie znaleziono" }, { status: 404 });
  if (job.task?.status === "running") return Response.json({ error: "Poczekaj, aż Claude skończy" }, { status: 409 });
  if (!changeId || (op !== "keep" && op !== "revert")) return Response.json({ error: "Złe dane" }, { status: 400 });
  try {
    return Response.json(await decideChange(id, changeId, op));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
}
