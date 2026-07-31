# SSO

L’API expose une abstraction `IdentityProvider` avec deux implémentations :

- démonstration, uniquement hors production ;
- identité transmise par un proxy SSO de confiance.

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

Aucun mot de passe utilisateur local n’existe. En cas d’identité absente,
proxy non approuvé ou groupes périmés, l’API refuse l’accès.

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
fournisseur `trusted-proxy` depuis un CIDR approuvé. Le fournisseur local
retourne `source: "demo"` et `ssoConnected: false`. Le portail et
l’administration utilisent cet indicateur pour afficher respectivement
`SSO connecté`/`SSO connected` ou `Session de démonstration`/`Demo session`.
Les groupes et claims bruts ne sont pas ajoutés à cette réponse.
