import { db } from "@/server/db";
import { getActor } from "@/server/auth/current";
import { readStored } from "@/server/storage";

// Photo de produit : visible par tout le personnel connecté (boutique).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getActor())) return new Response("Non authentifié", { status: 401 });
  const p = await db.product.findUnique({ where: { id: (await params).id }, select: { photoPath: true } });
  if (!p?.photoPath) return new Response("Introuvable", { status: 404 });
  const f = await readStored(p.photoPath);
  return new Response(new Uint8Array(f.data), { headers: { "Content-Type": f.mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
