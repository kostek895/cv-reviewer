// Adresowanie fragmentów CV, które może zmieniać automatyczna poprawka.
// Wspólne dla serwera i przeglądarki.
import type { TailoredCv } from "./types";

export type CvValue = string | string[];

const RE = /^(headline|summary|skills|experience\.(\d+)\.(intro|bullets))$/;

export function isValidPath(cv: TailoredCv, path: string) {
  const m = RE.exec(path);
  if (!m) return false;
  if (m[2] !== undefined) return Number(m[2]) < cv.experience.length;
  return true;
}

export function isListPath(path: string) {
  return path === "skills" || path.endsWith(".bullets");
}

export function getAt(cv: TailoredCv, path: string): CvValue {
  const m = RE.exec(path)!;
  if (m[2] !== undefined) {
    const e = cv.experience[Number(m[2])];
    return m[3] === "intro" ? e.intro : [...e.bullets];
  }
  const v = cv[path as "headline" | "summary" | "skills"];
  return Array.isArray(v) ? [...v] : v;
}

export function setAt(cv: TailoredCv, path: string, value: CvValue) {
  const m = RE.exec(path)!;
  if (m[2] !== undefined) {
    const e = cv.experience[Number(m[2])];
    if (m[3] === "intro") e.intro = String(value);
    else e.bullets = value as string[];
    return;
  }
  if (path === "skills") cv.skills = value as string[];
  else cv[path as "headline" | "summary"] = String(value);
}

export function sameValue(a: CvValue, b: CvValue) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function pathLabel(cv: TailoredCv, path: string) {
  const m = RE.exec(path);
  if (!m) return path;
  if (m[2] !== undefined) {
    const e = cv.experience[Number(m[2])];
    const who = e ? `${e.role}${e.company ? ` · ${e.company}` : ""}` : `stanowisko ${Number(m[2]) + 1}`;
    return `${who} – ${m[3] === "intro" ? "opis firmy" : "punkty"}`;
  }
  return { headline: "Tytuł pod nazwiskiem", summary: "O mnie", skills: "Umiejętności" }[m[1] as "headline" | "summary" | "skills"];
}
