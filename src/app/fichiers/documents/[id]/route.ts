import { getActor } from "@/server/auth/current";
import { ForbiddenError } from "@/server/auth/actor";
import { readDocumentForStaff } from "@/server/services/documents";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor || actor.mustChangePassword) return new Response("Non authentifié", { status: 401 });
  try {
    const r = await readDocumentForStaff(actor, (await params).id);
    if (!r) return new Response("Introuvable", { status: 404 });
    const dl = new URL(req.url).searchParams.has("telecharger");
    return new Response(new Uint8Array(r.data), { headers: {
      "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `${dl ? "attachment" : "inline"}; filename="${r.doc.number}.pdf"`,
    } });
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Accès refusé", { status: 403 });
    throw e;
  }
}
