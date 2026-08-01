# ISMS Portal

Portail documentaire ISMS/ISO 27001 bilingue, protégé par les groupes Active
Directory. L’API applique un modèle _deny by default_ : espaces, recherche,
consultation, téléchargement et administration sont filtrés côté serveur.

## Démarrage

```bash
cp .env.example .env
# Remplacer toutes les valeurs `change-me` et générer ENCRYPTION_KEY.
docker compose up -d --build
docker compose ps
```

Portail : <http://localhost:8080> — Administration :
<http://localhost:8080/admin> — OpenAPI : <http://localhost:8080/api/docs>.

Les conteneurs exécutent exclusivement le mode production. Aucun fournisseur
d’identité ni amorçage automatique de démonstration n’est présent au démarrage.

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

Le journal d’audit conserve automatiquement les 20 événements les plus récents.
Chaque nouvel événement déclenche, dans la même transaction PostgreSQL, la
suppression des événements plus anciens. Les exports CSV/JSON suivent cette
même rétention.

## Commandes

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
connecteur **LDAPS actif** existe. L’utilisateur saisit uniquement son login
court, par exemple `jdupont`, sans domaine, UPN ni suffixe `@entreprise.fr`.

- `sAMAccountName` retrouve le compte et le mot de passe est validé directement
  auprès d’un contrôleur AD ;
- `mail` devient l’identité stable affichée dans le profil ;
- les groupes AD sont relus à la connexion puis comparés aux groupes et règles
  d’accès configurés dans l’application ;
- le mot de passe AD n’est jamais écrit en base, dans les logs ou les cookies ;
- une session HttpOnly de huit heures est créée et révoquée par
  **Se déconnecter**.

Cette fonction refuse LDAP en clair et exige LDAPS avec une CA valide. La page
`/login` est exclusivement réservée aux utilisateurs. Le compte administrateur
local est uniquement accessible sur `/admin/login`.

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

Test LDAPS reproductible sans l’AD de production :

```bash
./scripts/test-ldaps-functional.sh
```

## Session SSO et diagnostic

Le portail tente d’abord la connexion SSO configurée (Microsoft 365/Entra ID,
Keycloak ou un proxy OIDC). Si aucune session professionnelle n’est reconnue,
`/admin/login` propose le compte administrateur local de secours.

Le compte principal n’utilise jamais un mot de passe fixe versionné. Le script
génère un mot de passe fort dans `.env` et `credentials.txt`, tous deux exclus
de Git et protégés en mode `600` :

```bash
./scripts/generate-secrets.sh
./scripts/generate-secrets.sh --admin-only
./scripts/generate-secrets.sh --admin-only --force
```

L’identifiant initial est `admin` sauf modification de
`INITIAL_ADMIN_USERNAME`. Lire le mot de passe uniquement dans
`credentials.txt`, puis le changer dans **Administration → Configuration →
Profil administrateur**. Cette page permet aussi d’ajouter une photo, de
configurer un MFA TOTP et de gérer les administrateurs locaux ou associés à un
utilisateur Active Directory.

Le frontal SSO approuvé peut transmettre `X-Auth-Session-Expires` au format
ISO-8601 en plus de l’identité et des groupes. Une date invalide ou expirée est
refusée par l’API. Configurer les destinations de reprise et de déconnexion
dans `.env` :

```dotenv
SSO_LOGIN_URL=https://sso.entreprise.local/login
SSO_LOGOUT_URL=https://sso.entreprise.local/logout
COOKIE_SECURE=true
```

Le menu du compte et **Administration → Configuration** affichent uniquement
la source d’identité, l’expiration et des compteurs de groupes/espaces
associés. Les claims et noms de groupes bruts ne sont pas exposés par ce
diagnostic. Le navigateur vérifie la session chaque minute et propose une
réauthentification lorsqu’elle expire.

Les listes administratives volumineuses acceptent les paramètres serveur
`page`, `limit`, `q`, `sort` et `order` sur les routes des groupes, documents
et règles. Le journal d’audit accepte également `action` et `result`. La limite
est plafonnée à 200 éléments par page.
