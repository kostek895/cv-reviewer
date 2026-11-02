"use client";

import { useState } from "react";
import { api, Badge, Section, Spinner } from "@/components/ui";
import { getAt, isValidPath, pathLabel, sameValue } from "@/lib/cvpath";
import type { CvChange, Job, TailoredCv } from "@/lib/types";

const STATUS_LABEL: Record<CvChange["status"], string> = {
  "do przejrzenia": "propozycja",
  zostawiona: "zatwierdzona",
  cofnięta: "odrzucona",
};

/** Propozycje poprawek CV – każdą zatwierdzasz, odrzucasz albo każesz przeredagować. */
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
  const [error, setError] = useState("");
  const [showDone, setShowDone] = useState(false);
  const improving = running && job.task?.kind === "improve";
  // propozycja jest aktualna, dopóki pole w CV wygląda tak jak w „było” (albo już jak w „jest”)
  const isCurrent = (c: CvChange) => isValidPath(cv, c.path) && (sameValue(getAt(cv, c.path), c.before) || sameValue(getAt(cv, c.path), c.after));
  const open = imp?.changes.filter((c) => c.status === "do przejrzenia") ?? [];
  const pending = open.filter(isCurrent);
  const stale = open.length - pending.length;
  const done = imp?.changes.filter((c) => c.status !== "do przejrzenia") ?? [];

  async function decide(changeId: string, op: "keep" | "revert") {
    setError("");
    try {
      await api(`/api/jobs/${job.id}/changes`, { method: "POST", json: { changeId, op } });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Section
      title={
        <>
          Propozycje poprawek {pending.length ? <Badge tone="amber">{pending.length} do decyzji</Badge> : null}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted">
          Claude szuka, co jeszcze wzmocni CV na podstawie Twoich umiejętności, doświadczenia i wykształcenia. Niczego nie zmienia sam – każdą
          propozycję zatwierdzasz albo odrzucasz. Odrzuconych nie proponuje ponownie. Wynik sprawdzasz, kiedy chcesz, przyciskiem „Sprawdź
          dopasowanie”.
        </p>
        <button className="btn btn-sm btn-primary" disabled={running} onClick={() => run({ action: "improve" })}>
          {improving ? <Spinner className="size-3" /> : null}
          {pending.length ? "Nowe propozycje" : "Zaproponuj poprawki"}
        </button>
      </div>
      {pending.length && !improving ? (
        <p className="mt-1.5 text-xs text-muted">„Nowe propozycje” zastąpią te, o których jeszcze nie zdecydowałeś.</p>
      ) : null}

      {stale ? (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2.5 text-sm">
          {stale === 1 ? "1 propozycja dotyczyła" : `${stale} propozycji dotyczyło`} starszej wersji CV (zmieniłeś je potem), więc ją ukrywam. Kliknij
          „Zaproponuj poprawki”, żeby dostać propozycje do obecnej wersji.
        </p>
      ) : null}

      {imp?.stopReason && !pending.length && !stale ? <p className="mt-4 rounded-lg bg-canvas px-3 py-2.5 text-sm">{imp.stopReason}</p> : null}

      {error ? <p className="mt-3 text-sm font-semibold text-rose-600">{error}</p> : null}

      {pending.length ? (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="label mb-0">Do decyzji</span>
            {pending.length > 1 ? (
              <span className="ml-auto flex gap-1.5">
                <button className="btn btn-sm" disabled={running} onClick={() => decide("all", "keep")}>
                  Zatwierdź wszystkie
                </button>
                <button className="btn btn-sm" disabled={running} onClick={() => decide("all", "revert")}>
                  Odrzuć wszystkie
                </button>
              </span>
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
            {showDone
              ? "Ukryj historię"
              : `Pokaż historię (${done.filter((c) => c.status === "zostawiona").length} zatwierdzone, ${done.filter((c) => c.status === "cofnięta").length} odrzucone)`}
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
        {c.status !== "do przejrzenia" ? <Badge tone={c.status === "zostawiona" ? "green" : "gray"}>{STATUS_LABEL[c.status]}</Badge> : null}
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
              ✓ Zatwierdź
            </button>
          ) : null}
          <button className="btn btn-sm" disabled={running} onClick={() => onDecide(c.id, "revert")}>
            {c.status === "do przejrzenia" ? "✗ Odrzuć" : "↶ Cofnij z CV"}
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
