# Docker secrets

Place runtime secrets here only on the target server. This directory is ignored
by Git. Prefer Docker secrets or an external secrets manager in production.

L’exemple `deploy/compose/secrets.yml.example` attend les fichiers suivants,
chacun en permissions `600` et sans retour à la ligne final :

- `database_url`
- `postgres_password`
- `redis_url`
- `encryption_key`

Utilisation :

```bash
docker compose -f docker-compose.yml \
  -f deploy/compose/secrets.yml.example up -d --build
```
