"use client";

import { useState } from "react";
import { api, Area, Badge, fitTone, Section, useDebouncedEffect } from "@/components/ui";
import type { JobAnalysis, Profile, Recommendation, RequirementCheck, SkillSuggestion } from "@/lib/types";
import type { StepProps } from "./PostingStep";

const MATCH_TONE = { mocne: "green", częściowe: "amber", brak: "red" } as const;

export function AnalysisStep({ job, running, patch, run }: StepProps) {
  const [a, setA] = useState<JobAnalysis>(job.analysis!);
  const [userNotes, setUserNotes] = useState(job.userNotes);

  useDebouncedEffect(() => {
    patch({ analysis: a });
  }, [a]);
  useDebouncedEffect(() => {
    patch({ userNotes });
  }, [userNotes]);

  const upd = (fn: (x: JobAnalysis) => void) =>
    setA((cur) => {
      const n = structuredClone(cur);
      fn(n);
      return n;
    });

  const unanswered = a.questions.filter((q) => !q.answer.trim()).length;
  const openSkills = a.skillSuggestions?.filter((x) => !x.answer).length ?? 0;

  return (
    <div className="grid gap-5">
      <Section title="Kogo szukają" actions={<Badge tone={fitTone(a.fitScore)}>{a.fitScore}% dopasowania</Badge>}>
        <p className="leading-relaxed">{a.whoTheySeek}</p>
        <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-sm leading-relaxed">
          <b>Ocena dopasowania:</b> {a.fitComment}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          {a.seniority ? (
            <span>
              Poziom: <b className="text-ink">{a.seniority}</b>
            </span>
          ) : null}
          {a.location ? (
            <span>
              Lokalizacja: <b className="text-ink">{a.location}</b>
            </span>
          ) : null}
          <span>
            CV powstanie po: <b className="text-ink">{a.language === "en" ? "angielsku" : "polsku"}</b>
          </span>
        </div>
      </Section>

      {/* Do uzupełnienia przez Ciebie – na pełnej szerokości, od razu pod podsumowaniem */}
      {a.questions.length || a.skillSuggestions?.length ? (
        <div className="grid items-start gap-5 xl:grid-cols-2">
          {a.questions.length ? (
            <Section title={<>Pytania do Ciebie {unanswered ? <Badge tone="amber">{unanswered} bez odpowiedzi</Badge> : null}</>}>
              <p className="-mt-2 mb-3 text-xs text-muted">
                Odpowiedzi to nowe fakty, których Claude może użyć. Pomiń pytanie, jeśli nie masz odpowiedzi – nic nie zostanie zmyślone.
              </p>
              <div className="grid gap-3">
                {a.questions.map((q, i) => (
                  <Area key={q.id} label={q.question} value={q.answer} onChange={(v) => upd((x) => void (x.questions[i].answer = v))} />
                ))}
              </div>
            </Section>
          ) : null}
          {a.skillSuggestions?.length ? (
            <SkillSuggestions items={a.skillSuggestions} onChange={(i, fn) => upd((x) => fn(x.skillSuggestions![i]))} />
          ) : null}
        </div>
      ) : null}

      <div className="grid items-start gap-5 xl:grid-cols-[1fr_420px]">
        <div className="grid content-start gap-5">
          <Section title="Wymagania vs Twoje doświadczenie">
            <ReqTable title="Wymagane" items={a.mustHave} />
            {a.niceToHave.length ? <ReqTable title="Mile widziane" items={a.niceToHave} className="mt-5" /> : null}
          </Section>
          <Section title="Słowa kluczowe (ATS)">
            <div className="flex flex-wrap gap-1.5">
              {a.keywords.map((k, i) => (
                <span key={i} className="rounded-md border border-brand/30 bg-brand-soft px-2 py-0.5 text-sm font-semibold text-brand">
                  {k}
                </span>
              ))}
            </div>
          </Section>
          <div className="grid gap-5 md:grid-cols-2">
            <Section title="Kultura i ton firmy">
              <Bullets items={a.cultureSignals} />
            </Section>
            <Section title="Czerwone flagi">
              {a.redFlags.length ? <Bullets items={a.redFlags} /> : <p className="text-sm text-muted">Nic niepokojącego.</p>}
            </Section>
          </div>
        </div>

        <div className="grid content-start gap-5">
          <Section
            title="Rekomendacje do CV"
            actions={
              <button className="btn btn-sm" onClick={() => upd((x) => void x.recommendations.push({ priority: "średni", text: "" }))}>
                + Dodaj
              </button>
            }
          >
            <p className="-mt-2 mb-3 text-xs text-muted">
              To są polecenia dla Claude&apos;a przy pisaniu. Popraw, usuń albo dopisz własne.
            </p>
            <div className="grid gap-2">
              {a.recommendations.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <select
                    className={`input h-fit w-24 shrink-0 px-1.5 text-xs font-bold`}
                    value={r.priority}
                    onChange={(e) => upd((x) => void (x.recommendations[i].priority = e.target.value as Recommendation["priority"]))}
                  >
                    <option value="wysoki">wysoki</option>
                    <option value="średni">średni</option>
                    <option value="niski">niski</option>
                  </select>
                  <textarea
                    className="input flex-1 text-sm"
                    value={r.text}
                    onChange={(e) => upd((x) => void (x.recommendations[i].text = e.target.value))}
                  />
                  <button className="btn btn-ghost btn-sm h-fit text-muted" onClick={() => upd((x) => void x.recommendations.splice(i, 1))}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-1">
              <div>
                <span className="label">Podkreślić</span>
                <Bullets items={a.emphasize} />
              </div>
              <div>
                <span className="label">Wyciszyć</span>
                <Bullets items={a.deemphasize} />
              </div>
            </div>
          </Section>
          <Section title="List motywacyjny – kąt">
            <Area value={a.coverLetterAngle} onChange={(v) => upd((x) => void (x.coverLetterAngle = v))} />
          </Section>
          <Section title="Twoje dodatkowe uwagi">
            <Area
              rows={3}
              value={userNotes}
              placeholder="np. podkreśl projekt migracji do chmury, pomiń pierwszą pracę, CV max 1 strona…"
              onChange={setUserNotes}
            />
          </Section>
        </div>
      </div>

      <div className="card sticky bottom-4 z-10 flex flex-wrap items-center gap-2 p-3 shadow-lg">
        <span className="mr-auto text-sm text-muted">
          {unanswered || openSkills ? (
            <>
              Do uzupełnienia: {unanswered ? <b className="text-ink">{unanswered} pytań</b> : null}
              {unanswered && openSkills ? " i " : null}
              {openSkills ? <b className="text-ink">{openSkills} umiejętności</b> : null}. Możesz też pominąć.
            </>
          ) : (
            "Wszystko uzupełnione – możesz pisać CV."
          )}
        </span>
        <button className="btn" disabled={running} onClick={() => run({ action: "analyze" })}>
          Analizuj ponownie
        </button>
        <button
          className="btn btn-primary"
          disabled={running}
          onClick={async () => {
            await patch({ analysis: a, userNotes });
            await run({ action: "tailor" });
          }}
        >
          {job.cv ? "Napisz CV od nowa" : "Napisz CV i list →"}
        </button>
      </div>
    </div>
  );
}

function ReqTable({ title, items, className = "" }: { title: string; items: RequirementCheck[]; className?: string }) {
  return (
    <div className={className}>
      <span className="label">{title}</span>
      <ul className="divide-y divide-line">
        {items.map((r, i) => (
          <li key={i} className="grid gap-1 py-2.5 md:grid-cols-[1fr_auto]">
            <div>
              <p className="font-semibold">{r.requirement}</p>
              {r.evidence ? <p className="mt-0.5 text-sm text-muted">{r.evidence}</p> : null}
            </div>
            <div>
              <Badge tone={MATCH_TONE[r.match]}>{r.match}</Badge>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

function SkillSuggestions({
  items,
  onChange,
}: {
  items: SkillSuggestion[];
  onChange: (i: number, fn: (s: SkillSuggestion) => void) => void;
}) {
  const [saveMsg, setSaveMsg] = useState("");
  const open = items.filter((s) => !s.answer).length;
  const confirmed = items.filter((s) => s.answer === "mam");

  async function saveToProfile() {
    setSaveMsg("");
    try {
      const p = await api<Profile>("/api/profile");
      const have = new Set(p.skills.map((x) => x.trim().toLowerCase()));
      const fresh = confirmed.filter((s) => !have.has(s.name.trim().toLowerCase()));
      const withNotes = confirmed.filter((s) => s.note.trim() && !p.extras.includes(`${s.name}: ${s.note.trim()}`));
      p.skills = [...p.skills, ...fresh.map((s) => s.name)];
      if (withNotes.length)
        p.extras = [p.extras.trim(), ...withNotes.map((s) => `- ${s.name}: ${s.note.trim()}`)].filter(Boolean).join("\n");
      await api("/api/profile", { method: "PUT", json: p });
      setSaveMsg(fresh.length || withNotes.length ? `Dodano do Bazy CV (${fresh.length} nowych).` : "Wszystko już jest w Bazie CV.");
    } catch (e) {
      setSaveMsg((e as Error).message);
    }
  }

  return (
    <Section title={<>Czy to umiesz? {open ? <Badge tone="amber">{open} do zaznaczenia</Badge> : null}</>}>
      <p className="-mt-2 mb-3 text-xs text-muted">
        Rzeczy, które warto mieć w CV pod tę ofertę, a których nie ma w Twojej bazie. Do CV trafią tylko te z „mam”.
      </p>
      <ul className="grid gap-2.5">
        {items.map((s, i) => (
          <li
            key={s.id}
            className={`rounded-lg border px-3 py-2 ${s.answer === "mam" ? "border-emerald-200 bg-emerald-50/60" : s.answer === "nie mam" ? "border-line opacity-60" : "border-line"}`}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug">{s.name}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{s.why}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                {(["mam", "nie mam"] as const).map((v) => (
                  <button
                    key={v}
                    className={`btn btn-sm ${s.answer === v ? (v === "mam" ? "border-emerald-600 bg-emerald-600 text-white" : "border-ink bg-ink text-white") : ""}`}
                    onClick={() => onChange(i, (x) => void (x.answer = x.answer === v ? "" : v))}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            {s.answer === "mam" ? (
              <input
                className="input mt-2 text-sm"
                placeholder="Gdzie i jak tego używałeś? (opcjonalnie – pomoże wpleść to w doświadczenie)"
                value={s.note}
                onChange={(e) => onChange(i, (x) => void (x.note = e.target.value))}
              />
            ) : null}
          </li>
        ))}
      </ul>
      {confirmed.length ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn btn-sm" onClick={saveToProfile}>
            Dodaj zaznaczone do Bazy CV
          </button>
          <span className="text-xs text-muted">{saveMsg || "Wtedy kolejne oferty od razu będą o tym wiedzieć."}</span>
        </div>
      ) : null}
    </Section>
  );
}
