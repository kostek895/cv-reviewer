import type { TailoredCv } from "@/lib/types";

const LABELS = {
  pl: {
    about: "O mnie",
    contact: "Kontakt",
    experience: "Doświadczenie",
    education: "Wykształcenie",
    languages: "Języki",
    skills: "Mocne strony",
    courses: "Kursy i szkolenia",
  },
  en: {
    about: "About me",
    contact: "Contact",
    experience: "Experience",
    education: "Education",
    languages: "Languages",
    skills: "Skills",
    courses: "Courses & certifications",
  },
};

/**
 * Szablon CV (układ z sidebarem, Manrope).
 * Kolejność w DOM = kolejność czytania przez ATS:
 *   1) nazwisko, tytuł, O mnie, kontakt  2) doświadczenie, kursy  3) wykształcenie, języki, umiejętności.
 * Wizualnie 1) i 3) są w lewej kolumnie, 2) w prawej.
 */
export function CvTemplate({ cv, photoUrl }: { cv: TailoredCv; photoUrl?: string | null }) {
  const L = LABELS[cv.lang] ?? LABELS.pl;
  const c = cv.contact;
  const accent = cv.accent && /^#[0-9a-f]{6}$/i.test(cv.accent) ? cv.accent : undefined;
  return (
    <div className="cv" style={accent ? ({ "--cv-blue": accent } as React.CSSProperties) : undefined}>
      <div className="cv-sidebar-bg" aria-hidden />

      <section className="cv-identity" suppressHydrationWarning>
        {cv.showPhoto && photoUrl ? <img className="cv-photo" src={photoUrl} alt="" /> : null}
        <h1 className="cv-name">{cv.name}</h1>
        {cv.headline ? <p className="cv-headline">{cv.headline}</p> : null}
        {cv.summary ? (
          <>
            <h2>{L.about}</h2>
            <p className="cv-summary">{cv.summary}</p>
          </>
        ) : null}
        <h2>{L.contact}</h2>
        <ul className="cv-contact">
          {c.phone ? <li><Icon d={PHONE} />{c.phone}</li> : null}
          {c.email ? <li><Icon d={MAIL} />{c.email}</li> : null}
          {c.location ? <li><Icon d={PIN} />{c.location}</li> : null}
          {c.linkedin ? <li><Icon d={LINK} />{c.linkedin.replace(/^https?:\/\/(www\.)?/, "")}</li> : null}
          {c.website ? <li><Icon d={LINK} />{c.website.replace(/^https?:\/\/(www\.)?/, "")}</li> : null}
        </ul>
      </section>

      <main className="cv-main" suppressHydrationWarning>
        <h2>{L.experience}</h2>
        {cv.experience.map((e, i) => (
          <article className="cv-job" key={i}>
            <div className="cv-job-head">
              <p>
                <strong>{e.role.toUpperCase()}</strong>
                <span className="cv-dot"> • </span>
                {e.company}
                {e.location ? `, ${e.location}` : ""}
              </p>
              <span className="cv-period">{e.period.toUpperCase()}</span>
            </div>
            {e.intro ? <p className="cv-intro">{e.intro}</p> : null}
            {e.bullets.length ? (
              <ul>
                {e.bullets.map((b, j) => (
                  <li key={j}>{b}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}

        {cv.courses.length ? (
          <>
            <h2>{L.courses}</h2>
            {cv.courses.map((co, i) => (
              <article className="cv-job" key={i}>
                <div className="cv-job-head">
                  <p>
                    <strong>{co.name.toUpperCase()}</strong>
                    {co.issuer ? (
                      <>
                        <span className="cv-dot"> • </span>
                        {co.issuer}
                      </>
                    ) : null}
                  </p>
                  <span className="cv-period">{co.year}</span>
                </div>
                {co.description ? <p className="cv-intro">{co.description}</p> : null}
              </article>
            ))}
          </>
        ) : null}

        {cv.gdpr ? <p className="cv-gdpr">{cv.gdpr}</p> : null}
      </main>

      <section className="cv-rest" suppressHydrationWarning>
        {cv.education.length ? (
          <>
            <h2>{L.education}</h2>
            {cv.education.map((ed, i) => (
              <div className="cv-edu" key={i}>
                <p className="cv-period">{ed.period}</p>
                <p><strong>{ed.degree}</strong></p>
                <p>{ed.school}</p>
              </div>
            ))}
          </>
        ) : null}
        {cv.languages.length ? (
          <>
            <h2>{L.languages}</h2>
            {cv.languages.map((l, i) => (
              <p className="cv-lang" key={i}>
                <span>{l.name}</span>
                <strong>{l.level}</strong>
              </p>
            ))}
          </>
        ) : null}
        {cv.skills.length ? (
          <>
            <h2>{L.skills}</h2>
            <ul className="cv-skills">
              {cv.skills.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg className="cv-icon" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

const PHONE = "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z";
const MAIL = "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zm0 0v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-5.5 8.3";
const PIN = "M12 22s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12zm0-9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z";
const LINK = "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7";
