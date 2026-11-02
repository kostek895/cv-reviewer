import { promises as fs } from "fs";
import path from "path";
import { getJob, jobDir } from "@/lib/store";

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export async function GET(req: Request, ctx: RouteContext<"/api/jobs/[id]/pdf">) {
  const { id } = await ctx.params;
  const job = await getJob(id);
  if (!job?.pdf || !job.cv) return new Response("Najpierw wygeneruj PDF", { status: 404 });
  const data = await fs.readFile(path.join(jobDir(id), job.pdf.file));
  const name = `CV-${slug(job.cv.name)}${job.company ? "-" + slug(job.company) : ""}.pdf`;
  const inline = new URL(req.url).searchParams.has("inline");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name}"`,
    },
  });
}
