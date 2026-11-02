import { getFacts, updateFacts } from "@/lib/store";
import type { Fact } from "@/lib/types";

export async function GET() {
  return Response.json(await getFacts());
}

/** Zapisuje całą listę (edycja i usuwanie w Bazie CV). */
export async function PUT(req: Request) {
  const list = (await req.json()) as Fact[];
  if (!Array.isArray(list)) return Response.json({ error: "Złe dane" }, { status: 400 });
  const now = new Date().toISOString();
  const clean = list
    .filter((f) => f && typeof f.key === "string" && typeof f.question === "string" && typeof f.answer === "string")
    .map((f) => ({ key: f.key, question: f.question, answer: f.answer, source: String(f.source ?? ""), updatedAt: f.updatedAt || now }));
  return Response.json(await updateFacts(() => clean));
}
