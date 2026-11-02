import { syncJobFacts, updateJob } from "@/lib/store";

/** Odpowiedzi na pytania z pętli poprawek. Body: { answers: { [questionId]: string } } */
export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[id]/improve-answers">) {
  const { id } = await ctx.params;
  const { answers } = (await req.json()) as { answers?: Record<string, string> };
  if (!answers || typeof answers !== "object") return Response.json({ error: "Złe dane" }, { status: 400 });
  const job = await updateJob(id, (j) => {
    for (const q of j.improve?.questions ?? []) if (q.id in answers) q.answer = String(answers[q.id] ?? "");
  });
  await syncJobFacts(job);
  return Response.json({ ok: true });
}
