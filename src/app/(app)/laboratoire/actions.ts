"use server";
import { revalidatePath } from "next/cache";
import { actionActor } from "@/server/auth/current";
import * as lab from "@/server/services/laboratory";
import { runAction, str, type ActionState } from "@/server/actions/result";

const r = (id: string) => { revalidatePath(`/laboratoire/${id}`); revalidatePath("/laboratoire"); };
export async function requestLabAction(consultationId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { const x = await lab.requestLab(await actionActor(), consultationId, fd.getAll("tests").map(String), str(fd, "clinicalInfo")); revalidatePath(`/consultations/${consultationId}`); return `Demande ${x.number} envoyée au laboratoire.`; });
}
export async function sampleAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await lab.recordSample(await actionActor(), id, str(fd, "sampleType") ?? "", str(fd, "notes")); r(id); return "Prélèvement enregistré."; });
}
export async function resultsAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const ids = fd.getAll("itemId").map(String);
    const items = ids.map((iid) => ({ id: iid, resultValue: str(fd, `value_${iid}`), flag: (str(fd, `flag_${iid}`) ?? "") as never, observation: str(fd, `obs_${iid}`) }));
    const submit = fd.get("intent") === "submit";
    await lab.enterResults(await actionActor(), id, { items, conclusion: str(fd, "conclusion"), submit });
    r(id); return submit ? "Résultats soumis pour validation." : "Résultats enregistrés.";
  });
}
export async function validateAction(id: string, _: ActionState): Promise<ActionState> {
  return runAction(async () => { await lab.validateResults(await actionActor(), id); r(id); return "Résultats validés : médecin notifié, document PDF créé."; });
}
export async function cancelLabAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await lab.cancelLabRequest(await actionActor(), id, str(fd, "reason") ?? ""); r(id); return "Demande annulée."; });
}
export async function labTestAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    await lab.saveLabTest(await actionActor(), { code: str(fd, "code"), name: str(fd, "name"), category: str(fd, "category"), sampleType: str(fd, "sampleType"), unit: str(fd, "unit"), referenceRange: str(fd, "referenceRange"), tariffItemId: str(fd, "tariffItemId") }, id ?? undefined);
    revalidatePath("/laboratoire/catalogue"); return id ? "Analyse modifiée." : "Analyse ajoutée au catalogue.";
  });
}
export async function labTestToggleAction(id: string, active: boolean, _: ActionState): Promise<ActionState> {
  return runAction(async () => { await lab.setLabTestActive(await actionActor(), id, active); revalidatePath("/laboratoire/catalogue"); return active ? "Analyse réactivée." : "Analyse retirée du catalogue."; });
}
