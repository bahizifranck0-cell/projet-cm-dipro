"use server";
import { revalidatePath } from "next/cache";
import { actionActor } from "@/server/auth/current";
import * as hr from "@/server/services/hr";
import { updateEmployeePhoto } from "@/server/services/employees";
import { runAction, str, type ActionState } from "@/server/actions/result";

const r = (id: string) => revalidatePath(`/personnel/${id}`);
export async function updateEmployeeAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const a = await actionActor();
    await hr.updateEmployee(a, id, Object.fromEntries(["firstName", "lastName", "postName", "phone", "email", "address", "position", "departmentId", "status"].map((k) => [k, str(fd, k)])));
    const f = fd.get("photo"); if (f instanceof File && f.size > 0) await updateEmployeePhoto(a, id, Buffer.from(await f.arrayBuffer()));
    r(id); return "Dossier mis à jour.";
  });
}
export async function contractAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await hr.addContract(await actionActor(), id, { type: str(fd, "type"), startDate: str(fd, "startDate"), endDate: str(fd, "endDate"), baseSalary: str(fd, "baseSalary"), currency: str(fd, "currency") }); r(id); return "Contrat enregistré."; });
}
export async function payrollItemAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await hr.addPayrollItem(await actionActor(), id, { period: str(fd, "period"), type: str(fd, "type"), amount: str(fd, "amount"), currency: str(fd, "currency"), description: str(fd, "description") }); r(id); return "Opération enregistrée."; });
}
export async function cancelItemAction(id: string, itemId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await hr.cancelPayrollItem(await actionActor(), itemId, str(fd, "reason") ?? ""); r(id); return "Opération annulée."; });
}
export async function payslipAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { const s = await hr.generatePayslip(await actionActor(), id, str(fd, "period") ?? ""); r(id); return `Bulletin ${s.period} généré (version ${s.version}).`; });
}
export async function leaveAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => { await hr.requestLeave(await actionActor(), id, { type: str(fd, "type"), startDate: str(fd, "startDate"), endDate: str(fd, "endDate"), reason: str(fd, "reason") }); r(id); return "Demande de congé enregistrée."; });
}
export async function decideLeaveAction(id: string, leaveId: string, approve: boolean, _: ActionState): Promise<ActionState> {
  return runAction(async () => { await hr.decideLeave(await actionActor(), leaveId, approve); r(id); return approve ? "Congé accordé." : "Congé refusé."; });
}
