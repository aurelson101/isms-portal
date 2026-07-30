# Architecture

Nginx expose Next.js et l’API NestJS. PostgreSQL conserve métadonnées, règles et
audit ; MinIO conserve les fichiers ; Redis porte cache et tâches ; ClamAV
analyse les imports. Le frontend, l’API et le worker sont sans état.

L’identité est fournie par un fournisseur OIDC/Entra/Keycloak ou par un proxy
Kerberos/SPNEGO explicitement approuvé. Les groupes sont évalués par l’API sur
chaque requête. Une panne d’annuaire ne crée jamais de permission.

