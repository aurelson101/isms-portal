# Routes applicatives

Toutes les routes API sont préfixées par `/api` au niveau du reverse proxy.
Les ressources non autorisées répondent `404` afin de ne pas révéler leur
existence. Les routes d’administration exigent un groupe déclaré dans
`ISMS_ADMIN_GROUPS`.

## Portail

| Méthode | Route | Fonction |
| --- | --- | --- |
| GET | `/` | Portail utilisateur |
| GET | `/admin` | Administration, protégée par `auth_request` |
| GET | `/api/me` | Identité et espaces autorisés |
| PUT | `/api/me/preferences` | Langue préférée |
| GET | `/api/documents` | Liste, recherche, filtre et capacités |
| GET | `/api/documents/:id` | Métadonnées autorisées |
| GET | `/api/documents/:id/content` | Aperçu avec permission `preview` |
| GET | `/api/documents/:id/download` | Fichier avec permission `download` |

## Administration

Les préfixes suivants couvrent les opérations réellement implémentées :

- `/api/admin/groups` : recherche, ajout et suppression locale ;
- `/api/admin/access-rules` : CRUD des règles ;
- `/api/admin/spaces` et `/api/admin/categories` : gestion documentaire ;
- `/api/admin/documents` : dépôt, publication, archivage et restauration ;
- `/api/admin/directory-connections` : CRUD, test et synchronisation LDAP/LDAPS ;
- `/api/admin/certificates` : import, test, export public et suppression ;
- `/api/admin/audit`, `/api/admin/settings`, `/api/admin/dashboard` ;
- `/api/health/live`, `/api/health/ready`, `/api/health/details`, `/api/metrics`.

La recette Playwright parcourt les routes GET publiques et administratives,
teste un identifiant de document inexistant, puis vérifie les routes de contenu
et de téléchargement d’un document autorisé.
