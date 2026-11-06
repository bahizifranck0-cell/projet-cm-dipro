// Mise à jour du suivi d'un commentaire par Claude (jeton requis) : en_cours, en_test, fait, refuse + réponse.
import { NextResponse, type NextRequest } from "next/server";
import { checkReviewToken, setReviewStatus } from "@/server/services/reviews";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (!checkReviewToken(q.get("jeton"))) return new NextResponse("Introuvable", { status: 404 });
  const id = q.get("id"), statut = q.get("statut");
  if (!id || !statut) return NextResponse.json({ erreur: "id et statut requis" }, { status: 400 });
  try {
    const r = await setReviewStatus(id, statut, q.get("reponse") ?? undefined);
    return NextResponse.json({ ok: true, id: r.id, statut: r.status }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ erreur: e instanceof Error ? e.message : "erreur" }, { status: 400 });
  }
}
export const GET = handle;
export const POST = handle;
