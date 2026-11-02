import "server-only";
import { runSkill } from "./claude";
import { fetchPosting } from "./fetch-posting";
import { analysisSchema, cvScoreSchema, profileSchema, rewriteSchemas, tailorResultSchema } from "./schemas";
import {
  getJob,
  getProfile,
  listSources,
  saveProfile,
  saveSources,
  setProfileTask,
  sourcePath,
  updateJob,
} from "./store";
import type { CvScore, Job, JobAnalysis, Profile, TailoredCv, TaskKind } from "./types";
import { renderPdf } from "./pdf";

const MESSAGES: Record<TaskKind, string> = {
  fetch: "Pobieram ogłoszenie…",
  analyze: "Claude analizuje ogłoszenie (zwykle 1–3 min)…",
  tailor: "Claude pisze CV i list motywacyjny (zwykle 2–4 min)…",
  rewrite: "Claude poprawia sekcję…",
  pdf: "Generuję PDF…",
  score: "Claude ocenia CV względem ogłoszenia (zwykle 1–2 min)…",
};

/** Odpala zadanie w tle; stan zadania zapisuje w job.task (UI go odpytuje). */
export async function startJobTask(id: string, kind: TaskKind, work: () => Promise<void>) {
  const job = await getJob(id);
  if (!job) throw new Error("Nie znaleziono oferty");
  if (job.task?.status === "running") throw new Error("Trwa już inne zadanie dla tej oferty");
  await updateJob(id, (j) => {
    j.task = { kind, status: "running", startedAt: new Date().toISOString(), message: MESSAGES[kind] };
  });
  void (async () => {
    try {
      await work();
      await updateJob(id, (j) => {
        j.task = undefined;
      });
    } catch (e) {
      console.error(`[task ${kind} ${id}]`, e);
      await updateJob(id, (j) => {
        j.task = {
          kind,
          status: "error",
          startedAt: j.task?.startedAt ?? new Date().toISOString(),
          error: e instanceof Error ? e.message : String(e),
        };
      }).catch(() => undefined);
    }
  })();
}

// ---------- Pobieranie ogłoszenia ----------

export async function doFetch(id: string) {
  const job = (await getJob(id))!;
  try {
    const p = await fetchPosting(job.url);
    await updateJob(id, (j) => {
      j.postingText = p.text;
      j.title = j.title || p.title;
      j.company = j.company || p.company;
      j.fetchError = undefined;
    });
  } catch (e) {
    await updateJob(id, (j) => {
      j.fetchError = e instanceof Error ? e.message : String(e);
    });
  }
}

// ---------- Analiza ----------

function profileForPrompt(p: Profile) {
  const { updatedAt: _u, ...rest } = p;
  void _u;
  return JSON.stringify(rest, null, 1);
}

export async function doAnalyze(id: string) {
  const job = (await getJob(id))!;
  const profile = await getProfile();
  const prompt = `Przeanalizuj poniższe ogłoszenie zgodnie z instrukcją skilla job-analysis.

<ogloszenie url="${job.url}">
${job.postingText}
</ogloszenie>

<baza_kandydata>
${profileForPrompt(profile)}
</baza_kandydata>`;
  const res = await runSkill<
    Omit<JobAnalysis, "questions" | "skillSuggestions"> & {
      questions: { id: string; question: string }[];
      skillSuggestions: { id: string; name: string; why: string }[];
    }
  >({
    skill: "job-analysis",
    prompt,
    schema: analysisSchema,
    tools: [],
  });
  await updateJob(id, (j) => {
    // zachowaj odpowiedzi na pytania o tym samym id przy ponownej analizie
    const old = new Map(j.analysis?.questions.map((q) => [q.id, q.answer]) ?? []);
    // …i decyzje „mam / nie mam” dla tych samych umiejętności (po nazwie)
    const key = (n: string) => n.trim().toLowerCase();
    const oldSkills = new Map(j.analysis?.skillSuggestions?.map((s) => [key(s.name), s]) ?? []);
    j.analysis = {
      ...res,
      questions: res.questions.map((q) => ({ ...q, answer: old.get(q.id) ?? "" })),
      skillSuggestions: res.skillSuggestions.map((s) => {
        const prev = oldSkills.get(key(s.name));
        return { ...s, answer: prev?.answer ?? "", note: prev?.note ?? "" };
      }),
    };
    j.title = res.jobTitle || j.title;
    j.company = res.company || j.company;
    if (j.status === "nowa") j.status = "w przygotowaniu";
  });
}

// ---------- Pisanie CV ----------

function analysisForPrompt(a: JobAnalysis) {
  return JSON.stringify(a, null, 1);
}

export async function doTailor(id: string) {
  const job = (await getJob(id))!;
  if (!job.analysis) throw new Error("Najpierw zrób analizę ogłoszenia");
  const profile = await getProfile();
  const prompt = `Napisz CV i list motywacyjny pod tę ofertę zgodnie z instrukcją skilla cv-tailor.

<ogloszenie url="${job.url}">
${job.postingText}
</ogloszenie>

<analiza_i_rekomendacje>
${analysisForPrompt(job.analysis)}
</analiza_i_rekomendacje>

<uwagi_kandydata>
${job.userNotes || "(brak)"}
</uwagi_kandydata>

<baza_kandydata>
${profileForPrompt(profile)}
</baza_kandydata>`;
  const res = await runSkill<{ cv: Omit<TailoredCv, "showPhoto">; coverLetter: string; changeNotes: string[] }>({
    skill: "cv-tailor",
    prompt,
    schema: tailorResultSchema,
    tools: [],
  });
  await updateJob(id, (j) => {
    j.cv = { ...res.cv, showPhoto: j.cv?.showPhoto ?? true, accent: j.cv?.accent };
    j.coverLetter = res.coverLetter;
    j.changeNotes = res.changeNotes;
    j.pdf = undefined;
  });
}

// ---------- Poprawka sekcji ----------

export type RewriteTarget =
  | { section: "summary" | "headline" | "skills" | "coverLetter" | "courses" }
  | { section: "experience"; index: number };

export async function doRewrite(id: string, target: RewriteTarget, instruction: string) {
  const job = (await getJob(id))!;
  if (!job.cv || !job.analysis) throw new Error("Brak CV do poprawy");
  const profile = await getProfile();
  const current =
    target.section === "coverLetter"
      ? job.coverLetter
      : target.section === "experience"
        ? job.cv.experience[target.index]
        : job.cv[target.section];
  const prompt = `Popraw jedną sekcję zgodnie z instrukcją skilla cv-rewrite.

<sekcja nazwa="${target.section}" jezyk_cv="${job.cv.lang}">
${JSON.stringify({ value: current }, null, 1)}
</sekcja>

<uwaga_kandydata>
${instruction || "(brak – popraw według analizy)"}
</uwaga_kandydata>

<analiza_i_rekomendacje>
${analysisForPrompt(job.analysis)}
</analiza_i_rekomendacje>

<uwagi_kandydata_do_oferty>
${job.userNotes || "(brak)"}
</uwagi_kandydata_do_oferty>

<cale_cv_dla_kontekstu>
${JSON.stringify(job.cv, null, 1)}
</cale_cv_dla_kontekstu>

<baza_kandydata>
${profileForPrompt(profile)}
</baza_kandydata>`;
  const res = await runSkill<{ value: unknown }>({
    skill: "cv-rewrite",
    prompt,
    schema: rewriteSchemas[target.section],
    tools: [],
  });
  await updateJob(id, (j) => {
    if (!j.cv) return;
    if (target.section === "coverLetter") j.coverLetter = res.value as string;
    else if (target.section === "experience") j.cv.experience[target.index] = res.value as TailoredCv["experience"][number];
    else (j.cv as unknown as Record<string, unknown>)[target.section] = res.value;
    j.pdf = undefined;
  });
}

// ---------- Ocena gotowego CV ----------

export function cvSnapshot(cv: TailoredCv) {
  const { showPhoto: _s, accent: _a, ...rest } = cv;
  void _s;
  void _a;
  return JSON.stringify(rest);
}

export async function doScore(id: string) {
  const job = (await getJob(id))!;
  if (!job.cv || !job.analysis) throw new Error("Najpierw napisz CV");
  const snapshot = cvSnapshot(job.cv);
  const text = snapshot.toLowerCase();
  const kw = job.analysis.keywords;
  const found = kw.filter((k) => text.includes(k.toLowerCase()));
  const prompt = `Oceń gotowe CV względem ogłoszenia zgodnie z instrukcją skilla cv-score.

<ogloszenie url="${job.url}">
${job.postingText}
</ogloszenie>

<analiza_ogloszenia wczesniejszy_fitScore="${job.analysis.fitScore}">
${JSON.stringify(
  { mustHave: job.analysis.mustHave, niceToHave: job.analysis.niceToHave, keywords: kw, fitComment: job.analysis.fitComment },
  null,
  1
)}
</analiza_ogloszenia>

<automatyczne_sprawdzenie_slow_kluczowych>
Znalezione dosłownie (${found.length}/${kw.length}): ${found.join(", ") || "(brak)"}
Nieznalezione: ${kw.filter((k) => !found.includes(k)).join(", ") || "(brak)"}
</automatyczne_sprawdzenie_slow_kluczowych>

<cv>
${JSON.stringify(job.cv, null, 1)}
</cv>

<list_motywacyjny>
${job.coverLetter || "(brak)"}
</list_motywacyjny>`;
  const res = await runSkill<Omit<CvScore, "keywordsFound" | "keywordsTotal" | "createdAt" | "cvSnapshot">>({
    skill: "cv-score",
    prompt,
    schema: cvScoreSchema,
    tools: [],
  });
  await updateJob(id, (j) => {
    j.cvScore = {
      ...res,
      keywordsFound: found.length,
      keywordsTotal: kw.length,
      createdAt: new Date().toISOString(),
      cvSnapshot: snapshot,
    };
  });
}

// ---------- PDF ----------

export async function doPdf(id: string, origin: string) {
  const job = (await getJob(id)) as Job;
  if (!job.cv) throw new Error("Brak CV");
  const result = await renderPdf(id, origin, job.cv);
  await updateJob(id, (j) => {
    j.pdf = { ...result, createdAt: new Date().toISOString() };
  });
}

// ---------- Import CV do bazy ----------

export async function startImport(sourceIds: string[]) {
  await setProfileTask({ kind: "import", status: "running", startedAt: new Date().toISOString() });
  void (async () => {
    try {
      const profile = await getProfile();
      const files = sourceIds.map(sourcePath);
      const prompt = `Zbuduj/uzupełnij bazę kandydata zgodnie z instrukcją skilla cv-import.

Pliki CV do przeczytania (użyj narzędzia Read na każdym):
${files.map((f) => `- ${f}`).join("\n")}

<aktualna_baza>
${profileForPrompt(profile)}
</aktualna_baza>`;
      const res = await runSkill<Profile>({ skill: "cv-import", prompt, schema: profileSchema, tools: ["Read"] });
      // pole notes należy do użytkownika – nie pozwól go nadpisać
      const oldNotes = new Map(profile.experience.map((e) => [e.id, e.notes]));
      res.experience = res.experience.map((e) => ({ ...e, notes: oldNotes.get(e.id) || e.notes || "" }));
      await saveProfile({ ...res, extras: res.extras || profile.extras });
      const now = new Date().toISOString();
      const sources = await listSources();
      await saveSources(sources.map((s) => (sourceIds.includes(s.id) ? { ...s, importedAt: now } : s)));
      await setProfileTask({ kind: "import", status: "done", startedAt: now });
    } catch (e) {
      console.error("[import]", e);
      await setProfileTask({
        kind: "import",
        status: "error",
        startedAt: new Date().toISOString(),
        error: e instanceof Error ? e.message : String(e),
      });
    }
  })();
}
