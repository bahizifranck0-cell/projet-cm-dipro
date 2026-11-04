import { requirePage } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { DOC_PERMISSION } from "@/server/services/documents";
import { displayName } from "@/server/services/patients";
import { db } from "@/server/db";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { buttonClass } from "@/components/ui/button-class";
import { fmtDateTime } from "@/lib/labels";
import type { DocumentType, Prisma } from "@prisma/client";

export const metadata = { title: "Documents" };
const TYPE: Record<DocumentType, string> = { LAB_RESULT: "Résultat de laboratoire", PRESCRIPTION: "Ordonnance", INVOICE: "Facture", RECEIPT: "Reçu", APPOINTMENT: "Rendez-vous", PAYSLIP: "Bulletin de paie", REPORT: "Rapport", MEDICAL: "Document médical", ADMINISTRATIVE: "Administratif", OTHER: "Autre" };
export default async function Page({ searchParams }: { searchParams: Promise<{ type?: string; q?: string }> }) {
  const actor = await requirePage("documents", "view");
  const sp = await searchParams;
  // Chaque type n'est listé que si l'utilisateur a le droit de le voir (bulletins : RH uniquement)
  const allowed = (Object.keys(TYPE) as DocumentType[]).filter((t) => { const [m, a] = DOC_PERMISSION[t]; return t === "PAYSLIP" ? can(actor, "hr", "view") : can(actor, m, a) || can(actor, "documents", "view"); });
  const where: Prisma.DocumentWhereInput = { type: { in: sp.type && allowed.includes(sp.type as DocumentType) ? [sp.type as DocumentType] : allowed },
    ...(sp.q ? { OR: [{ number: { contains: sp.q.toUpperCase() } }, { title: { contains: sp.q, mode: "insensitive" } }, { patient: { searchName: { contains: sp.q.toLowerCase() } } }] } : {}) };
  const docs = await db.document.findMany({ where, orderBy: { createdAt: "desc" }, take: 200, include: { patient: true, employee: true } });
  return (<>
    <PageHeader title="Documents" subtitle="Documents officiels générés par les modules (accès selon vos permissions)" />
    <form className="mb-4 flex flex-wrap gap-2" role="search">
      <input name="q" defaultValue={sp.q} placeholder="Numéro, titre ou patient" className="field max-w-sm" aria-label="Rechercher un document" />
      <select name="type" defaultValue={sp.type ?? ""} className="field !w-auto" aria-label="Type de document"><option value="">Tous les types</option>{allowed.map((t) => <option key={t} value={t}>{TYPE[t]}</option>)}</select>
      <button className={buttonClass("secondary")}>Rechercher</button>
    </form>
    {docs.length === 0 ? <EmptyState title="Aucun document." /> : <DataTable rows={docs} rowKey={(d) => d.id} caption="Documents" columns={[
      { header: "Document", mobile: "primary", cell: (d) => <a href={`/fichiers/documents/${d.id}`} target="_blank" className="font-semibold hover:underline">{d.title}</a> },
      { header: "Type", cell: (d) => TYPE[d.type] }, { header: "Numéro", cell: (d) => `${d.number}${d.version > 1 ? ` (v${d.version})` : ""}` },
      { header: "Concerne", cell: (d) => d.patient ? displayName(d.patient) : d.employee ? `${d.employee.lastName.toUpperCase()} ${d.employee.firstName}` : "—" },
      { header: "Date", mobile: "hide-mobile", cell: (d) => fmtDateTime(d.createdAt) },
    ]} />}
  </>);
}
