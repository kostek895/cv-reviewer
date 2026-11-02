import "server-only";
import { chromium, type Browser } from "playwright";

/** Uruchamia zainstalowanego Chrome (albo Chromium z Playwright) bez okna. */
export async function withBrowser<T>(fn: (b: Browser) => Promise<T>): Promise<T> {
  let browser: Browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }
  try {
    return await fn(browser);
  } finally {
    await browser.close().catch(() => undefined);
  }
}
