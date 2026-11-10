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

## Fonctions GED (novembre 2026)

**Affichage dans le lecteur** — les fonctions GED sont regroupées dans un bloc
**Gestion documentaire**, replié par défaut au-dessus du lecteur pour lui laisser
la place. Il s'ouvre automatiquement lorsqu'une signature attend le lecteur et
affiche un badge quand le document est réservé.

**Modules activables** — dans **Administration → GED → Options GED → Modules du
lecteur de documents**, un administrateur active ou désactive _Documents liés_,
_Commentaires_ et _Signatures électroniques_ (activés par défaut) ; le _Partage
externe_ se règle dans son propre bloc (désactivé par défaut). Un module
désactivé disparaît du lecteur pour tous et ses routes API répondent `404`. Les
données existantes sont conservées et réapparaissent à la réactivation. Chaque
changement est audité (`ged.features.update`).

**Recherche plein texte** — le worker extrait le texte de chaque version (PDF,
DOCX, XLSX) dans `DocumentVersionContent`, indexé en français (GIN `tsvector`).
La recherche générale couvre ce contenu, uniquement pour la dernière version de
chaque langue. Les fichiers MIP, en quarantaine ou purgés ne sont pas indexés.

**OCR** — un PDF qui contient moins de 40 caractères par page est traité comme
scanné : `pdftoppm` puis `tesseract` (`OCR_LANGUAGES`, `fra+eng` par défaut,
`OCR_MAX_PAGES` = 30). Les fichiers temporaires restent dans `/tmp` du worker et
sont toujours supprimés. L'historique des versions indique « Indexé (OCR) ».

**Réservation (check-out)** — **Réserver pour modification** verrouille le
document 8 heures. Pendant ce temps, seul le titulaire peut déposer ou restaurer
une version (`409` pour les autres). Le titulaire ou un administrateur libère.

**Restauration de version** — l'historique des versions (éditeurs) propose
**Restaurer** : une nouvelle version est créée à partir du fichier choisi (sans
copie), le document repasse en brouillon et doit être republié.

**Liens entre documents** — _Remplace_, _Annexe de_ et _Voir aussi_. La cible se
désigne par son lien copié, sa référence `ged.reference` ou son identifiant. Un
lien n'est affiché qu'aux personnes autorisées à voir les deux documents.

**Commentaires et suivi** — chaque lecteur peut commenter (page facultative) et
**Suivre** un document. Les abonnés reçoivent une notification du portail à chaque
publication et à chaque nouveau commentaire. Auteur et administrateur suppriment.

**Types documentaires** — `/admin#ged`. Un type (`ged.documentType` = identifiant)
définit des champs obligatoires, contrôlés à l'enregistrement des métadonnées et
avant toute publication, et un préfixe facultatif qui attribue automatiquement
`ged.reference` (`PRO-001`, `PRO-002`…). Une valeur sans type défini reste libre.

**Export en masse** — `/admin#ged` (administrateurs) : ZIP de la dernière version
saine de chaque document, avec `manifest.csv` et `manifest.json` (métadonnées,
SHA-256, horodatage). Limites : 1 000 documents, 2 Go. Chaque export est audité.

**Rétention et destruction** — le worker passe en `DUE` les rétentions échues
sans gel légal. Après demande puis approbation par un **second** administrateur,
le worker détruit réellement : fichiers supprimés du stockage, texte indexé,
commentaires, liens et abonnements effacés. Il conserve une fiche minimale
(`destroyedAt`) et un procès-verbal `document.destroyed` (titres, motif,
demandeur, approbateur, noms et SHA-256 des fichiers) dans le journal scellé. Un
document détruit ne peut plus être restauré depuis la corbeille. La suppression
définitive est refusée sous gel légal ou avant la fin de la rétention.

**Valeur probante** — chaque événement d'audit est chaîné au précédent (SHA-256,
`chainIndex`/`prevHash`/`chainHash`) et la chaîne est scellée toutes les
`AUDIT_SEAL_INTERVAL_MINUTES`. L'horodatage RFC 3161 est **facultatif** :
`/admin#ged` > **Options GED** l'active, définit l'URL de l'autorité (idéalement
qualifiée eIDAS), l'identifiant, le mot de passe (chiffré, jamais réaffiché) et
l'OID de politique, et **Tester l'autorité** demande un jeton réel. Sans réglage
enregistré, les variables `TSA_*` servent de repli. Une fois actif, chaque sceau,
chaque fichier et chaque signature reçoit un jeton d'horodatage.
**Vérifier l'intégrité** recalcule toute la chaîne. Les jetons `.tsr` se
vérifient hors ligne :

```sh
openssl ts -verify -token_in -in jeton.tsr -digest <sha256> -CAfile chaine-tsa.pem
```

Cette chaîne apporte l'intégrité et l'horodatage attendus par la NF Z42-013 ; la
conformité complète dépend aussi de l'organisation (procédures, stockage WORM,
audit de l'archive), hors du périmètre de l'application.

**Formats** — PDF, DOCX, XLSX, PPTX, PNG, JPEG, TXT et CSV (50 Mo). Le contenu
réel est contrôlé (signature binaire, UTF-8 pour le texte). Les documents
sensibles restent limités à PDF, DOCX et XLSX, seuls formats filigranables. Le
texte des PPTX/TXT/CSV est indexé ; les images passent par l'OCR.

**Versions majeures et mineures** — chaque dépôt ou restauration crée une version
mineure (`0.1`, `1.1`…) ; la publication transforme la dernière version de chaque
langue en version majeure (`1.0`, `2.0`…). Les versions existantes ont été
reprises comme majeures (`vN` → `N.0`).

**Signature électronique simple** — un éditeur demande la signature d'une version
à une liste d'e-mails. Chaque signataire, authentifié par le SSO, signe ou refuse
depuis la fiche après un consentement explicite. Une empreinte de preuve
(demande, version, SHA-256 du fichier, signataire, date, adresse IP) est
enregistrée, horodatée si l'option est active, et chaînée dans le journal. Le
**Certificat de signature (PDF)** récapitule ces preuves. Il s'agit d'une
signature électronique simple (eIDAS art. 3.10), pas d'une signature qualifiée.

**Partage externe** — désactivé par défaut ; un administrateur l'autorise dans
**Options GED** (durée maximale 1 à 90 jours). Un éditeur disposant du droit de
téléchargement crée un lien temporaire pour un document publié et non sensible
(hors fichiers MIP), avec durée et nombre de téléchargements maximum. Le jeton
n'est affiché qu'une fois, seul son hash est stocké. `/api/public/share/<jeton>`
est servi sans SSO par nginx (GET uniquement, 20 requêtes/minute par IP, en-têtes
d'identité effacés). Chaque accès est audité. Révoquer, dépublier, rendre
indisponible le fichier ou désactiver l'option invalide immédiatement les liens.

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

## Documents sensibles et liens SharePoint

Dans le formulaire de dépôt du portail, de l'administration ou de l'espace
modérateur, choisir **Fichier** ou **Lien / vidéo SharePoint**. Pour un lien,
coller l'URL HTTPS SharePoint et vérifier l'aperçu avant de créer le brouillon.
Publier ensuite le document depuis sa liste de gestion. Le lecteur propose la
vidéo intégrée lorsqu'un lien compatible est reconnu. Sa taille s'adapte à
l'écran et les outils GED restent dans un volet horizontal repliable. Utiliser
les commandes de la vidéo pour le plein écran ou **Ouvrir dans le navigateur** ;
aucun bouton d'ouverture supplémentaire n'est affiché. Les liens ordinaires
conservent leur bouton externe. L'authentification et les permissions SharePoint
restent applicables. Les boutons de langue utilisent les langues de la fiche ;
pour un lien sans fichier, la version est indiquée **Gérée à la source**.

Dans **Documents sensibles**, sélectionner un document publié puis ouvrir son
partage. Choisir **Utilisateur / e-mail** pour rechercher un compte AD par nom ou
e-mail, ou saisir l'e-mail du compte ISMS. Choisir **Groupe Active Directory**
pour rechercher et sélectionner un groupe AD. Définir une durée ou une date
d'expiration ; un partage peut également être révoqué avant cette échéance.

Le partage de groupe accorde la consultation aux membres du groupe présents dans
l'identité authentifiée utilisée par l'API, sans créer d'autorisations
individuelles permanentes. Après une modification d'appartenance AD, les groupes
de l'identité doivent être actualisés. Les groupes introuvables ou ambigus sont
refusés. Les notifications sont adressées séparément aux membres ayant un e-mail.

Les droits ordinaires de lecture ou de téléchargement sur l'espace ne suffisent
pas pour lire un document sensible. Les destinataires autorisés consultent sans
droit de téléchargement ; les gestionnaires disposant des capacités de gestion
du document conservent leur accès. Pour un lien sensible, ISMS protège l'accès au
lien, sans chiffrer ni filigraner le fichier hébergé sur le site distant.

## Filtres et confirmations

Dans l'explorateur, choisir **Liens / Vidéos** dans le filtre de format pour
afficher les documents constitués d'un lien sans fichier. Les filtres de langue,
de catégorie, de favoris et les ACL continuent de s'appliquer avant pagination.

Pour partager un document sensible avec un groupe AD, saisir son nom et la durée,
puis choisir **Prévisualiser les destinataires**. L'aperçu indique le nombre
d'adresses e-mail résolues et affiche au maximum dix adresses. Il ne crée aucun
partage et n'envoie aucun message. Choisir **Confirmer le partage** pour appliquer
le partage. Modifier le groupe ou la durée impose un nouvel aperçu. Le droit de
lecture reste lié à l'appartenance au groupe ; les membres sans attribut e-mail
peuvent ne pas être inclus dans le compteur des notifications.

Avant une publication, vérifier le récapitulatif commun aux trois interfaces :
titre, langues disponibles, espace/catégorie et notifications. Une confirmation
annulée n'effectue aucune publication. Les notifications non supprimées restent
soumises aux ACL, au workflow et à la configuration de messagerie ; le résumé
ne constitue pas une preuve de réception d'e-mail.

## English quick reference

Administrators and moderators share List/Windows document views, remembered in
the browser. Both request 20 items per page and support Previous/Next without
changing document state or file versions. Optional `ged.*` metadata supports
targeted search, favorites and saved searches. Bulk editing previews changes,
preserves other fields and applies atomically after checking source/destination
ACLs and preview timestamps. Editors can inspect change history; SHA-256 duplicate
detection only reveals editable existing documents. Administrators configure
annual and publication-review reminders separately from technical alerts.
GED tools sit in a collapsed **Document management** block above the viewer.
Administrators can disable linked documents, comments and electronic signatures
in **GED options** (external sharing has its own switch); disabled modules are
hidden and their API answers `404`, while existing data is kept.

See [administration](administration.md), [API routes](routes.md),
[versioning](VERSIONING.md) and [anonymized screenshots](screenshots/README.md).
