"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { actionActor } from "@/server/auth/current";
import * as patients from "@/server/services/patients";
import * as reception from "@/server/services/reception";
import { runAction, str, type ActionState } from "@/server/actions/result";

const fields = (fd: FormData) => ({
  lastName: str(fd, "lastName"), postName: str(fd, "postName"), firstName: str(fd, "firstName"), sex: str(fd, "sex"),
  birthDate: str(fd, "birthDate"), phone: str(fd, "phone"), address: str(fd, "address"),
}) as patients.PatientInput;

export type CreatePatientState = (ActionState & { duplicates?: { id: string; patientNumber: string; name: string; phone: string | null; reasons: string[] }[] }) | undefined;

export async function createPatientAction(_: CreatePatientState, fd: FormData): Promise<CreatePatientState> {
  let id = "";
  let duplicates: NonNullable<CreatePatientState>["duplicates"];
  const res = await runAction(async () => {
    const r = await patients.createPatient(await actionActor(), fields(fd), { confirmedNotDuplicate: fd.get("confirmNotDuplicate") === "1" });
    if (!r.created) { duplicates = r.duplicates.map(({ birthDate: _b, ...d }) => d); return; }
    id = r.patient.id;
  });
  if (res?.ok && id) redirect(`/patients/${id}?cree=1`);
  if (duplicates) return { duplicates };
  return res;
}

export async function updatePatientAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => { await patients.updatePatient(await actionActor(), id, fields(fd)); });
  if (res?.ok) redirect(`/patients/${id}?modifie=1`);
  return res;
}

export async function registerArrivalAction(patientId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await reception.registerArrival(await actionActor(), patientId, {
      reason: str(fd, "reason"), priority: fd.get("priority") === "on", departmentId: str(fd, "departmentId"), doctorId: str(fd, "doctorId"),
    });
    revalidatePath(`/patients/${patientId}`); revalidatePath("/reception");
    return "Arrivée enregistrée : le patient est dans la file d'attente.";
  });
}

export async function orientVisitAction(visitId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await reception.orientVisit(await actionActor(), visitId, { departmentId: str(fd, "departmentId"), doctorId: str(fd, "doctorId") });
    revalidatePath("/reception");
    return "Orientation enregistrée.";
  });
}

export async function cancelVisitAction(visitId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await reception.cancelVisit(await actionActor(), visitId, str(fd, "reason") ?? "");
    revalidatePath("/reception");
    return "Passage annulé.";
  });
}
