"use client";

import { useState } from "react";
import { api, Area, Badge, Section, Spinner, useDebouncedEffect } from "@/components/ui";
import { isValidPath, pathLabel } from "@/lib/cvpath";
import type { CvChange, Job, TailoredCv } from "@/lib/types";

const TARGETS = [90, 96, 100];

/** Pętla „popraw → oceń” do zadanego wyniku + przegląd każdej zmiany. */
export function ImprovePanel({
  job,
  cv,
  running,
  run,
  refresh,
}: {
  job: Job;
  cv: TailoredCv;
  running: boolean;
  run: (body: Record<string, unknown>) => Promise<void>;
  refresh: () => Promise<void>;
}) {
  const imp = job.improve;
  const [target, setTarget] = useState(imp?.target ?? 96);
  const [error, setError] = useState("");
  const [showDone, setShowDone] = useState(false);
  const improving = running && job.task?.kind === "improve";
  const pending = imp?.changes.filter((c) => c.status === "do przejrzenia") ?? [];
  const done = imp?.changes.filter((c) => c.status !== "do przejrzenia") ?? [];
  const score = job.cvScore?.score;

  // odpowiedzi na pytania z pętli – zapisywane na bieżąco (i do wspólnej pamięci odpowiedzi)
  const questions = imp?.questions ?? [];
  const facts = questions.filter((q) => q.kind === "pytanie");
  const gaps = questions.filter((q) => q.kind === "brak");
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(facts.map((q) => [q.id, q.answer])));
  const openCount = facts.filter((q) => !(answers[q.id] ?? "").trim()).length;
  const saveAnswers = () => api(`/api/jobs/${job.id}/improve-answers`, { method: "POST", json: { answers } });
  useDebouncedEffect(() => {
    saveAnswers().catch((e) => setError((e as Error).message));
  }, [answers]);

  async function continueLoop() {
    await saveAnswers();
    await run({ action: "improve", target });
  }

  async function decide(changeId: string, op: "keep" | "revert") {
    setError("");
    try {
      await api(`/api/jobs/${job.id}/changes`, { method: "POST", json: { changeId, op } });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const chain = imp?.rounds.length
    ? [imp.rounds[0].scoreBefore, ...imp.rounds.map((r) => (r.reverted ? null : r.scoreAfter)).filter((x): x is number => x != null)]
    : [];

  return (
    <Section
      title={
        <>
          Popraw automatycznie do celu {openCount ? <Badge tone="amber">{openCount} pytań do Ciebie</Badge> : null}{" "}
          {pending.length ? <Badge tone="amber">{pending.length} zmian do przejrzenia</Badge> : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Cel:</span>
        {TARGETS.map((t) => (
          <button key={t} className={`btn btn-sm ${target === t ? "border-ink bg-ink text-white" : ""}`} onClick={() => setTarget(t)}>
            {t}%
          </button>
        ))}
        <button className="btn btn-sm btn-primary ml-auto" disabled={running} onClick={continueLoop}>
          {improving ? <Spinner className="size-3" /> : null}
          {imp?.rounds.length ? "Poprawiaj dalej" : "Popraw do celu"}
          {score !== undefined ? ` (teraz ${score}%)` : ""}
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        Claude stosuje sugestie z oceny, ocenia CV ponownie i powtarza (do 3 rund na raz, ok. 3 min na rundę). Używa tylko faktów z Twojej bazy i
        odpowiedzi. Rundę, która obniży wynik, cofa sam. Każdą zmianę możesz potem zostawić, cofnąć albo poprawić.
      </p>

      {imp?.rounds.length || imp?.stopReason ? (
        <div className="mt-4 rounded-lg bg-canvas px-3 py-2.5 text-sm">
          {chain.length > 1 ? (
            <p className="flex flex-wrap items-center gap-1.5 font-bold">
              {chain.map((s, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i ? <span className="text-muted">→</span> : null}
                  <span className={i === chain.length - 1 ? "text-emerald-700" : "text-muted"}>{s}%</span>
                </span>
              ))}
            </p>
          ) : null}
          {imp?.stopReason ? <p className="mt-0.5">{imp.stopReason}</p> : null}
        </div>
      ) : null}

      {facts.length ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/40 p-3">
          <p className="text-sm font-bold">Claude potrzebuje od Ciebie</p>
          <p className="mb-3 text-xs text-muted">
            Odpowiedz krótko (wystarczy przybliżona liczba). Pomiń, jeśli nie wiesz – nic nie zostanie zmyślone. Odpowiedzi zapamiętuję też dla
            innych ofert.
          </p>
          <div className="grid gap-3">
            {facts.map((q) => (
              <div key={q.id}>
                <p className="mb-1 flex gap-2 text-sm font-semibold leading-snug">
                  <span className={(answers[q.id] ?? "").trim() ? "text-emerald-600" : "text-amber-500"}>{(answers[q.id] ?? "").trim() ? "✓" : "●"}</span>
                  {q.question}
                </p>
                <Area value={answers[q.id] ?? ""} placeholder="Twoja odpowiedź" onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
              </div>
            ))}
          </div>
          <button className="btn btn-sm btn-primary mt-3" disabled={running} onClick={continueLoop}>
            {improving ? <Spinner className="size-3" /> : null}
            Poprawiaj dalej z tymi odpowiedziami
          </button>
        </div>
      ) : null}

      {gaps.length ? (
        <div className="mt-3 rounded-lg bg-canvas px-3 py-2.5">
          <p className="text-sm font-bold">Realne braki względem ogłoszenia</p>
          <p className="mb-1.5 text-xs text-muted">Tego nie da się uczciwie dopisać. To normalne – nie każda oferta pasuje w 100%. Zdecyduj, czy mimo to aplikujesz.</p>
          <ul className="list-disc space-y-0.5 pl-5 text-sm leading-relaxed">
            {gaps.map((q) => (
              <li key={q.id}>{q.question}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p> : null}

      {pending.length ? (
        <div className="mt-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="label mb-0">Do przejrzenia</span>
            {pending.length > 1 ? (
              <button className="btn btn-sm ml-auto" disabled={running} onClick={() => decide("all", "keep")}>
                Zostaw wszystkie
              </button>
            ) : null}
          </div>
          <ul className="grid gap-3">
            {pending.map((c) => (
              <ChangeItem key={c.id} c={c} cv={cv} running={running} onDecide={decide} onRefine={(comment) => run({ action: "refine", changeId: c.id, comment })} />
            ))}
          </ul>
        </div>
      ) : null}

      {done.length ? (
        <div className="mt-3">
          <button className="text-sm font-semibold text-brand" onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Ukryj przejrzane" : `Pokaż przejrzane (${done.filter((c) => c.status === "zostawiona").length} zostawione, ${done.filter((c) => c.status === "cofnięta").length} cofnięte)`}
          </button>
          {showDone ? (
            <ul className="mt-2 grid gap-2">
              {done.map((c) => (
                <ChangeItem key={c.id} c={c} cv={cv} running={running} compact onDecide={decide} onRefine={(comment) => run({ action: "refine", changeId: c.id, comment })} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Section>
  );
}

function ChangeItem({
  c,
  cv,
  running,
  compact,
  onDecide,
  onRefine,
}: {
  c: CvChange;
  cv: TailoredCv;
  running: boolean;
  compact?: boolean;
  onDecide: (id: string, op: "keep" | "revert") => void;
  onRefine: (comment: string) => void;
}) {
  const [open, setOpen] = useState(!compact);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState("");
  const label = isValidPath(cv, c.path) ? pathLabel(cv, c.path) : c.path;

  return (
    <li className={`rounded-lg border px-3 py-2.5 ${c.status === "cofnięta" ? "border-line bg-canvas/60" : c.status === "zostawiona" ? "border-emerald-200" : "border-amber-200 bg-amber-50/30"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((v) => !v)}>
          <span className="font-bold">{label}</span> <span className="text-xs text-muted">runda {c.round}</span>
        </button>
        {c.status !== "do przejrzenia" ? <Badge tone={c.status === "zostawiona" ? "green" : "gray"}>{c.status}</Badge> : null}
      </div>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">
        {c.reason}
        {c.comment ? <span className="block italic">Twoja uwaga: „{c.comment}”</span> : null}
      </p>
      {open ? <Diff before={c.before} after={c.after} /> : null}
      {c.status !== "cofnięta" ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.status === "do przejrzenia" ? (
            <button className="btn btn-sm border-emerald-600 bg-emerald-600 text-white" disabled={running} onClick={() => onDecide(c.id, "keep")}>
              ✓ Zostaw
            </button>
          ) : null}
          <button className="btn btn-sm" disabled={running} onClick={() => onDecide(c.id, "revert")}>
            ↶ Cofnij
          </button>
          <button className="btn btn-sm" disabled={running} onClick={() => setCommenting((v) => !v)}>
            ✎ Popraw…
          </button>
        </div>
      ) : null}
      {commenting ? (
        <div className="mt-2 flex gap-2">
          <input
            className="input text-sm"
            autoFocus
            placeholder="Co nie tak? np. „za dużo buzzwordów”, „nie pisz o bankowości”, „krócej”"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && comment.trim()) {
                onRefine(comment);
                setCommenting(false);
                setComment("");
              }
            }}
          />
          <button
            className="btn btn-sm btn-primary"
            disabled={running || !comment.trim()}
            onClick={() => {
              onRefine(comment);
              setCommenting(false);
              setComment("");
            }}
          >
            Popraw
          </button>
        </div>
      ) : null}
    </li>
  );
}

function Diff({ before, after }: { before: string | string[]; after: string | string[] }) {
  if (!Array.isArray(before) || !Array.isArray(after)) {
    return (
      <div className="mt-2 grid gap-1.5 text-sm leading-relaxed">
        <p className="rounded bg-rose-50 px-2 py-1 text-rose-900 line-through decoration-rose-300">{String(before) || "(puste)"}</p>
        <p className="rounded bg-emerald-50 px-2 py-1 text-emerald-950">{String(after)}</p>
      </div>
    );
  }
  const removed = before.filter((x) => !after.includes(x));
  return (
    <ul className="mt-2 grid gap-1 text-sm leading-relaxed">
      {after.map((x, i) => {
        const isNew = !before.includes(x);
        return (
          <li key={`a${i}`} className={`flex gap-2 rounded px-2 py-0.5 ${isNew ? "bg-emerald-50 text-emerald-950" : "text-muted"}`}>
            <span className="w-3 shrink-0 font-bold">{isNew ? "+" : "·"}</span>
            {x}
          </li>
        );
      })}
      {removed.map((x, i) => (
        <li key={`r${i}`} className="flex gap-2 rounded bg-rose-50 px-2 py-0.5 text-rose-900 line-through decoration-rose-300">
          <span className="w-3 shrink-0 font-bold no-underline">−</span>
          {x}
        </li>
      ))}
    </ul>
  );
}
