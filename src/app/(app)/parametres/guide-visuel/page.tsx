import { requireSuperAdminPage } from "@/server/auth/current";
import { Alert, Card, PageHeader } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ComponentsDemo } from "./demo";

export const metadata = { title: "Guide visuel" };

const COLORS = [
  ["--brand-950", "Fond profond"], ["--brand-900", "Fond"], ["--brand-700", "Bleu profond"], ["--brand-600", "Bouton principal"],
  ["--brand-500", "Bleu vif"], ["--brand-400", "Bleu lumineux"], ["--brand-300", "Bleu clair"], ["--brand-100", "Bleu très clair"],
  ["--success", "Succès"], ["--warning", "Attention"], ["--danger", "Erreur"],
];
const sample = [{ id: "1", a: "Ligne d'exemple 1", b: "Valeur", c: "—" }, { id: "2", a: "Ligne d'exemple 2", b: "Valeur", c: "—" }];

export default async function Page() {
  await requireSuperAdminPage();
  return (
    <div className="space-y-6">
      <PageHeader title="Guide visuel" subtitle="Référence du design CMD Pro : couleurs, textes et composants." />
      <Alert tone="info">Cette page ne contient aucune donnée de l'hôpital : tous les contenus sont des exemples de présentation.</Alert>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Couleurs</h2>
        <p className="mb-4 text-sm text-muted">Définies dans un seul fichier (<code>src/app/globals.css</code>). Les codes officiels de la charte pourront y remplacer ces valeurs, tirées du logo.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {COLORS.map(([v, l]) => (
            <div key={v} className="overflow-hidden rounded-xl border border-white/20">
              <div className="h-14" style={{ background: `var(${v})` }} />
              <div className="px-2.5 py-2 text-xs"><p className="font-medium">{l}</p><p className="text-muted">{v}</p></div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Textes</h2>
        <p className="text-[28px] font-semibold tracking-tight">Titre de page</p>
        <p className="text-lg font-semibold">Titre de section</p>
        <p className="text-[15px]">Texte courant, lisible sur tous les écrans.</p>
        <p className="text-sm text-muted">Texte secondaire, pour les précisions.</p>
      </Card>
      <Card><ComponentsDemo /></Card>
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Tableau responsive</h2>
        <p className="mb-3 text-sm text-muted">Tableau sur ordinateur et tablette ; cartes empilées sur téléphone.</p>
        <DataTable rows={sample} rowKey={(r) => r.id} caption="Tableau d'exemple" columns={[
          { header: "Libellé", mobile: "primary", cell: (r) => <span className="font-medium">{r.a}</span> },
          { header: "Colonne B", cell: (r) => r.b },
          { header: "Colonne C", mobile: "hide-mobile", cell: (r) => r.c },
        ]} />
      </Card>
    </div>
  );
}
