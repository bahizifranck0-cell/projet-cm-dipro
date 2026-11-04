"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { login } from "@/server/services/auth";
import { clientIp, setSessionCookie } from "@/server/auth/current";
import type { ActionState } from "@/server/actions/result";

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await login(String(fd.get("username") ?? ""), String(fd.get("password") ?? ""), {
    ip: await clientIp(),
    userAgent: (await headers()).get("user-agent"),
  });
  if (!r.ok) return { error: r.error };
  await setSessionCookie(r.token, r.expiresAt);
  redirect(r.mustChangePassword ? "/compte/mot-de-passe" : "/");
}
