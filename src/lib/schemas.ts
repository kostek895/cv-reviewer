// Schematy JSON przekazywane do `claude -p --json-schema`.

const str = { type: "string" } as const;
const strArr = { type: "array", items: str } as const;

const obj = (properties: Record<string, object>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const contactSchema = obj({ phone: str, email: str, location: str, linkedin: str, website: str });
export const educationSchema = obj({ period: str, degree: str, school: str });
export const languageSchema = obj({ name: str, level: str });
export const courseSchema = obj({ name: str, issuer: str, year: str, description: str });

export const profileSchema = obj({
  name: str,
  headline: str,
  contact: contactSchema,
  summaries: strArr,
  experience: {
    type: "array",
    items: obj({
      id: str,
      company: str,
      role: str,
      location: str,
      start: str,
      end: str,
      context: str,
      bullets: strArr,
      notes: str,
    }),
  },
  education: { type: "array", items: educationSchema },
  languages: { type: "array", items: languageSchema },
  skills: strArr,
  courses: { type: "array", items: courseSchema },
  extras: str,
  gdpr: str,
});

const reqCheck = obj({ requirement: str, match: { type: "string", enum: ["mocne", "częściowe", "brak"] }, evidence: str });

export const analysisSchema = obj({
  jobTitle: str,
  company: str,
  location: str,
  seniority: str,
  language: { type: "string", enum: ["pl", "en"] },
  whoTheySeek: str,
  mustHave: { type: "array", items: reqCheck },
  niceToHave: { type: "array", items: reqCheck },
  keywords: strArr,
  cultureSignals: strArr,
  redFlags: strArr,
  fitScore: { type: "integer", minimum: 0, maximum: 100 },
  fitComment: str,
  recommendations: {
    type: "array",
    items: obj({ priority: { type: "string", enum: ["wysoki", "średni", "niski"] }, text: str }),
  },
  emphasize: strArr,
  deemphasize: strArr,
  coverLetterAngle: str,
  gdprClause: str,
  questions: { type: "array", items: obj({ id: str, question: str }) },
  skillSuggestions: { type: "array", items: obj({ id: str, name: str, why: str }) },
});

export const cvExperienceSchema = obj({
  company: str,
  role: str,
  location: str,
  period: str,
  intro: str,
  bullets: strArr,
});

export const tailoredCvSchema = obj({
  lang: { type: "string", enum: ["pl", "en"] },
  name: str,
  headline: str,
  contact: contactSchema,
  summary: str,
  experience: { type: "array", items: cvExperienceSchema },
  education: { type: "array", items: educationSchema },
  languages: { type: "array", items: languageSchema },
  skills: strArr,
  courses: { type: "array", items: courseSchema },
  gdpr: str,
});

export const tailorResultSchema = obj({
  cv: tailoredCvSchema,
  coverLetter: str,
  changeNotes: strArr,
});

export const cvScoreSchema = obj({
  score: { type: "integer", minimum: 0, maximum: 100 },
  comment: str,
  requirements: {
    type: "array",
    items: obj({
      requirement: str,
      mustHave: { type: "boolean" },
      covered: { type: "string", enum: ["tak", "częściowo", "nie"] },
      where: str,
    }),
  },
  missingKeywords: strArr,
  suggestions: strArr,
});

export const improveSchema = obj({
  changes: { type: "array", items: obj({ path: str, text: str, list: strArr, reason: str }) },
  blockers: strArr,
});

// Przepisanie pojedynczej sekcji
export const rewriteSchemas: Record<string, object> = {
  summary: obj({ value: str }),
  headline: obj({ value: str }),
  skills: obj({ value: strArr }),
  coverLetter: obj({ value: str }),
  experience: obj({ value: cvExperienceSchema }),
  courses: obj({ value: { type: "array", items: courseSchema } }),
};
