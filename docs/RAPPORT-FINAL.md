# CMD Pro — Rapport final de réalisation et de tests

Date : 04/11/2026 — Branche : `claude/cmd-pro`

## 1. Synthèse

CMD Pro est une application web unique (Next.js 16, PostgreSQL 16, Prisma 6, TypeScript), utilisable sur ordinateur, tablette et téléphone. Elle est prévue pour un hébergement **mixte** : un serveur local à l'hôpital, avec sauvegarde en ligne.

Les 14 phases du cahier des charges ont été réalisées dans l'ordre. Chaque phase a été testée avant de passer à la suivante, avec des tests automatisés sur une vraie base de données et dans un vrai navigateur.

| Suite de tests | Résultat |
|---|---|
| Vérification TypeScript | 0 erreur |
| Logique métier et services (77 tests, chaque fichier sur une base vierge) | **77/77** |
| Protections de la base de données | **11/11** |
| Navigateur, de bout en bout : scénarios A à G, accessibilité de toutes les pages en 3 tailles d'écran, démo | RESULTAT_E2E |

## 2. Modules livrés

| Module | Contenu |
|---|---|
| Connexion et sécurité | Sessions sécurisées. Blocage après 5 échecs. Mot de passe provisoire à changer. Désactivation immédiate d'un compte. |
| Rôles et permissions | Les 12 rôles du cahier des charges et le Super Administrateur. Grille de cases à cocher (Voir, Créer, Modifier, Supprimer, Valider, Exporter). Les droits sont **vérifiés côté serveur** à chaque opération. |
| Journal d'audit | Toutes les opérations importantes sont enregistrées. La base de données interdit toute modification ou suppression du journal. Chaque utilisateur a une fiche « carnet ». |
| Design | Glassmorphism bleu, logo officiel, contrastes mesurés selon la norme WCAG AA. Barre basse sur téléphone, rail d'icônes sur tablette, barre latérale repliable sur ordinateur. |
| Patients, réception, secrétariat | Dossier unique et numéro configurable. Détection des doublons (téléphone, nom sans accents). Arrivée avec ou sans rendez-vous, urgence, orientation, file d'attente. |
| Médecins et spécialités | Spécialités **dynamiques** avec formulaires configurables et versionnés. Affectation des médecins. Spécialités confidentielles (ex. psychologie). Consultation, diagnostic, ordonnance en PDF, orientation vers un confrère. |
| Rendez-vous | Création, report (historique conservé), annulation motivée, rendez-vous manqué, document PDF. L'arrivée sur rendez-vous marque celui-ci comme honoré. |
| Urgences, hospitalisation, maternité | Un seul service. Chambres et lits configurables, attribution, transferts, notes de suivi. Fiches de maternité configurables, nouveau-né. **Sortie bloquée sans paiement** sauf crédit du Directeur général. |
| Laboratoire | Catalogue d'analyses. Demande depuis la consultation, prélèvement, saisie, soumission, **validation par le responsable**, résultats en PDF. Le médecin est notifié. |
| Pharmacie et boutique | Produits avec photo. Entrées, corrections motivées. Vente directe (facture transmise à la caisse) **distincte** de la consommation par un patient (ajoutée à son compte). Stock jamais négatif. Alertes de stock bas. |
| Facturation et caisse | Tarifs officiels configurables. Facture globale en USD ou CDF avec taux de change. **Facture ≠ paiement**. Paiements partiels, reçus PDF, remises validées par un tiers, extournes au lieu de suppressions. |
| Crédits et dettes | Demande par la caisse, **décision par le Directeur général uniquement**, dette suivie jusqu'au remboursement, visible quand le patient revient. |
| Finance | Journal des opérations. Dépenses de fonctionnement avec plafonds configurables et validation par une autre personne. Journal de caisse. Réconciliation mensuelle. Situation financière. |
| Personnel / RH | Dossier employé avec photo. Contrats. Avances, primes, déductions, paiements. Calcul de la paie. **Bulletins versionnés**. Congés. Chaque employé consulte son propre dossier. |
| Documents | Tous les PDF officiels portent le logo, une référence et une pagination. Stockage privé, accès contrôlé selon le type de document. |
| Portail patient | Comptes séparés de ceux du personnel. Uniquement le dossier du patient connecté, et uniquement ce qui est communicable. Téléchargement des PDF. Pensé pour le téléphone. |
| Rapports | Statistiques réelles filtrables (période, médecin, spécialité, service). Sections finance et RH réservées aux personnes autorisées. Export PDF. |
| Notifications | Envoyées aux seuls destinataires concernés, sans doublon. Compteurs par module. Centre de notifications. |
| Démonstration | Instance séparée avec données fictives. Comptes Administrateur et Finance mis en avant, autres profils en liste défilante. |

## 3. Sécurité

- Les permissions sont vérifiées dans **chaque service**, pas seulement dans l'interface.
- La base de données refuse elle-même plusieurs incohérences :
  - modification du journal d'audit, des paiements, des mouvements de stock ou du journal financier ;
  - stock négatif ;
  - un lit occupé deux fois ;
  - deux admissions ou deux passages ouverts pour un même patient ;
  - double extourne.
- Les fichiers (photos, PDF) ne sont jamais publics : ils sont servis après contrôle d'accès. Le contenu réel des images est vérifié.
- Le portail patient et l'espace du personnel utilisent des sessions séparées et étanches. Un patient ne peut jamais obtenir le document d'un autre patient : c'est vérifié par un test.
- Les opérations sensibles demandent une **deuxième personne** : remises, dépenses, réconciliation, congés.
- Les mots de passe sont hachés (scrypt). Il n'existe aucun mot de passe par défaut, et le Super Administrateur est créé en ligne de commande.

## 4. Défauts trouvés par les tests et corrigés

1. Contraste insuffisant du bouton principal, des bordures de champs, et de la barre basse sur fond clair.
2. Débordements horizontaux sur téléphone et sur tablette (cartes, grille des permissions).
3. Confirmations absentes quand un formulaire disparaissait après l'opération. Corrigé pour **tous** les formulaires.
4. **Listes de choix remises à zéro après un enregistrement** (comportement de React 19). Ce défaut pouvait enregistrer une valeur vide à la sauvegarde suivante. Corrigé dans le composant commun.
5. Sortie sur crédit : le lien avec la décision du Directeur général n'était pas enregistré.
6. Bouton sans nom accessible dans le portail patient sur téléphone.
7. Raccourci de droits dans l'espace médecin (lecture de l'agenda), remplacé par une vérification normale.

## 5. Points à configurer ou à valider par l'hôpital

Rien de ce qui suit n'a été inventé. Ces éléments sont configurables dans le logiciel et attendent les informations de l'hôpital :

1. Spécialités, médecins et départements (Paramètres).
2. **Tarifs** de toutes les prestations (Tarifs) et prix des produits (Pharmacie).
3. Catalogue officiel des analyses et valeurs de référence (Laboratoire → Catalogue).
4. Chambres et lits (Hospitalisation → Chambres et lits).
5. Formulaires médicaux par spécialité et fiches de maternité : à **valider par les médecins et sages-femmes**.
6. Format du numéro de dossier patient (provisoire : `P-2026-00001`).
7. Taux de change USD/CDF (Finance → Paramètres).
8. Plafonds de validation des dépenses et personnes autorisées à accorder des remises.
9. Permissions définitives de chaque rôle (une proposition est installée).
10. Disponibilité de l'échographie (à ajouter comme tarif et service si elle est confirmée).
11. Moyens de paiement autres que les espèces (non activés).
12. Règles des congés, gardes et présences (seuls les congés sont gérés, sans règle imposée).
13. Codes couleur officiels et logo vectoriel ou à fond transparent.
14. Politique de sauvegarde, durée de conservation des dossiers et conformité juridique.
15. HTTPS sur le serveur local, et matériel informatique (serveur, onduleur).

## 6. Limites connues

- **Fusion de dossiers en double :** non réalisée. Elle demande d'abord une procédure validée par l'hôpital.
- **Présences, gardes et évaluations annuelles :** les tables existent, mais pas encore les écrans. Les règles sont à définir.
- **Mode clair :** non réalisé. Le thème est prévu pour l'accueillir.
- **Sauvegarde automatique en ligne :** la procédure est documentée (README), mais sa mise en place dépend de l'hébergement choisi par l'hôpital.
- **Tests dans le navigateur :** ils ont tous été faits avec Chromium. D'autres navigateurs (Firefox, Safari) n'ont pas été testés.
