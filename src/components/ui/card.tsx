import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`glass rounded-2xl p-5 ${className}`}>{children}</section>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/20 px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

const badgeTones = {
  green: "bg-success/15 text-[#b5f5d8] border-success/40",
  red: "bg-danger/15 text-[#ffd0d5] border-danger/40",
  blue: "bg-brand-500/20 text-brand-100 border-brand-400/40",
  gray: "bg-white/8 text-muted border-white/20",
  amber: "bg-warning/15 text-[#ffe7b3] border-warning/40",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={`inline-block max-w-full truncate rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeTones[tone]}`}>{children}</span>;
}

/** Carte d'indicateur. N'affiche que des valeurs réelles transmises par la page. */
export function StatCard({ label, value, hint, icon, tone = "blue" }: { label: string; value: ReactNode; hint?: string; icon?: ReactNode; tone?: "blue" | "green" | "amber" | "red" }) {
  const ring = { blue: "from-brand-500/40", green: "from-success/35", amber: "from-warning/35", red: "from-danger/35" }[tone];
  return (
    <div className={`glass relative overflow-hidden rounded-2xl p-4`}>
      <div className={`pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-gradient-to-br ${ring} to-transparent blur-2xl`} aria-hidden />
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        {icon && <span className="rounded-xl border border-white/20 bg-white/10 p-2" aria-hidden>{icon}</span>}
      </div>
      <p className="relative mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="relative mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const alertTones = {
  info: "border-brand-300/50 bg-brand-500/10 text-brand-100",
  success: "border-success/50 bg-success/10 text-[#b5f5d8]",
  warning: "border-warning/50 bg-warning/10 text-[#ffe7b3]",
  danger: "border-danger/50 bg-danger/10 text-[#ffd0d5]",
};
export function Alert({ tone = "info", title, children }: { tone?: keyof typeof alertTones; title?: string; children: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "note"} className={`rounded-xl border px-4 py-3 text-sm ${alertTones[tone]}`}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? "mt-0.5" : ""}>{children}</div>
    </div>
  );
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <span aria-hidden className={`block animate-pulse rounded-lg bg-white/10 ${className}`} />;
}
