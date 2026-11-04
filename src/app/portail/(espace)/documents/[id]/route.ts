import { requirePortal } from "@/server/portal/session";
import { readDocumentForPatient } from "@/server/services/documents";
import { db } from "@/server/db";

// Téléchargement réservé au patient connecté, et seulement pour SES documents communicables.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await requirePortal();
  const r = await readDocumentForPatient(s.patientId, (await params).id);
  if (!r) return new Response("Document introuvable", { status: 404 });
  await db.auditLog.create({ data: { patientAccountId: s.accountId, action: "DOCUMENT_VIEW", module: "portal", entityType: "Document", entityId: r.doc.id } });
  return new Response(new Uint8Array(r.data), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${r.doc.number}.pdf"`, "Cache-Control": "private, no-store" } });
}
