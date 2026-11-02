import "server-only";
import * as cheerio from "cheerio";
import { withBrowser } from "./browser";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const MIN_LEN = 1500;

export interface Posting {
  text: string;
  title: string;
  company: string;
}

function htmlToText(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/li|\/h\d|\/div)\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function clean(t: string) {
  return t
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/** Wyciąga ogłoszenie z HTML: najpierw JSON-LD JobPosting, potem główna treść strony. */
export function extractFromHtml(html: string): Posting {
  const $ = cheerio.load(html);
  let title = $("meta[property='og:title']").attr("content") || $("title").text() || "";
  let company = "";
  const parts: string[] = [];

  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const raw = JSON.parse($(el).text());
      const items = (Array.isArray(raw) ? raw : raw["@graph"] ?? [raw]) as Record<string, unknown>[];
      for (const it of items) {
        if (it["@type"] !== "JobPosting") continue;
        title = String(it.title ?? title);
        const org = it.hiringOrganization as { name?: string } | undefined;
        company = org?.name ?? company;
        if (it.description) parts.push(htmlToText(String(it.description)));
        for (const k of ["qualifications", "responsibilities", "skills", "experienceRequirements"]) {
          if (typeof it[k] === "string") parts.push(htmlToText(it[k] as string));
        }
      }
    } catch {
      /* zły JSON-LD */
    }
  });

  $("script, style, noscript, svg, iframe, nav, footer, header, form, [aria-hidden='true']").remove();
  const main = $("main").first().length ? $("main").first() : $("article").first().length ? $("article").first() : $("body");
  const pageText = clean(htmlToText(main.html() ?? ""));

  const ld = clean(parts.join("\n\n"));
  // JSON-LD bywa niepełny (bez wymagań) – dołącz treść strony, jeśli wnosi więcej.
  const text = ld.length >= MIN_LEN ? `${title}\n${company}\n\n${ld}\n\n---\n${pageText}`.slice(0, 40000) : `${title}\n\n${pageText}`.slice(0, 40000);
  return { text: clean(text), title: clean(title).split("\n")[0] ?? "", company };
}

/** Pobiera ogłoszenie: zwykły fetch, a gdy treści jest za mało – Chrome w tle. */
export async function fetchPosting(url: string): Promise<Posting> {
  new URL(url); // walidacja
  let best: Posting | null = null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.8", Accept: "text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) best = extractFromHtml(await res.text());
  } catch {
    /* spróbujemy przeglądarką */
  }

  if (!best || best.text.length < MIN_LEN) {
    try {
      const rendered = await withBrowser(async (browser) => {
        const ctx = await browser.newContext({ userAgent: UA, locale: "pl-PL" });
        const page = await ctx.newPage();
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => undefined);
        // zamknij typowe banery cookies
        for (const label of ["Akceptuj", "Zaakceptuj", "Accept all", "Accept", "Zgadzam się", "Akceptuję"]) {
          await page.getByRole("button", { name: label, exact: false }).first().click({ timeout: 800 }).catch(() => undefined);
        }
        const html = await page.content();
        await ctx.close();
        return extractFromHtml(html);
      });
      if (!best || rendered.text.length > best.text.length) best = rendered;
    } catch {
      /* zostaje to, co mamy */
    }
  }

  if (!best || best.text.length < MIN_LEN) {
    throw new Error(
      "Nie udało się pobrać treści ogłoszenia (strona wymaga logowania albo blokuje pobieranie). Skopiuj treść ogłoszenia ze strony i wklej ją ręcznie."
    );
  }
  return best;
}
