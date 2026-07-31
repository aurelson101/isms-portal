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

Le mode démonstration ne fonctionne qu’avec `NODE_ENV` différent de
`production`. Il est bloqué au démarrage en production.

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

## Explorateur documentaire

L’accueil reste volontairement synthétique. Les cartes et menus **Politiques**,
**Procédures**, **Guides** et les espaces autorisés ouvrent l’environnement
dédié `/explorer` avec le filtre correspondant. La recherche de l’accueil y
redirige également.

L’explorateur possède sa propre URL partageable, la navigation entre catégories
et espaces, les modes mémorisés fenêtres/liste et le lecteur sécurisé
extensible. Les documents ne sont donc plus rendus sous les cartes de l’accueil.

## Commandes

```bash
docker compose exec api npx prisma migrate deploy
docker compose exec api npm run seed
docker compose run --rm api npm test
docker run --rm -v "$PWD:/app" -w /app node:22.13.1-alpine npm run lint
docker run --rm --network host -v "$PWD:/work" -w /work \
  mcr.microsoft.com/playwright:v1.55.1-noble npx playwright test
./scripts/test-ldaps-functional.sh
./scripts/test-authorization-functional.sh
./scripts/test-restore-functional.sh
./scripts/backup.sh backups/$(date +%Y%m%d-%H%M%S)
docker compose logs -f
```

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
Attribut utilisateur sAMAccountName
Attribut groupe      cn
Attribut email       mail
```

### LDAP

Sélectionner `LDAP`, généralement sur TCP/389, laisser le certificat CA vide,
puis enregistrer. LDAP transmet le bind sans protection TLS : il ne doit être
utilisé que sur un réseau isolé et maîtrisé. Préférer LDAPS.

### LDAPS

1. Exporter uniquement le certificat public de la CA qui a signé le certificat
   LDAPS des contrôleurs (`.pem`, `.crt` ou `.cer`). Les encodages PEM textuel
   et X.509 DER binaire sont acceptés. Ne jamais exporter la clé privée.
2. Dans **Administration → Certificats CA**, importer et tester cette CA.
3. Dans **Synchronisation LDAP**, sélectionner `LDAPS`, TCP/636 et la CA
   importée.
4. Utiliser comme contrôleurs les noms DNS présents dans le SAN des
   certificats ; les adresses IP ou contournements TLS sont refusés.
5. Enregistrer, cliquer **Tester**, puis **Synchroniser**.

Le test vérifie DNS, TCP, chaîne TLS, nom d’hôte, bind et recherches. Après une
synchronisation réussie, les groupes sont proposés dans la recherche de
**Groupes Active Directory** et dans la création des règles. Le secret de bind
est chiffré en AES-256-GCM et n’est jamais renvoyé par l’API.

Test LDAPS reproductible sans l’AD de production :

```bash
./scripts/test-ldaps-functional.sh
```

## Session SSO et diagnostic

Le frontal SSO approuvé peut transmettre `X-Auth-Session-Expires` au format
ISO-8601 en plus de l’identité et des groupes. Une date invalide ou expirée est
refusée par l’API. Configurer les destinations de reprise et de déconnexion
dans `.env` :

```dotenv
SSO_LOGIN_URL=https://sso.entreprise.local/login
SSO_LOGOUT_URL=https://sso.entreprise.local/logout
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
