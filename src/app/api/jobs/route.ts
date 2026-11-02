import { listJobs, newId, saveJob } from "@/lib/store";
import { doFetch, startJobTask } from "@/lib/tasks";
import type { Job } from "@/lib/types";

export async function GET() {
  const jobs = await listJobs();
  // lista nie potrzebuje pełnych treści
  return Response.json(
    jobs.map(({ postingText: _p, analysis, cv: _c, coverLetter: _l, cvScore, ...rest }) => {
      void _p;
      void _c;
      void _l;
      return { ...rest, fitScore: analysis?.fitScore, cvScore: cvScore?.score, hasPosting: !!_p, analyzed: !!analysis };
    })
  );
}

export async function POST(req: Request) {
  const { url = "", text = "" } = (await req.json()) as { url?: string; text?: string };
  if (!url.trim() && !text.trim()) return Response.json({ error: "Podaj link albo treść ogłoszenia" }, { status: 400 });
  if (url.trim()) {
    try {
      const u = new URL(url.trim());
      if (!/^https?:$/.test(u.protocol)) throw new Error();
    } catch {
      return Response.json({ error: "To nie wygląda na poprawny link" }, { status: 400 });
    }
  }
  const now = new Date().toISOString();
  const job: Job = {
    id: newId(),
    url: url.trim(),
    title: "",
    company: "",
    createdAt: now,
    updatedAt: now,
    status: "nowa",
    notes: "",
    postingText: text.trim(),
    userNotes: "",
  };
  await saveJob(job);
  if (job.url && !job.postingText) await startJobTask(job.id, "fetch", () => doFetch(job.id));
  return Response.json(job);
}
