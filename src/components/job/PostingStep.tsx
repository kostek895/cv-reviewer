"use client";

import { useState } from "react";
import { Section, useDebouncedEffect } from "@/components/ui";
import type { Job } from "@/lib/types";

export interface StepProps {
  job: Job;
  running: boolean;
  patch: (p: Partial<Job> & { cvBase?: string }) => Promise<boolean>;
  run: (body: Record<string, unknown>) => Promise<void>;
  /** pobiera ofertę z serwera i przeładowuje edytory */
  refresh?: () => Promise<void>;
}

export function PostingStep({ job, running, patch, run }: StepProps) {
  const [text, setText] = useState(job.postingText);
  const [notes, setNotes] = useState(job.notes);

  // treść mogła dojść z pobierania w tle
  const [seen, setSeen] = useState(job.postingText);
  if (job.postingText !== seen) {
    setSeen(job.postingText);
    setText(job.postingText);
  }

  useDebouncedEffect(() => {
    if (text !== job.postingText) patch({ postingText: text });
  }, [text]);
  useDebouncedEffect(() => {
    if (notes !== job.notes) patch({ notes });
  }, [notes]);

  const empty = !text.trim();

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <Section
        title="Treść ogłoszenia"
        actions={
          job.url ? (
            <button className="btn btn-sm" disabled={running} onClick={() => run({ action: "fetch" })}>
              Pobierz ponownie
            </button>
          ) : null
        }
      >
        {job.fetchError && empty ? (
          <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {job.fetchError}
            {job.url ? (
              <>
                {" "}
                <a className="font-bold underline" href={job.url} target="_blank" rel="noreferrer">
                  Otwórz ogłoszenie ↗
                </a>
              </>
            ) : null}
          </div>
        ) : null}
        <p className="mb-2 text-xs text-muted">Możesz tu poprawić tekst: usunąć śmieci ze strony albo dopisać coś, co wiesz o ofercie.</p>
        <textarea
          className="input min-h-[420px] font-[450] leading-relaxed"
          value={text}
          placeholder={running ? "Pobieram…" : "Wklej tutaj treść ogłoszenia…"}
          onChange={(e) => setText(e.target.value)}
        />
      </Section>

      <div className="grid content-start gap-5">
        <Section title="Następny krok">
          <p className="mb-4 text-sm text-muted">
            Claude przeczyta ogłoszenie jak rekruter, porówna je z Twoją bazą i przygotuje rekomendacje do CV. Zanim cokolwiek napisze, możesz je poprawić.
          </p>
          <button
            className="btn btn-primary w-full justify-center"
            disabled={running || empty}
            onClick={async () => {
              if (text !== job.postingText) await patch({ postingText: text });
              await run({ action: "analyze" });
            }}
          >
            {job.analysis ? "Analizuj ponownie" : "Analizuj ogłoszenie →"}
          </button>
        </Section>
        <Section title="Notatki o aplikacji">
          <textarea
            className="input min-h-32"
            placeholder="Kiedy wysłane, z kim rozmowa, widełki…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Section>
      </div>
    </div>
  );
}
