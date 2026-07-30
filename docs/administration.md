# Administration

L’accès HTML `/admin` et toutes les API `/api/admin/*` exigent un groupe défini
dans `ISMS_ADMIN_GROUPS`. Aucun compte ni mot de passe administrateur local
n’existe. Un administrateur possède toutes les permissions sur tous les espaces
par défaut ; la matrice concerne les utilisateurs standards.

Les dix sections sont actives :

- tableau de bord alimenté par PostgreSQL ;
- groupes AD et espaces associés ;
- création, modification et suppression des règles ;
- espaces et catégories ;
- dépôt, antivirus, publication, archivage et restauration des documents ;
- connecteurs et synchronisations LDAP/LDAPS ;
- import, test, téléchargement et suppression des CA publiques ;
- audit paginé et export CSV/JSON ;
- santé des services et métriques ;
- paramètres applicatifs, chiffrés lorsqu’ils sont sensibles.

Chaque mutation durable est auditée avec identité, IP, résultat et identifiant de
corrélation, sans mot de passe, fichier ou certificat privé.

Les seuls formats documentaires acceptés sont PDF, DOCX et XLSX. Les
utilisateurs consultent les PDF dans le navigateur et les documents Word/Excel
dans un aperçu local en lecture seule. Le téléchargement n’est affiché que si
la règle d’accès accorde explicitement la permission `download`.
