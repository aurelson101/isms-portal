# Installation Ubuntu

Prérequis : Ubuntu 24.04, Docker Engine 29+ avec Compose, DNS du portail, 4 CPU,
8 Gio de RAM et 40 Gio de stockage. Générer les secrets, démarrer et contrôler
les services :

```bash
./scripts/generate-secrets.sh
docker compose up -d postgres
./scripts/provision-runtime-credentials.sh
docker compose run --rm migrate
docker compose up -d --build --wait
docker compose ps
curl --fail http://127.0.0.1:8080/api/health/ready
```

Le script crée `.env` et `credentials.txt` avec les permissions `600`. Déplacer
ensuite `credentials.txt` dans le gestionnaire de secrets retenu. Il est ignoré
par Git.

Le provisionnement crée `.env.app` (compte PostgreSQL non privilégié et URL Redis
authentifiée) et `.env.redis` en mode `600`. Conserver ces fichiers hors Git et
les inclure dans la gestion des secrets. Ne pas relancer le provisionnement sur
une installation existante ; après mise à niveau, exécuter `docker compose run
--rm migrate` avant de redémarrer l’API et le worker.

Le seul port publié par défaut est TCP/8080. En production, terminer TLS sur un
reverse proxy approuvé et publier TCP/443 uniquement. Les flux sortants requis
sont DNS, NTP, LDAP/LDAPS vers les contrôleurs et OIDC si activé.
