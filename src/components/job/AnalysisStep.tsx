"use client";

import { useState } from "react";
import { api, Area, Badge, useDebouncedEffect } from "@/components/ui";
import type { JobAnalysis, Profile, Recommendation, RequirementCheck, SkillSuggestion } from "@/lib/types";
import type { StepProps } from "./PostingStep";

const MATCH_TONE = { mocne: "green", częściowe: "amber", brak: "red" } as const;

type Key = "questions" | "skills" | "recs" | "hints" | "reqs" | "keywords" | "culture";

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

  // ---------- stan sekcji ----------
  const skills = a.skillSuggestions ?? [];
  const unanswered = a.questions.filter((q) => !q.answer.trim()).length;
  const openSkills = skills.filter((x) => !x.answer).length;
  const haveSkills = skills.filter((x) => x.answer === "mam").length;
  const allReqs = [...a.mustHave, ...a.niceToHave];
  const reqCount = (m: RequirementCheck["match"]) => allReqs.filter((r) => r.match === m).length;
  const highRecs = a.recommendations.filter((r) => r.priority === "wysoki").length;

  // Na start otwarte jest to, co wymaga Twojej reakcji; szczegóły ogłoszenia są zwinięte.
  const [open, setOpen] = useState<Record<Key, boolean>>(() => ({
    questions: unanswered > 0,
    skills: openSkills > 0,
    recs: true,
    hints: false,
    reqs: false,
    keywords: false,
    culture: false,
  }));
  const toggle = (k: Key) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const jump = (k: Key) => {
    setOpen((o) => ({ ...o, [k]: true }));
    setTimeout(() => document.getElementById(`sec-${k}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  return (
    <div className="grid gap-6 pb-2">
      {/* ---------- Podsumowanie ---------- */}
      <section className="card p-5">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1 basis-[520px]">
            <h3 className="mb-2 text-[15px] font-extrabold">Kogo szukają</h3>
            <p className="leading-relaxed">{a.whoTheySeek}</p>
            <p className="mt-3 rounded-lg bg-canvas px-3 py-2 text-sm leading-relaxed">
              <b>Ocena dopasowania:</b> {a.fitComment}
            </p>
          </div>
          <div className="w-full shrink-0 rounded-xl border border-line p-4 md:w-[260px]">
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-extrabold ${a.fitScore >= 70 ? "text-emerald-600" : a.fitScore >= 45 ? "text-amber-600" : "text-rose-600"}`}>
                {a.fitScore}%
              </span>
              <span className="text-sm font-semibold text-muted">dopasowania</span>
            </div>
            <p className="mt-1 text-xs text-muted">Twoja baza vs ogłoszenie, przed napisaniem CV</p>
            <div className="mt-3 grid gap-0.5 text-xs text-muted">
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
          </div>
        </div>
      </section>

      {/* ---------- 1. Do uzupełnienia ---------- */}
      {a.questions.length || skills.length ? (
        <Group title="Twoje odpowiedzi" hint="Nowe fakty dla Claude'a. Wszystko jest opcjonalne – czego nie uzupełnisz, tego nie użyje.">
          {a.questions.length ? (
            <Accordion
              id="questions"
              title="Pytania do Ciebie"
              open={open.questions}
              onToggle={() => toggle("questions")}
              status={unanswered ? <Badge tone="amber">{unanswered} do uzupełnienia</Badge> : <Badge tone="green">✓ wszystkie odpowiedziane</Badge>}
            >
              <div className="grid gap-x-5 gap-y-4 lg:grid-cols-2">
                {a.questions.map((q, i) => (
                  <div key={q.id}>
                    <p className="mb-1.5 flex gap-2 text-sm font-semibold leading-snug">
                      <span className={q.answer.trim() ? "text-emerald-600" : "text-line"}>{q.answer.trim() ? "✓" : "●"}</span>
                      <span>{q.question}</span>
                    </p>
                    <Area
                      value={q.answer}
                      placeholder="Twoja odpowiedź (albo zostaw puste)"
                      onChange={(v) => upd((x) => void (x.questions[i].answer = v))}
                    />
                  </div>
                ))}
              </div>
            </Accordion>
          ) : null}

          {skills.length ? (
            <Accordion
              id="skills"
              title="Czy to umiesz?"
              open={open.skills}
              onToggle={() => toggle("skills")}
              status={
                openSkills ? (
                  <Badge tone="amber">{openSkills} do zaznaczenia</Badge>
                ) : (
                  <Badge tone="green">
                    ✓ {haveSkills} mam · {skills.length - haveSkills} nie mam
                  </Badge>
                )
              }
            >
              <SkillSuggestions items={skills} onChange={(i, fn) => upd((x) => fn(x.skillSuggestions![i]))} onBulk={(fn) => upd((x) => x.skillSuggestions!.forEach(fn))} />
            </Accordion>
          ) : null}
        </Group>
      ) : null}

      {/* ---------- 2. Plan CV ---------- */}
      <Group title="Plan CV" hint="Polecenia dla Claude'a przy pisaniu. Popraw, usuń albo dopisz własne.">
        <Accordion
          id="recs"
          title="Rekomendacje"
          open={open.recs}
          onToggle={() => toggle("recs")}
          status={
            <Badge tone="blue">
              {a.recommendations.length} {highRecs ? `· ${highRecs} ważnych` : ""}
            </Badge>
          }
          actions={
            <button className="btn btn-sm" onClick={() => upd((x) => void x.recommendations.push({ priority: "średni", text: "" }))}>
              + Dodaj
            </button>
          }
        >
          <div className="grid gap-2">
            {a.recommendations.map((r, i) => (
              <div key={i} className="flex gap-2">
                <select
                  className={`input h-fit w-24 shrink-0 px-1.5 text-xs font-bold ${r.priority === "wysoki" ? "text-rose-700" : r.priority === "średni" ? "text-amber-800" : "text-muted"}`}
                  value={r.priority}
                  onChange={(e) => upd((x) => void (x.recommendations[i].priority = e.target.value as Recommendation["priority"]))}
                >
                  <option value="wysoki">wysoki</option>
                  <option value="średni">średni</option>
                  <option value="niski">niski</option>
                </select>
                <textarea
                  className="input flex-1 text-sm"
                  rows={2}
                  value={r.text}
                  onChange={(e) => upd((x) => void (x.recommendations[i].text = e.target.value))}
                />
                <button
                  className="btn btn-ghost btn-sm h-fit text-muted"
                  title="Usuń"
                  onClick={() => upd((x) => void x.recommendations.splice(i, 1))}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <details className="group mt-4">
            <summary className="cursor-pointer list-none text-sm font-semibold text-brand">
              <span className="group-open:hidden">
                Pokaż, co podkreślić ({a.emphasize.length}) i wyciszyć ({a.deemphasize.length})
              </span>
              <span className="hidden group-open:inline">Ukryj, co podkreślić i wyciszyć</span>
            </summary>
            <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
              <div>
                <span className="label">Podkreślić</span>
                <Bullets items={a.emphasize} />
              </div>
              <div>
                <span className="label">Wyciszyć</span>
                <Bullets items={a.deemphasize} />
              </div>
            </div>
          </details>
        </Accordion>

        <Accordion
          id="hints"
          title="Twoje wskazówki i list motywacyjny"
          open={open.hints}
          onToggle={() => toggle("hints")}
          status={userNotes.trim() ? <Badge tone="green">✓ są uwagi</Badge> : <Badge>opcjonalne</Badge>}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Area
              label="Twoje dodatkowe uwagi do CV"
              rows={4}
              value={userNotes}
              placeholder="np. podkreśl projekt migracji do chmury, pomiń pierwszą pracę, CV max 1 strona…"
              onChange={setUserNotes}
            />
            <Area
              label="Kąt listu motywacyjnego"
              rows={4}
              value={a.coverLetterAngle}
              onChange={(v) => upd((x) => void (x.coverLetterAngle = v))}
            />
          </div>
        </Accordion>
      </Group>

      {/* ---------- 3. Szczegóły ogłoszenia ---------- */}
      <Group title="Szczegóły ogłoszenia" hint="Na czym opiera się analiza – rozwiń, jeśli chcesz sprawdzić.">
        <Accordion
          id="reqs"
          title="Wymagania vs Twoje doświadczenie"
          open={open.reqs}
          onToggle={() => toggle("reqs")}
          status={
            <span className="flex flex-wrap gap-1">
              {reqCount("mocne") ? <Badge tone="green">{reqCount("mocne")} mocne</Badge> : null}
              {reqCount("częściowe") ? <Badge tone="amber">{reqCount("częściowe")} częściowe</Badge> : null}
              {reqCount("brak") ? <Badge tone="red">{reqCount("brak")} brak</Badge> : null}
            </span>
          }
        >
          <div className="grid gap-x-8 gap-y-5 xl:grid-cols-2">
            <ReqTable title="Wymagane" items={a.mustHave} />
            {a.niceToHave.length ? <ReqTable title="Mile widziane" items={a.niceToHave} /> : null}
          </div>
        </Accordion>

        <Accordion
          id="keywords"
          title="Słowa kluczowe (ATS)"
          open={open.keywords}
          onToggle={() => toggle("keywords")}
          status={<Badge tone="blue">{a.keywords.length}</Badge>}
        >
          <div className="flex flex-wrap gap-1.5">
            {a.keywords.map((k, i) => (
              <span key={i} className="rounded-md border border-brand/30 bg-brand-soft px-2 py-0.5 text-sm font-semibold text-brand">
                {k}
              </span>
            ))}
          </div>
        </Accordion>

        <Accordion
          id="culture"
          title="Kultura firmy i czerwone flagi"
          open={open.culture}
          onToggle={() => toggle("culture")}
          status={a.redFlags.length ? <Badge tone="red">{a.redFlags.length} czerwone flagi</Badge> : <Badge tone="green">bez czerwonych flag</Badge>}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <span className="label">Kultura i ton</span>
              <Bullets items={a.cultureSignals} />
            </div>
            <div>
              <span className="label">Czerwone flagi</span>
              {a.redFlags.length ? <Bullets items={a.redFlags} /> : <p className="text-sm text-muted">Nic niepokojącego.</p>}
            </div>
          </div>
        </Accordion>
      </Group>

      {/* ---------- Pasek akcji ---------- */}
      <div className="card sticky bottom-4 z-10 flex flex-wrap items-center gap-2 p-3 shadow-lg">
        <div className="mr-auto flex flex-wrap items-center gap-2 text-sm">
          {a.questions.length ? (
            <Progress label="Pytania" done={a.questions.length - unanswered} total={a.questions.length} onClick={() => jump("questions")} />
          ) : null}
          {skills.length ? <Progress label="Umiejętności" done={skills.length - openSkills} total={skills.length} onClick={() => jump("skills")} /> : null}
          <span className="text-xs text-muted">{unanswered || openSkills ? "Możesz pisać CV też bez kompletu." : "Wszystko uzupełnione."}</span>
        </div>
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

// ---------- Elementy układu ----------

function Group({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 px-1">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted">{title}</h2>
        {hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Accordion({
  id,
  title,
  status,
  actions,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  status?: React.ReactNode;
  actions?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section id={`sec-${id}`} className="card scroll-mt-20 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5">
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onToggle} aria-expanded={open}>
          <span className={`text-muted transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
            ▸
          </span>
          <h3 className="text-[15px] font-extrabold">{title}</h3>
          {status}
        </button>
        {open ? actions : null}
      </div>
      {open ? <div className="border-t border-line px-5 pb-5 pt-4">{children}</div> : null}
    </section>
  );
}

function Progress({ label, done, total, onClick }: { label: string; done: number; total: number; onClick: () => void }) {
  const complete = done === total;
  return (
    <button
      onClick={onClick}
      title="Przejdź do sekcji"
      className={`flex items-center gap-2 rounded-full border px-3 py-1 font-semibold ${complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-900"}`}
    >
      {label} {done}/{total}
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-white">
        <span className={`block h-full ${complete ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </span>
    </button>
  );
}

function ReqTable({ title, items }: { title: string; items: RequirementCheck[] }) {
  return (
    <div>
      <span className="label">{title}</span>
      <ul className="divide-y divide-line">
        {items.map((r, i) => (
          <li key={i} className="flex items-start gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{r.requirement}</p>
              {r.evidence ? <p className="mt-0.5 text-sm text-muted">{r.evidence}</p> : null}
            </div>
            <Badge tone={MATCH_TONE[r.match]}>{r.match}</Badge>
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
  onBulk,
}: {
  items: SkillSuggestion[];
  onChange: (i: number, fn: (s: SkillSuggestion) => void) => void;
  onBulk: (fn: (s: SkillSuggestion) => void) => void;
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
    <>
      <p className="mb-3 text-sm text-muted">
        Rzeczy, które warto mieć w CV pod tę ofertę, a których nie ma w Twojej bazie. Do CV trafią tylko te z „mam”.
      </p>
      <ul className="grid gap-2 lg:grid-cols-2">
        {items.map((s, i) => (
          <li
            key={s.id}
            className={`rounded-lg border px-3 py-2 ${s.answer === "mam" ? "border-emerald-200 bg-emerald-50/60" : s.answer === "nie mam" ? "border-line bg-canvas/50" : "border-line"}`}
          >
            <div className="flex items-start gap-2">
              <div className={`min-w-0 flex-1 ${s.answer === "nie mam" ? "opacity-50" : ""}`}>
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
                className="input mt-2 py-1.5 text-sm"
                placeholder="Gdzie i jak? (opcjonalnie – pomoże wpleść to w doświadczenie)"
                value={s.note}
                onChange={(e) => onChange(i, (x) => void (x.note = e.target.value))}
              />
            ) : null}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {open ? (
          <button className="btn btn-sm" onClick={() => onBulk((x) => void (x.answer = x.answer || "nie mam"))}>
            Pozostałe {open} oznacz „nie mam”
          </button>
        ) : null}
        {confirmed.length ? (
          <>
            <button className="btn btn-sm" onClick={saveToProfile}>
              Dodaj {confirmed.length} „mam” do Bazy CV
            </button>
            <span className="text-xs text-muted">{saveMsg || "Kolejne oferty od razu będą o tym wiedzieć."}</span>
          </>
        ) : null}
      </div>
    </>
  );
}
