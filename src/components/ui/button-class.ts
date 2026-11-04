// Utilisable côté serveur et côté client.
export type Variant = "primary" | "secondary" | "danger" | "ghost";
const styles: Record<Variant, string> = {
  primary: "bg-brand-500 text-white border-brand-300/60 hover:bg-brand-400 shadow-[0_6px_20px_rgba(31,116,240,0.45)]",
  secondary: "bg-white/10 text-ink border-white/30 hover:bg-white/18 hover:border-white/50",
  danger: "bg-danger/15 text-[#ffd0d5] border-danger/60 hover:bg-danger/25",
  ghost: "bg-transparent text-ink border-transparent hover:bg-white/10",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition
    disabled:cursor-not-allowed disabled:opacity-50 aria-[pressed=true]:ring-2 aria-[pressed=true]:ring-brand-300 ${styles[variant]} ${extra}`;
}
