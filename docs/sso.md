# SSO

L’API expose une abstraction `IdentityProvider` avec deux modes :

- identité transmise par un proxy SSO de confiance.
- session d’un administrateur local de secours ;

Le fichier `docker-compose.sso.yml` ajoute oauth2-proxy 7.15.3 pour Microsoft
Entra ID et charge `deploy/nginx/nginx.sso.conf`. Le frontal :

1. supprime les en-têtes `X-Auth-*` venant du client ;
2. authentifie automatiquement l’utilisateur ;
3. transmet l’attribut `mail` validé à l’API ;
4. transmet `X-Auth-Mail`, `X-Auth-Name` et `X-Auth-Groups` ; la valeur
   `X-Auth-Mail`, issue de l’attribut AD `mail`, devient l’identité stable du
   profil utilisateur normal ;
5. utilise une adresse comprise dans `TRUSTED_PROXY_CIDRS`.

La configuration Nginx standard neutralise ces en-têtes. La variante SSO les
accepte uniquement depuis la sous-requête oauth2-proxy interne. L’API résout
ensuite le compte par correspondance exacte sur l’attribut AD `mail` avec le
bind de service LDAP/LDAPS, charge les groupes directs ou imbriqués et fusionne
ce résultat avec les claims éventuels. La résolution est mise en cache pendant
`SSO_DIRECTORY_CACHE_TTL_SECONDS` et n’accorde aucun droit lorsque le compte
est absent ou ambigu. Les recherches concurrentes d’une même identité sont
coalescées ; les absences et pannes utilisent séparément
`SSO_DIRECTORY_NEGATIVE_CACHE_TTL_SECONDS`, limité à trente secondes par
défaut.

Les utilisateurs standards n’ont aucun mot de passe local. En cas d’identité
absente, proxy non approuvé ou groupes périmés, l’accès documentaire est
refusé et la page `/login` propose uniquement la connexion utilisateur. Le
compte administrateur de secours est isolé sur `/admin/login`. Son mot de passe
initial est généré hors Git avec `./scripts/generate-secrets.sh --admin-only`.

Pour Microsoft 365, déclarer dans Entra l’URI
`https://<portail>/oauth2/callback`, ajouter la revendication facultative
`email` au jeton d’identité et définir `SSO_LOGIN_URL=/oauth2/start?rd=/`. La
racine du portail déclenche alors le SSO automatiquement. `/login` reste le
repli LDAP/LDAPS manuel et `/admin/login` le repli administrateur local.

## Activation progressive Entra ID (postes Entra et hybrides)

L'onglet administrateur `/admin#sso` indique le mode de connexion et propose
deux tests sans ouvrir de session : découverte OIDC du tenant et disponibilité
du proxy SSO. Un résultat positif ne valide ni le secret client, ni
l'affectation Entra, ni la correspondance des groupes AD ; un essai avec un
compte pilote reste nécessaire. Les tests sont réservés aux administrateurs.

L'application `ISMS Portal SSO` demande uniquement les permissions déléguées
OIDC `openid profile email`, visibles sous Microsoft Graph dans Entra et
consenties pour le tenant. Aucun accès aux données Graph n'est nécessaire :
les groupes sont résolus via le connecteur AD de l'ISMS. Ne pas ajouter `User.Read`, `Mail.Send`
ou des permissions d'application Graph au seul motif d'activer le SSO.
L'enregistrement Entra peut posséder un certificat, mais oauth2-proxy 7.15.3
utilise ici un secret client ; son fournisseur Entra ne propose pas
`private_key_jwt` pour ce flux. La bascule vers un certificat requiert un
connecteur OIDC compatible, son test complet et une migration contrôlée.

La production utilise par défaut la connexion AD directe. Le proxy SSO est une
surcouche facultative : ne pas l'activer avant d'avoir testé la connexion d'un
utilisateur pilote et le repli AD. Une ouverture de session Windows seule ne
prouve pas qu'un navigateur possède un jeton Entra utilisable ; contrôler le
PRT du poste pilote avec `dsregcmd /status` (`AzureAdPrt : YES`) et tester Edge.

1. Créer une application **mono-tenant** `ISMS Portal SSO` dans Entra ID, de
   type Web, avec l'URI de redirection exacte
   `https://isms.example.com/oauth2/callback`. Ajouter la revendication
   facultative `email` au jeton d'identité. Dans l'application d'entreprise,
   exiger une affectation et n'affecter d'abord qu'un groupe pilote.
   Le modèle de revendication se trouve dans
   `deploy/entra-optional-claims.json`. Les scopes OIDC délégués `openid`,
   `profile` et `email` suffisent ; aucun accès aux données Graph n'est requis.
2. Placer le Tenant ID, le Client ID et le secret client dans `.env` sur le
   serveur, jamais dans Git. Vérifier aussi
   `OAUTH2_PROXY_REDIRECT_URL=https://isms.example.com/oauth2/callback` et
   un `OAUTH2_PROXY_COOKIE_SECRET` aléatoire. Le proxy stocke ses sessions dans
   Redis DB 2, séparément des clés applicatives. Le secret n'est pas transmis
   aux autres conteneurs par `env_file`.
3. Activer la surcouche Compose SSO et définir
   `SSO_PILOT_URL=/oauth2/start?rd=/` dans `.env.app`, en laissant
   `SSO_LOGIN_URL` **vide** et `SSO_LOGIN_VERIFIED=false`. Définir aussi
   `SSO_LOGOUT_URL=/oauth2/sign_out?rd=/login` pour la session Entra. La page `/login` conserve le formulaire AD et
   ne montre pas encore le bouton SSO. Les pilotes ouvrent directement
   `https://isms.example.com/oauth2/start?rd=/` pour l'essai. Aucun
   utilisateur n'est redirigé automatiquement. Les sessions AD restent valides.
4. Vérifier sur un poste pilote : connexion Entra, correspondance exacte avec
   l'attribut AD `mail`, groupes et ACL, lecteur documentaire, administration
   de l'utilisateur, déconnexion, et connexion AD via `/login?local=1` si Entra
   est indisponible. Un utilisateur non affecté à l'application doit être refusé.
   L'administration reste accessible par la connexion AD ou locale pendant
   le pilote ; ne pas supposer que le cookie Entra suffit pour `/admin`.
5. Après cet essai complet, définir `SSO_LOGIN_VERIFIED=true` dans `.env.app`
   et redéployer l'API : le bouton « Connexion SSO » apparaît sur `/login`
   uniquement si le proxy répond. Le bouton disparaît si le proxy tombe.
   Un simple test de découverte Entra ou du proxy ne suffit pas à valider le
   parcours de connexion utilisateur.
6. Pour la redirection automatique, définir aussi
   `SSO_LOGIN_URL=/oauth2/start?rd=/` dans `.env.app` pour la redirection
   automatique depuis `/login`. Retirer cette seule variable pour revenir au
   mode pilote sans couper la connexion AD. Pour désactiver entièrement la
   surcouche, revenir aux fichiers Compose de production habituels et laisser
   `SSO_PILOT_URL` vide.

La surcouche ne s'active pas tant que l'application Entra et ses secrets ne sont
pas provisionnés. Une simple modification de `.env` sans déploiement contrôlé
et tests de connexion n'est pas une activation du SSO.

## Connexion AD directe par login ou attribut mail

L’utilisateur saisit son login court ou l’adresse exacte de son attribut AD
`mail`. L’API effectue une recherche exacte et échappée sur l’attribut de login
configurable (`sAMAccountName` par défaut) et sur `mail`, résout le DN du compte,
puis effectue le bind utilisateur. Le connecteur peut utiliser LDAPS ou LDAP ;
LDAP en clair ne doit être activé que sur un réseau interne isolé, car il ne
protège pas le mot de passe par TLS. `mail` reste l’identité canonique du profil.
Les groupes directs ou imbriqués alimentent le même moteur d’autorisation que
le SSO et le mot de passe AD n’est jamais conservé.

## Détection de la session

`GET /api/me` retourne un objet non sensible :

```json
{
  "authentication": {
    "source": "trusted-proxy",
    "ssoConnected": true
  }
}
```

`ssoConnected` vaut `true` uniquement lorsque l’identité a été acceptée par le
fournisseur `trusted-proxy` depuis un CIDR approuvé. Le compte de secours
retourne `source: "local-admin"` et une connexion directe AD retourne
`source: "directory-session"`, avec `ssoConnected: false`. Le portail et
l’administration distinguent clairement ces sessions. Les groupes et claims
bruts ne sont pas ajoutés à cette réponse.
