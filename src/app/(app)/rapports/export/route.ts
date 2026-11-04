import { getActor } from "@/server/auth/current";
import { ForbiddenError } from "@/server/auth/actor";
import { exportReportPdf } from "@/server/services/reports";
import { parseFilter } from "../filters";

export async function GET(req: Request) {
  const actor = await getActor();
  if (!actor || actor.mustChangePassword) return new Response("Non authentifié", { status: 401 });
  try {
    const { pdf, doc } = await exportReportPdf(actor, parseFilter(Object.fromEntries(new URL(req.url).searchParams)));
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${doc.number}.pdf"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Accès refusé", { status: 403 });
    throw e;
  }
}
