// Utilisable côté serveur et côté client.
export type Variant = "primary" | "secondary" | "danger" | "ghost";
const styles: Record<Variant, string> = {
  primary: "bg-brand-600 text-white border-brand-300/70 hover:bg-brand-700 hover:border-brand-300 active:bg-brand-800 shadow-[0_6px_20px_rgba(21,87,214,0.45)]",
  secondary: "bg-white/10 text-ink border-white/35 hover:bg-white/18 hover:border-white/60 active:bg-white/25",
  danger: "bg-danger/15 text-[#ffd0d5] border-danger/70 hover:bg-danger/25 active:bg-danger/35",
  ghost: "bg-transparent text-ink border-white/0 hover:bg-white/10 hover:border-white/20",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition select-none
    disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress
    aria-[pressed=true]:ring-2 aria-[pressed=true]:ring-brand-300 aria-[current=page]:ring-2 aria-[current=page]:ring-brand-300
    ${styles[variant]} ${extra}`;
}
