"use server";
import { redirect } from "next/navigation";
import { actionActor } from "@/server/auth/current";
import { createEmployee } from "@/server/services/employees";
import { runAction, str, type ActionState } from "@/server/actions/result";

export async function createEmployeeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id = "";
  const res = await runAction(async () => {
    const actor = await actionActor();
    const photo = fd.get("photo");
    const buf = photo instanceof File && photo.size > 0 ? Buffer.from(await photo.arrayBuffer()) : undefined;
    const fields = ["firstName", "lastName", "postName", "sex", "phone", "email", "address", "position", "departmentId", "matricule"];
    const e = await createEmployee(actor, Object.fromEntries(fields.map((k) => [k, str(fd, k)])), buf);
    id = e.id;
  });
  if (res?.ok) redirect(`/personnel?cree=${id}`);
  return res;
}
