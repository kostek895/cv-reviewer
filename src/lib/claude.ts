import "server-only";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { ROOT, TMP_DIR, newId } from "./store";

const SKILLS_DIR = path.join(ROOT, ".claude", "skills");
const TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Uruchamia Claude Code (`claude -p`) na abonamencie użytkownika.
 * Treść skilla (SKILL.md + pliki z references/) trafia do system promptu,
 * wynik wraca jako JSON zgodny z podanym schematem.
 *
 * Wyłączamy MCP i globalne skille/wtyczki, żeby jedno wywołanie nie ładowało
 * setek tysięcy tokenów kontekstu.
 */
export async function runSkill<T>(opts: {
  skill: string;
  prompt: string;
  schema: object;
  tools?: string[];
}): Promise<T> {
  const skillDir = path.join(SKILLS_DIR, opts.skill);
  let system = await fs.readFile(path.join(skillDir, "SKILL.md"), "utf8");
  try {
    const refsDir = path.join(SKILLS_DIR, "_shared");
    for (const f of await fs.readdir(refsDir)) {
      system += `\n\n---\n# Materiał referencyjny: ${f}\n\n` + (await fs.readFile(path.join(refsDir, f), "utf8"));
    }
  } catch {
    /* brak wspólnych materiałów */
  }

  await fs.mkdir(TMP_DIR, { recursive: true });
  const sysFile = path.join(TMP_DIR, `system-${opts.skill}-${newId()}.md`);
  await fs.writeFile(sysFile, system, "utf8");

  const args = [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(opts.schema),
    "--append-system-prompt-file",
    sysFile,
    "--strict-mcp-config",
    "--disable-slash-commands",
  ];
  const tools = opts.tools ?? ["Read"];
  args.push("--tools", tools.join(","));
  if (tools.length) args.push("--allowedTools", tools.join(","));
  if (process.env.CLAUDE_MODEL) args.push("--model", process.env.CLAUDE_MODEL);

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.env.CLAUDE_BIN || "claude", args, {
        cwd: ROOT,
        env: { ...process.env },
        windowsHide: true,
      });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error("Claude nie odpowiedział w ciągu 15 minut"));
      }, TIMEOUT_MS);
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(new Error(`Nie udało się uruchomić 'claude': ${e.message}. Czy Claude Code jest zainstalowany i w PATH?`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0 && !out.trim()) reject(new Error(`claude zakończył się kodem ${code}: ${err.slice(-2000)}`));
        else resolve(out);
      });
      child.stdin.write(opts.prompt);
      child.stdin.end();
    });

    let parsed: { is_error?: boolean; result?: string; structured_output?: T; subtype?: string };
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new Error(`Nieczytelna odpowiedź claude: ${stdout.slice(0, 500)}`);
    }
    if (parsed.is_error) throw new Error(`Błąd claude (${parsed.subtype}): ${parsed.result ?? ""}`);
    if (parsed.structured_output) return parsed.structured_output;
    // Awaryjnie: JSON w polu result
    const m = parsed.result?.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error("Claude nie zwrócił danych w oczekiwanym formacie");
  } finally {
    fs.rm(sysFile, { force: true }).catch(() => undefined);
  }
}
