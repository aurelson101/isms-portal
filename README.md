# ISMS Portal

Portail documentaire ISMS/ISO 27001 bilingue, protégé par les groupes Active
Directory. L’API applique un modèle _deny by default_ : espaces, recherche,
consultation, téléchargement et administration sont filtrés côté serveur.

## Architecture

```text
Utilisateurs internes
        │ HTTPS/443
        ▼
Nginx hôte + certificat Let's Encrypt
        │ 127.0.0.1:8080
        ▼
Nginx Docker ── Next.js
        │
        └────── NestJS ── PostgreSQL
                    ├──── Redis / BullMQ
                    ├──── ClamAV
                    └──── volume POSIX document-storage
```

La pile persistante comprend sept services : proxy Docker, frontend, API,
worker, PostgreSQL, Redis et ClamAV. Seul le proxy publie un port. Les réseaux
applicatifs et de données sont internes à Docker.

## Prérequis

Configuration recommandée pour une installation autonome :

- Ubuntu Server 24.04 LTS ou distribution Linux équivalente ;
- 4 vCPU, 8 Gio de RAM et 40 Gio d’espace disponible ;
- Docker Engine 29 ou version compatible et plugin Docker Compose v2 ;
- Git, OpenSSL, curl et, pour HTTPS, Nginx et Certbot ;
- DNS interne pointant le nom du portail vers le serveur ;
- accès sortant DNS/NTP, registre Docker, LDAP ou LDAPS et services d’alerte
  configurés ;
- TCP/443 entrant depuis le réseau utilisateur. Le port 8080 doit rester local
  au serveur en production.

Vérification rapide :

```bash
docker version
docker compose version
openssl version
getent hosts isms.example.com
```

## Installation Docker

```bash
git clone https://github.com/<ORGANISATION>/isms-portal.git
cd isms-portal
./scripts/generate-secrets.sh
sudo ./scripts/configure-host.sh
docker compose config --quiet
docker compose up -d --build --wait
docker compose exec -T api node node_modules/prisma/build/index.js \
  migrate deploy --schema prisma/schema.prisma
docker compose ps
curl -fsS http://127.0.0.1:8080/api/health/ready
```

Le générateur crée `.env` et `credentials.txt` en mode `600`. Conserver ces
fichiers hors Git et déplacer les identifiants vers le gestionnaire de secrets
de l’entreprise. Le compte de secours initial se connecte uniquement sur
`/admin/login`.

En développement ou sur un poste isolé, le portail est disponible sur
<http://localhost:8080>. En production, ne pas exposer directement ce port.
Créer un fichier local `docker-compose.production.yml`, non versionné :

```yaml
services:
  reverse-proxy:
    ports:
      - "127.0.0.1:8080:8080"
```

Puis ajouter dans `.env` :

```dotenv
COMPOSE_FILE=docker-compose.yml:docker-compose.production.yml
COOKIE_SECURE=true
```

Contrôler le rendu effectif avant tout démarrage :

```bash
docker compose config --quiet
docker compose config | sed -n '/ports:/,/networks:/p'
```

Les conteneurs exécutent exclusivement le mode production. Aucun fournisseur
d’identité ni amorçage automatique de démonstration n’est présent au démarrage.

## HTTPS avec Nginx et Certbot DNS OVH

Le schéma recommandé termine TLS dans Nginx sur l’hôte et transmet uniquement
vers `127.0.0.1:8080`. Le DNS public n’a pas besoin d’exposer le serveur : le
challenge DNS-01 OVH fonctionne aussi pour un portail accessible seulement en
interne.

Installer les composants Ubuntu :

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-dns-ovh
```

Créer `/root/.secrets/certbot/ovh.ini` avec des clés OVH dédiées et limitées à
la zone DNS concernée :

```ini
dns_ovh_endpoint = ovh-eu
dns_ovh_application_key = <SECRET_OVH>
dns_ovh_application_secret = <SECRET_OVH>
dns_ovh_consumer_key = <SECRET_OVH>
```

```bash
sudo chmod 600 /root/.secrets/certbot/ovh.ini
sudo certbot certonly \
  --dns-ovh \
  --dns-ovh-credentials /root/.secrets/certbot/ovh.ini \
  --dns-ovh-propagation-seconds 60 \
  --key-type ecdsa \
  -d isms.example.com
```

Exemple `/etc/nginx/sites-available/isms-portal.conf` :

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name isms.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name isms.example.com;

    ssl_certificate /etc/letsencrypt/live/isms.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/isms.example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    add_header Strict-Transport-Security "max-age=31536000" always;

    client_max_body_size 55m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 120s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/isms-portal.conf \
  /etc/nginx/sites-enabled/isms-portal.conf
sudo nginx -t
sudo systemctl reload nginx
curl -fsS https://isms.example.com/api/health/ready
```

Ne pas recopier la Content-Security-Policy dans Nginx : le proxy Docker la
génère avec un nonce propre à chaque réponse. Une seconde CSP pourrait bloquer
les scripts ou styles Next.js.

### Renouvellement du certificat

Certbot installe normalement son timer systemd. Ajouter un hook qui ne recharge
Nginx qu’après validation de sa configuration :

```bash
sudo install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
sudo sh -c 'printf "%s\n" \
  "#!/bin/sh" \
  "set -eu" \
  "nginx -t" \
  "systemctl reload nginx" \
  > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh'
sudo chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo certbot renew --dry-run --run-deploy-hooks
systemctl status certbot.timer
```

Le test doit se terminer sans erreur et le hook doit confirmer que la
configuration Nginx reste valide.

## DNS et accès interne uniquement

Pour une exposition interne, créer un enregistrement dans le DNS de l’entreprise
qui résout `isms.example.com` vers l’adresse privée du serveur. Autoriser TCP/443
uniquement depuis les réseaux ou le VPN internes. Aucun NAT entrant ni règle
publique vers le serveur n’est requis pour le challenge DNS OVH.

```bash
getent hosts isms.example.com
curl -I https://isms.example.com/login
sudo ss -lntp | grep -E ':(443|8080)\b'
```

Le résultat attendu est Nginx sur `:443` et Docker sur `127.0.0.1:8080`, jamais
`0.0.0.0:8080`.

## Génération des secrets

La méthode recommandée génère automatiquement des valeurs indépendantes et
fortes, puis crée `.env` et `credentials.txt` avec les permissions `600` :

```bash
./scripts/generate-secrets.sh
```

Le script refuse d’écraser un fichier existant. `--force` effectue une rotation
volontaire ; ne pas l’utiliser sur une installation existante sans procédure de
rotation PostgreSQL. Pour recréer uniquement `credentials.txt` depuis
le `.env` actuel :

```bash
./scripts/generate-secrets.sh --credentials-only
```

Pour ajouter le secret de cookie SSO à une installation existante sans changer
le mot de passe PostgreSQL, la clé de chiffrement ni le compte administrateur :

```bash
./scripts/generate-secrets.sh --sso-only
```

`credentials.txt` est exclu de Git mais reste un fichier sensible à déplacer
vers un gestionnaire de secrets après installation.

Pour une génération manuelle, générer chaque valeur séparément avec OpenSSL. Ne
jamais réutiliser une valeur entre PostgreSQL et l’application, ni la
valider dans Git.

```bash
# Mot de passe PostgreSQL : à reporter dans POSTGRES_PASSWORD et DATABASE_URL.
# Le format hexadécimal évite tout encodage supplémentaire dans l’URL.
openssl rand -hex 32

# Clé applicative de 32 octets encodée en base64 : ENCRYPTION_KEY.
openssl rand -base64 32

# Secret de cookie oauth2-proxy : OAUTH2_PROXY_COOKIE_SECRET.
openssl rand -base64 32
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
ENCRYPTION_KEY=<CLE_BASE64_32_OCTETS_GENEREE>
DOCUMENT_STORAGE_PATH=/data/documents
```

Comme les mots de passe proposés sont hexadécimaux, ils peuvent être insérés
dans `DATABASE_URL` sans encodage URL. Si un autre format est utilisé, encoder
les caractères réservés du mot de passe.

En production, préférer des secrets Docker ou un gestionnaire de secrets au
fichier `.env`. L’application n’a besoin d’aucune clé privée de CA : seuls les
certificats CA publics sont importés depuis l’administration et restent dans
PostgreSQL, séparément du volume documentaire.

## Documents et lecture seule

L’administration accepte uniquement les formats PDF, Word DOCX et Excel XLSX,
avec une limite de 50 Mio et une analyse ClamAV avant publication. Les PDF sont
affichés dans le lecteur intégré. Les DOCX sont convertis en texte et les XLSX
en tableau directement dans le navigateur, sans service tiers et sans fonction
d’édition.

Les permissions `read`, `preview` et `download` sont distinctes. L’API renvoie
les capacités autorisées et l’interface masque le téléchargement lorsqu’il
n’est pas accordé. Les fichiers sont conservés dans le volume Docker
`document-storage`, monté dans `/data/documents`.

Lorsqu’un document est marqué **sensible**, la publication génère une copie de
diffusion portant définitivement la mention `SENSITIVE DOCUMENT` en en-tête,
au centre ou en pied de page. Cette copie PDF, DOCX ou XLSX est de nouveau
analysée par ClamAV, possède sa propre empreinte SHA-256 et reste marquée après
téléchargement, ouverture hors ligne et impression. La source originale reste
interne et n’est jamais servie aux utilisateurs. La prévisualisation de
l’administration reprend la même position que le fichier distribué.

## Explorateur documentaire

L’accueil reste volontairement synthétique. Les cartes et menus **Politiques**,
**Procédures**, **Guides** et les espaces autorisés ouvrent l’environnement
dédié `/explorer` avec le filtre correspondant. La recherche de l’accueil y
redirige également.

L’explorateur possède sa propre URL partageable, la navigation entre catégories
et espaces, les modes mémorisés fenêtres/liste et le lecteur sécurisé
extensible. Les documents ne sont donc plus rendus sous les cartes de l’accueil.
Les résultats sont paginés côté serveur par groupes de 10 documents. Les
boutons **Précédent** et **Suivant**, le numéro de page et le total restent
cohérents avec les filtres et sont conservés dans l’URL.

Dans **Administration → Documents**, les actions permettent de publier,
archiver, restaurer ou supprimer définitivement un document. La suppression,
réservée aux administrateurs, demande une confirmation puis retire les
traductions, versions, analyses antivirus, métadonnées et fichiers du volume
POSIX.

Le journal d’audit conserve automatiquement les 50 événements les plus récents.
Chaque nouvel événement déclenche, dans la même transaction PostgreSQL, la
suppression des événements plus anciens. Les exports CSV/JSON suivent cette
même rétention.

## Gouvernance des administrateurs

Le compte principal gère les comptes et groupes administrateurs depuis le
profil d’administration. Chaque nouvelle délégation exige une justification ;
elle peut recevoir une date d’expiration appliquée côté API. Une revue initiale
est enregistrée à la création et sa prochaine recertification est fixée à six
mois. Le compte principal peut renouveler cette revue, consulter les sessions
administrateur actives et révoquer une session précise sans exposer son jeton.

La dernière utilisation d’un privilège est affichée dans l’interface et mise à
jour au plus toutes les cinq minutes afin de conserver une information utile
sans provoquer une écriture PostgreSQL à chaque requête. Un compte ou groupe
expiré ne donne plus aucun droit, même si sa session ou son appartenance AD est
encore valide.

## Commandes

### Mise à jour d’une installation

Sauvegarder avant chaque mise à jour, puis reconstruire à partir d’un commit ou
d’un tag identifié :

```bash
backup_target="backups/$(date +%Y%m%d-%H%M%S)"
./scripts/backup.sh "$backup_target"
./scripts/verify-backup.sh "$backup_target"
git fetch origin
git pull --ff-only origin main
docker compose config --quiet
docker compose up -d --build --wait
docker compose exec -T api node node_modules/prisma/build/index.js \
  migrate deploy --schema prisma/schema.prisma
./scripts/diagnose.sh
```

Ne jamais lancer `docker compose down -v` : l’option `-v` supprimerait les volumes
PostgreSQL, Redis, ClamAV et documentaires.

### Validation et diagnostic

```bash
docker run --rm -v "$PWD:/workspace" -w /workspace \
  mcr.microsoft.com/playwright:v1.55.1-noble npm run verify
./scripts/diagnose.sh
docker compose exec api node node_modules/prisma/build/index.js migrate deploy --schema prisma/schema.prisma
docker compose exec api node prisma/seed.js
docker run --rm -v "$PWD:/app" -w /app node:22.23.2-alpine npm test
docker run --rm -v "$PWD:/app" -w /app node:22.23.2-alpine npm run lint
docker run --rm --network host -v "$PWD:/work" -w /work \
  mcr.microsoft.com/playwright:v1.55.1-noble npx playwright test
# Recette E2E isolée : crée puis détruit une pile et des volumes dédiés sur 18080.
./scripts/test-e2e-isolated.sh
./scripts/test-ldaps-functional.sh
./scripts/test-authorization-functional.sh
./scripts/test-restore-functional.sh
./scripts/test-performance-functional.sh
./scripts/backup.sh backups/$(date +%Y%m%d-%H%M%S)
docker compose logs -f
```

`npm run verify` regroupe les traductions, TypeScript, ESLint, Prettier, les
tests unitaires, la détection de code mort et l'audit des dépendances. La
recette Playwright isolée fait également échouer chaque parcours sur une erreur
JavaScript non interceptée ou une réponse HTTP 5xx observée par le navigateur.
`./scripts/diagnose.sh` contrôle sans modifier les données la configuration
Compose, la santé des sept services, les routes publiques attendues et les
principaux en-têtes de sécurité.

Sur chaque hôte Linux Docker, appliquer une fois le réglage requis par la
persistance Redis, puis vérifier qu’il vaut `1` :

```bash
sudo ./scripts/configure-host.sh
sysctl vm.overcommit_memory
docker compose restart redis
docker compose logs redis | grep -i overcommit || true
```

## Exploitation P2

Le workflow `Supply chain` construit les images API et Web sur chaque push de
`main`, publie les digests immuables dans le registre privé GHCR, joint une
attestation BuildKit et une SBOM SPDX par image, recherche les vulnérabilités
système et applicatives HIGH/CRITICAL avec Trivy, puis signe chaque digest sans
clé avec Cosign/OIDC. Les actions tierces sont épinglées sur leur SHA de commit.

Le test de performance crée 2 000 groupes jetables et vérifie, avec dix requêtes
concurrentes, les budgets p95 suivants : recherche documentaire 2 s,
pagination 1,5 s, liste AD volumineuse 2 s, sans aucune réponse en erreur. Les
seuils et la charge peuvent être ajustés avec `PERFORMANCE_REQUESTS` et
`PERFORMANCE_CONCURRENCY`.

Le workflow hebdomadaire `Resilience drills` restaure une sauvegarde dans une
pile Docker jetable. Il contrôle le manifeste de sauvegarde, la santé, les
métadonnées, chaque taille et chaque empreinte SHA-256 restaurée ; toute
différence fait échouer le workflow et déclenche les notifications GitHub du
dépôt. Son second job, activé avec la variable privée
`AD_FAILOVER_TEST_ENABLED=true`, utilise un runner interne et les secrets de
l’environnement `ad-failover-test` pour provoquer une coupure contrôlée du
contrôleur primaire, valider la synchronisation via le secondaire, restaurer le
primaire puis vérifier l’authentification SSO. Le script n’imprime aucune
identité ni aucun secret.

Les métriques Prometheus restent accessibles uniquement sur le réseau privé de
l’API via `/metrics`. Elles couvrent santé des dépendances, taux HTTP 5xx,
échecs LDAP, profondeur BullMQ, espace disque documentaire et durée ClamAV. Les
règles prêtes à importer sont dans
`deploy/monitoring/prometheus-alerts.yml`.

Voir [l’architecture](docs/architecture.md), [l’installation](docs/installation.md),
[les routes](docs/routes.md) et [la sécurité](docs/security.md).

## Configuration Active Directory

Créer dans Active Directory un compte de service en lecture seule, sans droit
administrateur ni ouverture de session interactive. Il doit pouvoir lire les
utilisateurs, les groupes et leurs appartenances dans les OU configurées.

Dans **Administration → Synchronisation LDAP**, renseigner au minimum :

```text
Domaine              corp.entreprise.local
Contrôleur primaire  dc01.corp.entreprise.local
Contrôleur secondaire dc02.corp.entreprise.local
Base DN              DC=corp,DC=entreprise,DC=local
User Base DN         OU=Users,DC=corp,DC=entreprise,DC=local
Group Base DN        OU=Groups,DC=corp,DC=entreprise,DC=local
Bind DN              CN=svc-isms,OU=Service Accounts,DC=corp,DC=entreprise,DC=local
Filtre utilisateurs  (objectClass=user)
Filtre groupes       (objectClass=group)
Attribut de connexion sAMAccountName
Attribut utilisateur mail
Attribut groupe      cn
Attribut email       mail
```

### LDAP

Sélectionner `LDAP`, généralement sur TCP/389, laisser le certificat CA vide,
puis saisir chaque contrôleur sous forme d’adresse IP (`10.1.1.4`) ou de nom
d’hôte. LDAP transmet le bind sans protection TLS : il ne doit être utilisé que
sur un réseau isolé et maîtrisé. Préférer LDAPS.

### LDAPS

1. Exporter le certificat public de la CA qui a signé le certificat LDAPS des
   contrôleurs, ou la chaîne ADCS. Les certificats X.509 PEM/DER et les chaînes
   PKCS#7 sont acceptés (`.pem`, `.crt`, `.cer`, `.p7b`, `.p7c`), même lorsqu’un
   export PKCS#7 porte l’extension `.cer`. Ne jamais exporter la clé privée.
2. Dans **Administration → Certificats CA**, importer et tester cette CA.
3. Dans **Synchronisation LDAP**, sélectionner `LDAPS`, TCP/636 et la CA
   importée.
4. Utiliser obligatoirement pour chaque contrôleur son nom DNS complet, par
   exemple `dc04.example.com`, présent dans le SAN du certificat. Les adresses
   IP, noms courts ou contournements TLS sont refusés.
5. Enregistrer, cliquer **Tester**, puis **Synchroniser**.

### Connexion des utilisateurs Active Directory

La connexion directe des utilisateurs standards est proposée dès qu’un
connecteur **LDAP ou LDAPS actif** existe. L’utilisateur peut saisir son login
court, par exemple `jdupont`, ou l’adresse exacte enregistrée dans son attribut
AD `mail`, par exemple `jdupont@example.com`. Le domaine qualifié
`EXAMPLE\\jdupont` et l’UPN ne sont pas requis.

- l’API recherche une correspondance exacte sur l’attribut de connexion
  (`sAMAccountName` par défaut) ou sur l’attribut email (`mail` par défaut) ;
- le mot de passe est validé directement auprès d’un contrôleur AD en utilisant
  le DN renvoyé par la recherche ;
- `mail` devient l’identité stable affichée dans le profil ;
- les groupes AD sont relus à la connexion puis comparés aux groupes et règles
  d’accès configurés dans l’application ;
- le profil distingue le nombre total d'appartenances AD reçues des groupes
  actifs réellement importés et reconnus par l'application ; leurs noms sont
  consultables sans exposer les groupes non configurés ;
- le mot de passe AD n’est jamais écrit en base, dans les logs ou les cookies ;
- une session HttpOnly de huit heures est créée et révoquée par
  **Se déconnecter**.

LDAPS valide la chaîne de certification, le nom d’hôte et TLS 1.2 au minimum.
LDAP/389 est également accepté lorsqu’il est explicitement configuré et actif,
mais le bind utilisateur et son mot de passe ne sont alors pas protégés par TLS :
réserver ce mode à un réseau interne isolé et maîtrisé, et préférer LDAPS. La
page `/login` est exclusivement réservée aux utilisateurs. Le compte
administrateur local est uniquement accessible sur `/admin/login`.

Le test vérifie DNS, TCP, chaîne TLS, nom d’hôte, bind et recherches. Après une
synchronisation réussie, les groupes sont proposés dans la recherche de
**Groupes Active Directory** et dans la création des règles. Le secret de bind
est chiffré en AES-256-GCM et n’est jamais renvoyé par l’API.

La synchronisation complète utilise le contrôle de pagination LDAP, par pages
de 500 groupes. Elle respecte ainsi la limite serveur Active Directory
(`sizeLimitExceeded`, code `0x4`) et enregistre dans le résultat du job le
nombre de pages et de groupes effectivement traités.

Après réception réussie de toutes les pages, les groupes précédemment fournis
par ce connecteur mais désormais absents d’AD sont supprimés de l’application,
ainsi que leurs règles d’accès. Aucune suppression n’est effectuée si la
synchronisation LDAP échoue, reste incomplète ou retourne soudainement zéro
groupe. Dans ce dernier cas, la purge explicite reste disponible après
vérification de la configuration.

Le bouton **Purger les données AD** permet de préparer un changement d’annuaire.
Après confirmation, il supprime tous les groupes synchronisés et leurs règles
d’accès, mais conserve les groupes ajoutés localement et ne modifie jamais
Active Directory.

Dans **Groupes Active Directory**, le deuxième champ interroge directement les
connecteurs actifs à partir de deux caractères. Par exemple, `Skill` propose
les groupes correspondants avec leur DN. Cliquer sur un résultat remplit le
nom, le DN et la description ; **Ajouter** relit ensuite le groupe dans AD
avant de l’enregistrer avec la source **Synchronisé AD**. Une saisie manuelle
reste possible et conserve volontairement la source **Ajout local**.

La fiche de configuration préremplie pour DeftaGroup est disponible dans
[README-LDAP-LOCAL.md](README-LDAP-LOCAL.md). Elle ne contient aucun mot de
passe ; les contrôleurs et le Group Base DN restent à compléter.

Test LDAP/LDAPS reproductible sans l’AD de production :

```bash
./scripts/test-ldaps-functional.sh
```

## Session SSO et diagnostic

Le mode SSO Microsoft 365 utilise `oauth2-proxy` 7.15.3 devant l’API. Lorsqu’un
utilisateur ouvre le portail, Nginx vérifie sa session Entra ID. Un navigateur
qui possède déjà une session professionnelle revient automatiquement au
portail ; une règle MFA ou Conditional Access peut néanmoins demander une
validation. La connexion directe LDAP/LDAPS reste disponible sur `/login` et
le compte administrateur local reste isolé sur `/admin/login`.

Le compte principal n’utilise jamais un mot de passe fixe versionné. Le script
génère un mot de passe fort dans `.env` et `credentials.txt`, tous deux exclus
de Git et protégés en mode `600` :

```bash
./scripts/generate-secrets.sh
./scripts/generate-secrets.sh --admin-only
./scripts/generate-secrets.sh --admin-only --force
./scripts/generate-secrets.sh --sso-only
```

L’identifiant initial est `admin` sauf modification de
`INITIAL_ADMIN_USERNAME`. Lire le mot de passe uniquement dans
`credentials.txt`, puis le changer dans **Administration → Configuration →
Profil administrateur**. Cette page permet aussi d’ajouter une photo, de
configurer un MFA TOTP et de gérer les administrateurs locaux ou associés à un
utilisateur Active Directory.

### 1. Inscription Microsoft Entra ID

Dans **Microsoft Entra ID → Inscriptions d’applications**, créer une
application mono-tenant, ajouter une plateforme **Web** et déclarer exactement
l’URI publique suivante :

```text
https://isms.example.com/oauth2/callback
```

Dans **Configuration du jeton**, ajouter la revendication facultative `email`
au jeton d’identité. Elle doit contenir le même attribut `mail` que celui de
l’utilisateur dans Active Directory. Créer ensuite un secret client avec une
date d’expiration maîtrisée. Sa valeur, le Tenant ID et le Client ID doivent
rester exclusivement dans `.env` ou dans le gestionnaire de secrets ; ne
jamais les placer dans Git, le README ou `credentials.txt`.

Il n’est pas nécessaire d’envoyer les centaines de groupes de l’utilisateur
dans le jeton Microsoft. Après validation de l’identité Entra, l’API recherche
son adresse `mail` exacte avec le compte de service LDAP/LDAPS puis résout ses
groupes directs ou imbriqués. Seuls les groupes actifs déjà importés dans le
portail alimentent les règles d’accès. Le résultat est mis en cache cinq
minutes par défaut afin de ne pas interroger le contrôleur à chaque requête.

### 2. Variables locales

Compléter `.env` avec les valeurs de l’inscription et l’URL publique HTTPS :

```dotenv
ENTRA_TENANT_ID=<TENANT_ID>
ENTRA_CLIENT_ID=<CLIENT_ID>
ENTRA_CLIENT_SECRET=<SECRET_DANS_GESTIONNAIRE_DE_SECRETS>
OAUTH2_PROXY_COOKIE_SECRET=<GENERE_PAR_LE_SCRIPT>
OAUTH2_PROXY_REDIRECT_URL=https://isms.example.com/oauth2/callback
SSO_LOGIN_URL=/oauth2/start?rd=/
# Remplacer les valeurs puis encoder toute l'URL Entra placée après rd=.
SSO_LOGOUT_URL=/oauth2/sign_out?rd=<URL_ENTRA_END_SESSION_ENCODEE>
SSO_DIRECTORY_GROUP_ENRICHMENT=true
SSO_DIRECTORY_CACHE_TTL_SECONDS=300
SSO_DIRECTORY_NEGATIVE_CACHE_TTL_SECONDS=30
COOKIE_SECURE=true
```

Le portail doit impérativement être publié en HTTPS. Si TLS est terminé par un
reverse proxy d’entreprise placé devant le port 8080, celui-ci doit transmettre
`Host`, `X-Forwarded-For` et `X-Forwarded-Proto: https`. Le port de
`oauth2-proxy` n’est jamais publié : Nginx est le seul service autorisé à lui
adresser une sous-requête d’authentification et l’API continue de refuser tout
en-tête d’identité provenant d’une adresse hors de `TRUSTED_PROXY_CIDRS`.

La déconnexion `/oauth2/sign_out` seule efface uniquement le cookie local
oauth2-proxy. Pour fermer également la session de l'application dans Entra,
construire `SSO_LOGOUT_URL` avec le paramètre `rd` pointant vers l'endpoint
tenant `https://login.microsoftonline.com/<TENANT_ID>/oauth2/v2.0/logout`, puis
ajouter un `post_logout_redirect_uri` HTTPS enregistré dans l'application.
Encoder deux fois l'URL de retour puisqu'elle est imbriquée dans `rd`. Le domaine
Microsoft est explicitement autorisé dans `docker-compose.sso.yml` ; ne pas
élargir cette liste. Pour le single sign-out entre applications, enregistrer
également une URL front-channel Entra capable de supprimer la session locale
avant de répondre HTTP 200.

Lorsqu'un utilisateur ouvre `/` ou `/login`, le portail réutilise
automatiquement la session Microsoft 365 déjà présente dans le navigateur. Le
fournisseur Entra ne redemande une interaction que si aucune session compatible
n'existe, si plusieurs comptes nécessitent un choix ou si une politique d'accès
conditionnel l'impose. Le paramètre `return` est conservé uniquement lorsqu'il
désigne une route locale. Le repli LDAP/LDAPS reste disponible explicitement sur
`/login?local=1` ; après une déconnexion, `/login?loggedout=1` n'essaie pas de
reconnecter immédiatement le même compte.

### Administrateurs issus d'Active Directory

Dans **Administration → Configuration → Comptes administrateurs**, le compte
principal peut accorder les droits complets à un utilisateur AD précis ou à un
groupe AD. La sélection utilise uniquement la recherche du connecteur LDAP/LDAPS
actif et le serveur revérifie l'objet avant de l'enregistrer. Un groupe ne donne
des droits que lorsque son nom est présent dans les appartenances réellement
résolues pour la session ; une simple valeur envoyée depuis Internet n'est
jamais acceptée. Le retrait d'un groupe administrateur prend effet à la requête
suivante. Conserver au moins le compte local principal avec MFA comme accès de
secours et réserver les groupes administrateurs à un effectif très limité.

### 3. Démarrage et contrôle

Valider d’abord la fusion Compose, puis démarrer le profil SSO :

```bash
docker compose -f docker-compose.yml -f docker-compose.sso.yml config --quiet
docker compose -f docker-compose.yml -f docker-compose.sso.yml \
  up -d --build --wait
docker compose -f docker-compose.yml -f docker-compose.sso.yml ps
```

Contrôles attendus :

1. une fenêtre privée ouvre la page Microsoft puis revient au portail ;
2. un navigateur déjà connecté à Microsoft 365 revient sans ressaisie du mot
   de passe, sauf exigence MFA/Conditional Access ;
3. `/api/me` retourne `source: trusted-proxy` et `ssoConnected: true` ;
4. le profil affiche les groupes AD reçus et les groupes importés reconnus ;
5. `/admin` reste indépendant et redirige vers `/admin/login` sans utiliser la
   session utilisateur Entra.

Pour revenir au mode LDAP/LDAPS sans passerelle Entra, redémarrer uniquement le
fichier Compose principal :

```bash
docker compose -f docker-compose.yml -f docker-compose.sso.yml down
docker compose up -d --build --wait
```

Le menu du compte affiche la source d’identité, le nombre d’appartenances AD,
les groupes reconnus par le portail et les espaces associés. Les groupes non
importés ne sont jamais détaillés. La résolution annuaire échoue de façon sûre :
une identité Entra valide mais introuvable dans AD ne reçoit aucun droit issu
de LDAP. Les appels simultanés d’une même identité partagent une seule recherche
annuaire. Un résultat positif reste en cache cinq minutes ; une absence ou une
panne utilise un cache négatif de trente secondes afin d’éviter une surcharge
sans prolonger inutilement une indisponibilité.

Les listes administratives volumineuses acceptent les paramètres serveur
`page`, `limit`, `q`, `sort` et `order` sur les routes des groupes, documents
et règles. Le journal d’audit accepte également `action` et `result`. La limite
est plafonnée à 200 éléments par page.
