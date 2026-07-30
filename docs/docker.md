# Docker

Les images applicatives sont multi-stage et exécutées sans privilèges root.
PostgreSQL, Redis, MinIO et ClamAV utilisent des volumes persistants et un réseau
interne. Vérification : `docker compose ps` puis
`curl -fsS http://localhost:8080/api/health/ready`.

