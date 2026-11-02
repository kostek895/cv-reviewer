"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, Badge, fitTone, Spinner } from "@/components/ui";
import type { Job, Profile } from "@/lib/types";

type JobRow = Omit<Job, "postingText" | "analysis" | "cv" | "coverLetter"> & {
  fitScore?: number;
  cvScore?: number;
  hasPosting?: boolean;
  analyzed?: boolean;
};

const STATUS_TONE: Record<string, "gray" | "blue" | "green" | "amber" | "red"> = {
  nowa: "gray",
  "w przygotowaniu": "blue",
  wysłana: "amber",
  rozmowa: "green",
  oferta: "green",
  odmowa: "red",
  odpuszczona: "gray",
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [hasProfile, setHasProfile] = useState(true);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [pasteMode, setPasteMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [added, setAdded] = useState("");

  const load = useCallback(() => api<JobRow[]>("/api/jobs").then(setJobs).catch((e) => setError(e.message)), []);

  useEffect(() => {
    load();
    api<Profile>("/api/profile").then((p) => setHasProfile(p.experience.length > 0));
  }, [load]);

  // odświeżaj listę, dopóki jakaś oferta się pobiera
  const anyRunning = jobs?.some((j) => j.task?.status === "running") ?? false;
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [anyRunning, load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setAdded("");
    // można wkleić kilka linków naraz (oddzielonych spacją lub nową linią)
    const links = pasteMode && text.trim() ? [url.trim()] : url.split(/\s+/).filter(Boolean);
    let ok = 0;
    const failed: string[] = [];
    const failedLinks: string[] = [];
    for (const link of links.length ? links : [""]) {
      try {
        await api<Job>("/api/jobs", { method: "POST", json: { url: link, text: pasteMode ? text : "" } });
        ok++;
      } catch (err) {
        failed.push(`${link || "treść"}: ${(err as Error).message}`);
        failedLinks.push(link);
      }
    }
    if (ok) {
      setAdded(ok === 1 ? "Dodano ofertę. Analizę uruchomisz, gdy otworzysz ofertę." : `Dodano ${ok} oferty. Analizę uruchomisz w każdej z osobna.`);
      setUrl(failedLinks.join(" "));
      setText("");
      setPasteMode(false);
    }
    if (failed.length) setError(failed.join(" · "));
    await load();
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-extrabold tracking-tight">Oferty pracy</h1>
      <p className="mt-1 text-muted">Dodawaj oferty na zapas – zapiszą się i pobiorą w tle. Analizę i CV uruchamiasz sam, wchodząc w ofertę.</p>

      {!hasProfile ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Baza CV jest pusta. <Link href="/profil" className="font-bold underline">Wgraj swoje CV</Link>, żeby analiza mogła porównać ofertę z Twoim doświadczeniem.
        </div>
      ) : null}

      <form onSubmit={create} className="card mt-6 p-5">
        <div className="flex gap-2">
          <input
            className="input text-[15px]"
            placeholder="Wklej link (albo kilka linków oddzielonych spacją)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoFocus
          />
          <button className="btn btn-primary" disabled={busy || (!url.trim() && !text.trim())}>
            {busy ? <Spinner /> : null} Dodaj ofertę
          </button>
        </div>
        <button type="button" className="mt-3 text-sm font-semibold text-brand" onClick={() => setPasteMode((v) => !v)}>
          {pasteMode ? "Ukryj pole na treść" : "Strona wymaga logowania (np. LinkedIn)? Wklej treść ogłoszenia"}
        </button>
        {pasteMode ? (
          <textarea
            className="input mt-2 min-h-40"
            placeholder="Skopiuj całe ogłoszenie ze strony i wklej tutaj…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        ) : null}
        {added ? <p className="mt-3 text-sm font-semibold text-emerald-700">{added}</p> : null}
        {error ? <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p> : null}
      </form>

      <div className="mt-8">
        {jobs === null ? (
          <p className="text-muted">
            <Spinner /> Wczytuję…
          </p>
        ) : jobs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-6 py-10 text-center text-muted">
            Nie ma jeszcze żadnych ofert. Wklej pierwszy link powyżej.
          </p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link href={`/oferty/${j.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-canvas/60">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{j.title || j.url || "Oferta bez tytułu"}</p>
                    <p className="truncate text-sm text-muted">
                      {j.company || (j.url ? new URL(j.url).hostname.replace(/^www\./, "") : "wklejona treść")}
                      {" · "}
                      {new Date(j.createdAt).toLocaleDateString("pl-PL")}
                    </p>
                  </div>
                  {j.task?.status === "running" ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-brand">
                      <Spinner className="size-3" /> {j.task.kind === "fetch" ? "pobiera" : "pracuje"}
                    </span>
                  ) : j.fetchError && !j.hasPosting ? (
                    <Badge tone="red">nie udało się pobrać</Badge>
                  ) : j.hasPosting && !j.analyzed ? (
                    <Badge tone="blue">czeka na analizę</Badge>
                  ) : null}
                  {j.cvScore !== undefined ? (
                    <Badge tone={fitTone(j.cvScore)}>
                      {j.fitScore !== undefined ? `${j.fitScore}% → ` : ""}
                      {j.cvScore}% dopasowania
                    </Badge>
                  ) : j.fitScore !== undefined ? (
                    <Badge tone={fitTone(j.fitScore)}>{j.fitScore}% dopasowania</Badge>
                  ) : null}
                  <Badge tone={STATUS_TONE[j.status]}>{j.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
