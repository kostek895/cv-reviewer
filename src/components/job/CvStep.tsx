"use client";

import { useEffect, useRef, useState } from "react";
import { api, Area, Badge, Field, LinesArea, Section, Spinner, useDebouncedEffect } from "@/components/ui";
import type { CvExperience, TailoredCv } from "@/lib/types";
import type { StepProps } from "./PostingStep";
import { ScoreCard } from "./ScoreCard";
import { ImprovePanel } from "./ImprovePanel";

export function CvStep({ job, running, patch, run, refresh }: StepProps) {
  const [cv, setCv] = useState<TailoredCv>(job.cv!);
  const [letter, setLetter] = useState(job.coverLetter ?? "");
  const [previewV, setPreviewV] = useState(0);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasPhoto, setHasPhoto] = useState(true);
  const [photoError, setPhotoError] = useState("");
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/photo").then((r) => setHasPhoto(r.ok));
  }, []);

  async function uploadPhoto(files: FileList | null) {
    if (!files?.[0]) return;
    const fd = new FormData();
    fd.append("file", files[0]);
    if (photoRef.current) photoRef.current.value = "";
    setPhotoError("");
    try {
      await api("/api/photo", { method: "POST", body: fd });
      setHasPhoto(true);
      setPreviewV((v) => v + 1);
    } catch (e) {
      setPhotoError((e as Error).message);
    }
  }

  useDebouncedEffect(
    () => {
      setSaving(true);
      patch({ cv }).then(() => {
        setSaving(false);
        setPreviewV((v) => v + 1);
      });
    },
    [cv],
    600
  );
  useDebouncedEffect(() => {
    patch({ coverLetter: letter });
  }, [letter]);

  const upd = (fn: (c: TailoredCv) => void) =>
    setCv((cur) => {
      const n = structuredClone(cur);
      fn(n);
      return n;
    });

  const rewrite = (target: Record<string, unknown>) => (instruction: string) =>
    run({ action: "rewrite", target, instruction });

  async function copyLetter() {
    await navigator.clipboard.writeText(letter);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const pdf = job.pdf;
  const busy = running || saving;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ---------- Edytor ---------- */}
      <div className="grid content-start gap-5">
        <ScoreCard
          job={job}
          cv={cv}
          running={running}
          onScore={async () => {
            await patch({ cv }); // oceń dokładnie to, co widać w edytorze
            await run({ action: "score" });
          }}
        />

        <ImprovePanel
          job={job}
          cv={cv}
          running={running}
          run={async (body) => {
            await patch({ cv }); // pracuj na tym, co widać w edytorze
            await run(body);
          }}
          refresh={refresh ?? (async () => {})}
        />

        {job.changeNotes?.length ? (
          <Section title="Co zmienił Claude">
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
              {job.changeNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section
          title="Nagłówek i O mnie"
          actions={
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={cv.showPhoto} onChange={(e) => upd((c) => void (c.showPhoto = e.target.checked))} />
              Zdjęcie
            </label>
          }
        >
          <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => uploadPhoto(e.target.files)} />
          {cv.showPhoto && !hasPhoto ? (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <span className="flex-1">Nie wgrałeś jeszcze zdjęcia, więc CV wychodzi bez niego.</span>
              <button className="btn btn-sm" onClick={() => photoRef.current?.click()}>
                Wgraj zdjęcie
              </button>
            </div>
          ) : cv.showPhoto ? (
            <div className="mb-3 flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/photo?v=${previewV}`} alt="Zdjęcie" className="size-12 rounded-full border-2 border-brand object-cover" />
              <button className="btn btn-sm" onClick={() => photoRef.current?.click()}>
                Zmień zdjęcie
              </button>
            </div>
          ) : null}
          {photoError ? <p className="mb-2 text-sm font-semibold text-rose-600">{photoError}</p> : null}
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Imię i nazwisko" value={cv.name} onChange={(v) => upd((c) => void (c.name = v))} />
              <Field label="Tytuł pod nazwiskiem" value={cv.headline} onChange={(v) => upd((c) => void (c.headline = v))} />
            </div>
            <Area label="O mnie" rows={4} value={cv.summary} onChange={(v) => upd((c) => void (c.summary = v))} />
            <Rewrite disabled={running} onRun={rewrite({ section: "summary" })} />
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Telefon" value={cv.contact.phone} onChange={(v) => upd((c) => void (c.contact.phone = v))} />
              <Field label="E-mail" value={cv.contact.email} onChange={(v) => upd((c) => void (c.contact.email = v))} />
              <Field label="Lokalizacja" value={cv.contact.location} onChange={(v) => upd((c) => void (c.contact.location = v))} />
              <Field label="LinkedIn" value={cv.contact.linkedin} onChange={(v) => upd((c) => void (c.contact.linkedin = v))} />
              <Field label="Strona" value={cv.contact.website} onChange={(v) => upd((c) => void (c.contact.website = v))} />
            </div>
          </div>
        </Section>

        <Section
          title="Doświadczenie"
          actions={
            <button
              className="btn btn-sm"
              onClick={() => upd((c) => void c.experience.push({ company: "", role: "", location: "", period: "", intro: "", bullets: [] }))}
            >
              + Stanowisko
            </button>
          }
        >
          <div className="grid gap-4">
            {cv.experience.map((e, i) => (
              <ExpEditor
                key={i}
                exp={e}
                first={i === 0}
                last={i === cv.experience.length - 1}
                disabled={running}
                onChange={(fn) => upd((c) => fn(c.experience[i]))}
                onMove={(d) =>
                  upd((c) => {
                    const [x] = c.experience.splice(i, 1);
                    c.experience.splice(i + d, 0, x);
                  })
                }
                onRemove={() => upd((c) => void c.experience.splice(i, 1))}
                onRewrite={rewrite({ section: "experience", index: i })}
              />
            ))}
          </div>
        </Section>

        <Section title="Mocne strony / umiejętności">
          <LinesArea value={cv.skills} rows={5} onChange={(v) => upd((c) => void (c.skills = v))} />
          <Rewrite disabled={running} onRun={rewrite({ section: "skills" })} className="mt-2" />
        </Section>

        <Section
          title="Kursy i szkolenia"
          actions={
            <button className="btn btn-sm" onClick={() => upd((c) => void c.courses.push({ name: "", issuer: "", year: "", description: "" }))}>
              + Kurs
            </button>
          }
        >
          <div className="grid gap-3">
            {cv.courses.map((co, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-line p-3">
                <div className="flex gap-2">
                  <Field className="flex-1" value={co.name} placeholder="Nazwa" onChange={(v) => upd((c) => void (c.courses[i].name = v))} />
                  <Field className="w-40" value={co.issuer} placeholder="Wystawca" onChange={(v) => upd((c) => void (c.courses[i].issuer = v))} />
                  <Field className="w-20" value={co.year} placeholder="Rok" onChange={(v) => upd((c) => void (c.courses[i].year = v))} />
                  <button className="btn btn-ghost btn-sm text-muted" onClick={() => upd((c) => void c.courses.splice(i, 1))}>
                    ✕
                  </button>
                </div>
                <Area value={co.description} placeholder="Opis (opcjonalnie)" onChange={(v) => upd((c) => void (c.courses[i].description = v))} />
              </div>
            ))}
          </div>
        </Section>

        <div className="grid gap-5 md:grid-cols-2">
          <Section title="Wykształcenie">
            <div className="grid gap-3">
              {cv.education.map((ed, i) => (
                <div key={i} className="grid gap-1.5">
                  <Field value={ed.period} placeholder="Okres" onChange={(v) => upd((c) => void (c.education[i].period = v))} />
                  <Field value={ed.degree} placeholder="Kierunek" onChange={(v) => upd((c) => void (c.education[i].degree = v))} />
                  <Field value={ed.school} placeholder="Uczelnia" onChange={(v) => upd((c) => void (c.education[i].school = v))} />
                </div>
              ))}
            </div>
          </Section>
          <Section title="Języki">
            <div className="grid gap-2">
              {cv.languages.map((l, i) => (
                <div key={i} className="flex gap-2">
                  <Field className="flex-1" value={l.name} onChange={(v) => upd((c) => void (c.languages[i].name = v))} />
                  <Field className="w-24" value={l.level} onChange={(v) => upd((c) => void (c.languages[i].level = v))} />
                </div>
              ))}
            </div>
          </Section>
        </div>

        <Section title="Klauzula RODO">
          <Area rows={3} value={cv.gdpr} placeholder="Pusta = bez klauzuli" onChange={(v) => upd((c) => void (c.gdpr = v))} />
        </Section>

        <Section
          title="List motywacyjny"
          actions={
            <button className="btn btn-sm btn-primary" onClick={copyLetter} disabled={!letter}>
              {copied ? "Skopiowano ✓" : "Kopiuj"}
            </button>
          }
        >
          <textarea className="input min-h-80 leading-relaxed" value={letter} onChange={(e) => setLetter(e.target.value)} />
          <div className="mt-2 flex items-center justify-between gap-2">
            <Rewrite disabled={running} onRun={rewrite({ section: "coverLetter" })} />
            <span className="text-xs text-muted">{letter.trim().split(/\s+/).filter(Boolean).length} słów</span>
          </div>
        </Section>
      </div>

      {/* ---------- Podgląd + PDF ---------- */}
      <div className="xl:sticky xl:top-20 xl:self-start">
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <span className="text-sm font-extrabold">Podgląd</span>
            <AccentPicker value={cv.accent} onChange={(v) => upd((c) => void (c.accent = v))} />
            <span className="text-xs text-muted">{saving ? "zapisuję…" : "czerwona linia = koniec strony A4"}</span>
            <div className="ml-auto flex gap-2">
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => run({ action: "pdf" })}>
                {running && job.task?.kind === "pdf" ? <Spinner className="size-3" /> : null}
                {pdf ? "Wygeneruj PDF ponownie" : "Wygeneruj PDF"}
              </button>
              {pdf ? (
                <>
                  <a className="btn btn-sm" href={`/api/jobs/${job.id}/pdf?inline=1`} target="_blank" rel="noreferrer">
                    Otwórz
                  </a>
                  <a className="btn btn-sm" href={`/api/jobs/${job.id}/pdf`}>
                    Pobierz ↓
                  </a>
                </>
              ) : null}
            </div>
          </div>
          {pdf ? (
            <div className={`px-4 py-2 text-sm ${pdf.atsOk ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
              {pdf.atsOk ? (
                <>
                  <Badge tone="green">ATS ✓</Badge> Test odczytu PDF przeszedł: tekst, polskie znaki i kolejność sekcji są poprawne.
                  {pdf.pages && pdf.pages > 1 ? <span className="ml-1 font-semibold text-amber-800">PDF ma {pdf.pages} strony – rozważ skrócenie.</span> : null}
                </>
              ) : (
                <>
                  <b>Uwagi z testu ATS:</b>
                  <ul className="list-disc pl-5">
                    {pdf.atsIssues.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ) : null}
          <iframe
            key={previewV}
            src={`/print/${job.id}?preview=1&v=${previewV}`}
            className="h-[calc(100vh-190px)] min-h-[600px] w-full bg-[#d9dde3]"
            title="Podgląd CV"
          />
        </div>
      </div>
    </div>
  );
}

function ExpEditor({
  exp,
  first,
  last,
  disabled,
  onChange,
  onMove,
  onRemove,
  onRewrite,
}: {
  exp: CvExperience;
  first: boolean;
  last: boolean;
  disabled: boolean;
  onChange: (fn: (e: CvExperience) => void) => void;
  onMove: (d: -1 | 1) => void;
  onRemove: () => void;
  onRewrite: (instruction: string) => void;
}) {
  return (
    <div className="grid gap-2.5 rounded-xl border border-line p-4">
      <div className="grid gap-2 md:grid-cols-[1fr_1fr]">
        <Field label="Stanowisko" value={exp.role} onChange={(v) => onChange((e) => void (e.role = v))} />
        <Field label="Firma" value={exp.company} onChange={(v) => onChange((e) => void (e.company = v))} />
        <Field label="Miejsce" value={exp.location} onChange={(v) => onChange((e) => void (e.location = v))} />
        <Field label="Okres" value={exp.period} onChange={(v) => onChange((e) => void (e.period = v))} />
      </div>
      <Area label="Wprowadzenie" value={exp.intro} onChange={(v) => onChange((e) => void (e.intro = v))} />
      <LinesArea label="Punkty" value={exp.bullets} rows={4} hint="jeden punkt na linię" onChange={(v) => onChange((e) => void (e.bullets = v))} />
      <div className="flex flex-wrap items-center gap-2">
        <Rewrite disabled={disabled} onRun={onRewrite} />
        <div className="ml-auto flex gap-1">
          <button className="btn btn-ghost btn-sm" disabled={first} onClick={() => onMove(-1)} title="W górę">
            ↑
          </button>
          <button className="btn btn-ghost btn-sm" disabled={last} onClick={() => onMove(1)} title="W dół">
            ↓
          </button>
          <button className="btn btn-ghost btn-sm text-muted" onClick={onRemove}>
            Usuń
          </button>
        </div>
      </div>
    </div>
  );
}

/** Przycisk „Popraw z Claude” z polem na uwagę. */
function Rewrite({ onRun, disabled, className = "" }: { onRun: (instruction: string) => void; disabled: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open) {
    return (
      <button className={`btn btn-sm text-brand ${className}`} disabled={disabled} onClick={() => setOpen(true)}>
        ✦ Popraw z Claude
      </button>
    );
  }
  return (
    <div className={`flex w-full gap-2 ${className}`}>
      <input
        autoFocus
        className="input text-sm"
        placeholder="Co zmienić? np. „krócej”, „podkreśl SQL”, „dodaj, że zespół miał 7 osób”… (puste = popraw wg analizy)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onRun(text);
            setOpen(false);
            setText("");
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <button
        className="btn btn-sm btn-primary"
        disabled={disabled}
        onClick={() => {
          onRun(text);
          setOpen(false);
          setText("");
        }}
      >
        Popraw
      </button>
      <button className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
        Anuluj
      </button>
    </div>
  );
}

const ACCENTS = [
  { name: "Niebieski", value: "#0b63e5" },
  { name: "Granatowy", value: "#1e3a8a" },
  { name: "Turkusowy", value: "#0f766e" },
  { name: "Zielony", value: "#15803d" },
  { name: "Fioletowy", value: "#6d28d9" },
  { name: "Bordowy", value: "#9f1239" },
  { name: "Grafitowy", value: "#374151" },
];

function AccentPicker({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const current = (value || ACCENTS[0].value).toLowerCase();
  return (
    <div className="flex items-center gap-1" title="Kolor szablonu">
      {ACCENTS.map((a) => (
        <button
          key={a.value}
          title={a.name}
          aria-label={a.name}
          onClick={() => onChange(a.value)}
          className={`size-5 rounded-full border-2 ${current === a.value ? "border-ink" : "border-white"}`}
          style={{ background: a.value, boxShadow: "0 0 0 1px rgba(0,0,0,.12)" }}
        />
      ))}
      <label
        title="Własny kolor"
        className={`relative size-5 cursor-pointer overflow-hidden rounded-full border-2 ${ACCENTS.some((a) => a.value === current) ? "border-white" : "border-ink"}`}
        style={{ background: "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)", boxShadow: "0 0 0 1px rgba(0,0,0,.12)" }}
      >
        <input type="color" className="absolute inset-0 cursor-pointer opacity-0" value={current} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}
