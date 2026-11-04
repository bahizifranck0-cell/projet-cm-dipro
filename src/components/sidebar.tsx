"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Building2, ChevronsLeft, ChevronsRight, IdCard, KeyRound, LayoutDashboard, LogOut, Menu, ScrollText, ShieldCheck, Users, X } from "lucide-react";
import type { NavItem } from "./nav";

const ICONS = { LayoutDashboard, IdCard, Users, ShieldCheck, Building2, ScrollText } as const;

type Props = { items: NavItem[]; user: { name: string; role: string }; logo: React.ReactNode; logoutAction: () => Promise<void> };

export function Sidebar({ items, user, logo, logoutAction }: Props) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false); // tiroir mobile
  useEffect(() => {
    try { setCollapsed(localStorage.getItem("cmdpro.sidebar") === "1"); } catch {}
  }, []);
  useEffect(() => setOpen(false), [path]);
  const toggle = () => setCollapsed((c) => { try { localStorage.setItem("cmdpro.sidebar", c ? "0" : "1"); } catch {} return !c; });

  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  const link = (i: NavItem) => {
    const Icon = ICONS[i.icon as keyof typeof ICONS] ?? LayoutDashboard;
    const on = active(i.href);
    return (
      <Link key={i.href} href={i.href} title={collapsed ? i.label : undefined} aria-current={on ? "page" : undefined}
        className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition
          ${on ? "border-white/35 bg-white/15 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]" : "border-transparent text-ink/80 hover:border-white/15 hover:bg-white/8 hover:text-white"}`}>
        <Icon className="size-5 shrink-0" aria-hidden />
        <span className={collapsed ? "lg:sr-only" : ""}>{i.label}</span>
      </Link>
    );
  };
  const main = items.filter((i) => i.section === "main");
  const admin = items.filter((i) => i.section === "admin");

  return (
    <>
      {/* Barre supérieure mobile */}
      <div className="glass sticky top-0 z-30 flex items-center justify-between rounded-none border-x-0 border-t-0 px-4 py-2.5 lg:hidden">
        <div className="flex items-center gap-2.5">{logo}<span className="font-semibold">CMD Pro</span></div>
        <button onClick={() => setOpen(true)} aria-label="Ouvrir le menu" className="rounded-xl border border-white/25 p-2"><Menu className="size-5" /></button>
      </div>
      {open && <button aria-label="Fermer le menu" onClick={() => setOpen(false)} className="fixed inset-0 z-40 bg-black/50 lg:hidden" />}

      <aside className={`glass fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-4 rounded-none border-y-0 border-l-0 p-4 transition-transform
          lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0 lg:rounded-r-3xl ${open ? "translate-x-0" : "-translate-x-full"} ${collapsed ? "lg:w-[84px]" : "lg:w-72"}`}
        aria-label="Navigation principale">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            {logo}
            <div className={`min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
              <p className="truncate font-semibold leading-tight">CMD Pro</p>
              <p className="truncate text-xs text-muted">Gestion hospitalière</p>
            </div>
          </div>
          <button onClick={() => setOpen(false)} aria-label="Fermer le menu" className="rounded-lg p-1.5 hover:bg-white/10 lg:hidden"><X className="size-5" /></button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {main.map(link)}
          {admin.length > 0 && (
            <>
              <p className={`mt-4 mb-1 px-3 text-[11px] font-semibold tracking-wider text-muted uppercase ${collapsed ? "lg:sr-only" : ""}`}>Administration</p>
              {admin.map(link)}
            </>
          )}
        </nav>

        <div className="space-y-1 border-t border-white/12 pt-3">
          <div className={`px-3 pb-2 ${collapsed ? "lg:hidden" : ""}`}>
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.role}</p>
          </div>
          <Link href="/compte/mot-de-passe" title="Mot de passe" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink/80 hover:bg-white/8">
            <KeyRound className="size-5 shrink-0" /><span className={collapsed ? "lg:sr-only" : ""}>Mot de passe</span>
          </Link>
          <form action={logoutAction}>
            <button className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-[#ffd0d5] hover:bg-danger/15" title="Se déconnecter">
              <LogOut className="size-5 shrink-0" /><span className={collapsed ? "lg:sr-only" : ""}>Se déconnecter</span>
            </button>
          </form>
          <button onClick={toggle} className="hidden w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:bg-white/8 lg:flex"
            aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}>
            {collapsed ? <ChevronsRight className="size-5" /> : <><ChevronsLeft className="size-5" />Replier</>}
          </button>
        </div>
      </aside>
    </>
  );
}
