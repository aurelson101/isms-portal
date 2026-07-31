# SSO

L’API expose une abstraction `IdentityProvider` avec deux modes :

- identité transmise par un proxy SSO de confiance.
- session d’un administrateur local de secours ;

En production, placer oauth2-proxy/Keycloak/Entra ID ou un frontal
Kerberos/SPNEGO devant Nginx. Le frontal :

1. supprime les en-têtes `X-Auth-*` venant du client ;
2. authentifie automatiquement l’utilisateur ;
3. récupère ses groupes AD ;
4. transmet `X-Auth-User`, `X-Auth-Name` et `X-Auth-Groups` ;
5. utilise une adresse comprise dans `TRUSTED_PROXY_CIDRS`.

La configuration Nginx fournie neutralise volontairement ces en-têtes tant
qu’aucune passerelle SSO n’est raccordée. Adapter ce bloc lors du déploiement,
sans jamais accepter directement les en-têtes Internet.

Les utilisateurs standards n’ont aucun mot de passe local. En cas d’identité
absente, proxy non approuvé ou groupes périmés, l’accès documentaire est
refusé et la page `/login` propose uniquement le compte administrateur de
secours. Le mot de passe initial est généré hors Git avec
`./scripts/generate-secrets.sh --admin-only`.

Pour Microsoft 365, définir `SSO_LOGIN_URL` vers le point d’entrée du proxy
OIDC/Entra. La page de connexion le tente automatiquement une seule fois par
session navigateur ; si le SSO échoue, le formulaire administrateur reste
accessible sans boucle de redirection.

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
retourne `source: "local-admin"` et `ssoConnected: false`. Le portail et
l’administration le distinguent clairement d’une session SSO. Les groupes et
claims bruts ne sont pas ajoutés à cette réponse.
