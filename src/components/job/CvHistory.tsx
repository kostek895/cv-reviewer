"use client";

import { useState } from "react";
import { api, Section, Spinner } from "@/components/ui";
import type { CvVersion, TailoredCv } from "@/lib/types";

/** Które części CV różnią się między wersjami – krótki opis dla listy. */
function diffLabels(a: TailoredCv, b: TailoredCv) {
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  const out: string[] = [];
  if (!same(a.headline, b.headline)) out.push("Tytuł");
  if (!same(a.summary, b.summary)) out.push("O mnie");
  if (!same(a.contact, b.contact) || a.name !== b.name) out.push("Kontakt");
  const n = Math.max(a.experience.length, b.experience.length);
  for (let i = 0; i < n; i++)
    if (!same(a.experience[i], b.experience[i])) out.push(a.experience[i]?.company || b.experience[i]?.company || `stanowisko ${i + 1}`);
  if (!same(a.skills, b.skills)) out.push("Umiejętności");
  if (!same(a.courses, b.courses)) out.push("Kursy");
  if (!same(a.education, b.education)) out.push("Wykształcenie");
  if (!same(a.languages, b.languages)) out.push("Języki");
  if (a.gdpr !== b.gdpr) out.push("RODO");
  if (a.accent !== b.accent || a.showPhoto !== b.showPhoto) out.push("Wygląd");
  return out;
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("pl-PL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** Historia wersji CV z przywracaniem – zabezpieczenie przed przypadkowym nadpisaniem. */
export function CvHistory({
  jobId,
  cv,
  running,
  beforeRestore,
  onRestored,
}: {
  jobId: string;
  cv: TailoredCv;
  running: boolean;
  beforeRestore: () => Promise<void>;
  onRestored: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<CvVersion[] | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      setList(await api<CvVersion[]>(`/api/jobs/${jobId}/history`));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function restore(at: string) {
    setBusy(at);
    setError("");
    try {
      await beforeRestore(); // najpierw zapisz to, co jest w edytorze – trafi do historii
      await api(`/api/jobs/${jobId}/history`, { method: "POST", json: { at } });
      await onRestored();
    } catch (e) {
      setError((e as Error).message);
      setBusy("");
    }
  }

  return (
    <Section
      title="Historia wersji CV"
      actions={
        <button
          className="btn btn-sm"
          onClick={() => {
            if (!open) load();
            setOpen((v) => !v);
          }}
        >
          {open ? "Zwiń" : "Pokaż"}
        </button>
      }
    >
      <p className="text-xs leading-relaxed text-muted">
        Przed każdą zmianą CV (Twoją albo Claude’a) zapisuję poprzednią wersję. Jeśli coś nadpisze się przez przypadek, przywróć wersję sprzed
        tej zmiany. Obecna wersja też trafi do historii, więc zawsze da się wrócić.
      </p>
      {open ? (
        <div className="mt-3">
          {error ? <p className="mb-2 text-sm font-semibold text-rose-600">{error}</p> : null}
          {!list ? (
            <p className="text-sm text-muted">
              <Spinner className="size-3" /> Wczytuję…
            </p>
          ) : !list.length ? (
            <p className="text-sm text-muted">Na razie brak zapisanych wersji – pojawią się po pierwszej zmianie CV.</p>
          ) : (
            <ul className="grid gap-1.5">
              {list.map((v) => {
                const diff = diffLabels(v.cv, cv);
                return (
                  <li key={v.at} className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p>
                        <span className="font-bold">{fmt(v.at)}</span> <span className="text-muted">· wersja sprzed: {v.source}</span>
                      </p>
                      <p className="text-xs text-muted">{diff.length ? `Inaczej niż teraz: ${diff.join(", ")}` : "Taka sama jak obecna"}</p>
                    </div>
                    <button className="btn btn-sm" disabled={running || !!busy || !diff.length} onClick={() => restore(v.at)}>
                      {busy === v.at ? <Spinner className="size-3" /> : null}
                      Przywróć
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </Section>
  );
}
