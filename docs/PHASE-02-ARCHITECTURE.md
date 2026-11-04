# CMD Pro — Phase 2 : Architecture et modèle de données

Date : 04/11/2026 — Statut : **à valider par le propriétaire**

## 1. Architecture générale

```
 Navigateur (ordinateur / tablette / téléphone)
        │  HTTPS, réseau local de l'hôpital
        ▼
 Application Next.js (serveur local à l'hôpital)
   ├─ Interface (pages, composants Glassmorphism)
   ├─ Actions serveur / API  ── contrôle de session + permission à CHAQUE appel
   ├─ Services métier (facturation, stock, crédit, paie…)  ← règles centralisées
   ├─ Notifications, génération PDF, journal d'audit
   └─ Stockage privé des fichiers (photos, PDF) — jamais d'URL publique
        │
        ▼
 PostgreSQL (base réelle)          PostgreSQL (base de démonstration, séparée)
        │
        └─ Sauvegarde chiffrée automatique vers un stockage en ligne
```

- **Hébergement mixte** (décision du 04/11) : le serveur local garantit le fonctionnement sans Internet ; une copie de sauvegarde part en ligne dès que la connexion est disponible.
- **Démonstration isolée** : la démo tourne sur une base distincte (`DEMO_DATABASE_URL`). Aucune donnée fictive n'entre jamais dans la base réelle, et un compte de démo ne peut pas atteindre la base réelle.
- **Devises** : chaque montant porte sa devise (USD ou CDF). Le taux est historisé (`ExchangeRate`) ; un paiement mémorise le taux utilisé.

## 2. Correspondance modules → tables

| Module | Tables principales |
|---|---|
| Utilisateurs, rôles, permissions | `User`, `Role`, `Permission` (module × action), `RolePermission`, `Session`, `AuditLog` |
| Personnel / RH | `Employee`, `Department`, `EmployeeContract`, `PayrollItem`, `Payslip` (versionné), `AttendanceRecord`, `LeaveRequest`, `ShiftAssignment`, `Evaluation` |
| Patients, réception, secrétariat | `Patient` (dossier unique), `Visit` (passage + orientation), `Referral` |
| Médecins et spécialités | `Specialty`, `SpecialtyDepartment`, `DoctorAssignment`, `FormTemplate` (formulaires configurables et versionnés) |
| Consultations | `Consultation`, `Prescription`, `PrescriptionItem` |
| Rendez-vous | `Appointment`, `AppointmentEvent` (historique des changements) |
| Urgences, hospitalisation, maternité | `Admission` (type : urgence / hospitalisation / maternité — un seul service), `Room`, `Bed`, `BedAssignment`, `AdmissionNote`, `MaternityRecord`, `Newborn` |
| Laboratoire | `LabTest` (catalogue à remplir par l'hôpital), `LabRequest`, `LabRequestItem`, `LabSample` |
| Pharmacie et boutique | `Product`, `StockMovement`, `Sale`, `SaleItem` |
| Tarifs et facturation | `TariffItem`, `Charge` (compte du patient), `Invoice`, `Discount` |
| Caisse | `Payment` (= reçu), `PaymentMethod` (seul « Espèces » activé), `CashSession`, `CashReconciliation` |
| Crédits et dettes | `CreditRequest` (décision du DG), `Debt` |
| Finance | `Expense`, `ExpenseCategory`, `ApprovalRule` (plafonds configurables), `LedgerEntry` (journal) |
| Notifications | `Notification` (badge par module, anti-doublon) |
| Documents | `Document` (rattaché au patient, à l'employé ou à l'opération) |
| Portail patient | `PatientAccount` (séparé des comptes du personnel) |
| Paramètres | `Setting`, `Sequence` (numérotation) |

Il n'y a **pas** de table chirurgie (service inexistant) ni fournisseurs (non prioritaire). L'échographie, si elle est confirmée, sera un simple élément du catalogue tarifaire et un service : aucune table spécifique n'est nécessaire.

## 3. Règles métier traduites dans le modèle

| Règle du cahier des charges | Traduction |
|---|---|
| Un seul dossier par patient | Toutes les activités portent `patientId` ; recherche nom / téléphone / numéro indexée |
| Facture ≠ paiement | `Invoice` et `Payment` séparés ; le solde = total − paiements |
| Paiement partiel | Plusieurs `Payment` par facture, chacun avec montant, date et caissier |
| Corrections sans suppression | `Payment`, `StockMovement`, `LedgerEntry` : extourne = nouvelle ligne liée à l'originale |
| Vente directe ≠ consommation patient | `StockMovement.type` = `SALE` ou `PATIENT_CONSUMPTION` ; la consommation crée une `Charge` sur le compte du patient |
| Dépense de fonctionnement ≠ dépense patient | `Expense` (service) séparée de `Charge` (patient) |
| Crédit validé par le DG uniquement | `CreditRequest.decidedById` ; contrôle de permission `credit.validate` côté serveur |
| Sortie bloquée si impayé | Sortie autorisée si facture soldée **ou** `Admission.dischargeCreditRequestId` pointe vers un crédit approuvé |
| Spécialités dynamiques | Tables `Specialty` + `FormTemplate` : ajouter une spécialité = ajouter des lignes, pas du code |
| Formulaires médicaux non inventés | `FormTemplate.validated` = faux tant que les médecins n'ont pas validé |
| Tarifs non inventés | `TariffItem` vide au départ ; le prix est figé dans `Charge` au moment de l'acte |
| Bulletins non écrasés | `Payslip` unique par (employé, période, **version**) |
| Utilisateur désactivé conservé | `User.status = DISABLED` ; aucune suppression, historique intact |

## 4. Protections appliquées par la base elle-même

Même en cas d'erreur dans l'application, PostgreSQL refuse :

1. Toute modification, suppression ou vidage de `AuditLog`, `Payment`, `StockMovement`, `LedgerEntry`.
2. Un stock négatif ; un prix, une quantité ou un montant incohérent.
3. Un paiement négatif qui ne serait pas une extourne ; une double extourne.
4. Deux patients dans le même lit ; deux lits ouverts pour une même admission.
5. Deux admissions actives pour un même patient.
6. Deux demandes de crédit en attente pour une même facture.
7. Une session rattachée à la fois à un employé et à un patient.
8. Deux affectations actives d'un médecin à la même spécialité.

## 5. Migrations

| Migration | Contenu | Annulation |
|---|---|---|
| `20261104000000_init` | Création de toutes les tables | Base vide uniquement (aucune donnée réelle à ce stade) |
| `20261104000100_integrity_guards` | Protections du §4 | `down.sql` fourni et testé (retrait puis ré-application) |

Règle pour la suite : toute migration future est d'abord appliquée sur une copie de test, avec sauvegarde préalable de la base réelle.

## 6. Compte rendu de la Phase 2

**Réalisé**
- Schéma complet : 62 tables, toutes les relations entre modules.
- Deux migrations versionnées.
- Projet initial : `package.json`, Prisma 6.19.3 (dernière version stable), `.env.example`, `.gitignore`.

**Fichiers**
- `prisma/schema.prisma`
- `prisma/migrations/20261104000000_init/migration.sql`
- `prisma/migrations/20261104000100_integrity_guards/migration.sql` et `down.sql`
- `tests/db/schema.test.mjs`
- `docs/PHASE-02-ARCHITECTURE.md`

**Tests exécutés** (vraie base PostgreSQL 16, `cmdpro_test`) — **11/11 réussis**
1. Dossier patient central : visite, consultation, analyse, consommation, facture et paiement retrouvés depuis le patient.
2. Journal d'audit : modification, suppression et vidage refusés.
3. Paiements et mouvements de stock non modifiables.
4. Extourne : ligne négative liée acceptée ; paiement négatif isolé refusé ; double extourne refusée.
5. Stock négatif refusé.
6. Lits et admissions : doublons refusés, libération puis réaffectation acceptée.
7. Crédit : une seule demande en attente ; nouvelle demande possible après décision.
8. Sessions : propriétaire unique obligatoire.
9. Nouvelle spécialité ajoutée sans toucher au schéma ; formulaires versionnés.
10. Bulletins de paie versionnés.
11. Utilisateur désactivé conservé avec son historique.

Test supplémentaire : retrait des protections (`down.sql`) puis ré-application sur une base contenant des données → 8 triggers et contraintes restaurés, 11/11 tests toujours réussis.

**Erreurs détectées et corrigées**
- Le script `test:db` passait un dossier à `node --test` (non supporté) → remplacé par un motif de fichiers.

**Points restant à confirmer** (inchangés, voir Phase 1 §6) : spécialités, tarifs, analyses, chambres et lits, échographie, plafonds, remises, règles RH, format du numéro de dossier.
