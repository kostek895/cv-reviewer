import { deleteJob, getJob, updateJob } from "@/lib/store";
import type { Job } from "@/lib/types";

const EDITABLE: (keyof Job)[] = ["title", "company", "status", "notes", "postingText", "userNotes", "analysis", "cv", "coverLetter", "url"];

export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return Response.json({ error: "Nie znaleziono" }, { status: 404 });
  return Response.json(job);
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  const patch = (await req.json()) as Partial<Job> & { clearTaskError?: boolean };
  const job = await updateJob(id, (j) => {
    for (const k of EDITABLE) if (k in patch) (j as unknown as Record<string, unknown>)[k] = patch[k];
    if ("cv" in patch) j.pdf = undefined; // CV zmienione – stary PDF nieaktualny
    if (patch.clearTaskError && j.task?.status === "error") j.task = undefined;
  });
  return Response.json(job);
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  await deleteJob(id);
  return Response.json({ ok: true });
}
