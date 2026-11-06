"use client";
// Cloche des notifications de l'en-tête : ouvre la page Notifications (même contenu et mêmes actions qu'avant).
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";

export function NotificationBell({ count }: { count: number }) {
  const path = usePathname() ?? "";
  const on = path === "/notifications" || path.startsWith("/notifications/");
  const label = count ? `Notifications : ${count} non lue${count > 1 ? "s" : ""}` : "Notifications : aucune non lue";
  return (
    <Link href="/notifications" aria-label={label} title={label} aria-current={on ? "page" : undefined}
      className={`relative inline-flex size-11 items-center justify-center rounded-full border shadow-[0_6px_18px_rgba(0,0,0,0.35)] transition
        ${on ? "border-white/50 bg-white/20 text-white" : "border-white/25 bg-brand-900/90 text-ink hover:border-white/45 hover:bg-brand-800"}`}>
      <Bell className="size-5" aria-hidden />
      {count > 0 && (
        <span aria-hidden className="absolute -top-1 -right-1 min-w-5 rounded-full border-2 border-brand-950 bg-danger px-1 text-center text-[11px] leading-4 font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
