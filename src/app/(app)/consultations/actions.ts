"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionActor } from "@/server/auth/current";
import * as cons from "@/server/services/consultations";
import * as appts from "@/server/services/appointments";
import { runAction, str, type ActionState } from "@/server/actions/result";

export async function startConsultationAction(visitId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const r = await runAction(async () => { id = (await cons.startConsultation(await actionActor(), visitId, str(fd, "specialtyId") ?? "")).id; });
  if (r?.ok) redirect(`/consultations/${id}`);
  return r;
}

function formOf(fd: FormData) {
  const form: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) if (k.startsWith("f_")) form[k.slice(2)] = v;
  return { observations: str(fd, "observations"), diagnosis: str(fd, "diagnosis"), treatment: str(fd, "treatment"), patientVisible: fd.get("patientVisible") === "on", form };
}

export async function saveConsultationAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const a = await actionActor();
    await cons.saveConsultation(a, id, formOf(fd));
    if (fd.get("intent") === "sign") {
      const r = await cons.signConsultation(a, id, { closeVisit: fd.get("closeVisit") === "on" });
      revalidatePath(`/consultations/${id}`);
      return r.charged ? "Consultation signée et ajoutée au compte du patient." : "Consultation signée. Aucun tarif de consultation n'est configuré : rien n'a été facturé.";
    }
    revalidatePath(`/consultations/${id}`);
    return "Brouillon enregistré.";
  });
}

export async function addPrescriptionAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const meds = fd.getAll("medication").map(String);
    const items = meds.map((medication, i) => ({ medication, dosage: String(fd.getAll("dosage")[i] ?? ""), frequency: String(fd.getAll("frequency")[i] ?? ""), duration: String(fd.getAll("duration")[i] ?? "") })).filter((x) => x.medication.trim());
    await cons.addPrescription(await actionActor(), id, items, str(fd, "notes"));
    revalidatePath(`/consultations/${id}`);
    return "Ordonnance ajoutée. Elle sera éditée en PDF à la signature.";
  });
}
export async function removePrescriptionAction(consultationId: string, id: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => { await cons.removePrescription(await actionActor(), id); revalidatePath(`/consultations/${consultationId}`); return "Ordonnance retirée."; });
}
export async function referAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await cons.referPatient(await actionActor(), id, { toDepartmentId: str(fd, "toDepartmentId"), toSpecialtyId: str(fd, "toSpecialtyId"), toDoctorId: str(fd, "toDoctorId"), reason: str(fd, "reason") });
    revalidatePath(`/consultations/${id}`);
    return "Orientation enregistrée : le passage sera transmis à la signature.";
  });
}
export async function createAppointmentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const a = await appts.createAppointment(await actionActor(), { patientId: str(fd, "patientId"), doctorId: str(fd, "doctorId"), specialtyId: str(fd, "specialtyId"), scheduledAt: str(fd, "scheduledAt"), reason: str(fd, "reason"), notes: str(fd, "notes"), consultationId: str(fd, "consultationId") });
    revalidatePath("/rendez-vous");
    return `Rendez-vous ${a.number} enregistré. Le document à remettre au patient est disponible.`;
  });
}
export async function rescheduleAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { const a = await appts.rescheduleAppointment(await actionActor(), id, { scheduledAt: str(fd, "scheduledAt") ?? "", reason: str(fd, "reason") }); revalidatePath("/rendez-vous"); return `Rendez-vous reporté (${a.number}).`; });
}
export async function cancelAppointmentAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await appts.cancelAppointment(await actionActor(), id, str(fd, "reason") ?? ""); revalidatePath("/rendez-vous"); return "Rendez-vous annulé."; });
}
export async function missedAction(id: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => { await appts.markMissed(await actionActor(), id); revalidatePath("/rendez-vous"); return "Rendez-vous marqué comme manqué."; });
}
