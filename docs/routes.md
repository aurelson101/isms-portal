# Routes applicatives

Toutes les routes API sont préfixées par `/api` au niveau du reverse proxy.
Les ressources non autorisées répondent `404` afin de ne pas révéler leur
existence. Les routes d’administration exigent un compte administrateur
enregistré.

## Portail

| Méthode | Route                         | Fonction                                    |
| ------- | ----------------------------- | ------------------------------------------- |
| GET     | `/`                           | Portail utilisateur                         |
| GET     | `/admin`                      | Administration, protégée par `auth_request` |
| GET     | `/api/me`                     | Identité et espaces autorisés               |
| PUT     | `/api/me/preferences`         | Langue préférée                             |
| GET     | `/api/auth/config`            | Configuration publique SSO/repli            |
| POST    | `/api/auth/login`             | Connexion administrateur locale             |
| POST    | `/api/auth/logout`            | Fermeture de la session locale              |
| GET     | `/api/documents`              | Liste, recherche, filtre et capacités       |
| GET     | `/api/documents/:id`          | Métadonnées autorisées                      |
| GET     | `/api/documents/:id/content`  | Aperçu avec permission `preview`            |
| GET     | `/api/documents/:id/download` | Fichier avec permission `download`          |

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
- `/api/admin/accounts` et `/api/admin/accounts/me/*` pour comptes, profil,
  mot de passe et MFA ;

La recette Playwright parcourt les routes GET publiques et administratives,
teste un identifiant de document inexistant, puis vérifie les routes de contenu
et de téléchargement d’un document autorisé.

Le filtre de catégorie du portail utilise `categoryId` avec `space`. Les anciens
liens avec `category=<slug>` restent acceptés seulement lorsqu'ils désignent une
catégorie unique parmi les espaces accessibles ; un slug ambigu est refusé afin
de ne jamais mélanger deux espaces.

## Gestion documentaire commune aux administrateurs et modérateurs

| Méthode | Route                               | Fonction et contrôle                                                                  |
| ------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| PUT     | `/api/documents/:id/metadata`       | Métadonnées facultatives et champs usuels ; droit `edit`, contrôle de concurrence     |
| GET     | `/api/documents/:id/categories`     | Catégories cibles autorisées à l'éditeur                                              |
| POST    | `/api/documents/bulk/preview`       | Aperçu de 1 à 50 documents, ACL source et destination                                 |
| POST    | `/api/documents/bulk/apply`         | Application transactionnelle avec les dates exactes de l'aperçu                       |
| GET     | `/api/documents/:id/history?page=1` | Auteur, date, action et noms de champs ; réservé aux éditeurs, 20 événements par page |
| GET     | `/api/documents/quality/summary`    | Compteurs limités aux documents modifiables                                           |
| GET/PUT | `/api/documents/quality/reminders`  | Lecture/configuration des rappels, administrateurs uniquement                         |

`GET /api/documents` et `GET /api/admin/documents` acceptent `reference`, `owner`,
`documentType`, `keywords`, `reviewFrom` et `reviewTo`. Les interfaces demandent
`limit=20` et utilisent `page` pour Précédent/Suivant ; Liste/Fenêtres ne crée pas
de route supplémentaire. Les recherches enregistrées conservent ces critères.

Un dépôt initial identique peut répondre `409 DOCUMENT_DUPLICATE`, avec uniquement
la référence d'un document que le déposant peut modifier. Un conflit d'édition
demande de refaire l'aperçu ou de rouvrir la fiche. Voir les
[exemples et limites](document-management.md).
