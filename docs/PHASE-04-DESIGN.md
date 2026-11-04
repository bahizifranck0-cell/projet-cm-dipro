# CMD Pro — Phase 4 : Design system et interface principale

Date : 04/11/2026

## 1. Fonctionnalités réalisées

| Élément | Détail |
|---|---|
| Couleurs | Bleus tirés du logo, blanc, couleurs d'état (succès, attention, erreur). Toutes définies dans **un seul bloc** de `src/app/globals.css` : la charte officielle pourra les remplacer sans toucher au reste |
| Typographie | Police Inter, téléchargée lors de la compilation puis servie par le serveur local (aucune connexion Internet nécessaire à l'hôpital) |
| Glassmorphism | Trois niveaux : `glass` (cartes), `glass-strong` (fenêtres), `glass-solid` (barres fixes presque opaques, lisibles quel que soit le contenu qui passe dessous) |
| Boutons | 4 variantes ; états normal, survol, appuyé, sélectionné, désactivé, chargement ; zone tactile ≥ 44 px ; bordure toujours visible |
| Champs | Bordure contrastée, état d'erreur avec message sous le champ, état désactivé |
| Cases à cocher | Dessinées sur mesure : bordure nette, coche blanche sur bleu |
| Fenêtres (modales) | Basées sur `<dialog>` : focus piégé puis rendu, fermeture par Échap / × / clic extérieur, jamais plus grandes que l'écran |
| Confirmation | Les actions sensibles (désactiver un compte, désactiver ou supprimer un rôle) demandent une confirmation dans une fenêtre |
| Notifications | Messages éphémères de réussite / d'erreur, annoncés aux lecteurs d'écran, fermables |
| Onglets | Navigation au clavier (flèches, Début, Fin), défilement horizontal limité à la barre d'onglets |
| Tableau responsive | Tableau sur ordinateur et tablette, cartes empilées sur téléphone (utilisé pour la liste des utilisateurs) |
| Cartes d'indicateurs, alertes, squelettes de chargement | Prêts pour les tableaux de bord des phases suivantes |
| Guide visuel | Page réservée au Super Administrateur montrant tous les composants et leurs états (contenus d'exemple, aucune donnée de l'hôpital) |

## 2. Navigation selon l'écran

| Écran | Navigation |
|---|---|
| Téléphone (< 768 px) | Barre supérieure avec logo ; **barre basse** (modules principaux + « Menu ») inspirée de la référence bancaire ; menu complet en tiroir, fermable par Échap ou en touchant à l'extérieur |
| Tablette (768–1023 px) | **Rail d'icônes** permanent (76 px), libellés en info-bulle et pour les lecteurs d'écran ; bouton pour ouvrir le menu complet |
| Ordinateur (≥ 1024 px) | Barre latérale en verre inspirée de « Glassy Sidebar » : recherche de module, sections, profil en bas, **repliable** (choix mémorisé) |

Les compteurs (badges) sont prévus dans la navigation : ils s'afficheront avec les notifications (Phase 13). Aucune valeur fictive n'est affichée en attendant.

## 3. Tests exécutés

| Suite | Résultat |
|---|---|
| Contrastes du thème (WCAG 2.1 AA, calculés) | **13/13** |
| Unitaires + services (Phase 3) | 28/28 (contrastes inclus) |
| Protections de la base (Phase 2) | 11/11 |
| Navigateur, Phases 3 et 4 | **77/77** |

Tests de navigateur de la Phase 4 :
- **Audit d'accessibilité automatique (axe-core, WCAG 2.1 A/AA)** sur les 13 pages, en ordinateur (1366 px), tablette (820 px) et téléphone (390 px) : aucun défaut.
- Aucun défilement horizontal sur aucune page, dans les 3 tailles.
- Téléphone : barre basse en bas de l'écran, zones tactiles ≥ 44 px, tiroir qui s'ouvre, se ferme avec Échap et après navigation.
- Tablette : rail ≤ 80 px, pas de barre basse, liens utilisables.
- Ordinateur : recherche de module, repli / dépli, choix conservé après rechargement.
- Composants : bouton désactivé non cliquable, état de chargement annoncé, état sélectionné annoncé, focus clavier visible, onglets au clavier, fenêtre (Échap, retour du focus, conforme à l'audit), fenêtre contenue dans l'écran du téléphone, notifications annoncées et fermables.
- Aucune erreur dans la console du navigateur.

## 4. Défauts trouvés et corrigés

1. **Contraste du bouton principal insuffisant** (4,36:1 au lieu de 4,5:1) sur presque toutes les pages → bleu plus profond.
2. **Bordures des champs trop pâles** (2,24:1 au lieu de 3:1) → renforcées (3:1 minimum vérifié par test).
3. Attribut d'accessibilité invalide sur les filtres du journal d'audit → corrigé.
4. **Barre basse illisible au-dessus d'un contenu clair** (1,47:1) : l'effet de verre était trop transparent → barres fixes presque opaques.
5. **Grille des permissions trop large sur tablette** (débordement de 135 px) → disposition en lignes jusqu'aux grands écrans.
6. Barre basse : libellé « Tableau de bord » coupé et case vide → libellé court « Accueil », colonnes ajustées au nombre de modules.
7. Cases de la grille des permissions trop serrées sur tablette → retour à la ligne automatique.

## 5. Points restant à confirmer

- Codes couleur officiels de la charte CMD Pro (sinon les bleus tirés du logo restent en place).
- Une version du logo à fond transparent ou vectorielle améliorerait l'affichage sur fond sombre (le logo actuel est affiché tel quel, sur sa pastille blanche d'origine).
- Mode clair : non demandé ; possible plus tard grâce aux variables de thème.
