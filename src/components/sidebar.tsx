"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Baby, BedDouble, FlaskConical, Pill, Building2, CalendarDays, HeartPulse, Stethoscope, ConciergeBell, Contact, Settings, ChevronsLeft, ChevronsRight, IdCard, KeyRound, LayoutDashboard, LogOut, Menu, Palette, ScrollText, Search, ShieldCheck, Users, X } from "lucide-react";
import type { NavItem } from "./nav";

const ICONS = { LayoutDashboard, Baby, BedDouble, FlaskConical, Pill, CalendarDays, HeartPulse, Stethoscope, ConciergeBell, Contact, Settings, IdCard, Users, ShieldCheck, Building2, ScrollText, Palette } as const;
const iconOf = (n: string) => ICONS[n as keyof typeof ICONS] ?? LayoutDashboard;

type Props = { items: NavItem[]; user: { name: string; role: string; avatar: React.ReactNode }; logo: React.ReactNode; logoutAction: () => Promise<void> };

function Badge({ n, dot }: { n?: number; dot?: boolean }) {
  if (!n) return null;
  if (dot) return <span className="absolute top-1 right-1 size-2.5 rounded-full border-2 border-brand-900 bg-danger" aria-hidden />;
  return <span className="ml-auto min-w-6 rounded-full bg-danger px-1.5 text-center text-xs font-semibold text-white" aria-label={`${n} élément(s) à traiter`}>{n > 99 ? "99+" : n}</span>;
}

export function Sidebar({ items, user, logo, logoutAction }: Props) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false); // ordinateur : barre repliée
  const [drawer, setDrawer] = useState(false);       // téléphone / tablette : menu complet ouvert
  const [q, setQ] = useState("");
  useEffect(() => { try { setCollapsed(localStorage.getItem("cmdpro.sidebar") === "1"); } catch {} }, []);
  useEffect(() => { setDrawer(false); setQ(""); }, [path]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("cmdpro.sidebar", c ? "0" : "1"); } catch {} return !c; });

  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return t ? items.filter((i) => i.label.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(t)) : items;
  }, [items, q]);

  // compact = icônes seules (tablette toujours ; ordinateur si replié), sauf quand le tiroir est ouvert
  const compactCls = drawer ? "" : `md:max-lg:sr-only ${collapsed ? "lg:sr-only" : ""}`;
  const hideCompact = drawer ? "" : `md:max-lg:hidden ${collapsed ? "lg:hidden" : ""}`;

  const link = (i: NavItem) => {
    const Icon = iconOf(i.icon);
    const on = active(i.href);
    return (
      <Link key={i.href} href={i.href} title={i.label} aria-current={on ? "page" : undefined}
        className={`relative flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium transition
          ${on ? "border-white/40 bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]" : "border-transparent text-ink/85 hover:border-white/15 hover:bg-white/8 hover:text-white"}`}>
        <Icon className="size-5 shrink-0" aria-hidden />
        <span className={`truncate ${compactCls}`}>{i.label}</span>
        <span className={hideCompact}><Badge n={i.badge} /></span>
        {!drawer && <span className={`hidden ${collapsed ? "lg:block" : ""} md:max-lg:block`}><Badge n={i.badge} dot /></span>}
      </Link>
    );
  };
  const main = filtered.filter((i) => i.section === "main");
  const admin = filtered.filter((i) => i.section === "admin");
  const bottom = items.filter((i) => i.section === "main").slice(0, 3);

  return (
    <>
      {/* ── Téléphone : barre supérieure ── */}
      <header className="glass-solid sticky top-0 z-30 flex items-center gap-3 rounded-none border-x-0 border-t-0 px-4 py-2 md:hidden">
        {logo}<span className="font-semibold">CMD Pro</span>
      </header>

      {/* ── Téléphone : barre de navigation basse ── */}
      <nav aria-label="Navigation rapide" className="glass-solid fixed inset-x-3 bottom-3 z-30 grid gap-1 rounded-3xl p-1.5 md:hidden"
        style={{ marginBottom: "env(safe-area-inset-bottom)", gridTemplateColumns: `repeat(${bottom.length + 1}, minmax(0, 1fr))` }}>
        {bottom.map((i) => {
          const Icon = iconOf(i.icon); const on = active(i.href);
          return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
              className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-medium ${on ? "border border-white/35 bg-white/15 text-white" : "text-ink/80"}`}>
              <Icon className="size-5" aria-hidden /><span className="max-w-full truncate px-1">{i.short ?? i.label}</span><Badge n={i.badge} dot />
            </Link>
          );
        })}
        <button onClick={() => setDrawer(true)} aria-expanded={drawer} aria-controls="cmdpro-sidebar"
          className="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-medium text-ink/80">
          <Menu className="size-5" aria-hidden />Menu
        </button>
      </nav>

      {drawer && <button aria-label="Fermer le menu" tabIndex={-1} onClick={() => setDrawer(false)} className="fixed inset-0 z-40 bg-brand-950/60 backdrop-blur-sm lg:hidden" />}

      {/* ── Barre latérale : tiroir (téléphone), rail d'icônes (tablette), complète ou repliée (ordinateur) ── */}
      <aside id="cmdpro-sidebar" aria-label="Navigation principale"
        className={`${drawer ? "glass-solid" : "glass"} fixed inset-y-0 left-0 z-50 flex flex-col gap-3 rounded-none border-y-0 border-l-0 p-3 transition-[transform,width] duration-200
          md:sticky md:top-0 md:h-dvh md:translate-x-0 md:rounded-r-3xl
          ${drawer ? "w-72 translate-x-0 md:fixed" : "w-72 -translate-x-full md:w-[76px]"} ${!drawer && (collapsed ? "lg:w-[76px]" : "lg:w-72")}`}>
        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <div className="flex min-w-0 items-center gap-3">
            {logo}
            <div className={`min-w-0 ${hideCompact}`}>
              <p className="truncate font-semibold leading-tight">CMD Pro</p>
              <p className="truncate text-xs text-muted">Gestion hospitalière</p>
            </div>
          </div>
          {drawer && <button onClick={() => setDrawer(false)} aria-label="Fermer le menu" className="rounded-lg p-2 hover:bg-white/10"><X className="size-5" /></button>}
        </div>

        <label className={`relative block ${hideCompact}`}>
          <span className="sr-only">Rechercher un module</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un module" className="field !py-2 pl-9 text-sm" />
        </label>
        {!drawer && (
          <button onClick={() => (window.matchMedia("(min-width: 1024px)").matches ? toggle() : setDrawer(true))} title="Rechercher un module" aria-label="Rechercher un module"
            className={`hidden min-h-11 items-center justify-center rounded-xl text-muted hover:bg-white/8 hover:text-ink md:max-lg:flex ${collapsed ? "lg:flex" : ""}`}>
            <Search className="size-5" />
          </button>
        )}

        <nav className="-mx-1 flex flex-1 flex-col gap-1 overflow-y-auto px-1">
          {main.map(link)}
          {admin.length > 0 && (
            <>
              <p className={`mt-3 mb-1 px-3 text-[11px] font-semibold tracking-wider text-muted uppercase ${compactCls}`}>Administration</p>
              {admin.map(link)}
            </>
          )}
          {filtered.length === 0 && <p className="px-3 py-2 text-sm text-muted">Aucun module ne correspond.</p>}
        </nav>

        <div className="space-y-1 border-t border-white/12 pt-3">
          <div className="flex items-center gap-3 px-2 pb-1" title={`${user.name} — ${user.role}`}>
            {user.avatar}
            <div className={`min-w-0 ${hideCompact}`}>
              <p className="truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.role}</p>
            </div>
          </div>
          <Link href="/compte/mot-de-passe" title="Mot de passe" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-ink/85 hover:bg-white/8">
            <KeyRound className="size-5 shrink-0" aria-hidden /><span className={compactCls}>Mot de passe</span>
          </Link>
          <form action={logoutAction}>
            <button className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-[#ffd0d5] hover:bg-danger/15" title="Se déconnecter">
              <LogOut className="size-5 shrink-0" aria-hidden /><span className={compactCls}>Se déconnecter</span>
            </button>
          </form>
          {!drawer && (
            <>
              <button onClick={toggle} className="hidden min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm text-muted hover:bg-white/8 lg:flex" aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}>
                {collapsed ? <ChevronsRight className="size-5" /> : <><ChevronsLeft className="size-5" />Replier</>}
              </button>
              <button onClick={() => setDrawer(true)} className="hidden min-h-11 w-full items-center justify-center rounded-xl text-muted hover:bg-white/8 md:max-lg:flex" aria-label="Déplier le menu">
                <ChevronsRight className="size-5" />
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
