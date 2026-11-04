import { db } from "../db";
import { listDoctors } from "./reception";

/** Listes de choix pour l'orientation (services actifs et médecins disponibles). */
export async function orientationOptions() {
  const [deps, docs] = await Promise.all([db.department.findMany({ where: { active: true }, orderBy: { name: "asc" } }), listDoctors()]);
  return {
    departments: deps.map((d) => ({ id: d.id, name: d.name })),
    doctors: docs.map((d) => ({ id: d.id, name: `Dr ${d.lastName.toUpperCase()} ${d.firstName}${d.doctorAssignments.length ? ` — ${d.doctorAssignments.map((a) => a.specialty.name).join(", ")}` : ""}` })),
  };
}
