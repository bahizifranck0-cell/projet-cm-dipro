"use client";
import { useId, useRef, useState, type ReactNode } from "react";

/** Onglets accessibles (flèches gauche/droite, Début, Fin). Défilent horizontalement sur petit écran. */
export function Tabs({ tabs, initial = 0 }: { tabs: { label: string; content: ReactNode; count?: number }[]; initial?: number }) {
  const [active, setActive] = useState(initial);
  const id = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (i: number) => { const n = (i + tabs.length) % tabs.length; setActive(n); refs.current[n]?.focus(); };
  return (
    <div>
      <div role="tablist" className="scroll-area -mx-1 mb-4 flex gap-1 px-1 pb-1" onKeyDown={(e) => {
        if (e.key === "ArrowRight") move(active + 1);
        else if (e.key === "ArrowLeft") move(active - 1);
        else if (e.key === "Home") move(0);
        else if (e.key === "End") move(tabs.length - 1);
      }}>
        {tabs.map((t, i) => (
          <button key={t.label} ref={(el) => { refs.current[i] = el; }} role="tab" id={`${id}-t${i}`} aria-controls={`${id}-p${i}`} aria-selected={i === active} tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-medium transition ${i === active ? "border-white/40 bg-white/15 text-white" : "border-transparent text-ink/80 hover:bg-white/8"}`}>
            {t.label}{t.count !== undefined && <span className="ml-2 rounded-full bg-white/15 px-2 text-xs">{t.count}</span>}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.label} role="tabpanel" id={`${id}-p${i}`} aria-labelledby={`${id}-t${i}`} hidden={i !== active} tabIndex={0}>{t.content}</div>
      ))}
    </div>
  );
}
