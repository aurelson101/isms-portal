# Dépannage

`docker compose ps` indique les services malsains. Examiner
`docker compose logs api reverse-proxy`. Tester DNS/TCP/TLS séparément pour
LDAPS. Ne jamais contourner la validation TLS. Une absence de groupe produit
volontairement un refus ; vérifier la synchronisation et le nom exact du groupe.

