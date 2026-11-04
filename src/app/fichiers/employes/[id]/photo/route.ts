import { db } from "@/server/db";
import { getActor } from "@/server/auth/current";
import { can } from "@/server/auth/actor";
import { readStored } from "@/server/storage";

// Photo d'employé : accessible au personnel RH, au Super Administrateur et à l'employé lui-même.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  if (!actor) return new Response("Non authentifié", { status: 401 });
  if (!(actor.isSuperAdmin || can(actor, "hr", "view") || actor.employeeId === id)) return new Response("Accès refusé", { status: 403 });
  const emp = await db.employee.findUnique({ where: { id }, select: { photoPath: true } });
  if (!emp?.photoPath) return new Response("Introuvable", { status: 404 });
  try {
    const f = await readStored(emp.photoPath);
    return new Response(new Uint8Array(f.data), { headers: { "Content-Type": f.mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new Response("Introuvable", { status: 404 });
  }
}
