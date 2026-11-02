import "server-only";
import { runSkill } from "./claude";
import { fetchPosting } from "./fetch-posting";
import { analysisSchema, cvScoreSchema, improveSchema, profileSchema, rewriteSchemas, tailorResultSchema } from "./schemas";
import { getAt, isListPath, isValidPath, pathLabel, sameValue, setAt, type CvValue } from "./cvpath";
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
import type { CvChange, CvScore, Job, JobAnalysis, Profile, TailoredCv, TaskKind } from "./types";
import { renderPdf } from "./pdf";

const MESSAGES: Record<TaskKind, string> = {
  fetch: "Pobieram ogłoszenie…",
  analyze: "Claude analizuje ogłoszenie (zwykle 1–3 min)…",
  tailor: "Claude pisze CV i list motywacyjny (zwykle 2–4 min)…",
  rewrite: "Claude poprawia sekcję…",
  pdf: "Generuję PDF…",
  score: "Claude ocenia CV względem ogłoszenia (zwykle 1–2 min)…",
  improve: "Claude poprawia CV i ocenia je ponownie…",
  refine: "Claude poprawia fragment według Twojej uwagi…",
};

async function setTaskMessage(id: string, message: string) {
  await updateJob(id, (j) => {
    if (j.task?.status === "running") j.task.message = message;
  });
}

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
</list_motywacyjny>

<baza_kandydata uwaga="tylko do sugestii – oceniasz to, co jest w CV">
${profileForPrompt(await getProfile())}
</baza_kandydata>

<uwagi_kandydata>
${job.userNotes || "(brak)"}
</uwagi_kandydata>

<fakty_potwierdzone_przez_kandydata uwaga="to też jest baza – nie zgłaszaj ich jako niepotwierdzonych">
${JSON.stringify(
  {
    odpowiedzi: job.analysis.questions.filter((q) => q.answer.trim()).map((q) => ({ pytanie: q.question, odpowiedz: q.answer })),
    umiejetnosci_mam: (job.analysis.skillSuggestions ?? []).filter((x) => x.answer === "mam").map((x) => (x.note ? `${x.name}: ${x.note}` : x.name)),
  },
  null,
  1
)}
</fakty_potwierdzone_przez_kandydata>`;
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

// ---------- Automatyczne poprawki do celu ----------

const MAX_ROUNDS = 3;

export async function doImprove(id: string, target: number) {
  let job = (await getJob(id))!;
  if (!job.cv || !job.analysis) throw new Error("Najpierw napisz CV");
  const profile = await getProfile();

  const stop = async (reason: string, blockers?: string[]) => {
    await updateJob(id, (j) => {
      if (!j.improve) return;
      j.improve.stopReason = reason;
      if (blockers) j.improve.blockers = blockers;
    });
  };

  await updateJob(id, (j) => {
    j.improve = { target, rounds: j.improve?.rounds ?? [], changes: j.improve?.changes ?? [], blockers: [], stopReason: undefined };
  });

  if (!job.cvScore || job.cvScore.cvSnapshot !== cvSnapshot(job.cv)) {
    await setTaskMessage(id, "Oceniam aktualne CV…");
    await doScore(id);
    job = (await getJob(id))!;
  }

  for (let i = 0; i < MAX_ROUNDS; i++) {
    const before = job.cvScore!;
    if (before.score >= target) return stop(`Cel osiągnięty: ${before.score}%.`);
    const round = (job.improve?.rounds.at(-1)?.round ?? 0) + 1;
    await setTaskMessage(id, `Runda ${i + 1}/${MAX_ROUNDS}: Claude wprowadza poprawki (teraz ${before.score}%, cel ${target}%)…`);

    const rejected = (job.improve?.changes ?? [])
      .filter((c) => c.status === "cofnięta")
      .map((c) => ({ pole: pathLabel(job.cv!, c.path), odrzucona_wersja: c.after, komentarz: c.comment ?? "" }));
    const prompt = `Przeprowadź jedną rundę poprawek zgodnie z instrukcją skilla cv-improve. Cel: ${target}/100.

<ocena_cv wynik="${before.score}">
${JSON.stringify({ comment: before.comment, suggestions: before.suggestions, missingKeywords: before.missingKeywords, requirements: before.requirements }, null, 1)}
</ocena_cv>

<odrzucone>
${rejected.length ? JSON.stringify(rejected, null, 1) : "(brak)"}
</odrzucone>

<cv>
${JSON.stringify(job.cv, null, 1)}
</cv>

<ogloszenie url="${job.url}">
${job.postingText}
</ogloszenie>

<analiza_i_rekomendacje>
${analysisForPrompt(job.analysis!)}
</analiza_i_rekomendacje>

<uwagi_kandydata>
${job.userNotes || "(brak)"}
</uwagi_kandydata>

<baza_kandydata>
${profileForPrompt(profile)}
</baza_kandydata>`;
    const res = await runSkill<{ changes: { path: string; text: string; list: string[]; reason: string }[]; blockers: string[] }>({
      skill: "cv-improve",
      prompt,
      schema: improveSchema,
      tools: [],
    });

    const applied: CvChange[] = [];
    await updateJob(id, (j) => {
      if (!j.cv || !j.improve) return;
      const seen = new Set<string>();
      for (const c of res.changes) {
        if (!isValidPath(j.cv, c.path) || seen.has(c.path)) continue;
        const after: CvValue = isListPath(c.path) ? c.list.map((x) => x.trim()).filter(Boolean) : c.text.trim();
        const prev = getAt(j.cv, c.path);
        if (!after.length || sameValue(prev, after)) continue;
        seen.add(c.path);
        setAt(j.cv, c.path, after);
        applied.push({ id: newChangeId(), round, path: c.path, before: prev, after, reason: c.reason, status: "do przejrzenia" });
      }
      j.improve.changes.push(...applied);
      j.improve.rounds.push({ round, scoreBefore: before.score });
      j.pdf = undefined;
    });
    if (!applied.length) {
      await updateJob(id, (j) => void j.improve?.rounds.pop());
      return stop(
        `Claude nie widzi już poprawek opartych na Twoich faktach (wynik ${before.score}%).`,
        res.blockers
      );
    }

    await setTaskMessage(id, `Runda ${i + 1}/${MAX_ROUNDS}: oceniam CV po ${applied.length} poprawkach…`);
    await doScore(id);
    job = (await getJob(id))!;
    const after = job.cvScore!.score;

    if (after < before.score) {
      // runda pogorszyła wynik – przywróć poprzednią wersję i poprzednią ocenę
      await updateJob(id, (j) => {
        if (!j.cv || !j.improve) return;
        for (const c of applied) {
          setAt(j.cv, c.path, c.before);
          const ch = j.improve.changes.find((x) => x.id === c.id);
          if (ch) ch.status = "cofnięta";
        }
        const r = j.improve.rounds.at(-1)!;
        r.scoreAfter = after;
        r.reverted = true;
        j.cvScore = before;
      });
      return stop(`Runda ${round} obniżyła wynik (${before.score}% → ${after}%), więc ją cofnąłem.`, res.blockers);
    }

    await updateJob(id, (j) => {
      const r = j.improve?.rounds.at(-1);
      if (r) r.scoreAfter = after;
      if (j.improve) j.improve.blockers = res.blockers;
    });
    if (after >= target) return stop(`Cel osiągnięty: ${after}%.`, res.blockers);
    if (after - before.score < 2) return stop(`Wynik przestał rosnąć (${before.score}% → ${after}%).`, res.blockers);
  }
  return stop(`Limit ${MAX_ROUNDS} rund w jednym przebiegu – wynik ${job.cvScore!.score}%. Możesz uruchomić kolejny.`);
}

const newChangeId = () => Math.random().toString(36).slice(2, 10);

/** Poprawia jedną zmianę według uwagi kandydata. */
export async function doRefine(id: string, changeId: string, comment: string) {
  const job = (await getJob(id))!;
  const ch = job.improve?.changes.find((c) => c.id === changeId);
  if (!job.cv || !job.analysis || !ch) throw new Error("Nie znaleziono zmiany");
  if (!isValidPath(job.cv, ch.path)) throw new Error("Ten fragment CV już nie istnieje");
  const profile = await getProfile();
  const current = getAt(job.cv, ch.path);
  const prompt = `Popraw jeden fragment CV zgodnie z instrukcją skilla cv-rewrite.

<fragment nazwa="${pathLabel(job.cv, ch.path)}" jezyk_cv="${job.cv.lang}">
${JSON.stringify({ value: current }, null, 1)}
</fragment>

<wersja_sprzed_automatycznej_poprawki>
${JSON.stringify(ch.before, null, 1)}
</wersja_sprzed_automatycznej_poprawki>

<powod_automatycznej_poprawki>
${ch.reason}
</powod_automatycznej_poprawki>

<uwaga_kandydata>
${comment}
</uwaga_kandydata>

<analiza_i_rekomendacje>
${analysisForPrompt(job.analysis)}
</analiza_i_rekomendacje>

<cale_cv_dla_kontekstu>
${JSON.stringify(job.cv, null, 1)}
</cale_cv_dla_kontekstu>

<baza_kandydata>
${profileForPrompt(profile)}
</baza_kandydata>`;
  const res = await runSkill<{ value: CvValue }>({
    skill: "cv-rewrite",
    prompt,
    schema: isListPath(ch.path) ? rewriteSchemas.skills : rewriteSchemas.summary,
    tools: [],
  });
  await updateJob(id, (j) => {
    const c = j.improve?.changes.find((x) => x.id === changeId);
    if (!j.cv || !c) return;
    setAt(j.cv, c.path, res.value);
    c.after = res.value;
    c.comment = comment;
    c.status = "do przejrzenia";
    j.pdf = undefined;
  });
}

/** Zostaw / cofnij zmianę (bez Claude'a). */
export async function decideChange(id: string, changeId: string | "all", op: "keep" | "revert") {
  return updateJob(id, (j) => {
    if (!j.cv || !j.improve) throw new Error("Brak zmian");
    const list = changeId === "all" ? j.improve.changes.filter((c) => c.status === "do przejrzenia") : j.improve.changes.filter((c) => c.id === changeId);
    if (!list.length) throw new Error("Nie znaleziono zmiany");
    for (const c of list) {
      if (op === "keep") {
        c.status = "zostawiona";
        continue;
      }
      if (!isValidPath(j.cv, c.path)) throw new Error("Ten fragment CV już nie istnieje");
      if (!sameValue(getAt(j.cv, c.path), c.after))
        throw new Error(`„${pathLabel(j.cv, c.path)}” zmieniłeś ręcznie po tej poprawce – cofnij go ręcznie w edytorze.`);
      setAt(j.cv, c.path, c.before);
      c.status = "cofnięta";
      j.pdf = undefined;
    }
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
