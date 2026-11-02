import { getProfileTask, setProfileTask } from "@/lib/store";

export async function GET() {
  return Response.json(await getProfileTask());
}

export async function DELETE() {
  await setProfileTask(null);
  return Response.json({ ok: true });
}
