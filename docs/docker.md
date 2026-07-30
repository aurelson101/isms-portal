# Docker

La pile contient Nginx, Next.js, NestJS, worker BullMQ, PostgreSQL, Redis, un
volume documentaire persistant et ClamAV. Les images applicatives sont multi-stage, non-root, sans capacités
Linux et avec système de fichiers en lecture seule. Les réseaux `app` et `data`
sont internes ; seul Nginx publie TCP/8080.

```bash
./scripts/generate-secrets.sh
docker compose config --quiet
docker compose up -d --build --wait
docker compose exec api npx prisma migrate deploy
docker compose ps
curl -fsS http://localhost:8080/api/health/ready
```

Les volumes `postgres-data`, `redis-data`, `document-storage` et `clamav-data`
survivent aux redémarrages. Ne jamais lancer `docker compose down -v` sur une
installation à conserver.

Les limites Compose constituent une base : les ajuster après mesure CPU/RAM.
Les secrets doivent venir du gestionnaire approuvé ; `.env` et
`credentials.txt` sont locaux, protégés en `600` et exclus de Git.
