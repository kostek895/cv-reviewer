"use client";

import { useState } from "react";
import { Badge, Section, Spinner } from "@/components/ui";
import type { Job, TailoredCv } from "@/lib/types";

const COVER_TONE = { tak: "green", częściowo: "amber", nie: "red" } as const;

function snapshot(cv: TailoredCv) {
  const { showPhoto: _s, accent: _a, ...rest } = cv;
  void _s;
  void _a;
  return JSON.stringify(rest);
}

/** Ocena gotowego CV względem ogłoszenia: wynik przed (baza) → po (to CV). */
export function ScoreCard({
  job,
  cv,
  running,
  onScore,
}: {
  job: Job;
  cv: TailoredCv;
  running: boolean;
  onScore: () => void;
}) {
  const [showReqs, setShowReqs] = useState(false);
  const s = job.cvScore;
  const before = job.analysis?.fitScore;
  const scoring = running && job.task?.kind === "score";
  const stale = s ? s.cvSnapshot !== snapshot(cv) : false;
  const missingMust = s?.requirements.filter((r) => r.mustHave && r.covered === "nie").length ?? 0;

  return (
    <Section
      title="Dopasowanie CV do ogłoszenia"
      actions={
        <button className={`btn btn-sm ${!s || stale ? "btn-primary" : ""}`} disabled={running} onClick={onScore}>
          {scoring ? <Spinner className="size-3" /> : null}
          {s ? "Sprawdź ponownie" : "Sprawdź dopasowanie"}
        </button>
      }
    >
      {!s ? (
        <p className="text-sm text-muted">
          Wynik {before !== undefined ? <b className="text-ink">{before}%</b> : null} z analizy dotyczył całej Twojej bazy, zanim powstało CV.
          Sprawdź, jak wypada samo CV – po rekomendacjach i Twoich poprawkach.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-baseline gap-2">
              {before !== undefined ? (
                <>
                  <span className="text-lg font-bold text-muted">{before}%</span>
                  <span className="text-muted">→</span>
                </>
              ) : null}
              <span className={`text-3xl font-extrabold ${s.score >= 70 ? "text-emerald-600" : s.score >= 45 ? "text-amber-600" : "text-rose-600"}`}>
                {s.score}%
              </span>
              {before !== undefined && s.score !== before ? (
                <Badge tone={s.score > before ? "green" : "red"}>
                  {s.score > before ? "+" : ""}
                  {s.score - before} pkt
                </Badge>
              ) : null}
            </div>
            <span className="text-sm text-muted">
              Słowa kluczowe: <b className="text-ink">{s.keywordsFound}/{s.keywordsTotal}</b> dosłownie w CV
            </span>
            {missingMust ? <Badge tone="red">{missingMust} wymagań nie widać w CV</Badge> : null}
          </div>
          {stale ? (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
              CV zmieniło się od tej oceny – kliknij „Sprawdź ponownie”.
            </p>
          ) : null}
          <p className="mt-3 text-sm leading-relaxed">{s.comment}</p>

          {s.suggestions.length ? (
            <div className="mt-3">
              <span className="label">Co jeszcze poprawić</span>
              <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
                {s.suggestions.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {s.missingKeywords.length ? (
            <div className="mt-3">
              <span className="label">Brakujące słowa kluczowe</span>
              <div className="flex flex-wrap gap-1.5">
                {s.missingKeywords.map((k, i) => (
                  <span key={i} className="rounded-md border border-rose-200 bg-rose-50 px-2 py-0.5 text-sm font-semibold text-rose-700">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <button className="mt-3 text-sm font-semibold text-brand" onClick={() => setShowReqs((v) => !v)}>
            {showReqs ? "Ukryj wymagania" : `Pokaż wymagania (${s.requirements.filter((r) => r.covered === "tak").length}/${s.requirements.length} widać w CV)`}
          </button>
          {showReqs ? (
            <ul className="mt-2 divide-y divide-line text-sm">
              {s.requirements.map((r, i) => (
                <li key={i} className="flex items-start gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {r.requirement} {r.mustHave ? null : <span className="text-xs font-normal text-muted">(mile widziane)</span>}
                    </p>
                    {r.where ? <p className="text-xs text-muted">{r.where}</p> : null}
                  </div>
                  <Badge tone={COVER_TONE[r.covered]}>{r.covered}</Badge>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </Section>
  );
}

