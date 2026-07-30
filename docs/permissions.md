# Permissions

Une règle associe un groupe AD et un espace avec :

`showMenu`, `read`, `search`, `preview`, `download`, `upload`, `edit`,
`publish`, `archive` et `administer`.

Pour un utilisateur standard, l’absence de règle vaut refus. L’API filtre
espaces, listes, recherche plein texte, métadonnées, aperçu, téléchargement et
URL directe. Une ressource interdite retourne 404 afin de ne pas confirmer son
existence.

Une identité membre de `ISMS_ADMIN_GROUPS` possède toutes les permissions par
défaut, même sans règle par espace. L’accès à `/admin` est en plus contrôlé au
proxy et par le garde NestJS.

Toute création, modification ou suppression de règle prend effet
immédiatement et produit un événement d’audit.
