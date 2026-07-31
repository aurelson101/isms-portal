# Sauvegarde et restauration

Une sauvegarde contient :

- PostgreSQL au format personnalisé `pg_dump` : métadonnées, règles, audit,
  configuration et CA publiques ;
- une archive `documents.tar` du volume documentaire ;
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

La recette automatisée crée une sauvegarde, démarre une pile Docker isolée sur
TCP/18080, restaure PostgreSQL et les documents, vérifie santé, métadonnées et
contenu, puis supprime ses conteneurs, réseaux et volumes :

```bash
./scripts/test-restore-functional.sh
```
