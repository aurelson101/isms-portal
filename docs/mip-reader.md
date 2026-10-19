# Lecteur Microsoft Information Protection optionnel

## Statut et perimetre

Integration pilote, desactivee par defaut. La presence de ce code dans GitHub
ne signifie pas que le tenant Entra ou le serveur de production est configure.
La compilation et les tests sans tenant ne prouvent pas un dechiffrement reel.
Ne pas activer avant la recette decrite ci-dessous.

Les originaux DOCX/XLSX chiffres par Purview restent sur le stockage ISMS :
aucun depot dans OneDrive ou SharePoint n'est necessaire. Le service utilise
neanmoins Entra ID et Azure Rights Management sur Internet pour obtenir les
autorisations. Ce n'est pas une solution de dechiffrement hors ligne.

Le SDK MIP est une bibliotheque native, pas un lecteur Excel. Le service
optionnel .NET 10/Ubuntu 24.04 transmet temporairement les octets autorises
au lecteur existant apres controle des droits et analyse antivirus.

## Controles appliques

1. Les routes existantes controlent les ACL ISMS avant tout appel MIP.
2. Seule une identite `trusted-proxy`, issue du SSO configure, est acceptee.
   L'email ne vient jamais d'un champ du formulaire ou d'un parametre URL.
   Une session locale ou LDAP seule ne permet pas la delegation MIP, meme
   pour un administrateur. Utiliser le portail avec la session SSO Microsoft.
3. Le SDK cree un moteur propre a l'utilisateur avec `DelegatedUserEmail`
   et `ProtectionOnlyEngine`. Il ne reutilise pas un moteur d'un autre utilisateur.
4. Les droits `VIEW` **et** `EXTRACT` sont obligatoires. Restituer un classeur
   dechiffre dans le navigateur ne permet pas d'empecher sa copie par les
   outils du navigateur. Un document avec interdiction de copie est donc refuse,
   meme s'il est consultable dans Microsoft Excel.
5. ClamAV analyse le contenu dechiffre au depot et a chaque apercu. Une erreur
   du SDK, un refus Purview ou une analyse non CLEAN ne libere pas l'apercu.
6. L'original et son empreinte restent chiffres. Seul cet original est conserve.
   Le telechargement autorise par ISMS retourne l'original chiffre ; le client
   Microsoft du destinataire applique ensuite les droits Purview.
7. Les fichiers temporaires du SDK sont dans un tmpfs et supprimes en fin de
   requete ; les buffers applicatifs sont effaces apres usage. Aucune copie
   dechiffree n'est partagee ou mise en cache. Les reponses sont `no-store`.
   La gestion memoire du runtime et du SDK ne garantit pas un effacement
   physique immediat de toutes leurs copies internes.
   Un tmpfs peut utiliser le swap de l'hote : desactiver le swap pour ce service
   ou exiger un swap chiffre selon la politique de securite de l'organisation.
8. Les decisions d'apercu sont journalisees sans jeton, cle ou contenu du fichier.
   Le service est non-root, en lecture seule, sans port publie, avec une seule
   operation native a la fois, limites CPU/RAM et journaux Docker bornes.

## Preparer Entra et les secrets

Creer une application Entra **dediee a la lecture MIP**. Ne pas reutiliser
l'application d'envoi des emails Microsoft Graph. Le SSO OIDC ne confere pas
automatiquement d'autorisation sur Azure Rights Management.

Ajouter l'autorisation d'application Azure Rights Management Service
`Content.DelegatedReader` et faire accorder le consentement administrateur
par un administrateur habilite. Cette autorisation permet au service de demander
une lecture pour une identite donnee : la frontiere de confiance entre l'API
ISMS et ce service est donc critique. Ne pas ajouter `Content.SuperUser`.
Ce lecteur n'ecrit pas de protection ni de labels : ne pas ajouter de droits
d'ecriture ou de permissions Graph globales pour ce parcours.

Le moteur est configure en mode protection uniquement. Il ne liste pas les
politiques de labels. Si le tenant ou une evolution du SDK exige une permission
supplementaire, arreter la recette et examiner ce besoin plutot que d'accorder
des permissions plus larges par essai/erreur.

Charger le certificat **public** dans l'application Entra. Conserver le certificat
PEM et la cle privee PEM associee sur le serveur, hors Git et hors image Docker :

```text
secrets/mip-certificate.pem
secrets/mip-private-key.pem
secrets/mip-api-key.txt
```

Generer la cle interne avec `openssl rand -hex 32`. Ne pas la copier dans le
README ou dans un ticket. Rendre les fichiers lisibles uniquement par les UID
des conteneurs concernes et les administrateurs d'exploitation. Les secrets
Compose bases sur des fichiers sont des montages : verifier les permissions
reelles de l'hote, ne pas supposer qu'ils constituent un coffre-fort chiffre.

Configurer dans `.env`, jamais dans `.env.example` :

```dotenv
MIP_READER_ENABLED=false
MIP_TENANT_ID=<tenant-guid>
MIP_CLIENT_ID=<application-guid>
MIP_ALLOWED_DOMAINS=example.com
MIP_API_KEY_HOST_FILE=./secrets/mip-api-key.txt
MIP_CERTIFICATE_HOST_FILE=./secrets/mip-certificate.pem
MIP_PRIVATE_KEY_HOST_FILE=./secrets/mip-private-key.pem
```

Le service prend aussi en charge `MIP_CLIENT_SECRET_FILE` si le montage
du certificat est remplace par un secret client. Le fichier Compose fourni
utilise volontairement le certificat. Ne jamais mettre un secret client
directement dans une commande, une variable versionnee ou des logs.

## Deploiement pilote

Verifier les licences MIP/RMS des utilisateurs et du tenant, le certificat,
le consentement, l'horloge et les acces HTTPS aux services Microsoft.
Restreindre les sorties reseau du service aux points de terminaison Microsoft
necessaires selon le cloud utilise. Le lecteur fourni cible le cloud commercial.
Il ne doit jamais etre expose a Internet ou partage avec des applications non fiables.

Effectuer la sauvegarde et les controles habituels avant de reconstruire l'API.
Ne charger le fichier optionnel que pour une installation MIP configuree :

```sh
docker compose -f docker-compose.yml -f docker-compose.production.yml \
  -f docker-compose.sso.yml -f docker-compose.mip.yml --profile mip config --quiet

docker compose -f docker-compose.yml -f docker-compose.production.yml \
  -f docker-compose.sso.yml -f docker-compose.mip.yml --profile mip \
  up -d --build api mip-reader
```

Le service peut demarrer avec `MIP_READER_ENABLED=false` pour verifier ses
controles de base ; cela n'active pas le depot ou la lecture des fichiers chiffres.
`/health/live` prouve seulement que le serveur HTTP repond. `/health/ready`
verifie aussi le chargement natif du SDK, mais ni les permissions du tenant
ni la capacite a dechiffrer un document particulier.

En environnement de recette isole uniquement, passer le drapeau a `true`,
recreer l'API avec les memes fichiers Compose et effectuer les essais ci-dessous.
Une activation sur une installation partagee concerne tous ses utilisateurs SSO
des domaines autorises : ce drapeau n'est pas une liste d'utilisateurs pilotes.

## Recette obligatoire

- Deposer un DOCX puis un XLSX Purview avec un utilisateur autorise disposant
  de VIEW et EXTRACT. Verifier l'analyse, la publication et l'apercu.
- Comparer l'empreinte de l'original avant depot et apres telechargement.
  Verifier que l'original demeure chiffre et qu'aucun fichier clair ne persiste.
- Essayer un autre compte avec ACL ISMS mais sans droit Purview : apercu refuse.
- Essayer un compte avec droit Purview mais sans ACL ISMS : acces refuse avant MIP.
- Essayer une session LDAP ou locale, un compte hors domaines autorises et
  un document VIEW seul : apercu refuse, sans reutilisation d'une autre identite.
- Revoquer les droits, puis refaire les essais selon les delais effectifs RMS.
  Verifier le comportement des licences expirees et de l'acces conditionnel
  propre au tenant. La delegation applicative ne remplace pas une interaction MFA.
- Couper le lecteur ou ses acces Microsoft, puis ClamAV : aucun apercu ne doit
  etre libere. Les fichiers non proteges doivent continuer a fonctionner.
- Tester les nouvelles versions, le refus du filigrane ISMS et un document
  malforme. Ne pas utiliser de donnees sensibles pour les tests de panne.

Ne pas declarer l'integration operationnelle avant ces verifications avec de
vrais fichiers proteges et les identites de test du tenant.

## Limites et retour arriere

- DOCX/XLSX natifs chiffres seulement ; pas de XLS, PDF protege, PFILE,
  mot de passe Office, DKE/HYOK ou garanties pour les clouds souverains.
- Pas de modification des labels, de changement de protection, de comparaison
  textuelle des versions protegees ou de generation de copies filigranees ISMS.
- Pas de promesse de compatibilite avec toutes les politiques Purview.
- Pour revenir en arriere, mettre `MIP_READER_ENABLED=false`, recreer l'API
  avec la meme configuration et arreter le service MIP. Conserver les secrets
  uniquement selon la politique de retention. Les originaux restent stockes ;
  les apercus proteges deviennent indisponibles et les fichiers ordinaires
  continuent d'utiliser le lecteur existant. Ne jamais executer `down -v`.

## Validation du code

Avec un SDK .NET 10 et Node compatibles avec le depot :

```sh
dotnet build integrations/mip-reader/MipReader.csproj -c Release
npx vitest run apps/api/src/mip-reader.spec.ts apps/api/src/mip-preview.spec.ts apps/api/src/documents-authorization.spec.ts apps/api/src/document-antivirus.spec.ts
ISMS_MIP_DOTNET=dotnet npx vitest run integrations/mip-reader/boundary.spec.ts
```

Le test HTTP de frontiere utilise des identifiants factices sans appel au tenant.
Il ne valide pas le SDK natif Ubuntu, les licences ou le dechiffrement Purview.
Le conteneur doit aussi etre construit et teste sur Ubuntu x86-64 avant activation.

Validation du code de cette version : 78 tests cibles, compilation .NET 10 et
TypeScript, controles de style et chargement natif du SDK dans un conteneur
Ubuntu 24.04 isole. Aucun de ces controles ne remplace la recette de
dechiffrement avec des fichiers et utilisateurs reels du tenant.

## References Microsoft

- [Vue d'ensemble du SDK MIP](https://learn.microsoft.com/en-us/information-protection/develop/overview)
- [Permissions requises](https://learn.microsoft.com/en-us/information-protection/develop/concept-api-permissions)
- [Delegation des identites](https://learn.microsoft.com/en-us/information-protection/develop/concept-delegation)
- [Configuration et prerequis](https://learn.microsoft.com/en-us/information-protection/develop/setup-configure-mip)

## English Summary

Optional, disabled-by-default pilot for Purview-encrypted DOCX/XLSX files stored
directly in ISMS. No OneDrive/SharePoint upload is required. A separate Entra
application, certificate and approved delegated-reader permission are required.
ISMS ACLs and the requesting user's VIEW and EXTRACT rights are checked.
Browser preview is not a DRM-enforcing Office client: no-copy documents are denied.
Ciphertext originals are retained, plaintext is scanned and temporary only.
Do not enable in production until real allow/deny tenant tests and native Linux
container validation have passed. SSO alone does not configure MIP access.
