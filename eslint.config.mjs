import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Ładowanie danych z API w efektach (setState w callbacku promisa) jest tu zamierzone.
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
  {
    // Szablon CV renderuje zdjęcie jako data URL do PDF – next/image nie ma tu zastosowania.
    files: ["src/components/CvTemplate.tsx"],
    rules: { "@next/next/no-img-element": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
