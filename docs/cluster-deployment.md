# Déploiement cluster

Frontend, API et workers sont réplicables car sans état. Externaliser PostgreSQL,
Redis et S3/MinIO, partager les clés de session, utiliser probes et
PodDisruptionBudget. Les gabarits Kubernetes sont dans `deploy/kubernetes`.

