import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { CvSource, Fact, Job, Profile, ProfileTask } from "./types";

export const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");
export const SOURCES_DIR = path.join(DATA_DIR, "cv-sources");
export const JOBS_DIR = path.join(DATA_DIR, "jobs");
export const TMP_DIR = path.join(DATA_DIR, "tmp");
const PROFILE_FILE = path.join(DATA_DIR, "profile.json");
const SOURCES_FILE = path.join(DATA_DIR, "cv-sources.json");
const PROFILE_TASK_FILE = path.join(DATA_DIR, "profile-task.json");
const FACTS_FILE = path.join(DATA_DIR, "facts.json");

export function emptyProfile(): Profile {
  return {
    name: "",
    headline: "",
    contact: { phone: "", email: "", location: "", linkedin: "", website: "" },
    summaries: [],
    experience: [],
    education: [],
    languages: [],
    skills: [],
    courses: [],
    extras: "",
    gdpr: "",
  };
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

// Zapis atomowy, żeby równoległe zapisy nie zostawiły połówki pliku.
async function writeJson(file: string, data: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, file);
}

export const newId = () => randomUUID().slice(0, 8);

// ---------- Profil ----------

export async function getProfile(): Promise<Profile> {
  return { ...emptyProfile(), ...(await readJson<Partial<Profile>>(PROFILE_FILE, {})) };
}

export async function saveProfile(p: Profile) {
  p.updatedAt = new Date().toISOString();
  p.experience = p.experience.map((e) => ({ ...e, id: e.id || newId() }));
  await writeJson(PROFILE_FILE, p);
  return p;
}

export async function getProfileTask() {
  return readJson<ProfileTask | null>(PROFILE_TASK_FILE, null);
}

export async function setProfileTask(t: ProfileTask | null) {
  if (t === null) await fs.rm(PROFILE_TASK_FILE, { force: true });
  else await writeJson(PROFILE_TASK_FILE, t);
}

// ---------- Źródłowe CV (PDF) ----------

export async function listSources(): Promise<CvSource[]> {
  return readJson<CvSource[]>(SOURCES_FILE, []);
}

export async function saveSources(s: CvSource[]) {
  await writeJson(SOURCES_FILE, s);
}

export function sourcePath(id: string) {
  return path.join(SOURCES_DIR, `${id}.pdf`);
}

// ---------- Oferty ----------

function jobFile(id: string) {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error("Nieprawidłowe id");
  return path.join(JOBS_DIR, id, "job.json");
}

export function jobDir(id: string) {
  return path.dirname(jobFile(id));
}

export async function getJob(id: string): Promise<Job | null> {
  return readJson<Job | null>(jobFile(id), null);
}

export async function saveJob(job: Job) {
  job.updatedAt = new Date().toISOString();
  await writeJson(jobFile(job.id), job);
  return job;
}

// Odczyt-modyfikacja-zapis w jednej kolejce na ofertę.
const locks = new Map<string, Promise<unknown>>();
export async function updateJob(id: string, fn: (j: Job) => void | Promise<void>) {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(async () => {
    const job = await getJob(id);
    if (!job) throw new Error("Nie znaleziono oferty");
    await fn(job);
    return saveJob(job);
  });
  locks.set(id, next.catch(() => undefined));
  return next;
}

export async function listJobs(): Promise<Job[]> {
  let dirs: string[] = [];
  try {
    dirs = await fs.readdir(JOBS_DIR);
  } catch {
    return [];
  }
  const jobs = await Promise.all(dirs.map((d) => getJob(d).catch(() => null)));
  return (jobs.filter(Boolean) as Job[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteJob(id: string) {
  await fs.rm(jobDir(id), { recursive: true, force: true });
}

// ---------- Zapamiętane odpowiedzi (wspólne dla wszystkich ofert) ----------

export async function getFacts(): Promise<Fact[]> {
  return readJson<Fact[]>(FACTS_FILE, []);
}

let factsLock: Promise<unknown> = Promise.resolve();
export async function updateFacts(fn: (f: Fact[]) => Fact[]) {
  const next = factsLock.then(async () => {
    const f = fn(await getFacts());
    await writeJson(FACTS_FILE, f);
    return f;
  });
  factsLock = next.catch(() => undefined);
  return next;
}

/** Zbiera odpowiedzi z oferty (pytania z analizy, „czy to umiesz”, pytania z pętli poprawek) do wspólnej pamięci. */
export async function syncJobFacts(job: Job) {
  const source = [job.title, job.company].filter(Boolean).join(" – ") || job.url || "oferta";
  const now = new Date().toISOString();
  const items: Omit<Fact, "updatedAt" | "source">[] = [];
  for (const q of job.analysis?.questions ?? [])
    if (q.answer.trim()) items.push({ key: `${job.id}:q:${q.id}`, question: q.question, answer: q.answer.trim() });
  for (const s of job.analysis?.skillSuggestions ?? [])
    if (s.answer)
      items.push({
        key: `${job.id}:s:${s.name.toLowerCase()}`,
        question: `Czy masz: ${s.name}?`,
        answer: s.answer === "mam" ? `Tak${s.note.trim() ? ` – ${s.note.trim()}` : ""}` : "Nie",
      });
  for (const q of job.improve?.questions ?? [])
    if (q.kind === "pytanie" && q.answer.trim()) items.push({ key: `${job.id}:i:${q.id}`, question: q.question, answer: q.answer.trim() });

  const prefix = `${job.id}:`;
  await updateFacts((all) => {
    const byKey = new Map(all.map((f) => [f.key, f]));
    const keep = all.filter((f) => !f.key.startsWith(prefix)); // odpowiedzi z tej oferty budujemy od nowa
    for (const it of items) {
      const old = byKey.get(it.key);
      keep.push(old && old.answer === it.answer && old.question === it.question ? old : { ...it, source, updatedAt: now });
    }
    return keep;
  });
}

// ---------- Zdjęcie ----------

export const PHOTO_FILE = path.join(DATA_DIR, "photo");

export async function getPhoto(): Promise<{ data: Buffer; type: string } | null> {
  try {
    const meta = await readJson<{ type: string }>(`${PHOTO_FILE}.json`, { type: "image/jpeg" });
    return { data: await fs.readFile(PHOTO_FILE), type: meta.type };
  } catch {
    return null;
  }
}

export async function deletePhoto() {
  await fs.rm(PHOTO_FILE, { force: true });
  await fs.rm(`${PHOTO_FILE}.json`, { force: true });
}

export async function savePhoto(data: Buffer, type: string) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(PHOTO_FILE, data);
  await writeJson(`${PHOTO_FILE}.json`, { type });
}
