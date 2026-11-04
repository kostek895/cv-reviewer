// ---------- Baza (wszystko, co wiemy o kandydacie) ----------

export interface Contact {
  phone: string;
  email: string;
  location: string;
  linkedin: string;
  website: string;
}

export interface ProfileExperience {
  id: string;
  company: string;
  role: string;
  location: string;
  start: string; // np. "2021"
  end: string; // np. "2024" albo "obecnie"
  context: string; // 1-2 zdania o firmie / produkcie
  bullets: string[]; // wszystkie znane punkty, ze wszystkich wersji CV
  notes: string; // dodatkowe fakty, liczby, wyniki dopisane przez użytkownika
}

export interface Education {
  period: string;
  degree: string;
  school: string;
}

export interface Language {
  name: string;
  level: string;
}

export interface Course {
  name: string;
  issuer: string;
  year: string;
  description: string;
}

export interface Profile {
  name: string;
  headline: string;
  contact: Contact;
  summaries: string[]; // różne wersje "O mnie"
  experience: ProfileExperience[];
  education: Education[];
  languages: Language[];
  skills: string[];
  courses: Course[];
  extras: string; // projekty, wolontariat, zainteresowania, inne fakty – wolny tekst
  gdpr: string; // domyślna klauzula RODO
  updatedAt?: string;
}

export interface CvSource {
  id: string;
  fileName: string;
  uploadedAt: string;
  importedAt?: string;
}

// ---------- CV dopasowane do oferty (to trafia do szablonu) ----------

export interface CvExperience {
  company: string;
  role: string;
  location: string;
  period: string;
  intro: string;
  bullets: string[];
}

export interface TailoredCv {
  lang: "pl" | "en";
  name: string;
  headline: string;
  contact: Contact;
  summary: string;
  experience: CvExperience[];
  education: Education[];
  languages: Language[];
  skills: string[];
  courses: Course[];
  gdpr: string;
  showPhoto: boolean;
  accent?: string; // kolor szablonu (#rrggbb)
}

// ---------- Analiza ogłoszenia ----------

export type Match = "mocne" | "częściowe" | "brak";

export interface RequirementCheck {
  requirement: string;
  match: Match;
  evidence: string;
}

export interface Recommendation {
  priority: "wysoki" | "średni" | "niski";
  text: string;
}

export interface Question {
  id: string;
  question: string;
  answer: string;
}

export interface SkillSuggestion {
  id: string;
  name: string;
  why: string; // skąd pomysł: wymaganie z ogłoszenia / co z doświadczenia na to wskazuje
  answer: "" | "mam" | "nie mam";
  note: string; // opcjonalny kontekst od kandydata (gdzie, jak długo)
}

export interface JobAnalysis {
  jobTitle: string;
  company: string;
  location: string;
  seniority: string;
  language: "pl" | "en";
  whoTheySeek: string;
  mustHave: RequirementCheck[];
  niceToHave: RequirementCheck[];
  keywords: string[];
  cultureSignals: string[];
  redFlags: string[];
  fitScore: number;
  fitComment: string;
  recommendations: Recommendation[];
  emphasize: string[];
  deemphasize: string[];
  coverLetterAngle: string;
  gdprClause: string;
  questions: Question[];
  skillSuggestions?: SkillSuggestion[];
}

// ---------- Oferta ----------

export type JobStatus =
  | "nowa"
  | "w przygotowaniu"
  | "wysłana"
  | "rozmowa"
  | "oferta"
  | "odmowa"
  | "odpuszczona";

export const JOB_STATUSES: JobStatus[] = [
  "nowa",
  "w przygotowaniu",
  "wysłana",
  "rozmowa",
  "oferta",
  "odmowa",
  "odpuszczona",
];

export type TaskKind = "fetch" | "analyze" | "tailor" | "rewrite" | "pdf" | "score" | "improve" | "refine";

export interface TaskState {
  kind: TaskKind;
  status: "running" | "error";
  startedAt: string;
  message?: string;
  error?: string;
}

export interface CvScore {
  score: number;
  comment: string;
  requirements: { requirement: string; mustHave: boolean; covered: "tak" | "częściowo" | "nie"; where: string }[];
  missingKeywords: string[];
  suggestions: string[];
  keywordsFound: number;
  keywordsTotal: number;
  createdAt: string;
  cvSnapshot: string; // JSON CV w chwili oceny – żeby pokazać, że CV zmieniło się od tego czasu
}

export interface CvChange {
  id: string;
  round: number;
  path: string; // np. "summary", "experience.0.bullets" – patrz lib/cvpath.ts
  before: string | string[];
  after: string | string[];
  reason: string;
  status: "do przejrzenia" | "zostawiona" | "cofnięta";
  comment?: string; // ostatnia uwaga kandydata do tej zmiany
}

export interface ImproveQuestion {
  id: string;
  question: string;
  kind: "pytanie" | "brak"; // pytanie o fakt albo realny brak do zaakceptowania
  answer: string;
}

export interface CvVersion {
  at: string; // kiedy zapisano tę wersję (tuż przed zmianą)
  source: string; // co ją zastąpiło, np. „ręczna edycja”, „Napisz CV”
  cv: TailoredCv;
}

export interface ImproveState {
  target: number;
  rounds: { round: number; scoreBefore: number; scoreAfter?: number; reverted?: boolean }[];
  changes: CvChange[];
  stopReason?: string;
  questions?: ImproveQuestion[]; // czego Claude potrzebuje od kandydata, żeby wynik rósł dalej
}

/** Odpowiedź kandydata zapamiętana dla wszystkich ofert. */
export interface Fact {
  key: string; // "<jobId>:q:<id>" itp. – pozwala aktualizować tę samą odpowiedź
  question: string;
  answer: string;
  source: string; // z jakiej oferty pochodzi
  updatedAt: string;
}

export interface Job {
  id: string;
  url: string;
  title: string;
  company: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  notes: string;
  postingText: string;
  fetchError?: string;
  analysis?: JobAnalysis;
  userNotes: string; // dodatkowe wskazówki użytkownika do pisania CV
  cv?: TailoredCv;
  coverLetter?: string;
  changeNotes?: string[];
  cvScore?: CvScore;
  improve?: ImproveState;
  pdf?: { file: string; createdAt: string; atsOk: boolean; atsIssues: string[]; pages?: number };
  /** Poprzednie wersje CV (stan sprzed zmiany), najnowsza na końcu. */
  cvHistory?: CvVersion[];
  task?: TaskState;
}

export interface ProfileTask {
  kind: "import";
  status: "running" | "error" | "done";
  startedAt: string;
  error?: string;
}
