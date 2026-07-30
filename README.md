# ISMS Portal

Portail documentaire ISMS/ISO 27001 bilingue, protégé par les groupes Active
Directory. L’API applique un modèle *deny by default* : espaces, recherche,
consultation, téléchargement et administration sont filtrés côté serveur.

## Démarrage

```bash
cp .env.example .env
# Remplacer toutes les valeurs `change-me` et générer ENCRYPTION_KEY.
docker compose up -d --build
docker compose ps
```

Portail : <http://localhost:8080> — Administration :
<http://localhost:8080/admin> — OpenAPI : <http://localhost:8080/api/docs>.

Le mode démonstration ne fonctionne qu’avec `NODE_ENV` différent de
`production`. Il est bloqué au démarrage en production.

## Commandes

```bash
docker compose exec api npx prisma db push
docker compose exec api node prisma/seed.js
docker compose run --rm api npm test
docker compose logs -f
```

Voir [l’architecture](docs/architecture.md), [l’installation](docs/installation.md)
et [la sécurité](docs/security.md).

