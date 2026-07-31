# Sécurité

- refus par défaut et contrôle backend de chaque ressource ;
- aucun fournisseur d’identité de démonstration dans le runtime ;
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
- mots de passe administrateur hachés avec scrypt et mot de passe initial
  généré hors Git ;
- sessions administrateur limitées à huit heures dans un cookie `HttpOnly`,
  `SameSite=Strict` et `Secure` en HTTPS ;
- verrouillage du compte pendant quinze minutes après cinq échecs et limitation
  Nginx dédiée à la route de connexion ;
- MFA TOTP optionnel compatible Microsoft Authenticator.

Le cookie administrateur utilise `SameSite=Strict`, ce qui bloque son envoi
dans les requêtes intersites usuelles. `COOKIE_SECURE=true` est obligatoire
derrière HTTPS. Les utilisateurs SSO restent authentifiés par le frontal de
confiance.

Contrôles :

```bash
docker run --rm -v "$PWD:/app" -w /app node:22.13.1-alpine npm audit --omit=dev
docker run --rm -v "$PWD:/app" -w /app node:22.13.1-alpine npm run lint
git grep -nE 'PRIVATE KEY|password=|token=' -- ':!docs/*'
```
