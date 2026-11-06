"use client";
// Mode commentaire : sélectionner un élément de l'interface et décrire la modification voulue.
// Monté seulement quand CMDPRO_REVIEW=1. N'altère pas les pages : tout est en surimpression.
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, X, MousePointerClick, Eye, Trash2 } from "lucide-react";
import { deleteReviewAction, listReviewsAction, sendReviewAction } from "@/app/(app)/revue-actions";

type Picked = { el: Element; selector: string; tag: string; text: string; html: string; context: string };
type Row = Awaited<ReturnType<typeof listReviewsAction>>[number];

const ACTIONS: [string, string][] = [["modifier", "Modifier"], ["supprimer", "Supprimer"], ["deplacer", "Déplacer"], ["ameliorer", "Améliorer"], ["bug", "Ne marche pas"]];
const STATUS: Record<string, [string, string]> = {
  nouveau: ["Envoyé", "bg-brand-600/30 text-brand-100"], en_cours: ["En cours", "bg-warning/20 text-[#ffe7b3]"],
  en_test: ["À vérifier", "bg-brand-400/25 text-brand-100"], fait: ["Fait", "bg-success/20 text-[#b7f5d3]"], refuse: ["Pas possible", "bg-danger/20 text-[#ffc9c4]"],
};
const isUi = (el: Element | null) => !!el?.closest("[data-revue-ui]");
const clean = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

function cssPath(el: Element): string {
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) return `#${el.id}`;
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== document.body && parts.length < 10) {
    if (cur.id && /^[A-Za-z][\w-]*$/.test(cur.id)) { parts.unshift(`#${cur.id}`); break; }
    let part = cur.tagName.toLowerCase();
    const parent: Element | null = cur.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter((c) => c.tagName === cur!.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(cur) + 1})`;
    }
    parts.unshift(part);
    cur = parent;
  }
  return parts.join(" > ");
}

function describe(el: Element): Picked {
  const label = el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder") || el.getAttribute("alt") || "";
  const text = clean(label || (el as HTMLElement).innerText || el.textContent, 300);
  const region = el.closest("section, article, form, table, nav, aside, [role=dialog]");
  const heading = region?.querySelector("h1, h2, h3, legend, caption, th")?.textContent ?? "";
  const pageTitle = document.querySelector("main h1")?.textContent ?? "";
  const ctx = [pageTitle && `Page : ${clean(pageTitle, 80)}`, heading && `Bloc : ${clean(heading, 80)}`, el.getAttribute("role") && `Rôle : ${el.getAttribute("role")}`]
    .filter(Boolean).join(" · ");
  const html = el.outerHTML.replace(/\s+/g, " ").slice(0, 1500);
  return { el, selector: cssPath(el), tag: el.tagName.toLowerCase(), text, html, context: ctx };
}

export function ReviewOverlay() {
  const path = usePathname() || "/";
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [action, setAction] = useState("modifier");
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => { listReviewsAction(path).then(setRows).catch(() => setRows([])); }, [path]);
  useEffect(() => { refresh(); setPicked(null); }, [refresh]);

  const place = (el: Element | null) => {
    const b = box.current; if (!b) return;
    if (!el) { b.style.display = "none"; return; }
    const r = el.getBoundingClientRect();
    Object.assign(b.style, { display: "block", top: `${r.top - 3}px`, left: `${r.left - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
  };

  useEffect(() => {
    if (!picking) { if (!picked) place(null); return; }
    const move = (e: PointerEvent) => { const t = e.target as Element; place(isUi(t) ? null : t); };
    const block = (e: Event) => { if (!isUi(e.target as Element)) { e.preventDefault(); e.stopPropagation(); } };
    const click = (e: MouseEvent) => {
      const t = e.target as Element;
      if (isUi(t)) return;
      e.preventDefault(); e.stopPropagation();
      const p = describe(t); setPicked(p); place(t); setPicking(false); setMsg(null);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { setPicking(false); place(null); } };
    document.addEventListener("pointermove", move, true);
    document.addEventListener("click", click, true);
    document.addEventListener("submit", block, true);
    document.addEventListener("pointerdown", block, true);
    document.addEventListener("keydown", key);
    document.documentElement.style.cursor = "crosshair";
    return () => {
      document.removeEventListener("pointermove", move, true); document.removeEventListener("click", click, true);
      document.removeEventListener("submit", block, true); document.removeEventListener("pointerdown", block, true);
      document.removeEventListener("keydown", key); document.documentElement.style.cursor = "";
    };
  }, [picking, picked]);

  useEffect(() => {
    if (!picked) return;
    const follow = () => place(picked.el.isConnected ? picked.el : null);
    window.addEventListener("scroll", follow, true); window.addEventListener("resize", follow);
    return () => { window.removeEventListener("scroll", follow, true); window.removeEventListener("resize", follow); };
  }, [picked]);

  const send = async () => {
    if (!picked) return;
    setSending(true);
    const r = await sendReviewAction({ path, selector: picked.selector, elementTag: picked.tag, elementText: picked.text, elementHtml: picked.html,
      context: picked.context, viewport: `${window.innerWidth}x${window.innerHeight}`, action, comment });
    setSending(false);
    if (r?.error) { setMsg({ t: r.error, bad: true }); return; }
    setMsg({ t: r?.message ?? "Envoyé." }); setComment(""); setPicked(null); place(null); refresh(); setListOpen(true);
  };

  const show = (sel: string) => {
    let el: Element | null = null;
    try { el = document.querySelector(sel); } catch { el = null; }
    if (!el) { setMsg({ t: "Cet élément n'est plus sur la page (il a peut-être déjà été modifié).", bad: true }); return; }
    el.scrollIntoView({ block: "center", behavior: "smooth" }); setTimeout(() => place(el), 350); setTimeout(() => { if (!picked) place(null); }, 2600);
  };

  const remove = async (id: string) => { const r = await deleteReviewAction(id); if (r?.error) setMsg({ t: r.error, bad: true }); refresh(); };
  const open = rows.filter((r) => r.status !== "fait" && r.status !== "refuse").length;

  return (
    <div data-revue-ui>
      <div ref={box} aria-hidden="true" className="pointer-events-none fixed z-[80] hidden rounded-md border-2 border-[#ffb547] bg-[#ffb547]/10 shadow-[0_0_0_9999px_rgba(2,8,26,0.25)]" />

      <div className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[85] flex flex-col items-end gap-2 md:bottom-6">
        {picking && <p role="status" className="border border-white/20 bg-[#0a1a40] text-ink shadow-[0_12px_40px_rgba(0,0,0,0.55)] max-w-64 rounded-xl px-3 py-2 text-sm">Touchez l&apos;élément à commenter. <kbd className="font-mono text-xs">Échap</kbd> pour annuler.</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => { setListOpen((v) => !v); setPicked(null); place(null); }} aria-expanded={listOpen}
            className="border border-white/20 bg-[#0a1a40] text-ink shadow-[0_12px_40px_rgba(0,0,0,0.55)] inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold">
            <Eye className="size-4" aria-hidden="true" />Commentaires{open ? ` (${open})` : ""}
          </button>
          <button type="button" onClick={() => { setPicking((v) => !v); setPicked(null); setListOpen(false); setMsg(null); }} aria-pressed={picking}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-brand-300/70 bg-brand-600 px-4 text-sm font-semibold text-white shadow-[0_6px_20px_rgba(21,87,214,0.45)] aria-pressed:bg-[#b86e00]">
            {picking ? <X className="size-4" aria-hidden="true" /> : <MousePointerClick className="size-4" aria-hidden="true" />}{picking ? "Annuler" : "Commenter"}
          </button>
        </div>
      </div>

      {(picked || listOpen) && (
        <section aria-label={picked ? "Nouveau commentaire" : "Commentaires de cette page"} className="border border-white/20 bg-[#0a1a40] text-ink shadow-[0_12px_40px_rgba(0,0,0,0.55)] fixed inset-x-[max(0.75rem,env(safe-area-inset-left))] bottom-[calc(9rem+env(safe-area-inset-bottom))] z-[85] max-h-[60dvh] overflow-y-auto rounded-2xl p-4 md:inset-x-auto md:right-6 md:bottom-20 md:w-[26rem]">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 className="font-semibold">{picked ? "Que voulez-vous changer ?" : `Commentaires de cette page (${rows.length})`}</h2>
            <button type="button" aria-label="Fermer" onClick={() => { setPicked(null); setListOpen(false); place(null); }} className="-m-2 rounded-lg p-2 hover:bg-white/10"><X className="size-5" aria-hidden="true" /></button>
          </div>

          {picked && (
            <div className="grid gap-3">
              <div className="rounded-xl border border-white/15 bg-black/20 p-3 text-xs">
                <p className="font-mono text-brand-300">&lt;{picked.tag}&gt;</p>
                {picked.text && <p className="mt-1 line-clamp-3 text-sm">« {picked.text} »</p>}
                {picked.context && <p className="mt-1 text-muted">{picked.context}</p>}
                <button type="button" onClick={() => { setPicked(null); setPicking(true); }} className="mt-2 text-xs font-semibold text-brand-300 underline">Choisir un autre élément</button>
              </div>
              <fieldset className="flex flex-wrap gap-2">
                <legend className="mb-1.5 text-sm font-medium">Type de demande</legend>
                {ACTIONS.map(([v, l]) => (
                  <label key={v} className="cursor-pointer rounded-full border border-white/25 px-3 py-1.5 text-sm has-checked:border-brand-300 has-checked:bg-brand-600/50">
                    <input type="radio" name="revue-action" value={v} checked={action === v} onChange={() => setAction(v)} className="sr-only" />{l}
                  </label>
                ))}
              </fieldset>
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium">Votre demande</span>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} className="field" placeholder="Exemple : mettre ce bouton en vert et l'appeler « Valider la facture »." />
              </label>
              <button type="button" onClick={send} disabled={sending} aria-busy={sending}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-brand-300/70 bg-brand-600 px-4 py-2 font-semibold text-white disabled:opacity-60">
                <MessageSquarePlus className="size-5" aria-hidden="true" />{sending ? "Envoi…" : "Envoyer le commentaire"}
              </button>
            </div>
          )}

          {!picked && (
            <div className="grid gap-2">
              {rows.length === 0 && <p className="text-sm text-muted">Aucun commentaire sur cette page. Touchez « Commenter », puis l&apos;élément à changer.</p>}
              {rows.map((r) => {
                const [lab, cls] = STATUS[r.status] ?? STATUS.nouveau;
                return (
                  <article key={r.id} className="rounded-xl border border-white/15 bg-black/15 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${cls}`}>{lab}</span>
                      <span className="text-muted">{ACTIONS.find((a) => a[0] === r.action)?.[1]} · {r.authorName}</span>
                    </div>
                    {r.elementText && <p className="mt-1.5 line-clamp-1 text-xs text-muted">Élément : « {r.elementText} »</p>}
                    <p className="mt-1 whitespace-pre-wrap">{r.comment}</p>
                    {r.reply && <p className="mt-2 border-l-2 border-success pl-2 text-xs">Claude : {r.reply}</p>}
                    <div className="mt-2 flex gap-3 text-xs font-semibold">
                      <button type="button" onClick={() => show(r.selector)} className="inline-flex items-center gap-1 text-brand-300"><Eye className="size-3.5" aria-hidden="true" />Voir l&apos;élément</button>
                      {r.mine && r.status === "nouveau" && <button type="button" onClick={() => remove(r.id)} className="inline-flex items-center gap-1 text-muted"><Trash2 className="size-3.5" aria-hidden="true" />Retirer</button>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {msg && <p role="status" className={`mt-3 text-sm ${msg.bad ? "text-danger" : "text-success"}`}>{msg.t}</p>}
        </section>
      )}
      {!picked && !listOpen && msg && <p role="status" className="border border-white/20 bg-[#0a1a40] text-ink shadow-[0_12px_40px_rgba(0,0,0,0.55)] fixed right-6 bottom-36 z-[85] max-w-72 rounded-xl px-3 py-2 text-sm md:bottom-20">{msg.t}</p>}
    </div>
  );
}
