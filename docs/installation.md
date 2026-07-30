# Installation Ubuntu

Prérequis : Ubuntu 24.04, Docker Engine 29+ avec Compose, DNS du portail, 4 CPU,
8 Gio de RAM et 40 Gio de stockage. Générer les secrets, démarrer et contrôler
les services :

```bash
./scripts/generate-secrets.sh
docker compose up -d --build --wait
docker compose ps
curl --fail http://127.0.0.1:8080/api/health/ready
```

Le script crée `.env` et `credentials.txt` avec les permissions `600`. Déplacer
ensuite `credentials.txt` dans le gestionnaire de secrets retenu. Il est ignoré
par Git.

Le seul port publié par défaut est TCP/8080. En production, terminer TLS sur un
reverse proxy approuvé et publier TCP/443 uniquement. Les flux sortants requis
sont DNS, NTP, LDAP/LDAPS vers les contrôleurs et OIDC si activé.
