import { deletePhoto, getPhoto, listJobs, savePhoto, updateJob } from "@/lib/store";

export async function GET() {
  const p = await getPhoto();
  if (!p) return new Response("Brak zdjęcia", { status: 404 });
  return new Response(new Uint8Array(p.data), { headers: { "Content-Type": p.type, "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const f = form.get("file");
  if (!(f instanceof File) || !f.type.startsWith("image/")) return Response.json({ error: "Wybierz obraz" }, { status: 400 });
  await savePhoto(Buffer.from(await f.arrayBuffer()), f.type);
  await invalidatePdfs();
  return Response.json({ ok: true });
}

export async function DELETE() {
  await deletePhoto();
  await invalidatePdfs();
  return Response.json({ ok: true });
}

// gotowe PDF-y mają stare zdjęcie (albo żadnego) – trzeba je wygenerować ponownie
async function invalidatePdfs() {
  for (const j of await listJobs()) if (j.pdf) await updateJob(j.id, (x) => void (x.pdf = undefined));
}
