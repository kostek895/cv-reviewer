"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, Area, Elapsed, Field, LinesArea, Section, Spinner, useDebouncedEffect } from "@/components/ui";
import type { CvSource, Fact, Profile, ProfileExperience, ProfileTask } from "@/lib/types";

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sources, setSources] = useState<CvSource[]>([]);
  const [task, setTask] = useState<ProfileTask | null>(null);
  const [saved, setSaved] = useState<"saved" | "saving" | "dirty">("saved");
  const [photoV, setPhotoV] = useState(0);
  const [hasPhoto, setHasPhoto] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const [p, s, t] = await Promise.all([
      api<Profile>("/api/profile"),
      api<CvSource[]>("/api/sources"),
      api<ProfileTask | null>("/api/profile/task"),
    ]);
    setProfile(p);
    setSources(s);
    setTask(t);
  }, []);

  useEffect(() => {
    load();
    fetch("/api/photo").then((r) => setHasPhoto(r.ok));
  }, [load]);

  // odpytywanie w trakcie importu
  useEffect(() => {
    if (task?.status !== "running") return;
    const t = setInterval(async () => {
      const nt = await api<ProfileTask | null>("/api/profile/task");
      if (nt?.status !== "running") {
        await load();
        setSaved("saved");
      } else setTask(nt);
    }, 2500);
    return () => clearInterval(t);
  }, [task?.status, load]);

  useDebouncedEffect(
    () => {
      if (!profile || saved !== "dirty") return;
      setSaved("saving");
      api("/api/profile", { method: "PUT", json: profile })
        .then(() => setSaved("saved"))
        .catch((e) => setError(e.message));
    },
    [profile]
  );

  const update = (fn: (p: Profile) => void) => {
    setProfile((p) => {
      if (!p) return p;
      const next = structuredClone(p);
      fn(next);
      return next;
    });
    setSaved("dirty");
  };

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    try {
      const added = await api<CvSource[]>("/api/sources", { method: "POST", body: fd });
      setSources((s) => [...s, ...added]);
      if (added.length) await runImport(added.map((a) => a.id));
    } catch (e) {
      setError((e as Error).message);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function runImport(ids?: string[]) {
    setError("");
    try {
      await api("/api/sources/import", { method: "POST", json: { ids } });
      setTask({ kind: "import", status: "running", startedAt: new Date().toISOString() });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removeSource(id: string) {
    await api(`/api/sources/${id}`, { method: "DELETE" });
    setSources((s) => s.filter((x) => x.id !== id));
  }

  async function uploadPhoto(files: FileList | null) {
    if (!files?.[0]) return;
    const fd = new FormData();
    fd.append("file", files[0]);
    if (photoRef.current) photoRef.current.value = ""; // pozwala wybrać ten sam plik jeszcze raz
    setError("");
    try {
      await api("/api/photo", { method: "POST", body: fd });
      setHasPhoto(true);
      setPhotoV((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function removePhoto() {
    await api("/api/photo", { method: "DELETE" });
    setHasPhoto(false);
  }

  if (!profile) {
    return (
      <p className="text-muted">
        <Spinner /> Wczytuję…
      </p>
    );
  }

  const running = task?.status === "running";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Baza CV</h1>
          <p className="mt-1 text-muted">
            Wszystko, co wiadomo o Twoim doświadczeniu. Claude pisze CV tylko na podstawie tych faktów, więc im więcej konkretów (liczby, efekty), tym lepiej.
          </p>
        </div>
        <span className="shrink-0 text-xs font-semibold text-muted">
          {saved === "saving" ? "Zapisuję…" : saved === "dirty" ? "Niezapisane zmiany" : "Zapisano"}
        </span>
      </div>

      {error ? <p className="mt-4 rounded-lg bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}

      <div className="mt-6 grid gap-5 md:grid-cols-[1fr_260px]">
        <Section
          title="Twoje CV (PDF)"
          actions={
            <div className="flex gap-2">
              {sources.length ? (
                <button className="btn btn-sm" disabled={running} onClick={() => runImport()}>
                  Zaimportuj wszystkie ponownie
                </button>
              ) : null}
              <button className="btn btn-sm btn-primary" disabled={running} onClick={() => fileRef.current?.click()}>
                Wgraj PDF
              </button>
            </div>
          }
        >
          <input ref={fileRef} type="file" accept="application/pdf" multiple hidden onChange={(e) => upload(e.target.files)} />
          {running ? (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-brand-soft px-3 py-2 text-sm font-semibold text-brand">
              <Spinner /> Claude czyta CV i uzupełnia bazę… <Elapsed since={task!.startedAt} />
            </div>
          ) : task?.status === "error" ? (
            <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              <b>Import nie powiódł się:</b> {task.error}
            </div>
          ) : null}
          {sources.length === 0 ? (
            <button
              className="w-full rounded-xl border-2 border-dashed border-line px-6 py-10 text-center text-muted hover:border-brand hover:text-brand"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                upload(e.dataTransfer.files);
              }}
            >
              Przeciągnij tutaj CV w PDF (możesz kilka wersji) albo kliknij
            </button>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {sources.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-2">
                  <a href={`/api/sources/${s.id}`} target="_blank" className="flex-1 truncate font-semibold hover:text-brand">
                    {s.fileName}
                  </a>
                  <span className="text-xs text-muted">
                    {s.importedAt ? `zaimportowano ${new Date(s.importedAt).toLocaleDateString("pl-PL")}` : "nie zaimportowano"}
                  </span>
                  <button className="btn btn-ghost btn-sm text-muted" onClick={() => removeSource(s.id)}>
                    Usuń
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Zdjęcie">
          <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => uploadPhoto(e.target.files)} />
          <button
            onClick={() => photoRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              uploadPhoto(e.dataTransfer.files);
            }}
            className="mx-auto block"
            title="Kliknij albo przeciągnij tu zdjęcie"
          >
            {hasPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/photo?v=${photoV}`} alt="Zdjęcie" className="size-32 rounded-full border-4 border-brand object-cover" />
            ) : (
              <span className="flex size-32 items-center justify-center rounded-full border-2 border-dashed border-line text-sm text-muted">
                Dodaj zdjęcie
              </span>
            )}
          </button>
          <div className="mt-3 flex justify-center gap-2">
            <button className="btn btn-sm" onClick={() => photoRef.current?.click()}>
              {hasPhoto ? "Zmień zdjęcie" : "Wgraj zdjęcie"}
            </button>
            {hasPhoto ? (
              <button className="btn btn-ghost btn-sm text-muted" onClick={removePhoto}>
                Usuń
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-center text-xs text-muted">Kwadratowe, twarz na środku. Zmiana dotyczy wszystkich CV.</p>
        </Section>
      </div>

      <div className="mt-5 grid gap-5">
        <Section title="Dane podstawowe">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Imię i nazwisko" value={profile.name} onChange={(v) => update((p) => void (p.name = v))} />
            <Field label="Rola / tytuł" value={profile.headline} onChange={(v) => update((p) => void (p.headline = v))} />
            <Field label="Telefon" value={profile.contact.phone} onChange={(v) => update((p) => void (p.contact.phone = v))} />
            <Field label="E-mail" value={profile.contact.email} onChange={(v) => update((p) => void (p.contact.email = v))} />
            <Field label="Lokalizacja" value={profile.contact.location} onChange={(v) => update((p) => void (p.contact.location = v))} />
            <Field label="LinkedIn" value={profile.contact.linkedin} onChange={(v) => update((p) => void (p.contact.linkedin = v))} />
            <Field label="Strona / portfolio" value={profile.contact.website} onChange={(v) => update((p) => void (p.contact.website = v))} />
          </div>
        </Section>

        <Section
          title="O mnie – wersje"
          actions={
            <button className="btn btn-sm" onClick={() => update((p) => void p.summaries.push(""))}>
              + Wersja
            </button>
          }
        >
          <div className="grid gap-3">
            {profile.summaries.map((s, i) => (
              <div key={i} className="flex gap-2">
                <Area className="flex-1" value={s} onChange={(v) => update((p) => void (p.summaries[i] = v))} />
                <button className="btn btn-ghost btn-sm self-start text-muted" onClick={() => update((p) => void p.summaries.splice(i, 1))}>
                  Usuń
                </button>
              </div>
            ))}
            {profile.summaries.length === 0 ? <p className="text-sm text-muted">Brak – zostanie uzupełnione z CV.</p> : null}
          </div>
        </Section>

        <Section
          title="Doświadczenie"
          actions={
            <button
              className="btn btn-sm"
              onClick={() =>
                update((p) =>
                  void p.experience.unshift({ id: "", company: "", role: "", location: "", start: "", end: "", context: "", bullets: [], notes: "" })
                )
              }
            >
              + Stanowisko
            </button>
          }
        >
          <div className="grid gap-4">
            {profile.experience.map((e, i) => (
              <ExperienceEditor
                key={e.id || i}
                exp={e}
                onChange={(fn) => update((p) => fn(p.experience[i]))}
                onRemove={() => update((p) => void p.experience.splice(i, 1))}
              />
            ))}
          </div>
        </Section>

        <div className="grid gap-5 md:grid-cols-2">
          <Section title="Umiejętności">
            <LinesArea value={profile.skills} rows={6} onChange={(v) => update((p) => void (p.skills = v))} />
          </Section>
          <Section
            title="Języki"
            actions={
              <button className="btn btn-sm" onClick={() => update((p) => void p.languages.push({ name: "", level: "" }))}>
                + Język
              </button>
            }
          >
            <div className="grid gap-2">
              {profile.languages.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <Field className="flex-1" value={l.name} placeholder="Język" onChange={(v) => update((p) => void (p.languages[i].name = v))} />
                  <Field className="w-28" value={l.level} placeholder="Poziom" onChange={(v) => update((p) => void (p.languages[i].level = v))} />
                  <button className="btn btn-ghost btn-sm text-muted" onClick={() => update((p) => void p.languages.splice(i, 1))}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <Section
          title="Wykształcenie"
          actions={
            <button className="btn btn-sm" onClick={() => update((p) => void p.education.push({ period: "", degree: "", school: "" }))}>
              + Pozycja
            </button>
          }
        >
          <div className="grid gap-2">
            {profile.education.map((ed, i) => (
              <div key={i} className="flex gap-2">
                <Field className="w-36" value={ed.period} placeholder="2017 – 2020" onChange={(v) => update((p) => void (p.education[i].period = v))} />
                <Field className="flex-1" value={ed.degree} placeholder="Kierunek, stopień" onChange={(v) => update((p) => void (p.education[i].degree = v))} />
                <Field className="flex-1" value={ed.school} placeholder="Uczelnia" onChange={(v) => update((p) => void (p.education[i].school = v))} />
                <button className="btn btn-ghost btn-sm text-muted" onClick={() => update((p) => void p.education.splice(i, 1))}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Kursy i certyfikaty"
          actions={
            <button className="btn btn-sm" onClick={() => update((p) => void p.courses.push({ name: "", issuer: "", year: "", description: "" }))}>
              + Kurs
            </button>
          }
        >
          <div className="grid gap-4">
            {profile.courses.map((c, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-line p-3">
                <div className="flex gap-2">
                  <Field className="flex-1" value={c.name} placeholder="Nazwa" onChange={(v) => update((p) => void (p.courses[i].name = v))} />
                  <Field className="w-48" value={c.issuer} placeholder="Wystawca" onChange={(v) => update((p) => void (p.courses[i].issuer = v))} />
                  <Field className="w-20" value={c.year} placeholder="Rok" onChange={(v) => update((p) => void (p.courses[i].year = v))} />
                  <button className="btn btn-ghost btn-sm text-muted" onClick={() => update((p) => void p.courses.splice(i, 1))}>
                    ✕
                  </button>
                </div>
                <Area value={c.description} placeholder="Opis (opcjonalnie)" onChange={(v) => update((p) => void (p.courses[i].description = v))} />
              </div>
            ))}
          </div>
        </Section>

        <Section title="Inne fakty o Tobie">
          <Area
            rows={4}
            value={profile.extras}
            hint="projekty, wyniki, narzędzia, wolontariat… wszystko, czego Claude może użyć"
            onChange={(v) => update((p) => void (p.extras = v))}
          />
        </Section>

        <RememberedAnswers />

        <Section title="Domyślna klauzula RODO">
          <Area rows={3} value={profile.gdpr} onChange={(v) => update((p) => void (p.gdpr = v))} />
        </Section>
      </div>
    </div>
  );
}

function ExperienceEditor({
  exp,
  onChange,
  onRemove,
}: {
  exp: ProfileExperience;
  onChange: (fn: (e: ProfileExperience) => void) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-line p-4">
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_90px_90px_auto]">
        <Field label="Stanowisko" value={exp.role} onChange={(v) => onChange((e) => void (e.role = v))} />
        <Field label="Firma" value={exp.company} onChange={(v) => onChange((e) => void (e.company = v))} />
        <Field label="Miejsce" value={exp.location} onChange={(v) => onChange((e) => void (e.location = v))} />
        <Field label="Od" value={exp.start} onChange={(v) => onChange((e) => void (e.start = v))} />
        <Field label="Do" value={exp.end} onChange={(v) => onChange((e) => void (e.end = v))} />
        <button className="btn btn-ghost btn-sm self-end text-muted" onClick={onRemove}>
          Usuń
        </button>
      </div>
      <Area label="Kontekst firmy / produktu" value={exp.context} onChange={(v) => onChange((e) => void (e.context = v))} />
      <LinesArea label="Punkty (wszystkie znane)" value={exp.bullets} rows={4} onChange={(v) => onChange((e) => void (e.bullets = v))} />
      <Area
        label="Twoje notatki"
        hint="liczby, efekty, szczegóły, których nie ma w CV"
        value={exp.notes}
        placeholder="np. koszyk podniósł konwersję o 12%, zespół 7 osób: 4 dev, 1 QA, 1 UX…"
        onChange={(v) => onChange((e) => void (e.notes = v))}
      />
    </div>
  );
}

/** Odpowiedzi z wszystkich ofert – Claude używa ich jak bazy i nie pyta o nie ponownie. */
function RememberedAnswers() {
  const [facts, setFacts] = useState<Fact[] | null>(null);
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    api<Fact[]>("/api/facts").then(setFacts);
  }, []);
  useDebouncedEffect(() => {
    if (facts) api("/api/facts", { method: "PUT", json: facts });
  }, [facts]);

  if (!facts) return null;
  const q = filter.trim().toLowerCase();
  const list = facts
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !q || `${f.question} ${f.answer} ${f.source}`.toLowerCase().includes(q))
    .reverse(); // najnowsze na górze
  const shown = showAll || q ? list : list.slice(0, 8);

  return (
    <Section
      title={
        <>
          Zapamiętane odpowiedzi <span className="text-sm font-semibold text-muted">({facts.length})</span>
        </>
      }
      actions={
        facts.length > 8 ? <input className="input w-56 py-1.5 text-sm" placeholder="Szukaj…" value={filter} onChange={(e) => setFilter(e.target.value)} /> : null
      }
    >
      <p className="-mt-2 mb-3 text-xs text-muted">
        Twoje odpowiedzi z analiz, „Czy to umiesz?” i poprawek CV. Zapisują się same i trafiają do każdej kolejnej oferty – Claude nie zapyta o nie
        drugi raz. Popraw albo usuń, jeśli coś jest nieaktualne.
      </p>
      {facts.length === 0 ? (
        <p className="text-sm text-muted">Jeszcze nic – pojawią się tu, gdy odpowiesz na pytania przy ofercie.</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {shown.map(({ f, i }) => (
            <li key={f.key} className="rounded-lg border border-line p-3">
              <div className="flex items-start gap-2">
                <p className="flex-1 text-sm font-semibold leading-snug">{f.question}</p>
                <button
                  className="btn btn-ghost btn-sm -mr-1 -mt-1 text-muted"
                  title="Usuń"
                  onClick={() => setFacts((all) => all!.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
              <textarea
                className="input mt-1.5 text-sm"
                rows={2}
                value={f.answer}
                onChange={(e) => setFacts((all) => all!.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))}
              />
              {f.source ? <p className="mt-1 text-xs text-muted">z oferty: {f.source}</p> : null}
            </li>
          ))}
        </ul>
      )}
      {!q && list.length > 8 ? (
        <button className="mt-3 text-sm font-semibold text-brand" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Pokaż mniej" : `Pokaż wszystkie (${list.length})`}
        </button>
      ) : null}
    </Section>
  );
}
