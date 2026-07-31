# Administration

L’accès HTML `/admin` et toutes les API `/api/admin/*` exigent soit un groupe
défini dans `ISMS_ADMIN_GROUPS`, soit un compte administrateur enregistré. Le
compte principal local est généré hors Git et sert de secours lorsque le SSO
n’est pas disponible. Un administrateur possède toutes les permissions sur
tous les espaces par défaut ; la matrice concerne les utilisateurs standards.

Dans **Configuration**, l’administrateur peut modifier son nom et sa photo,
changer son mot de passe, activer un MFA TOTP, ajouter un compte local ou
rechercher un utilisateur AD puis lui attribuer l’administration. Le compte
principal ne peut pas être supprimé.

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
