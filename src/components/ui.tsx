"use client";

import { useEffect, useRef, useState } from "react";

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Błąd ${res.status}`);
  return data as T;
}

/**
 * Wywołuje fn z opóźnieniem po ostatniej zmianie deps.
 * Porównuje wartości, a nie „pierwsze uruchomienie” – w trybie dev React montuje
 * komponent dwa razy i flaga pierwszego uruchomienia przepuszczała pusty zapis.
 */
export function useDebouncedEffect(fn: () => void, deps: unknown[], ms = 700) {
  const last = useRef(JSON.stringify(deps));
  useEffect(() => {
    const now = JSON.stringify(deps);
    if (now === last.current) return;
    last.current = now;
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      {label ? <span className="label">{label}</span> : null}
      <input className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Area({
  label,
  value,
  onChange,
  placeholder,
  rows = 2,
  hint,
  className = "",
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      {label ? (
        <span className="label">
          {label}
          {hint ? <span className="ml-1 font-medium normal-case text-muted/80">· {hint}</span> : null}
        </span>
      ) : null}
      <textarea
        className="input resize-y"
        style={{ minHeight: `${rows * 1.5 + 1}em` }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** Lista tekstów edytowana jako textarea – jedna pozycja na linię. */
export function LinesArea({
  label,
  value,
  onChange,
  hint = "jedna pozycja na linię",
  rows = 3,
}: {
  label?: string;
  value: string[];
  onChange: (v: string[]) => void;
  hint?: string;
  rows?: number;
}) {
  const [text, setText] = useState(value.join("\n"));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current && value.join("\n") !== text.split("\n").filter((l) => l.trim()).join("\n")) {
      setText(value.join("\n"));
    }
    last.current = value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Area
      label={label}
      hint={hint}
      rows={rows}
      value={text}
      onChange={(t) => {
        setText(t);
        const lines = t
          .split("\n")
          .map((l) => l.replace(/^\s*[•\-–]\s*/, "").trim())
          .filter(Boolean);
        last.current = lines;
        onChange(lines);
      }}
    />
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      aria-hidden
    />
  );
}

export function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
  return (
    <span className="tabular-nums">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

export function Badge({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "green" | "amber" | "red" | "blue" }) {
  const tones = {
    gray: "bg-gray-100 text-gray-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-rose-50 text-rose-700",
    blue: "bg-brand-soft text-brand",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

export function Section({
  title,
  children,
  actions,
  className = "",
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-extrabold">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function fitTone(score?: number): "green" | "amber" | "red" | "gray" {
  if (score === undefined) return "gray";
  return score >= 70 ? "green" : score >= 45 ? "amber" : "red";
}
