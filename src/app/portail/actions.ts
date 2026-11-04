"use server";
import { redirect } from "next/navigation";
import { portalChangePassword, portalLogin, portalLogout } from "@/server/services/portal";
import { clearPortalCookie, getPortalSession, portalIp, setPortalCookie } from "@/server/portal/session";
import { runAction, str, type ActionState } from "@/server/actions/result";

export async function portalLoginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await portalLogin(str(fd, "username") ?? "", str(fd, "password") ?? "", await portalIp());
  if (!r.ok) return { error: r.error };
  await setPortalCookie(r.token, r.expiresAt);
  redirect(r.mustChangePassword ? "/portail/mot-de-passe" : "/portail");
}
export async function portalLogoutAction() {
  const s = await getPortalSession();
  if (s) await portalLogout(s);
  await clearPortalCookie();
  redirect("/portail/connexion");
}
export async function portalPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await runAction(async () => {
    const s = await getPortalSession();
    if (!s) throw new Error("Session expirée");
    await portalChangePassword(s, str(fd, "current") ?? "", str(fd, "next") ?? "", str(fd, "confirm") ?? "");
  });
  if (r?.ok) redirect("/portail?mdp=1");
  return r;
}
