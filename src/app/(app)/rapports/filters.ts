import type { ReportFilter } from "@/server/services/reports";
export type RawFilter = { du?: string; au?: string; medecin?: string; specialite?: string; service?: string };
export function parseFilter(sp: RawFilter): ReportFilter & { du: string; au: string } {
  const today = new Date(Date.now() + 2 * 3600e3).toISOString().slice(0, 10);
  const du = sp.du && /^\d{4}-\d{2}-\d{2}$/.test(sp.du) ? sp.du : `${today.slice(0, 7)}-01`;
  const au = sp.au && /^\d{4}-\d{2}-\d{2}$/.test(sp.au) ? sp.au : today;
  return { du, au, from: new Date(`${du}T00:00:00+02:00`), to: new Date(new Date(`${au}T00:00:00+02:00`).getTime() + 86400e3), doctorId: sp.medecin || undefined, specialtyId: sp.specialite || undefined, departmentId: sp.service || undefined };
}
