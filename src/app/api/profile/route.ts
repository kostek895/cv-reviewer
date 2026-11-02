import { getProfile, saveProfile } from "@/lib/store";
import type { Profile } from "@/lib/types";

export async function GET() {
  return Response.json(await getProfile());
}

export async function PUT(req: Request) {
  const body = (await req.json()) as Profile;
  return Response.json(await saveProfile(body));
}
