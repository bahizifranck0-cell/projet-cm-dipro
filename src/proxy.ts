import { NextResponse, type NextRequest } from "next/server";

// Transmet le chemin demandé aux mises en page serveur. Aucun contrôle d'accès ici :
// les droits sont vérifiés dans chaque page et chaque action côté serveur.
export function proxy(req: NextRequest) {
  const h = new Headers(req.headers);
  h.set("x-cmdpro-path", req.nextUrl.pathname);
  return NextResponse.next({ request: { headers: h } });
}

export const config = { matcher: ["/((?!_next/|fichiers/|favicon).*)"] };
