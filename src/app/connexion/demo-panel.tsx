"use client";
import { useActionState } from "react";
import { loginAction } from "./actions";

type Acc = { username: string; label?: string; role: string };
function DemoLogin({ a, password, big }: { a: Acc; password: string; big?: boolean }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (<form action={action} >
    <input type="hidden" name="username" value={a.username} /><input type="hidden" name="password" value={password} />
    <button disabled={pending} className={big
      ? "w-full rounded-2xl border border-brand-300/60 bg-brand-600/30 p-4 text-left hover:bg-brand-600/50 disabled:opacity-60"
      : "w-full rounded-xl border border-white/25 bg-white/8 px-3 py-2 text-left text-sm hover:bg-white/15 disabled:opacity-60"}>
      <span className="block font-semibold">{a.label ?? a.role}</span><span className="block text-xs text-muted">{pending ? "Connexion…" : a.username}</span>
    </button>
    {state?.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
  </form>);
}
export function DemoPanel({ main, others, password }: { main: Acc[]; others: Acc[]; password: string }) {
  return (<section aria-labelledby="demo-title" className="glass mt-5 rounded-3xl p-5">
    <h2 id="demo-title" className="font-semibold">Démonstration — données fictives</h2>
    <p className="mb-4 text-xs text-muted">Mot de passe des comptes de démonstration : <strong className="font-mono">{password}</strong></p>
    <div className="grid gap-3 sm:grid-cols-2">{main.map((a) => <DemoLogin key={a.username} a={a} password={password} big />)}</div>
    <details className="group mt-4">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl border border-white/25 bg-white/8 px-4 py-2 text-sm font-semibold hover:bg-white/15 [&::-webkit-details-marker]:hidden">
        <span>Autres profils ({others.length})</span>
        <span aria-hidden="true" className="transition group-open:rotate-180">▾</span>
      </summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">{others.map((a) => <DemoLogin key={a.username} a={a} password={password} />)}</div>
    </details>
  </section>);
}
