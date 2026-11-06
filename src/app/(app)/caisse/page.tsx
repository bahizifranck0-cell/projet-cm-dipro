import Link from "next/link";
import { redirect } from "next/navigation";
import type { Currency, InvoiceStatus } from "@prisma/client";
import { ArrowDownCircle, ArrowUpCircle, History, PieChart, ReceiptText, Wallet } from "lucide-react";
import { requireActor } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { INVOICE_STATUS, fmtMoney, listInvoices, patientsToInvoice } from "@/server/services/billing";
import * as cash from "@/server/services/cash";
import { displayName } from "@/server/services/patients";
import { cashJournal } from "@/server/services/finance";
import { todayBounds } from "@/lib/normalize";
import { Badge, Card, EmptyState, PageHeader, StatCard } from "@/components/ui/card";
import { CreateInvoice } from "@/components/billing/billing-forms";
import { CloseSessionButton, OpenSessionButton, OperationButtons } from "@/components/cash/cash-forms";
import { buttonClass } from "@/components/ui/button-class";
import { fmtDateTime } from "@/lib/labels";

// Module Caisse : structure du module Caisse PREMIDIS (session, solde théorique, entrées/sorties, opérations,
// billetage à la clôture, historique, rapport) + factures et encaissements CMD Pro (onglet « Factures »).
export const metadata = { title: "Caisse" };

const VIEWS = { operations: "Opérations", factures: "Factures", historique: "Historique des sessions", rapport: "Rapport" } as const;
type View = keyof typeof VIEWS;
const PERIODS = { jour: "Aujourd'hui", semaine: "7 derniers jours", mois: "30 derniers jours" } as const;

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string; statut?: string; vue?: string; devise?: string; periode?: string }> }) {
  const actor = await requireActor();
  const canCash = can(actor, "cash", "view") || can(actor, "finance", "view");
  if (!canCash && !can(actor, "billing", "view")) redirect("/acces-refuse");
  const sp = await searchParams;
  const currency: Currency = sp.devise === "CDF" ? "CDF" : "USD";
  const view: View = !canCash ? "factures" : sp.vue && sp.vue in VIEWS ? (sp.vue as View) : "operations";
  const canWrite = can(actor, "cash", "create");
  const href = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ vue: view, devise: currency, ...p }).filter(([, v]) => v) as [string, string][]);
    return `/caisse?${q.toString()}`;
  };

  const [session, toInvoice] = await Promise.all([canCash ? cash.currentSession(actor, currency) : null, patientsToInvoice(actor)]);

  return (<>
    <PageHeader title="Caisse" subtitle={canCash ? (session ? `Session ${currency} ouverte` : `Aucune session ${currency} ouverte`) : "Factures à régler, encaissements et reçus"}
      actions={canCash && canWrite && (session
        ? <CloseSessionButton currency={currency} expected={Number(session.expected)} denominations={cash.DENOMINATIONS[currency]} />
        : <OpenSessionButton currency={currency} />)} />

    {canCash && <>
      <nav aria-label="Devise de la caisse" className="mb-4 inline-flex rounded-2xl border border-white/15 bg-white/5 p-1 backdrop-blur-md">
        {cash.CURRENCIES.map((c) => (
          <Link key={c} href={href({ devise: c })} aria-current={c === currency ? "page" : undefined}
            className={`min-h-10 rounded-xl px-4 py-2 text-sm font-semibold transition ${c === currency ? "bg-brand-600 text-white shadow-[0_6px_18px_rgba(21,87,214,0.4)]" : "text-ink/80 hover:bg-white/10"}`}>{c}</Link>
        ))}
      </nav>

      {session ? (
        <section aria-label="Session de caisse en cours" className="mb-6 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="cash-rise" style={{ ["--i" as string]: 0 }}><StatCard label="Fond de caisse" value={fmtMoney(session.openingFloat, currency)} tone="blue" icon={<Wallet className="size-5" />} /></div>
            <div className="cash-rise" style={{ ["--i" as string]: 1 }}><StatCard label="Entrées" value={fmtMoney(session.totalIn, currency)} tone="green" icon={<ArrowDownCircle className="size-5" />} /></div>
            <div className="cash-rise" style={{ ["--i" as string]: 2 }}><StatCard label="Sorties" value={fmtMoney(session.totalOut, currency)} tone="red" icon={<ArrowUpCircle className="size-5" />} /></div>
          </div>
          <div className="cash-rise relative overflow-hidden rounded-3xl border border-white/25 bg-gradient-to-br from-brand-600/55 via-brand-700/45 to-brand-900/60 p-5 shadow-[0_18px_50px_rgba(4,17,46,0.55)] backdrop-blur-xl" style={{ ["--i" as string]: 3 }}>
            <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-brand-300/20 blur-3xl" />
            <p className="text-[11px] font-semibold tracking-wider text-white/75 uppercase">Solde théorique</p>
            <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums text-white sm:text-4xl">{fmtMoney(session.expected, currency)}</p>
            <p className="mt-1 text-xs text-white/80">Session ouverte {fmtDateTime(session.openedAt)} • {session.openedByName}</p>
          </div>
          {canWrite && <div className="cash-rise" style={{ ["--i" as string]: 4 }}><OperationButtons currency={currency} categories={cash.CATEGORIES} methods={cash.METHODS} /></div>}
        </section>
      ) : (
        <div className="cash-rise mb-6"><EmptyState title={`Aucune session ${currency} ouverte`}>
          <p className="mb-3 text-sm text-muted">Ouvrez une session de caisse avec un fond initial pour commencer.</p>
          {canWrite && <OpenSessionButton currency={currency} big />}
        </EmptyState></div>
      )}

      <nav aria-label="Vues de la caisse" className="scroll-area -mx-1 mb-4 flex gap-1 px-1 pb-1">
        {(Object.keys(VIEWS) as View[]).map((v) => {
          const Icon = { operations: Wallet, factures: ReceiptText, historique: History, rapport: PieChart }[v];
          return (
            <Link key={v} href={href({ vue: v, q: undefined, statut: undefined })} aria-current={v === view ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition ${v === view ? "border-white/40 bg-white/15 text-white" : "border-transparent text-ink/80 hover:bg-white/8"}`}>
              <Icon className="size-4" aria-hidden />{VIEWS[v]}{v === "factures" && toInvoice.length > 0 && <span className="rounded-full bg-warning/25 px-2 text-xs">{toInvoice.length}</span>}
            </Link>
          );
        })}
      </nav>
    </>}

    {view === "operations" && <Operations actor={actor} sessionId={session?.id} currency={currency} />}
    {view === "factures" && <Invoices actor={actor} toInvoice={toInvoice} q={sp.q} statut={sp.statut} vue={canCash ? "factures" : undefined} devise={canCash ? currency : undefined} />}
    {view === "historique" && <Sessions actor={actor} />}
    {view === "rapport" && <Report actor={actor} periode={sp.periode && sp.periode in PERIODS ? (sp.periode as keyof typeof PERIODS) : "jour"} href={href} />}
  </>);
}

type Actor = Awaited<ReturnType<typeof requireActor>>;

async function Operations({ actor, sessionId, currency }: { actor: Actor; sessionId?: string; currency: Currency }) {
  if (!sessionId) return <p className="text-sm text-muted">Les opérations s&apos;affichent ici dès qu&apos;une session {currency} est ouverte. Les sessions passées sont dans « Historique des sessions ».</p>;
  const ops = await cash.listOperations(actor, { sessionId });
  return (<section aria-labelledby="ops-title">
    <h2 id="ops-title" className="mb-2 px-1 text-xs font-semibold tracking-wider text-muted uppercase">Opérations</h2>
    {ops.length === 0 ? <EmptyState title="Aucune opération" /> : <OpList ops={ops} />}
  </section>);
}

function OpList({ ops }: { ops: Awaited<ReturnType<typeof cash.listOperations>> }) {
  return (
    <ul className="glass divide-y divide-white/10 overflow-hidden rounded-3xl">
      {ops.map((o, i) => (
        <li key={o.id} className="cash-rise flex items-center gap-3 px-4 py-3" style={{ ["--i" as string]: Math.min(i, 8) }}>
          <span aria-hidden className={`flex size-10 shrink-0 items-center justify-center rounded-2xl border ${o.type === "IN" ? "border-emerald-300/30 bg-emerald-500/20 text-[#b7f5d3]" : "border-rose-300/30 bg-rose-500/20 text-[#ffc9c4]"}`}>
            {o.type === "IN" ? <ArrowDownCircle className="size-5" /> : <ArrowUpCircle className="size-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{o.description || cash.categoryLabel(o.category)}</p>
            <p className="text-xs text-muted">{fmtDateTime(o.createdAt)} • {cash.METHODS[o.method] ?? o.method} • {cash.categoryLabel(o.category)} • {o.createdByName}</p>
          </div>
          <p className={`shrink-0 font-semibold tabular-nums ${o.type === "IN" ? "text-[#b7f5d3]" : "text-[#ffc9c4]"}`}><span className="sr-only">{o.type === "IN" ? "Entrée de " : "Sortie de "}</span>{o.type === "IN" ? "+" : "−"}{fmtMoney(o.amount, o.currency)}</p>
        </li>
      ))}
    </ul>
  );
}

async function Sessions({ actor }: { actor: Actor }) {
  const ss = await cash.listSessions(actor);
  if (ss.length === 0) return <EmptyState title="Aucune session de caisse pour le moment." />;
  return (
    <ul className="space-y-3">{ss.map((s, i) => {
      const diff = s.difference ? Number(s.difference) : 0;
      return (
        <li key={s.id} className="glass cash-rise rounded-3xl p-4" style={{ ["--i" as string]: Math.min(i, 8) }}>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">Session {s.currency} — {fmtDateTime(s.openedAt)}</p>
            {s.closedAt ? <Badge tone={Math.abs(diff) < 0.01 ? "green" : "red"}>{Math.abs(diff) < 0.01 ? "Clôturée sans écart" : `Écart ${diff > 0 ? "+" : ""}${fmtMoney(diff, s.currency)}`}</Badge> : <Badge tone="blue">Ouverte</Badge>}
            <span className="text-xs text-muted">{s._count.operations} opération{s._count.operations > 1 ? "s" : ""}</span>
          </div>
          <p className="mt-1 text-sm text-muted">Ouverte par {s.openedByName}{s.closedAt && <> • clôturée {fmtDateTime(s.closedAt)} par {s.closedByName}</>}</p>
          {s.closedAt && (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              {[["Fond", s.openingFloat], ["Entrées", s.totalIn], ["Sorties", s.totalOut], ["Attendu", s.expectedAmount], ["Compté", s.countedAmount]].map(([l, v]) => (
                <div key={String(l)} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2"><dt className="text-xs text-muted">{String(l)}</dt><dd className="font-semibold tabular-nums">{fmtMoney(String(v ?? 0), s.currency)}</dd></div>
              ))}
            </dl>
          )}
          {Array.isArray(s.denominations) && s.denominations.length > 0 && (
            <details className="mt-2 text-sm"><summary className="cursor-pointer text-brand-300">Billetage</summary>
              <ul className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">{(s.denominations as { denomination: number; count: number }[]).map((d) => (
                <li key={d.denomination} className="tabular-nums">{d.denomination.toLocaleString("fr-FR")} × {d.count} = {fmtMoney(d.denomination * d.count, s.currency)}</li>))}</ul>
            </details>
          )}
          {s.notes && <p className="mt-2 text-sm text-ink/85">Notes : {s.notes}</p>}
        </li>);
    })}</ul>
  );
}

async function Report({ actor, periode, href }: { actor: Actor; periode: keyof typeof PERIODS; href: (p: Record<string, string | undefined>) => string }) {
  const to = new Date(), from = new Date();
  if (periode === "jour") from.setHours(0, 0, 0, 0); else from.setDate(from.getDate() - (periode === "semaine" ? 7 : 30));
  const rows = await cash.cashReport(actor, from, to);
  return (<section aria-labelledby="rapport-title">
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <h2 id="rapport-title" className="mr-2 text-lg font-semibold">Rapport de caisse</h2>
      {(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((p) => (
        <Link key={p} href={href({ vue: "rapport", periode: p })} aria-current={p === periode ? "page" : undefined}
          className={`rounded-full border px-3 py-1 text-sm ${p === periode ? "border-brand-300 bg-brand-600/50 text-white" : "border-white/20 text-ink/80 hover:bg-white/10"}`}>{PERIODS[p]}</Link>
      ))}
    </div>
    <div className="space-y-6">{rows.map((r) => (
      <div key={r.currency}>
        <h3 className="mb-2 text-sm font-semibold tracking-wider text-muted uppercase">{r.currency}</h3>
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Entrées" value={fmtMoney(r.totalIn, r.currency)} tone="green" />
          <StatCard label="Sorties" value={fmtMoney(r.totalOut, r.currency)} tone="red" />
          <StatCard label="Net" value={fmtMoney(r.net, r.currency)} tone={r.net.gte(0) ? "blue" : "amber"} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {([["Entrées par catégorie", r.inByCategory], ["Sorties par catégorie", r.outByCategory]] as const).map(([title, data]) => (
            <Card key={title}><h4 className="mb-2 font-semibold">{title}</h4>
              {data.length === 0 ? <p className="text-sm text-muted">Aucune opération.</p> : (
                <ul className="space-y-2">{data.map((x) => {
                  const total = data.reduce((a, y) => a + Number(y.amount), 0) || 1;
                  const pct = Math.round((Number(x.amount) / total) * 100);
                  return (<li key={x.category}>
                    <div className="flex justify-between gap-2 text-sm"><span>{x.label} <span className="text-muted">({x.count})</span></span><span className="font-semibold tabular-nums">{fmtMoney(x.amount, r.currency)}</span></div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden><div className="h-full rounded-full bg-brand-400" style={{ width: `${pct}%` }} /></div>
                  </li>);
                })}</ul>)}
            </Card>))}
        </div>
      </div>))}</div>
  </section>);
}

async function Invoices({ actor, toInvoice, q, statut, vue, devise }: { actor: Actor; toInvoice: Awaited<ReturnType<typeof patientsToInvoice>>; q?: string; statut?: string; vue?: string; devise?: string }) {
  const { start, end } = todayBounds();
  const [invoices, today] = await Promise.all([
    listInvoices(actor, { status: (statut as InvoiceStatus) || "open", q }),
    can(actor, "cash", "view") ? cashJournal(actor, start, end, can(actor, "finance", "view") ? undefined : actor.userId) : null,
  ]);
  return (<>
    {today && <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Encaissé aujourd'hui (USD)" value={fmtMoney(today.totals.USD ?? 0, "USD")} tone="green" />
      <StatCard label="Encaissé aujourd'hui (CDF)" value={fmtMoney(today.totals.CDF ?? 0, "CDF")} tone="green" />
      <StatCard label="Paiements aujourd'hui" value={today.payments.length} />
      <StatCard label="Patients à facturer" value={toInvoice.length} tone="amber" />
    </div>}
    {toInvoice.length > 0 && <Card className="mb-5">
      <h2 className="mb-3 text-lg font-semibold">Prestations à facturer</h2>
      <ul className="divide-y divide-white/10">{toInvoice.map((p) => (
        <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
          <span className="min-w-0 flex-1"><Link href={`/patients/${p.id}`} className="font-semibold hover:underline">{displayName(p)}</Link><span className="block text-sm text-muted">{p.patientNumber} · {p.lines} prestation{p.lines > 1 ? "s" : ""} non facturée{p.lines > 1 ? "s" : ""}</span></span>
          <CreateInvoice patientId={p.id} />
        </li>))}</ul>
    </Card>}
    <form className="mb-4 flex flex-wrap gap-2" role="search">
      {vue && <input type="hidden" name="vue" value={vue} />}{devise && <input type="hidden" name="devise" value={devise} />}
      <input name="q" defaultValue={q} placeholder="N° de facture, patient, dossier" className="field max-w-sm" aria-label="Rechercher une facture" />
      <select name="statut" defaultValue={statut ?? ""} className="field !w-auto" aria-label="Statut"><option value="">À régler</option>{Object.entries(INVOICE_STATUS).filter(([k]) => k !== "DRAFT").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      <button className={buttonClass("secondary")}>Afficher</button>
    </form>
    {invoices.length === 0 ? <EmptyState title="Aucune facture." /> : (
      <ul className="space-y-3">{invoices.map((i) => (
        <li key={i.id}><Link href={`/caisse/factures/${i.id}`} className="glass flex flex-wrap items-center gap-3 rounded-2xl p-4 hover:border-white/35">
          <div className="min-w-0 flex-1"><p className="flex flex-wrap items-center gap-2 font-semibold">{i.number} — {i.patient ? displayName(i.patient) : i.sale?.customerName ?? "Vente pharmacie"}
            <Badge tone={i.status === "PAID" ? "green" : i.status === "CANCELLED" ? "red" : "amber"}>{INVOICE_STATUS[i.status]}</Badge>
            {i.creditRequests.some((c) => c.status === "PENDING") && <Badge tone="blue">Crédit demandé</Badge>}{i.creditRequests.some((c) => c.status === "APPROVED") && <Badge tone="blue">Crédit approuvé</Badge>}</p>
            <p className="text-sm text-muted">{fmtDateTime(i.issuedAt)} · total {fmtMoney(i.total, i.currency)} · reste {fmtMoney(i.total.sub(i.amountPaid), i.currency)}</p></div>
        </Link></li>))}</ul>
    )}
  </>);
}
