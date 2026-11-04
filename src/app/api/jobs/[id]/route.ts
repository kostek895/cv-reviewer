import { deleteJob, getJob, publicJob, syncJobFacts, updateJob } from "@/lib/store";
import type { Job } from "@/lib/types";

const EDITABLE: (keyof Job)[] = ["title", "company", "status", "notes", "postingText", "userNotes", "analysis", "cv", "coverLetter", "url"];

export async function GET(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job) return Response.json({ error: "Nie znaleziono" }, { status: 404 });
  return Response.json(publicJob(job));
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  const patch = (await req.json()) as Partial<Job> & { clearTaskError?: boolean; cvBase?: string };
  let conflict = false;
  const job = await updateJob(id, (j) => {
    const cvBefore = JSON.stringify(j.cv);
    // edytor wysyła wersję CV, na której pracował – jeśli w międzyczasie CV zmieniło się gdzie indziej
    // (inna karta, Claude), nie nadpisuj go starym stanem
    if ("cv" in patch && patch.cvBase !== undefined && patch.cvBase !== cvBefore) {
      conflict = true;
      return;
    }
    for (const k of EDITABLE) if (k in patch) (j as unknown as Record<string, unknown>)[k] = patch[k];
    if ("cv" in patch && JSON.stringify(j.cv) !== cvBefore) j.pdf = undefined; // CV zmienione – stary PDF nieaktualny
    if (patch.clearTaskError && j.task?.status === "error") j.task = undefined;
  }, "ręczna edycja");
  if (conflict)
    return Response.json(
      { error: "CV zmieniło się w innym miejscu (np. w drugiej karcie), więc nie nadpisałem go. Odśwież stronę – Twoja ostatnia zmiana nie została zapisana." },
      { status: 409 }
    );
  if ("analysis" in patch) await syncJobFacts(job);
  return Response.json(publicJob(job));
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/jobs/[id]">) {
  const { id } = await ctx.params;
  await deleteJob(id);
  return Response.json({ ok: true });
}
