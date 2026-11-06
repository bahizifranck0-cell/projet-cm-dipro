// Lecture des commentaires par Claude (jeton requis). Aucune donnée patient : uniquement les commentaires de revue.
import { NextResponse, type NextRequest } from "next/server";
import { allReviews, checkReviewToken } from "@/server/services/reviews";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkReviewToken(req.nextUrl.searchParams.get("jeton"))) return new NextResponse("Introuvable", { status: 404 });
  const rows = await allReviews(req.nextUrl.searchParams.get("statut") ?? undefined);
  return NextResponse.json({ commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null, total: rows.length, commentaires: rows },
    { headers: { "cache-control": "no-store" } });
}
