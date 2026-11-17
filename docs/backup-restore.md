# Sauvegarde et restauration

Une sauvegarde contient :

- PostgreSQL au format personnalisé `pg_dump` : métadonnées, règles, audit,
  configuration et CA publiques ;
- une archive `documents.tar` du volume documentaire ;
- `.env.example` et `docker-compose.yml` sans secret ;
- un manifeste SHA-256.

Le script refuse une sauvegarde dite complète si une cible S3 ou SMB est configurée :
les objets de ces cibles ne sont pas contenus dans `documents.tar`. Sauvegarder
séparément ces cibles et valider leur restauration avant de les utiliser en
production.

```bash
./scripts/backup.sh backups/isms-backup
./scripts/verify-backup.sh backups/isms-backup
```

Le dossier cible doit être vide. Les permissions sont limitées au propriétaire.
Chiffrer ensuite la sauvegarde avec l’outil approuvé de l’entreprise et la
conserver hors du serveur.

Restaurer d’abord dans un environnement de test :

```bash
./scripts/restore.sh backups/isms-backup
```

Une restauration sur une pile de production exige un terminal et la saisie
explicite de `RESTORE` :

```bash
./scripts/restore.sh backups/isms-backup --production
```

Après restauration, redémarrer API/worker, contrôler `/api/health/ready`, ouvrir
un document et vérifier règles, audit et synchronisation.

La recette automatisée crée une sauvegarde, démarre une pile Docker isolée sur
TCP/18080, restaure PostgreSQL et les documents, vérifie santé, métadonnées et
contenu, puis supprime ses conteneurs, réseaux et volumes :

```bash
./scripts/test-restore-functional.sh
```

Exécuter cette recette depuis un checkout jetable avec ses propres secrets de
test, générés par `./scripts/generate-secrets.sh`. Elle refuse un répertoire
contenant déjà `.env.app` ou `.env.redis`. Le même projet Compose et les mêmes
fichiers de configuration isolés sont transmis à la sauvegarde, à la restauration
et au nettoyage ; aucune commande ne doit cibler la pile de production.

Le workflow GitHub **Resilience drills** exécute cette recette périodiquement et
sur déclenchement manuel. Son rapport `restore-results` permet de contrôler le
résultat. Le job **performance** de la CI mesure séparément les réponses complètes
sur un jeu de données de test et publie `performance-results`.
