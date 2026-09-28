# Docker

La pile contient Nginx, Next.js, NestJS, worker BullMQ, PostgreSQL, Redis, un
volume documentaire persistant et ClamAV. Les images applicatives sont multi-stage, non-root, sans capacités
Linux et avec système de fichiers en lecture seule. Les réseaux `app` et `data`
sont internes ; seul Nginx publie TCP/8080.

```bash
./scripts/generate-secrets.sh
docker compose up -d postgres
./scripts/provision-runtime-credentials.sh
docker compose config --quiet
docker compose run --rm migrate
docker compose up -d --build --wait
docker compose ps
curl -fsS http://localhost:8080/api/health/ready
```

Les volumes `postgres-data`, `redis-data`, `document-storage` et `clamav-data`
survivent aux redémarrages. Ne jamais lancer `docker compose down -v` sur une
installation à conserver.

Le réseau `antivirus-egress` donne uniquement à ClamAV la sortie nécessaire à
l'actualisation de ses signatures. Aucun port ClamAV n'est publié sur l'hôte ;
l'API et le worker l'interrogent exclusivement sur le réseau interne `data`.
Exécuter les migrations avec le service éphémère `migrate`, qui est seul à
recevoir le compte propriétaire PostgreSQL. L’API et le worker utilisent
`.env.app` et ne lancent plus de migrations au démarrage. Le worker attend que
l’API soit saine.

Les limites Compose constituent une base : les ajuster après mesure CPU/RAM.
Les secrets doivent venir du gestionnaire approuvé ; `.env` et
`credentials.txt` sont locaux, protégés en `600` et exclus de Git.

## Pré-requis Redis sur un hôte Linux

Redis peut signaler `Memory overcommit must be enabled` dans ses logs. Vérifier
d'abord la valeur actuelle, puis faire valider le changement par
l'administrateur du serveur :

```bash
sysctl vm.overcommit_memory
sudo sysctl -w vm.overcommit_memory=1
```

La deuxième commande ne persiste pas après redémarrage. Pour une configuration
durable, ajouter `vm.overcommit_memory = 1` dans le fichier `sysctl` géré par
l'exploitation (par exemple `/etc/sysctl.d/99-isms-portal.conf`), appliquer la
politique du serveur puis contrôler de nouveau la valeur. Cette configuration
concerne l'hôte Docker et ne doit pas être simulée dans le conteneur Redis.

## Entretien sûr du cache de build

`sudo ./scripts/configure-host.sh` installe et active le timer systemd
`isms-docker-build-cache-prune.timer`. Il s'exécute chaque jour vers 03 h 30,
avec un délai aléatoire maximal de 30 minutes, et supprime uniquement le cache
de build inutilisé depuis plus de 24 heures.

Le service n'exécute ni `docker system prune`, ni suppression d'image, de
conteneur ou de volume. Les volumes PostgreSQL, Redis, ClamAV et documentaires
ne sont donc jamais ciblés. Contrôler son fonctionnement avec :

```bash
systemctl status isms-docker-build-cache-prune.timer
systemctl list-timers isms-docker-build-cache-prune.timer
journalctl -u isms-docker-build-cache-prune.service
```
