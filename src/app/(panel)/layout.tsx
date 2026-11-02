import type { Metadata } from "next";
import Link from "next/link";
import "../globals.css";

export const metadata: Metadata = {
  title: "CV Reviewer",
  description: "Dopasowywanie CV do ofert pracy",
};

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <header className="sticky top-0 z-20 border-b border-line bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-8 px-6">
            <Link href="/" className="text-[15px] font-extrabold tracking-tight">
              CV<span className="text-brand">Reviewer</span>
            </Link>
            <nav className="flex gap-1 text-sm font-semibold">
              <Link href="/" className="rounded-md px-3 py-1.5 hover:bg-canvas">
                Oferty
              </Link>
              <Link href="/profil" className="rounded-md px-3 py-1.5 hover:bg-canvas">
                Baza CV
              </Link>
            </nav>
          </div>
        </header>
        <div className="mx-auto max-w-[1500px] px-6 py-8">{children}</div>
      </body>
    </html>
  );
}
