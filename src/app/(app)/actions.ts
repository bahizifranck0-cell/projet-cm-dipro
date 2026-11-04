"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getActor, clearSessionCookie, SESSION_COOKIE } from "@/server/auth/current";
import { logout } from "@/server/services/auth";
import { revokeSession } from "@/server/services/sessions";

export async function logoutAction() {
  const actor = await getActor();
  if (actor) await logout(actor);
  else {
    const t = (await cookies()).get(SESSION_COOKIE)?.value;
    if (t) await revokeSession(t);
  }
  await clearSessionCookie();
  redirect("/connexion");
}
