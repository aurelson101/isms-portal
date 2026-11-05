# Administration

L’accès HTML `/admin` et toutes les API `/api/admin/*` exigent un compte
administrateur enregistré dans l'application. Le compte principal local est
généré hors Git et sert de secours lorsque le SSO n’est pas disponible. Un
administrateur possède toutes les permissions sur tous les espaces par défaut ;
la matrice concerne les utilisateurs standards.

Dans **Configuration**, l’administrateur peut modifier son nom et sa photo,
changer son mot de passe, activer un MFA TOTP, ajouter un compte local ou
rechercher un utilisateur AD puis lui attribuer l’administration. Le compte
principal ne peut pas être supprimé.

Les sections comprennent notamment :

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

## Documents sensibles

Le menu **Contenu et accès > Documents sensibles** liste les utilisateurs
autorisés à créer des documents sensibles (import et nouvelle version). Chaque
utilisateur ajouté reçoit un e-mail (modèle « Sensitive document »). Un
utilisateur désigné partage un document sensible publié avec des personnes
nommées : 24 h, 7, 30 ou 90 jours, date précise ou à vie. Le destinataire lit
le document avec son compte, en lecture seule, avec filigrane et sans
téléchargement, et reçoit un rappel environ 48 h avant l'expiration. Les accès
se révoquent à tout moment ; les créations, partages et révocations sont
journalisés. Aucun lien anonyme n'existe pour ces documents.

## Périmètre des modérateurs

Un compte modérateur porte trois autorisations globales (gérer, publier,
supprimer). Les permissions de modification, publication et archivage se
définissent ensuite dans **Règles d'accès** par espace, catégorie et
sous-catégorie (héritage de la catégorie parente sauf règle contraire). Il n'y
a pas de réglage par menu : l'interface suit les droits effectifs et l'API
refuse toute action hors périmètre.

## Documents et métadonnées

Administrateurs et modérateurs disposent des vues **Liste** et **Fenêtres**,
avec **20 documents par page**, **Précédent** et **Suivant**. Le choix de
présentation est mémorisé dans le navigateur et les filtres restent appliqués
pendant la pagination. Les capacités effectives de chaque document restent
contrôlées par l'API.

Les menus `/admin#metadata` et `/moderator#moderator-metadata` proposent des
métadonnées métier facultatives, recherche ciblée, modification par lot avec
aperçu, historique des modifications et suivi documentaire. Les réglages de
rappels sont réservés aux administrateurs. La modification de métadonnées ne
crée pas de nouvelle version du fichier.

La procédure complète, les limites et les exemples JSON sont décrits dans
[Gestion documentaire](document-management.md). Des
[captures anonymisées](screenshots/README.md) illustrent les deux présentations.
