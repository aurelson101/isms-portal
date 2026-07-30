# Sauvegarde et restauration

Une sauvegarde contient :

- PostgreSQL au format personnalisé `pg_dump` : métadonnées, règles, audit,
  configuration et CA publiques ;
- tous les objets du bucket MinIO ;
- `.env.example` et `docker-compose.yml` sans secret ;
- un manifeste SHA-256.

```bash
./scripts/backup.sh backups/20260730-120000
./scripts/verify-backup.sh backups/20260730-120000
```

Le dossier cible doit être vide. Les permissions sont limitées au propriétaire.
Chiffrer ensuite la sauvegarde avec l’outil approuvé de l’entreprise et la
conserver hors du serveur.

Restaurer d’abord dans un environnement de test :

```bash
./scripts/restore.sh backups/20260730-120000
```

Une restauration sur une pile de production exige un terminal et la saisie
explicite de `RESTORE` :

```bash
./scripts/restore.sh backups/20260730-120000 --production
```

Après restauration, redémarrer API/worker, contrôler `/api/health/ready`, ouvrir
un document et vérifier règles, audit et synchronisation.
