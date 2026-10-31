# Gestion documentaire et métadonnées GED

## Administration et modération

Les vues Documents et Métadonnées proposent **Liste** et **Fenêtres**. Le même
choix est mémorisé dans le navigateur pour les deux espaces. La présentation
s'adapte au mobile sans modifier les droits ni multiplier les formulaires.

Chaque page demande **20 documents** au serveur. **Précédent** et **Suivant**
chargent les autres pages ; une dernière page peut contenir moins de 20 éléments.
Les filtres sont conservés pendant la pagination. Le changement de présentation
ne republie aucun document et ne modifie ni son état ni sa version.

## Métadonnées facultatives

Depuis `/admin#metadata` ou `/moderator#moderator-metadata`, ouvrez une fiche pour
modifier titre, description, langue, catégorie et champs personnalisés. Un
changement de métadonnées ne nécessite pas de fichier et ne crée pas de version.
Le titre et la langue restent les champs documentaires usuels ; **aucun champ
de métadonnée métier n'est obligatoire**. Les modèles sont facultatifs.

| Clé standard       | Exemple               | Usage                                                |
| ------------------ | --------------------- | ---------------------------------------------------- |
| `ged.reference`    | `POL-001`             | Référence documentaire                               |
| `ged.owner`        | `Documentation team`  | Responsable                                          |
| `ged.documentType` | `policy`              | `policy`, `procedure`, `guide`, `evidence`, `record` |
| `ged.keywords`     | `ISO 27001; security` | Recherche et mots-clés cliquables                    |
| `ged.reviewDate`   | `2027-10-01`          | Date descriptive, sans création automatique de revue |

Une fiche accepte au maximum 20 champs texte, avec des noms de 64 caractères et
des valeurs de 1 000 caractères maximum. Ajoutez explicitement un champ préparé
avec **Ajouter**, puis **Enregistrer** la fiche. Les autres modifications ne
doivent pas écraser une fiche modifiée entre-temps : un conflit demande de la
rouvrir pour comparer, en conservant les valeurs saisies.

## Recherche, favoris et recherches enregistrées

La recherche générale couvre titres, descriptions et noms/valeurs de métadonnées
sans tenir compte de la casse. **Recherche GED** cible référence, responsable,
type, mots-clés et plage de dates. Ces filtres ciblés respectent la casse et
portent sur les clés `ged.*` ; les champs personnalisés restent accessibles par
la recherche générale. Les critères se combinent avec langue, catégorie et
favoris, selon les ACL. **Enregistrer la recherche** conserve les critères GED.

Exemple : `/explorer?owner=Documentation&documentType=policy&favorites=true`.
Les dates utilisent `YYYY-MM-DD` ; une plage inversée ou une date invalide est
refusée. Les documents supprimés ou hors du périmètre autorisé restent exclus.

## Modification par lot

1. Ouvrir **Modifier un lot de métadonnées** et sélectionner les documents de la
   page courante. L'API limite chaque demande à 50 documents.
2. Ajouter uniquement les champs à remplacer, par exemple `ged.owner` avec une
   nouvelle valeur. Les autres champs sont conservés. Une valeur vide efface la
   valeur du champ ; ne pas ajouter ce champ si aucune modification n'est voulue.
3. Choisir éventuellement une catégorie cible. Les documents doivent appartenir
   au même espace pour changer leur catégorie ; les déplacements entre espaces
   ne font pas partie de cette opération.
4. **Prévisualiser les changements**, contrôler chaque valeur avant/après, puis
   **Confirmer le lot**. Fermer l'aperçu pour corriger la sélection ou les valeurs.

L'API revérifie le droit de modification de chaque document et de la catégorie
cible. Elle exige les dates `expectedUpdatedAt` renvoyées par l'aperçu. Un conflit
ou une erreur annule toutes les écritures du lot ; données et audit sont écrits
dans la même transaction. Le lot ne publie pas les documents et ne crée pas de
version de fichier.

Exemple de corps pour `POST /api/documents/bulk/preview` :

```json
{
  "documents": [{ "id": "00000000-0000-4000-8000-000000000001" }],
  "metadata": { "ged.owner": "Documentation team" }
}
```

Utiliser les vrais identifiants renvoyés par la liste autorisée. Pour
`POST /api/documents/bulk/apply`, reprendre la sélection et les mêmes changements,
en ajoutant à chaque document son `expectedUpdatedAt` exact issu de l'aperçu.
Les requêtes JSON exigent `Content-Type: application/json` et une session valide.

## Historique et doublons

L'**Historique des modifications** de l'éditeur indique auteur, date, action et
noms des champs modifiés, à raison de 20 événements par page. Il est réservé aux
éditeurs et distinct de la chronologie des versions. Les anciennes valeurs et
les détails techniques sensibles de l'audit ne sont pas restitués.

Un dépôt initial calcule le SHA-256 des octets du fichier et recherche un fichier
strictement identique parmi les documents modifiables par le déposant. Une
réponse `409 DOCUMENT_DUPLICATE` propose d'ouvrir l'existant ou de gérer une
nouvelle version. Les documents invisibles et ceux de la corbeille ne sont pas
révélés. Le dépôt explicite d'une nouvelle version reste possible.

## Suivi et rappels

**Suivi documentaire** compte les documents sans responsable, les champs
conseillés non renseignés et les revues en retard dans le périmètre d'édition.
Ces compteurs ne rendent aucun champ obligatoire.

L'administrateur peut régler les rappels via **Configurer les rappels** :

```json
{
  "enabled": true,
  "leadDays": 30,
  "overdueDays": 7,
  "publicationRepeatDays": 0
}
```

Les valeurs sont des jours entiers de 0 à 365. La répétition des rappels de
publication vaut `0` par défaut : un seul rappel. Une valeur positive permet la
répétition des revues toujours en attente. Les revues terminées et documents
archivés/supprimés sont exclus. Une livraison échouée ne marque pas le rappel
comme envoyé. Le worker relit les réglages sans redéploiement ; les canaux
documentaires et destinataires existants restent appliqués. Les alertes techniques
Teams/disque/services constituent une configuration distincte.

## Exploitation et vérification

La migration additive `20261031120000_document_lookup_indexes` crée des index sur
`StoredFile.sha256` et `AuditEvent(resource, occurredAt)` sans modifier les données
documentaires ou ACL. Sauvegarder PostgreSQL avant de lancer les migrations avec
les identifiants d'exploitation prévus, puis contrôler les neuf services.

La recette couvre les vues Liste/Fenêtres, les 20 résultats, Précédent/Suivant,
les conflits d'édition, la préservation des autres champs, les refus d'ACL et
l'absence de nouvelle version après modification des métadonnées.

Le workflow **Validated release** ne publie qu'après réussite de la qualité, des
builds, de la recette Docker isolée, de la performance et du contrôle des images.
Un échec Prettier ou Knip bloque la publication ; il n'est pas ignoré. Le tag doit
correspondre à la version de `package.json` et ne doit pas déjà exister.

## English quick reference

Administrators and moderators share List/Windows document views, remembered in
the browser. Both request 20 items per page and support Previous/Next without
changing document state or file versions. Optional `ged.*` metadata supports
targeted search, favorites and saved searches. Bulk editing previews changes,
preserves other fields and applies atomically after checking source/destination
ACLs and preview timestamps. Editors can inspect change history; SHA-256 duplicate
detection only reveals editable existing documents. Administrators configure
annual and publication-review reminders separately from technical alerts.

See [administration](administration.md), [API routes](routes.md),
[versioning](VERSIONING.md) and [anonymized screenshots](screenshots/README.md).
