# Sécurité

- refus par défaut et contrôle backend de chaque ressource ;
- identité de démonstration interdite avec `NODE_ENV=production` ;
- en-têtes `X-Auth-*` acceptés uniquement depuis `TRUSTED_PROXY_CIDRS` ;
- compte de service LDAP chiffré en AES-256-GCM ;
- TLS 1.2 minimum, CA et nom d’hôte obligatoires pour LDAPS ;
- validation DTO, limites JSON 256 Kio et upload 50 Mio ;
- extension, MIME, signature de fichier et nom neutralisé ;
- analyse ClamAV avant publication et quarantaine des échecs ;
- CSP, anti-framing, `nosniff`, politique de référent et rate limiting Nginx ;
- images non-root, capacités minimales, réseaux internes et racine en lecture
  seule ;
- logs JSON corrélés et audit expurgé.

L’application n’utilise pas de cookie de session ni d’authentification par
cookie : une protection CSRF par jeton n’est donc pas nécessaire dans le mode
proxy actuel. Si OIDC avec cookie est ajouté au proxy, celui-ci doit imposer
`Secure`, `HttpOnly`, `SameSite` et une protection CSRF.

Contrôles :

```bash
docker run --rm -v "$PWD:/app" -w /app node:22.13.1-alpine npm audit --omit=dev
docker run --rm -v "$PWD:/app" -w /app node:22.13.1-alpine npm run lint
git grep -nE 'PRIVATE KEY|password=|token=' -- ':!docs/*'
```
