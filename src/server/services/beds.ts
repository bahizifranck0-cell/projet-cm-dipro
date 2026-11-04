import { db } from "../db";
export async function availableBeds() {
  const beds = await db.bed.findMany({ where: { status: "AVAILABLE", room: { active: true } }, include: { room: true }, orderBy: [{ room: { code: "asc" } }, { code: "asc" }] });
  return beds.map((b) => ({ id: b.id, name: `${b.room.code} · lit ${b.code} — ${b.room.category}` }));
}
