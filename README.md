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

## Génération des secrets

La méthode recommandée génère automatiquement des valeurs indépendantes et
fortes, puis crée `.env` et `credentials.txt` avec les permissions `600` :

```bash
./scripts/generate-secrets.sh
```

Le script refuse d’écraser un fichier existant. `--force` effectue une rotation
volontaire ; ne pas l’utiliser sur une installation existante sans procédure de
rotation PostgreSQL et MinIO. Pour recréer uniquement `credentials.txt` depuis
le `.env` actuel :

```bash
./scripts/generate-secrets.sh --credentials-only
```

`credentials.txt` est exclu de Git mais reste un fichier sensible à déplacer
vers un gestionnaire de secrets après installation.

Pour une génération manuelle, générer chaque valeur séparément avec OpenSSL. Ne
jamais réutiliser une valeur entre PostgreSQL, MinIO et l’application, ni la
valider dans Git.

```bash
# Mot de passe PostgreSQL : à reporter dans POSTGRES_PASSWORD et DATABASE_URL.
# Le format hexadécimal évite tout encodage supplémentaire dans l’URL.
openssl rand -hex 32

# Mot de passe MinIO : à reporter dans MINIO_SECRET_KEY.
openssl rand -hex 32

# Clé applicative de 32 octets encodée en base64 : ENCRYPTION_KEY.
openssl rand -base64 32

# Identifiant MinIO facultatif si la valeur par défaut doit être remplacée.
openssl rand -hex 16
```

Créer ensuite le fichier local protégé :

```bash
cp .env.example .env
chmod 600 .env
```

Reporter les valeurs générées dans `.env`. Le même mot de passe PostgreSQL doit
être utilisé dans les deux lignes suivantes :

```dotenv
POSTGRES_PASSWORD=<MOT_DE_PASSE_POSTGRES_GENERE>
DATABASE_URL=postgresql://isms:<MOT_DE_PASSE_POSTGRES_GENERE>@postgres:5432/isms
MINIO_ACCESS_KEY=<IDENTIFIANT_MINIO_GENERE>
MINIO_SECRET_KEY=<MOT_DE_PASSE_MINIO_GENERE>
ENCRYPTION_KEY=<CLE_BASE64_32_OCTETS_GENEREE>
```

Comme les mots de passe proposés sont hexadécimaux, ils peuvent être insérés
dans `DATABASE_URL` sans encodage URL. Si un autre format est utilisé, encoder
les caractères réservés du mot de passe.

En production, préférer des secrets Docker ou un gestionnaire de secrets au
fichier `.env`. L’application n’a besoin d’aucune clé privée de CA : seuls les
certificats CA publics sont importés depuis l’administration et ils ne sont
jamais stockés dans MinIO.

## Commandes

```bash
docker compose exec api npx prisma migrate deploy
docker compose exec api npm run seed
docker compose run --rm api npm test
docker run --rm -v "$PWD:/app" -w /app node:22.13.1-alpine npm run lint
docker run --rm --network host -v "$PWD:/work" -w /work \
  mcr.microsoft.com/playwright:v1.55.1-noble npx playwright test
./scripts/test-ldaps-functional.sh
./scripts/backup.sh backups/$(date +%Y%m%d-%H%M%S)
docker compose logs -f
```

Voir [l’architecture](docs/architecture.md), [l’installation](docs/installation.md)
et [la sécurité](docs/security.md).
