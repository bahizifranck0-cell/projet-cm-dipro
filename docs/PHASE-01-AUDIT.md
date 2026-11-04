# CMD Pro — Phase 1 : Rapport d'audit du projet

Date : 04/11/2026
Dépôt audité : `juniorsungba-png/cm.dipro` (branche `master`)

---

## 1. Constat principal

**Le dépôt est entièrement vide.**

| Vérification | Résultat |
|---|---|
| Fichiers dans le dépôt local | Aucun |
| Commits | Aucun (`master` n'a pas encore de commit) |
| Branches sur GitHub (`git ls-remote`) | Aucune |
| Frontend / backend / API | Absents |
| Base de données, schéma, migrations | Absents |
| Données existantes | Aucune — il n'y a donc **aucun risque de perte de données** à ce stade |
| Dépendances / technologies déjà choisies | Aucune |

Conséquence : il n'existe ni fonctionnalité conforme, ni fonctionnalité partielle, ni doublon. Tout est à construire. Aucune architecture existante ne contraint les choix.

> Si une version antérieure de CMD Pro existe ailleurs (autre dépôt, serveur, clé USB, base de données en production), elle doit être fournie **avant la Phase 2** : sinon, elle sera ignorée et ses données ne pourront pas être reprises.

## 2. Classification des éléments du cahier des charges

| Module | État |
|---|---|
| Authentification, utilisateurs, rôles, permissions | ABSENT |
| Journal d'audit | ABSENT |
| Design system (Glassmorphism, logo, responsive) | ABSENT |
| Patients, réception, secrétariat | ABSENT |
| Médecins, spécialités dynamiques, consultations | ABSENT |
| Rendez-vous | ABSENT |
| Urgences, hospitalisation, maternité, chambres et lits | ABSENT |
| Laboratoire | ABSENT |
| Pharmacie, boutique, stock | ABSENT |
| Catalogue tarifaire, facturation, caisse, reçus | ABSENT |
| Crédits / dettes patients, validation par le DG | ABSENT |
| Finance, dépenses, extournes, réconciliation | ABSENT |
| Personnel / RH, paie, avances | ABSENT |
| Notifications et badges | ABSENT |
| Documents et PDF | ABSENT |
| Portail patient | ABSENT |
| Rapports et exports | ABSENT |
| Mode démonstration | ABSENT |
| Spécialités, tarifs, analyses, chambres, plafonds… | À CONFIRMER (voir §6) |
| Chirurgie | EXCLUE (confirmé par le propriétaire) |
| Échographie | À CONFIRMER (désactivée par défaut) |

## 3. Éléments fournis par le propriétaire

| Élément | Analyse |
|---|---|
| Logo officiel (PNG, 1 793 Ko) | Fond blanc, non transparent. Sera utilisé tel quel. Pour l'interface sombre, il sera posé sur une pastille claire plutôt que retouché. Une version vectorielle ou à fond transparent serait préférable, si elle existe. |
| Capture « Glassmorphism » (app bancaire mobile) | Fond bleu nuit, cartes translucides, bordures fines lumineuses, boutons carrés arrondis avec libellé dessous, barre de navigation en bas. → Référence pour la **version téléphone** et le **portail patient**. |
| Capture « Glassy Dashboard V2 » | Grille de cartes statistiques, graphique en barres, tableau d'activités récentes. → Référence pour les **tableaux de bord**. |
| Vidéo « Dashboard V21 » | Barre d'onglets en haut, cartes de synthèse, bloc d'activité. → Référence pour l'organisation des tableaux de bord finance. |
| Vidéo « CRM Dashboard UI V2 » | Interface claire, cartes KPI en ligne, salutation personnalisée (« Good evening… »). → Référence pour l'accueil personnalisé par rôle. |
| Vidéo « Glassy Sidebar V5 » | Barre latérale en verre, repliable en icônes, recherche, badges de compteur, sections groupées, profil en bas, interrupteur mode nuit. → Référence directe pour la **navigation ordinateur**. |

Aucun code couleur hexadécimal n'a été communiqué. Les couleurs seront définies comme variables de thème centralisées (tirées visuellement du logo : bleu roi / bleu lumineux / blanc) et seront remplaçables en un seul fichier.

## 4. Risques identifiés

| Risque | Gravité | Mesure proposée |
|---|---|---|
| **Connexion Internet instable à Goma** alors que l'hôpital fonctionne 24 h/24 | Élevée | Choix d'hébergement à décider (§5) ; prévoir un serveur local sur le réseau de l'hôpital si Internet n'est pas fiable |
| Données médicales et financières sensibles | Élevée | Permissions vérifiées côté serveur, journal d'audit non modifiable, documents non accessibles par URL publique, mots de passe hachés |
| Coupures d'électricité | Élevée | Sauvegardes automatiques + onduleur/serveur (matériel à confirmer) |
| Fuite entre patients sur le portail | Élevée | Contrôle d'accès systématique par patient côté serveur + tests dédiés |
| Corrections comptables silencieuses | Moyenne | Aucune suppression : annulation / extourne tracée |
| Informations métier non confirmées (tarifs, analyses, chambres…) | Moyenne | Tout est configurable, rien n'est inventé |
| Taille du projet (17 modules) | Moyenne | Développement phase par phase avec tests à chaque étape |
| Logo uniquement en PNG à fond blanc | Faible | Utilisation sans retouche, sur fond clair |

## 5. Architecture proposée (à valider)

Une seule application web, responsive, en TypeScript.

| Couche | Choix proposé | Raison |
|---|---|---|
| Application | **Next.js** (React) — interface + API dans un même projet | Un seul projet à maintenir, rendu rapide, fonctionne sur ordinateur, tablette et téléphone |
| Base de données | **PostgreSQL** | Relations fortes, transactions fiables pour la caisse et le stock |
| Accès aux données | **Prisma** (schéma + migrations versionnées et réversibles) | Migrations contrôlées, pas de modification arbitraire des données |
| Authentification | Sessions sécurisées côté serveur, mots de passe hachés (argon2/bcrypt) | Désactivation immédiate d'un compte possible |
| Permissions | Table rôles × permissions (module × action), vérifiée dans **chaque** action serveur | Exigence §7.4 |
| Style | Tailwind CSS + composants maison Glassmorphism | Variables de thème centralisées |
| PDF | Génération côté serveur (logo officiel, références, pagination) | Documents identiques pour tous |
| Fichiers (photos, documents) | Stockage privé, servi uniquement après contrôle des droits | Pas d'URL publique |
| Tests | Tests automatisés (logique métier + API) et tests navigateur (Playwright) | Exigence §27 |

**Hébergement — décision nécessaire du propriétaire :**

1. **Serveur local à l'hôpital** (un ordinateur dédié sur le réseau interne) : fonctionne même sans Internet ; le portail patient n'est accessible que si ce serveur est relié à Internet.
2. **Cloud** (ex. PostgreSQL hébergé + hébergement web) : accessible partout, portail patient simple, mais l'hôpital est bloqué si Internet coupe.
3. **Mixte** : serveur local principal + copie de sauvegarde en ligne.

Le code sera le même dans les trois cas ; seul le déploiement change.

## 6. Points à confirmer par l'hôpital (non inventés)

1. Liste définitive des spécialités et nombre de médecins.
2. Liste des départements / services.
3. Nombre de sites (un seul établissement ?).
4. Tarifs des prestations (consultation, analyses, hospitalisation…) et devise (USD, CDF, ou les deux ?).
5. Liste officielle des analyses de laboratoire et leurs valeurs de référence.
6. Nombre et catégories de chambres et de lits.
7. Disponibilité réelle de l'échographie.
8. Règles des congés, gardes, présences.
9. Plafonds de dépenses et circuit de validation.
10. Qui peut accorder une remise, et jusqu'à quel montant.
11. Moyens de paiement autres que les espèces.
12. Matériel informatique disponible et procédure en cas de panne.
13. Politique de sauvegarde et durée de conservation des dossiers.
14. Formulaires médicaux par spécialité et formulaires de maternité (à valider par les médecins).
15. Format souhaité du numéro de dossier patient.
16. Secrétaire et réceptionniste : une seule personne ou deux postes ?

## 7. Plan de réalisation

| Phase | Contenu | Condition de passage |
|---|---|---|
| 1 | Audit (ce document) | Validation du propriétaire |
| 2 | Architecture + modèle de données complet (toutes les tables et relations) | Schéma relu et validé |
| 3 | Connexion, utilisateurs, rôles, matrice de permissions, journal d'audit | Chaque rôle testé : autorisé / refusé |
| 4 | Design system Glassmorphism, logo, navigation (barre latérale repliable / barre basse mobile) | Testé ordinateur, tablette, téléphone |
| 5 | Patients, recherche anti-doublon, réception, orientation, dossier central | Création, recherche, rechargement OK |
| 6 | Médecins, spécialités dynamiques, formulaires configurables, consultations, prescriptions, rendez-vous + PDF | Ajout d'une spécialité test sans casser les autres |
| 7 | Urgences/hospitalisation (un seul service), chambres, lits, maternité, sortie | Disponibilité des lits correcte |
| 8 | Laboratoire : demande → prélèvement → résultat → validation → notification → PDF | Scénario B complet |
| 9 | Pharmacie, boutique, stock, vente directe vs consommation patient, alertes | Stock et facture patient corrects |
| 10 | Tarifs, facture globale, caisse, paiements partiels, reçus, crédit validé par le DG, dettes, dépenses, extournes | Scénarios A, C, E |
| 11 | RH : dossiers, salaires, avances, primes, déductions, bulletins versionnés | Scénario G |
| 12 | Documents, portail patient, rapports, exports PDF | Isolement strict entre patients |
| 13 | Notifications et badges transverses | Compteurs exacts, bons destinataires |
| 14 | Campagne de tests complète, sécurité, non-régression, rapport final | Rapport final de tests |

Chaque phase se termine par un compte rendu : fonctionnalités, fichiers modifiés, tests exécutés, résultats, erreurs, corrections, points restant à confirmer.

## 8. Décisions attendues pour démarrer la Phase 2

1. Valider la pile technique proposée (§5).
2. Choisir le mode d'hébergement (local, cloud ou mixte).
3. Confirmer qu'il n'existe pas d'ancienne version ou de données à reprendre.
4. Indiquer la devise utilisée pour la facturation.
5. Autoriser l'enregistrement du travail sur GitHub (commits sur une branche de travail).

## 9. Décisions du propriétaire (04/11/2026)

| Sujet | Décision |
|---|---|
| Hébergement | **Mixte** : serveur local à l'hôpital (fonctionne sans Internet) + sauvegarde en ligne |
| Pile technique | **Validée** : Next.js + PostgreSQL + Prisma (TypeScript) |
| Devise | **USD et CDF**, avec taux de change configurable |
| Existant | Aucun code ni données à reprendre |
| GitHub | Autorisé : chaque phase est enregistrée sur une branche de travail |

Logo officiel ajouté sans modification : `public/brand/logo-cmdpro.png`.
