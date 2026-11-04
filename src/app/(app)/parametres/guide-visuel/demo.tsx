"use client";
import { useState } from "react";
import { Activity, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, Badge, Skeleton, StatCard } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-3 text-lg font-semibold">{children}</h2>;

export function ComponentsDemo() {
  const [open, setOpen] = useState(false);
  const [pressed, setPressed] = useState(true);
  const toast = useToast();
  return (
    <div className="space-y-8">
      <section>
        <H>Boutons et leurs états</H>
        <div className="flex flex-wrap gap-3">
          <Button>Principal</Button>
          <Button variant="secondary">Secondaire</Button>
          <Button variant="danger">Action sensible</Button>
          <Button variant="ghost">Discret</Button>
          <Button variant="secondary" aria-pressed={pressed} onClick={() => setPressed((p) => !p)}>Sélectionné : {pressed ? "oui" : "non"}</Button>
          <Button disabled>Désactivé</Button>
          <Button aria-busy disabled><Loader2 className="size-4 animate-spin" aria-hidden />Chargement…</Button>
        </div>
        <p className="mt-2 text-xs text-muted">Survol : fond plus clair et bordure renforcée. Clavier : contour bleu clair visible.</p>
      </section>

      <section>
        <H>Champs de formulaire</H>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Champ normal" name="demo1"><Input name="demo1" placeholder="Saisir…" /></Field>
          <Field label="Champ en erreur" name="demo2" state={{ error: "Ce champ est obligatoire.", field: "demo2" }}>
            <Input name="demo2" state={{ error: "x", field: "demo2" }} />
          </Field>
          <Field label="Champ désactivé" name="demo3"><Input name="demo3" disabled defaultValue="Non modifiable" /></Field>
          <Field label="Liste" name="demo4"><Select name="demo4" defaultValue="a"><option value="a">Option A</option><option value="b">Option B</option></Select></Field>
          <div className="flex items-end gap-4 pb-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="checkbox" defaultChecked />Cochée</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="checkbox" />Vide</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="checkbox" disabled />Inactive</label>
          </div>
        </div>
      </section>

      <section>
        <H>Étiquettes et messages</H>
        <div className="mb-3 flex flex-wrap gap-2"><Badge tone="green">Actif</Badge><Badge tone="red">Désactivé</Badge><Badge tone="amber">En attente</Badge><Badge tone="blue">Information</Badge><Badge>Neutre</Badge></div>
        <div className="grid gap-3 md:grid-cols-2">
          <Alert tone="info" title="Information">Message d'information.</Alert>
          <Alert tone="success" title="Succès">L'opération a été enregistrée.</Alert>
          <Alert tone="warning" title="Attention">Une vérification est nécessaire.</Alert>
          <Alert tone="danger" title="Erreur">L'opération a été refusée.</Alert>
        </div>
      </section>

      <section>
        <H>Cartes d'indicateurs (exemple de présentation, valeurs fictives)</H>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Exemple A" value="12" hint="Valeur d'illustration" icon={<Users className="size-4" />} />
          <StatCard label="Exemple B" value="3" tone="amber" icon={<Activity className="size-4" />} />
          <StatCard label="Exemple C" value="—" tone="green" />
          <div className="glass space-y-2 rounded-2xl p-4"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-7 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
        </div>
      </section>

      <section>
        <H>Onglets, fenêtre et notification</H>
        <Tabs tabs={[
          { label: "Premier onglet", content: <p className="text-sm text-muted">Contenu du premier onglet. Flèches gauche/droite pour naviguer.</p> },
          { label: "Deuxième", count: 2, content: <p className="text-sm text-muted">Contenu du deuxième onglet.</p> },
          { label: "Troisième", content: <p className="text-sm text-muted">Contenu du troisième onglet.</p> },
        ]} />
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setOpen(true)}>Ouvrir une fenêtre</Button>
          <Button variant="secondary" onClick={() => toast("Exemple de notification de réussite.")}>Afficher une notification</Button>
          <Button variant="secondary" onClick={() => toast("Exemple de notification d'erreur.", "error")}>Notification d'erreur</Button>
        </div>
        <Dialog open={open} onClose={() => setOpen(false)} title="Exemple de fenêtre"
          footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Annuler</Button><Button onClick={() => setOpen(false)}>Valider</Button></>}>
          <p className="text-sm">Une fenêtre se ferme avec Échap, le bouton ×, ou un clic à l'extérieur. Elle ne dépasse jamais de l'écran.</p>
          <div className="mt-4"><Field label="Champ dans la fenêtre" name="dlg"><Input name="dlg" /></Field></div>
        </Dialog>
      </section>
    </div>
  );
}
