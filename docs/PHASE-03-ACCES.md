# CMD Pro — Phase 3 : Connexion, utilisateurs, rôles et permissions

Date : 04/11/2026

## 1. Fonctionnalités réalisées

| Fonctionnalité | Détail |
|---|---|
| Connexion | Identifiant + mot de passe, bouton « œil », messages clairs, blocage 15 min après 5 échecs |
| Sessions | Jeton aléatoire en cookie `httpOnly` ; seule son empreinte est en base ; durée 12 h (une garde), prolongée en cas d'activité |
| Mots de passe | Hachage scrypt avec sel ; 10 caractères minimum, lettres et chiffres ; aucun mot de passe par défaut |
| Mot de passe provisoire | Changement obligatoire à la première connexion ; aucun droit tant qu'il n'est pas changé |
| Super Administrateur | Créé en ligne de commande (`npm run admin:create`), distinct du Directeur général |
| Rôles | Les 12 rôles du §7.3 + Super Administrateur ; ajout, renommage, désactivation, suppression (seulement si aucun utilisateur) |
| Permissions | Matrice module × action (Voir, Créer, Modifier, Supprimer, Valider, Exporter) avec cases à cocher et « Tout » par module |
| Application réelle des permissions | Vérifiées **côté serveur** à chaque page et chaque opération, relues en base à chaque requête : un changement prend effet immédiatement |
| Gestion des comptes | Réservée au Super Administrateur ; non attribuable par la matrice |
| Création d'un compte | Choix d'un employé existant → photo et informations reprises → identifiant, mot de passe provisoire, rôle, département, statut |
| Désactivation | Connexion refusée, sessions fermées immédiatement, historique conservé ; impossible de se désactiver soi-même ou de désactiver le dernier Super Administrateur |
| Annuaire | Tableau sur ordinateur, cartes sur téléphone : photo, nom, rôle, département, statut |
| Fiche utilisateur | Présentation « carnet ouvert » : connexions à gauche, actions à droite, modules utilisés |
| Journal d'audit | Page filtrable, pagination ; table protégée en base (ni modification ni suppression) |
| Personnel (minimal) | Création d'un employé avec photo, liste et recherche — le module RH complet viendra en Phase 11 |
| Départements | Ajout, renommage, désactivation ; **aucun département créé d'office** (liste à fournir par l'hôpital) |
| Photos | Contenu réel vérifié (JPEG/PNG/WebP, 5 Mo), stockage privé, servies seulement après contrôle des droits |

## 2. Permissions proposées pour les rôles de base

Ces permissions sont une **proposition** tirée des descriptions du cahier des charges. Le Super Administrateur les modifie librement ; une réinstallation ne les écrase jamais.

| Rôle | Permissions proposées |
|---|---|
| Directeur général | Tableau de bord, rapports, **validation des crédits**, consultation finance, facturation, caisse, RH, journal d'audit, documents |
| Administration | RH (voir, créer, modifier), documents, rapports, paramètres (voir) |
| Finance / comptabilité | Finance complète, facturation (voir, modifier, exporter), caisse (voir), crédits (voir), RH (voir), rapports |
| Caissier | Caisse (voir, encaisser, exporter), facturation (voir), crédits (voir, **soumettre**), patients (voir), documents |
| Réceptionniste | Réception, patients (voir), rendez-vous (voir) |
| Secrétaire | Patients (voir, créer, modifier), réception, rendez-vous |
| Médecin | Patients (voir), consultations, rendez-vous, demandes de laboratoire, hospitalisation (voir, créer), pharmacie (voir), documents |
| Infirmier | Patients, consultations (voir), hospitalisation (voir, modifier), pharmacie (voir) |
| Resp. urgences et hospitalisation | Hospitalisation complète (sauf suppression), patients, pharmacie (voir), documents |
| Resp. laboratoire | Laboratoire complet, patients (voir), documents |
| Resp. pharmacie | Pharmacie complète, rapports (voir) |
| Personnel administratif | Tableau de bord, documents (voir) |

Seul le Directeur général peut valider un crédit (vérifié par un test automatique).

## 3. Fichiers principaux

- `src/server/auth/` — mots de passe, catalogue des permissions, contrôles d'accès, rôles par défaut
- `src/server/services/` — connexion, sessions, utilisateurs, rôles, employés, départements, audit
- `src/app/connexion`, `src/app/(app)/…` — pages
- `src/components/` — barre latérale, composants d'interface, logo
- `scripts/seed.ts`, `scripts/create-super-admin.ts`, `scripts/test-db-reset.sh`, `scripts/e2e.sh`
- `tests/unit`, `tests/services`, `tests/e2e`

## 4. Tests exécutés

Toutes les suites ont été lancées sur de vraies bases PostgreSQL de test, recréées à chaque exécution.

| Suite | Résultat |
|---|---|
| Vérification TypeScript (`npm run typecheck`) | Aucune erreur |
| Compilation de production (`next build`) | Réussie, 15 routes |
| Unitaires + services (`npm test`) | **15/15** |
| Protections de la base, Phase 2 (`npm run test:db`) | **11/11** (aucune régression) |
| Bout en bout dans Chromium (`npm run test:e2e`) | **16/16 étapes** |

**Services (sans interface)** : le seed est relançable sans doublon ; la connexion est journalisée, avec un message générique en cas d'erreur ; le compte est bloqué après 5 échecs ; un caissier est refusé sur les rôles, les comptes, le personnel et les départements ; une permission cochée ou décochée prend effet immédiatement ; un rôle désactivé n'a plus aucune permission ; un rôle utilisé ne peut pas être supprimé ; un employé ne peut avoir qu'un seul compte ; le rôle Super Administrateur ne peut pas être attribué ; un compte désactivé perd ses sessions et garde son historique ; le dernier Super Administrateur est protégé ; le changement de mot de passe déconnecte les autres appareils ; une photo piégée est refusée.

**Bout en bout (vrai navigateur, vrai serveur)** :
1. Sans session, retour à la connexion.
2. Mauvais mot de passe : message clair.
3. Bouton « œil ».
4. Connexion du Super Administrateur.
5. Département créé et retrouvé après rechargement.
6. Employé créé avec sa photo (vérification HTTP : 200, image/png).
7. Rôle créé ; 2 cases cochées ; enregistrées et retrouvées après rechargement.
8. Compte créé depuis l'employé (fonction reprise automatiquement).
9. Mot de passe provisoire : accès bloqué jusqu'au changement.
10. L'agent voit Personnel en lecture seule ; création, utilisateurs, rôles et journal refusés.
11. Téléphone (390 px) : aucun débordement, menu accessible.
12. Permission retirée → accès refusé dès la page suivante.
13. Compte désactivé → l'agent est déconnecté immédiatement et ne peut plus se reconnecter.
14. Pages d'administration sur téléphone : aucun débordement.
15. Le journal d'audit et la fiche utilisateur montrent toutes ces opérations.
16. Aucune erreur dans la console du navigateur.

## 5. Erreurs détectées et corrigées

1. `vitest` fait planter npm dans cet environnement → remplacé par le lanceur de tests intégré à Node.
2. La compilation de production a refusé un utilitaire de style déclaré côté client et utilisé côté serveur → déplacé dans un fichier partagé.
3. Le module de stockage faisait inclure tout le projet dans le serveur compilé → chemin isolé.
4. Le changement de mot de passe obligatoire n'était vérifié que dans la mise en page → ajouté aussi à chaque opération serveur.
5. Tests de navigateur : sélecteurs ambigus (« Nom » / « Prénom », « Nouveau mot de passe » / « Confirmer… ») → sélecteurs exacts (erreur du test, pas de l'application).
6. Le serveur de test n'était pas réellement arrêté entre deux exécutions (une ancienne version répondait) → arrêt complet et contrôle du port.
7. **Bug d'affichage sur téléphone** : une carte d'employé débordait de 23 px à cause d'une étiquette trop longue → les cartes et étiquettes se rétrécissent désormais ; le contrôle sur téléphone couvre maintenant toutes les pages d'administration.

## 6. Points restant à confirmer

- Liste des départements et services de l'hôpital.
- Permissions définitives de chaque rôle (proposition au §2).
- Secrétaire et réceptionniste : une seule personne ou deux postes ?
- Mise en place du HTTPS sur le serveur local (nécessaire pour sécuriser le cookie de session).
