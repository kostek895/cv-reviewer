import "server-only";
import { runSkill } from "./claude";
import { fetchPosting } from "./fetch-posting";
import { analysisSchema, cvScoreSchema, improveSchema, profileSchema, rewriteSchemas, tailorResultSchema } from "./schemas";
import { getAt, isListPath, isValidPath, pathLabel, sameValue, setAt, type CvValue } from "./cvpath";
import {
  getFacts,
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
  improve: "Claude szuka poprawek CV (zwykle 2–3 min)…",
  refine: "Claude przeredagowuje propozycję według Twojej uwagi…",
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

/** Baza kandydata + zapamiętane odpowiedzi ze wszystkich ofert. */
async function profileForPrompt(p: Profile) {
  const { updatedAt: _u, ...rest } = p;
  void _u;
  const facts = await getFacts();
  return JSON.stringify(
    {
      ...rest,
      zapamietane_odpowiedzi: facts.map((f) => ({ pytanie: f.question, odpowiedz: f.answer, z_oferty: f.source })),
    },
    null,
    1
  );
}

export async function doAnalyze(id: string) {
  const job = (await getJob(id))!;
  const profile = await getProfile();
  const prompt = `Przeanalizuj poniższe ogłoszenie zgodnie z instrukcją skilla job-analysis.

<ogloszenie url="${job.url}">
${job.postingText}
</ogloszenie>

<baza_kandydata>
${await profileForPrompt(profile)}
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
${await profileForPrompt(profile)}
</baza_kandydata>`;
  const res = await runSkill<{ cv: Omit<TailoredCv, "showPhoto">; coverLetter: string; changeNotes: string[] }>({
    skill: "cv-tailor",
    prompt,
    schema: tailorResultSchema,
    tools: [],
  });
  await updateJob(id, (j) => {
    j.cv = { ...res.cv, showPhoto: j.cv?.showPhoto ?? true, accent: j.cv?.accent };
    // nowe CV – propozycje do starej wersji tracą sens
    if (j.improve) j.improve.changes = j.improve.changes.filter((c) => c.status !== "do przejrzenia");
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
${await profileForPrompt(profile)}
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
${await profileForPrompt(await getProfile())}
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

// ---------- Propozycje poprawek (kandydat zatwierdza / odrzuca) ----------

/** Jedna runda: Claude proponuje poprawki CV. Nic nie zmienia w CV, dopóki kandydat ich nie zatwierdzi. */
export async function doImprove(id: string) {
  const job = (await getJob(id))!;
  if (!job.cv || !job.analysis) throw new Error("Najpierw napisz CV");
  const cv = job.cv;
  const profile = await getProfile();
  const round = (job.improve?.rounds.at(-1)?.round ?? 0) + 1;
  const score = job.cvScore;
  const scoreFresh = score && score.cvSnapshot === cvSnapshot(cv);

  // odrzucone przez kandydata (bez zmian cofniętych automatycznie w starej pętli z oceną)
  const autoReverted = new Set((job.improve?.rounds ?? []).filter((r) => r.reverted).map((r) => r.round));
  const rejected = (job.improve?.changes ?? [])
    .filter((c) => c.status === "cofnięta" && (c.comment || !autoReverted.has(c.round)))
    .map((c) => ({ pole: isValidPath(cv, c.path) ? pathLabel(cv, c.path) : c.path, odrzucona_wersja: c.after, komentarz: c.comment ?? "" }));
  const prompt = `Zaproponuj poprawki CV zgodnie z instrukcją skilla cv-improve.

<cv>
${JSON.stringify(cv, null, 1)}
</cv>

<ostatnia_ocena_cv ${score ? `wynik="${score.score}" aktualna="${scoreFresh ? "tak" : "nie – CV zmieniło się od oceny"}"` : ""}>
${score ? JSON.stringify({ comment: score.comment, suggestions: score.suggestions, missingKeywords: score.missingKeywords, requirements: score.requirements }, null, 1) : "(brak oceny)"}
</ostatnia_ocena_cv>

<odrzucone_propozycje>
${rejected.length ? JSON.stringify(rejected, null, 1) : "(brak)"}
</odrzucone_propozycje>

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
${await profileForPrompt(profile)}
</baza_kandydata>`;
  const res = await runSkill<{ changes: { path: string; text: string; list: string[]; reason: string }[] }>({
    skill: "cv-improve",
    prompt,
    schema: improveSchema,
    tools: [],
  });

  await updateJob(id, (j) => {
    if (!j.cv) return;
    const jcv = j.cv;
    const prev = j.improve;
    // niezatwierdzone propozycje z poprzedniej rundy zastępuje nowa runda
    const kept = (prev?.changes ?? []).filter(
      (c) => c.status !== "do przejrzenia" || (isValidPath(jcv, c.path) && sameValue(getAt(jcv, c.path), c.after))
    );
    const seen = new Set<string>();
    const proposals: CvChange[] = [];
    for (const c of res.changes) {
      if (!isValidPath(jcv, c.path) || seen.has(c.path)) continue;
      const after: CvValue = isListPath(c.path) ? c.list.map((x) => x.trim()).filter(Boolean) : c.text.trim();
      const before = getAt(jcv, c.path);
      if (!after.length || sameValue(before, after)) continue;
      seen.add(c.path);
      proposals.push({ id: newChangeId(), round, path: c.path, before, after, reason: c.reason, status: "do przejrzenia" });
    }
    j.improve = {
      target: 100,
      rounds: [...(prev?.rounds ?? []), { round, scoreBefore: j.cvScore?.score ?? 0 }],
      changes: [...kept, ...proposals],
      questions: prev?.questions,
      stopReason: proposals.length
        ? undefined
        : "Claude nie widzi już poprawek opartych na Twoich faktach – to najlepsza wersja tego CV, jaką da się uczciwie napisać.",
    };
  });
}

const newChangeId = () => Math.random().toString(36).slice(2, 10);

/** Przeredaguj propozycję według uwagi kandydata (wynik to nadal propozycja do zatwierdzenia). */
export async function doRefine(id: string, changeId: string, comment: string) {
  const job = (await getJob(id))!;
  const ch = job.improve?.changes.find((c) => c.id === changeId);
  if (!job.cv || !job.analysis || !ch) throw new Error("Nie znaleziono propozycji");
  if (!isValidPath(job.cv, ch.path)) throw new Error("Ten fragment CV już nie istnieje");
  const profile = await getProfile();
  const prompt = `Popraw jeden fragment CV zgodnie z instrukcją skilla cv-rewrite.

<fragment nazwa="${pathLabel(job.cv, ch.path)}" jezyk_cv="${job.cv.lang}" uwaga="to propozycja nowej wersji – popraw ją według uwagi kandydata">
${JSON.stringify({ value: ch.after }, null, 1)}
</fragment>

<obecna_wersja_w_cv>
${JSON.stringify(ch.before, null, 1)}
</obecna_wersja_w_cv>

<powod_propozycji>
${ch.reason}
</powod_propozycji>

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
${await profileForPrompt(profile)}
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
    // jeśli propozycja jest już w CV (zatwierdzona), podmień też treść w CV
    if (isValidPath(j.cv, c.path) && sameValue(getAt(j.cv, c.path), c.after)) {
      setAt(j.cv, c.path, res.value);
      j.pdf = undefined;
    }
    c.after = res.value;
    c.comment = comment;
  });
}

/** Zatwierdź (wstaw do CV) albo odrzuć / cofnij propozycję. Bez Claude'a. */
export async function decideChange(id: string, changeId: string | "all", op: "keep" | "revert") {
  return updateJob(id, (j) => {
    if (!j.cv || !j.improve) throw new Error("Brak propozycji");
    const cv = j.cv;
    const fresh = (c: CvChange) => isValidPath(cv, c.path) && (sameValue(getAt(cv, c.path), c.before) || sameValue(getAt(cv, c.path), c.after));
    const list =
      changeId === "all"
        ? j.improve.changes.filter((c) => c.status === "do przejrzenia" && fresh(c))
        : j.improve.changes.filter((c) => c.id === changeId);
    if (!list.length) throw new Error("Nie znaleziono propozycji");
    for (const c of list) {
      if (!isValidPath(j.cv, c.path)) throw new Error("Ten fragment CV już nie istnieje");
      const current = getAt(j.cv, c.path);
      const label = pathLabel(j.cv, c.path);
      if (op === "keep") {
        if (!sameValue(current, c.after)) {
          if (!sameValue(current, c.before)) throw new Error(`„${label}” zmieniło się po tej propozycji – odrzuć ją i wygeneruj nowe propozycje.`);
          setAt(j.cv, c.path, c.after);
          j.pdf = undefined;
        }
        c.status = "zostawiona";
      } else {
        if (sameValue(current, c.after)) {
          setAt(j.cv, c.path, c.before);
          j.pdf = undefined;
        }
        c.status = "cofnięta";
      }
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
${await profileForPrompt(profile)}
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
