# Dépannage

`docker compose ps` indique les services malsains. Examiner
`docker compose logs api reverse-proxy`. Tester DNS/TCP/TLS séparément pour
LDAPS. Ne jamais contourner la validation TLS. Une absence de groupe produit
volontairement un refus ; vérifier la synchronisation et le nom exact du groupe.

Après une version historique ayant utilisé `prisma db push`, l’API détecte le
schéma existant et enregistre automatiquement la migration de référence avant
`prisma migrate deploy`. Ne pas supprimer le volume PostgreSQL pour contourner
une erreur de migration.
