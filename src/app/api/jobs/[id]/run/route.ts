import { getJob } from "@/lib/store";
import { doAnalyze, doFetch, doImprove, doPdf, doRefine, doRewrite, doScore, doTailor, startJobTask, type RewriteTarget } from "@/lib/tasks";

type Body =
  | { action: "fetch" | "analyze" | "tailor" | "pdf" | "score" }
  | { action: "rewrite"; target: RewriteTarget; instruction?: string }
  | { action: "improve"; target?: number }
  | { action: "refine"; changeId: string; comment: string };

export async function POST(req: Request, ctx: RouteContext<"/api/jobs/[id]/run">) {
  const { id } = await ctx.params;
  const body = (await req.json()) as Body;
  const job = await getJob(id);
  if (!job) return Response.json({ error: "Nie znaleziono" }, { status: 404 });
  const origin = new URL(req.url).origin;

  try {
    switch (body.action) {
      case "fetch":
        if (!job.url) throw new Error("Ta oferta nie ma linku");
        await startJobTask(id, "fetch", () => doFetch(id));
        break;
      case "analyze":
        if (!job.postingText.trim()) throw new Error("Brak treści ogłoszenia");
        await startJobTask(id, "analyze", () => doAnalyze(id));
        break;
      case "tailor":
        await startJobTask(id, "tailor", () => doTailor(id));
        break;
      case "rewrite":
        await startJobTask(id, "rewrite", () => doRewrite(id, body.target, body.instruction ?? ""));
        break;
      case "score":
        if (!job.cv || !job.analysis) throw new Error("Najpierw napisz CV");
        await startJobTask(id, "score", () => doScore(id));
        break;
      case "improve": {
        if (!job.cv || !job.analysis) throw new Error("Najpierw napisz CV");
        const target = Math.min(100, Math.max(50, Math.round(Number(body.target) || 100)));
        await startJobTask(id, "improve", () => doImprove(id, target));
        break;
      }
      case "refine":
        if (!body.comment?.trim()) throw new Error("Napisz, co poprawić");
        await startJobTask(id, "refine", () => doRefine(id, body.changeId, body.comment.trim()));
        break;
      case "pdf":
        await startJobTask(id, "pdf", () => doPdf(id, origin));
        break;
      default:
        throw new Error("Nieznana akcja");
    }
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  return Response.json({ ok: true });
}
