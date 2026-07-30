# Installation Ubuntu

Prérequis : Ubuntu 24.04, Docker Engine 29+ avec Compose, DNS du portail, 4 CPU,
8 Gio de RAM et 40 Gio de stockage. Copier `.env.example` vers `.env`, remplacer
les secrets, configurer le DNS et lancer `docker compose up -d --build`.

Le seul port publié par défaut est TCP/8080. En production, terminer TLS sur un
reverse proxy approuvé et publier TCP/443 uniquement. Les flux sortants requis
sont DNS, NTP, LDAP/LDAPS vers les contrôleurs et OIDC si activé.

