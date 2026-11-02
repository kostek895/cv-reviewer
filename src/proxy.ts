import { NextResponse, type NextRequest } from "next/server";

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/**
 * Narzędzie bez logowania – dopuszczamy tylko ruch z tego komputera.
 * Blokuje też inne strony otwarte w przeglądarce (CSRF / DNS rebinding).
 */
export function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (!LOCAL.test(host)) return new NextResponse("Dostęp tylko lokalny", { status: 403 });
  const origin = req.headers.get("origin");
  if (origin && req.method !== "GET" && req.method !== "HEAD") {
    try {
      if (!LOCAL.test(new URL(origin).host)) return new NextResponse("Niedozwolone źródło", { status: 403 });
    } catch {
      return new NextResponse("Niedozwolone źródło", { status: 403 });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
