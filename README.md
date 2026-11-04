# CMD Pro

Logiciel de gestion hospitalière du Centre Médical Dieu est Fidélité (Goma).

Technologies : Next.js 16, React 19, PostgreSQL 16, Prisma 6, TypeScript, Tailwind CSS 4.

## Installation sur le serveur de l'hôpital

Prérequis : Node.js 22 ou plus récent, PostgreSQL 16.

```bash
# 1. Base de données (une fois)
sudo -u postgres psql -c "CREATE ROLE cmdpro LOGIN PASSWORD 'mot-de-passe-solide';"
sudo -u postgres psql -c "CREATE DATABASE cmdpro OWNER cmdpro;"

# 2. Configuration
cp .env.example .env        # puis renseigner DATABASE_URL et STORAGE_DIR

# 3. Installation
npm ci
npm run db:migrate          # crée les tables et les protections
npm run db:seed             # permissions, rôles du cahier des charges, paiement « Espèces »
npm run admin:create        # crée le premier Super Administrateur (questions interactives)

# 4. Démarrage
npm run build
npm start                   # http://adresse-du-serveur:3000
```

Variables d'environnement :

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | Base réelle de l'hôpital |
| `STORAGE_DIR` | Dossier privé des photos et documents (à inclure dans les sauvegardes) |
| `CMDPRO_DEMO_URL` | Lien affiché sur la page de connexion vers l'instance de démonstration |
| `COOKIE_SECURE` | `false` uniquement si le serveur n'est pas encore en HTTPS |

Aucune donnée fictive n'est jamais créée dans la base réelle. Aucun mot de passe par défaut n'existe.

## Tests

```bash
npm run typecheck
npm test            # tests unitaires et services (base *_test recréée par scripts/test-db-reset.sh)
npm run test:db     # protections de la base
npm run test:e2e    # parcours complets dans un vrai navigateur
```

Les scripts de test refusent toute base dont le nom ne se termine pas par `_test`.

## Documentation

- `docs/PHASE-01-AUDIT.md` — audit initial et décisions
- `docs/PHASE-02-ARCHITECTURE.md` — architecture et modèle de données
- `docs/PHASE-03-ACCES.md` — connexion, utilisateurs, rôles et permissions
- `docs/PHASE-04-DESIGN.md` — design system, navigation responsive, accessibilité
