# Déploiement cluster

Frontend, API et workers sont sans état. Externaliser PostgreSQL, Redis et
S3/MinIO en haute disponibilité ; utiliser la même clé de chiffrement et la même
configuration d’identité sur chaque réplique.

Le manifeste `deploy/kubernetes/isms-portal.yaml` fournit :

- ConfigMap et gabarit Secret sans valeur réelle ;
- deux réplicas frontend et API ;
- deux workers BullMQ ;
- Services et Ingress HTTPS ;
- probes, ressources, contextes non-root et racines en lecture seule ;
- HPA frontend/API ;
- PodDisruptionBudget pour les trois composants.

Remplacer les images `registry.example`, l’hôte Ingress, CIDR approuvé et
références de services externes. Injecter les secrets via External Secrets,
Vault ou le gestionnaire de la plateforme.

Appliquer d’abord les migrations avec un Job unique, puis déployer API/worker.
Ne jamais exécuter simultanément plusieurs migrations concurrentes.
