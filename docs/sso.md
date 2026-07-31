# SSO

L’API expose une abstraction `IdentityProvider` avec deux modes :

- identité transmise par un proxy SSO de confiance.
- session d’un administrateur local de secours ;

En production, placer oauth2-proxy/Keycloak/Entra ID ou un frontal
Kerberos/SPNEGO devant Nginx. Le frontal :

1. supprime les en-têtes `X-Auth-*` venant du client ;
2. authentifie automatiquement l’utilisateur ;
3. récupère ses groupes AD ;
4. transmet `X-Auth-Mail`, `X-Auth-Name` et `X-Auth-Groups` ; la valeur
   `X-Auth-Mail`, issue de l’attribut AD `mail`, devient l’identité stable du
   profil utilisateur normal ;
5. utilise une adresse comprise dans `TRUSTED_PROXY_CIDRS`.

La configuration Nginx fournie neutralise volontairement ces en-têtes tant
qu’aucune passerelle SSO n’est raccordée. Adapter ce bloc lors du déploiement,
sans jamais accepter directement les en-têtes Internet.

Les utilisateurs standards n’ont aucun mot de passe local. En cas d’identité
absente, proxy non approuvé ou groupes périmés, l’accès documentaire est
refusé et la page `/login` propose uniquement la connexion utilisateur. Le
compte administrateur de secours est isolé sur `/admin/login`. Son mot de passe
initial est généré hors Git avec `./scripts/generate-secrets.sh --admin-only`.

Pour Microsoft 365, définir `SSO_LOGIN_URL` vers le point d’entrée du proxy
OIDC/Entra. La page de connexion affiche alors cette méthode sans imposer de
redirection automatique.

## Connexion AD directe sans UPN

L’utilisateur saisit uniquement son login court. L’API le recherche avec
l’attribut configurable `sAMAccountName`, effectue un bind utilisateur
exclusivement en LDAPS, puis utilise `mail` comme identité du profil. Les
groupes directs ou imbriqués sont chargés à la connexion et alimentent le même
moteur d’autorisation que le SSO. Le mot de passe AD n’est jamais conservé.

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
