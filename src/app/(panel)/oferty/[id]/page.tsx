"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Badge, Elapsed, fitTone, Spinner } from "@/components/ui";
import { PostingStep } from "@/components/job/PostingStep";
import { AnalysisStep } from "@/components/job/AnalysisStep";
import { CvStep } from "@/components/job/CvStep";
import { JOB_STATUSES, type Job } from "@/lib/types";

type Tab = "posting" | "analysis" | "cv";

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [error, setError] = useState("");
  // wersja danych z serwera – edytory przeładowują stan tylko po zadaniach Claude'a
  const [serverRev, setServerRev] = useState(0);

  const reload = useCallback(async () => {
    const j = await api<Job>(`/api/jobs/${id}`);
    setJob(j);
    return j;
  }, [id]);

  useEffect(() => {
    reload()
      .then((j) => setTab(j.cv ? "cv" : j.analysis ? "analysis" : "posting"))
      .catch((e) => setError(e.message));
  }, [reload]);

  const running = job?.task?.status === "running";

  // odpytywanie, gdy Claude pracuje
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const j = await reload();
      if (j.task?.status !== "running") setServerRev((r) => r + 1);
    }, 2000);
    return () => clearInterval(t);
  }, [running, reload]);

  // automatyczne przejście do wyniku po zakończonym zadaniu
  const prevKind = useRef<string | undefined>(undefined);
  useEffect(() => {
    const kind = job?.task?.kind;
    if (prevKind.current && !job?.task) {
      if (prevKind.current === "analyze") setTab("analysis");
      if (prevKind.current === "tailor") setTab("cv");
    }
    prevKind.current = job?.task?.status === "running" ? kind : undefined;
  }, [job?.task]);

  async function patch(p: Partial<Job>) {
    setJob((j) => (j ? { ...j, ...p } : j));
    try {
      const j = await api<Job>(`/api/jobs/${id}`, { method: "PATCH", json: p });
      setJob((cur) => (cur ? { ...cur, pdf: j.pdf, updatedAt: j.updatedAt } : j));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function run(body: Record<string, unknown>) {
    setError("");
    try {
      await api(`/api/jobs/${id}/run`, { method: "POST", json: body });
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove() {
    if (!window.confirm("Usunąć tę ofertę razem z CV?")) return;
    await api(`/api/jobs/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (!job) {
    return error ? (
      <p className="text-rose-600">{error}</p>
    ) : (
      <p className="text-muted">
        <Spinner /> Wczytuję…
      </p>
    );
  }

  const host = job.url ? new URL(job.url).hostname.replace(/^www\./, "") : "";
  const tabs: { key: Tab; label: string; enabled: boolean }[] = [
    { key: "posting", label: "1. Ogłoszenie", enabled: true },
    { key: "analysis", label: "2. Analiza i rekomendacje", enabled: !!job.analysis },
    { key: "cv", label: "3. CV i list motywacyjny", enabled: !!job.cv },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight">{job.title || "Nowa oferta"}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-muted">
            {job.company ? <span className="font-semibold text-ink">{job.company}</span> : null}
            {job.url ? (
              <a href={job.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                {host} ↗
              </a>
            ) : null}
            {job.analysis ? <Badge tone={fitTone(job.analysis.fitScore)}>{job.analysis.fitScore}% dopasowania</Badge> : null}
            {job.cvScore ? <Badge tone={fitTone(job.cvScore.score)}>CV: {job.cvScore.score}%</Badge> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input w-auto font-semibold" value={job.status} onChange={(e) => patch({ status: e.target.value as Job["status"] })}>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button className="btn btn-ghost text-muted" onClick={remove}>
            Usuń
          </button>
        </div>
      </div>

      <div className="mt-6 flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            disabled={!t.enabled}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              tab === t.key ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {running ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl bg-brand-soft px-4 py-3 text-sm font-semibold text-brand">
          <Spinner />
          <span className="flex-1">{job.task!.message}</span>
          <Elapsed since={job.task!.startedAt} />
        </div>
      ) : job.task?.status === "error" ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span className="flex-1">
            <b>Nie udało się:</b> {job.task.error}
          </span>
          <button className="btn btn-sm" onClick={() => patch({ clearTaskError: true } as Partial<Job>).then(reload)}>
            Zamknij
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-4 rounded-lg bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700">{error}</p> : null}

      <div className="mt-6">
        {tab === "posting" ? <PostingStep job={job} running={running} patch={patch} run={run} /> : null}
        {tab === "analysis" && job.analysis ? (
          <AnalysisStep key={serverRev} job={job} running={running} patch={patch} run={run} />
        ) : null}
        {tab === "cv" && job.cv ? <CvStep key={serverRev} job={job} running={running} patch={patch} run={run} /> : null}
      </div>
    </div>
  );
}
