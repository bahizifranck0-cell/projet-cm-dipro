# Mode commentaire (revue visuelle)

Permet de sélectionner un élément de la véritable application et de demander une modification.

## Utilisation
1. Se connecter à l'application (n'importe quel compte).
2. Bouton **Commenter** (en bas à droite) → toucher l'élément voulu → choisir le type de demande → écrire → **Envoyer**.
3. Bouton **Commentaires** : liste des demandes de la page, avec leur suivi (Envoyé, En cours, À vérifier, Fait, Pas possible) et la réponse de Claude. « Voir l'élément » le retrouve sur la page.

Pendant la sélection, les clics ne déclenchent rien (aucun lien, aucun formulaire).

## Ce qui est enregistré
Page, sélecteur CSS de l'élément, balise, texte visible, extrait HTML, titre de la page et du bloc, taille d'écran,
version du code (commit), auteur. Table `ReviewComment` (ajout seul, migration `20261106000600_review_comments`).

## Accès de Claude
- `GET /api/revue/flux?jeton=…[&statut=nouveau]` : liste des commentaires (JSON).
- `GET|POST /api/revue/statut?jeton=…&id=…&statut=en_cours|en_test|fait|refuse&reponse=…` : suivi.
Sans `CMDPRO_REVIEW=1` et un `CMDPRO_REVIEW_TOKEN` d'au moins 24 caractères, ces adresses répondent 404.

## Circuit de modification
1. Claude lit les commentaires, modifie le code sur une branche `revue/…` et lance les tests.
2. Vercel publie automatiquement une **version de test** (Preview) de cette branche : à vérifier par l'hôpital.
3. Après accord, la branche est fusionnée dans `claude/cmd-pro` → mise en production.

Attention : la version de test utilise la même base de données que la production. Une modification qui change
la structure de la base n'est donc proposée qu'avec une migration en ajout seul.

## Désactivation
Supprimer `CMDPRO_REVIEW` dans Vercel (Settings → Environment Variables) puis redéployer : le bouton disparaît.
