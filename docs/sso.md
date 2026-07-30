# SSO

Production recommandée : Keycloak ou Entra ID en OIDC, ou Nginx/Apache avec
Kerberos SPNEGO. Le proxy supprime tout en-tête entrant `X-Auth-*`, authentifie
l’utilisateur, puis transmet identité et groupes à l’API depuis une plage CIDR
approuvée. Aucun mot de passe utilisateur local n’existe.

