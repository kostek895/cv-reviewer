import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { extractText, getDocumentProxy } from "unpdf";
import { withBrowser } from "./browser";
import { jobDir } from "./store";
import type { TailoredCv } from "./types";

/** Renderuje /print/[id] w Chrome do PDF i sprawdza, czy tekst da się poprawnie odczytać (test ATS). */
export async function renderPdf(id: string, origin: string, cv: TailoredCv) {
  const buf = await withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.goto(`${origin}/print/${id}`, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForFunction(() => (window as unknown as { __cvFitted?: boolean }).__cvFitted === true, null, { timeout: 15000 }).catch(() => undefined);
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    await page.close();
    return pdf;
  });
  const file = path.join(jobDir(id), "cv.pdf");
  await fs.writeFile(file, buf);
  const { issues, pages } = await atsCheck(buf, cv);
  return { file: "cv.pdf", atsOk: issues.length === 0, atsIssues: issues, pages };
}

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

export async function atsCheck(buf: Uint8Array, cv: TailoredCv): Promise<{ issues: string[]; pages: number }> {
  const issues: string[] = [];
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text, totalPages } = await extractText(doc, { mergePages: true });
  const t = norm(text);

  if (totalPages > 2) issues.push(`CV ma ${totalPages} strony – warto skrócić do 1–2.`);
  if (!t.includes(norm(cv.name))) issues.push("Imię i nazwisko nie jest czytelne jako tekst.");
  for (const e of cv.experience) {
    if (e.company && !t.includes(norm(e.company))) issues.push(`Nazwa firmy „${e.company}” nie jest czytelna jako tekst.`);
  }
  // Polskie znaki: jeśli CV jest po polsku, a w tekście PDF nie ma żadnego – font jest źle osadzony.
  const sample = norm(`${cv.summary} ${cv.experience.map((e) => e.bullets.join(" ")).join(" ")}`);
  if (/[ąćęłńóśźż]/.test(sample) && !/[ąćęłńóśźż]/.test(t)) issues.push("Polskie znaki nie są poprawnie odczytywane z PDF.");
  // Kolejność: doświadczenie powinno być przeczytane przed sidebarem.
  const firstBullet = cv.experience[0]?.bullets[0];
  const sidebarMarker = cv.education[0]?.school;
  if (firstBullet) {
    const a = t.indexOf(norm(firstBullet).slice(0, 30));
    const b = sidebarMarker ? t.indexOf(norm(sidebarMarker)) : -1;
    if (a === -1) issues.push("Pierwszy punkt doświadczenia nie został znaleziony w tekście PDF.");
    else if (b !== -1 && b < a) issues.push("ATS przeczyta sidebar przed doświadczeniem (kolejność tekstu).");
  }
  return { issues, pages: totalPages };
}
