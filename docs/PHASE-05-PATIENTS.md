# CMD Pro — Phase 5 : Patients, réception et secrétariat

Date : 04/11/2026

## 1. Fonctionnalités réalisées

| Fonctionnalité | Détail |
|---|---|
| Dossier patient unique | Nom, post-nom, prénom, sexe, date de naissance, téléphone, adresse. Uniquement administratif : rien de médical ni de financier n'est saisi au secrétariat |
| Numéro de dossier | Attribué automatiquement, continu, sans doublon même avec plusieurs postes en même temps. Format **configurable** (préfixe, nombre de chiffres, année). Valeur provisoire `P-2026-00001`, **à confirmer** |
| Anti-doublons | Avant toute création, le système cherche : même téléphone (0991… et +243 991… sont reconnus comme identiques), même nom complet (sans accents, mots dans n'importe quel ordre), même nom et prénom. Si un dossier ressemble, la création est **bloquée** et les dossiers proches sont proposés avec un bouton « Ouvrir ce dossier ». Un vrai homonyme peut être créé après confirmation explicite, et cette confirmation est inscrite au journal d'audit |
| Recherche | Par numéro de dossier, téléphone (même partiel) ou nom (sans accents, dans le désordre) |
| Modification | Champs vidés réellement effacés ; chaque changement est enregistré au journal avec l'ancienne et la nouvelle valeur |
| Arrivée du patient | Avec ou sans rendez-vous ; motif ; case « situation urgente » qui place le patient en tête de file ; orientation possible dès l'arrivée |
| File d'attente | Passages en cours (y compris ceux arrivés la veille : service 24 h/24) ou tous les passages du jour ; compteurs du jour |
| Orientation | Vers un service et/ou un médecin ; réorientation possible tant que le patient n'est pas pris en charge |
| Annulation | Motif obligatoire, visible dans l'historique du dossier ; le dossier n'est jamais supprimé |
| Un seul passage ouvert | Vérifié par le logiciel **et** par la base de données |
| Dossier central | En-tête (âge calculé, téléphone, adresse, passage en cours), onglets « Passages » (chronologie) et « Informations administratives » ; les modules suivants viendront s'y ajouter |
| Tableau de bord | Compteurs réels du jour pour les utilisateurs de la réception |
| Paramètres généraux | Page de réglage du format du numéro de dossier, avec aperçu |

Rôles : la **secrétaire** crée et modifie les dossiers ; le **réceptionniste** enregistre les arrivées et oriente, mais ne crée pas de dossier. Ces répartitions se modifient dans la grille des permissions si l'organisation réelle est différente.

## 2. Base de données

Migration `20261104000200_patients_search` (ajouts uniquement, avec `down.sql`) :
- champs de recherche normalisés sur `Patient` (`searchName`, `phoneDigits`), remplis automatiquement pour d'éventuels dossiers existants ;
- index de recherche rapide (trigrammes) sur le nom ;
- `Visit.priority` et `Visit.cancelReason` ;
- règle « un seul passage ouvert par patient ».

Note technique : l'index trigramme n'est pas décrit par Prisma. Les migrations doivent donc toujours être créées avec `prisma migrate diff` et relues, jamais avec `prisma migrate dev` sans vérification (qui proposerait de supprimer cet index).

## 3. Tests exécutés

| Suite | Résultat |
|---|---|
| Unitaires + services | **41/41** |
| Protections de la base (Phase 2) | 11/11 |
| Navigateur, Phases 3 à 5 | voir § 5 |

Tests de services de la Phase 5 :
- numéros continus ;
- champs de recherche remplis ;
- doublon par téléphone (autre format), par nom sans accents, par nom inversé ;
- absence de faux doublon ;
- homonyme confirmé et tracé ;
- recherche par numéro, téléphone partiel et nom dans le désordre ;
- validations (champ obligatoire, date future, téléphone invalide) ;
- modification avec audit des seuls champs changés ;
- permissions (réceptionniste, caissier) ;
- arrivée, urgence en tête, second passage refusé (logiciel et base), orientation vers un non-médecin refusée ;
- annulation sans motif refusée ;
- historique dans le dossier ;
- format du numéro modifiable seulement par une personne autorisée ;
- calcul de l'âge ; journée de Goma (UTC+2).

Tests navigateur de la Phase 5 :
- secrétaire **sur téléphone** : création, dossier retrouvé après rechargement ;
- doublon détecté avec un autre format de téléphone, sans création, avec ouverture du bon dossier ;
- recherche sans accents ;
- réceptionniste : aucune création de dossier possible ;
- arrivée urgente ;
- orientation retrouvée après rechargement ;
- annulation motivée visible dans la file et dans le dossier ;
- modification tracée au journal ;
- audit d'accessibilité de la fenêtre d'arrivée et de l'avertissement de doublon ;
- les nouvelles pages ajoutées à l'audit des 3 tailles d'écran.

## 4. Défauts trouvés et corrigés

1. **Aucune confirmation après « Enregistrer l'arrivée »** : le bouton disparaissait avec son message dès que le passage était créé → la page du dossier affiche désormais la confirmation avec un lien vers la file.
2. Test : le numéro de dossier apparaît deux fois sur la page → sélecteur précisé.

## 5. Résultat final des tests navigateur

RESULTAT_FINAL

## 6. Points restant à confirmer

- Format officiel du numéro de dossier patient.
- Autres informations administratives à recueillir (profession, personne à contacter, assurance, etc.) : ajoutables sans toucher à la structure (champ `extraFields`).
- Secrétaire et réceptionniste : une ou deux personnes ? (réglable par les permissions).
- Fusion de deux dossiers créés par erreur : non réalisée. Elle demande une procédure validée par l'hôpital ; la permission « Patients — Supprimer » est réservée à cet usage.
- La clôture d'un passage se fera depuis la consultation (Phase 6) et la sortie depuis la facturation (Phase 10).
