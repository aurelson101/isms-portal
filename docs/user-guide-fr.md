# Guide utilisateur

## Se connecter et choisir sa langue

Utilisez Continuer avec Microsoft lorsque le SSO est configuré, ou la connexion
Active Directory proposée. Vos droits suivent votre compte et les groupes
autorisés. Utilisez la recherche ou les catégories. Seuls les espaces
et documents autorisés sont visibles. Les langues FR/EN/ES/SK sont proposées
selon la configuration du portail ; votre profil permet de choisir une langue
par défaut, avec détection du navigateur en l'absence de préférence.

## Rechercher et consulter

Les PDF s’ouvrent dans le lecteur intégré. Les fichiers Word DOCX et Excel XLSX
s’affichent dans une vue locale en lecture seule. Le téléchargement peut être
désactivé par l’administrateur indépendamment du droit de consultation.

L'explorateur affiche 20 documents par page avec Précédent/Suivant. La recherche
GED cible référence, responsable, type, mots-clés ou dates de revue ; elle se
combine avec les favoris et peut être enregistrée. Les métadonnées métier sont
facultatives. Les modérateurs et administrateurs retrouvent ces outils dans leurs
menus Documents et Métadonnées, avec présentation Liste ou Fenêtres.

Les favoris appartiennent au compte connecté. Ajouter ou retirer un favori
actualise la liste et ses compteurs. Enregistrer une recherche conserve les
critères, sans changer les droits d'accès. Les mots-clés d'une fiche peuvent
servir de liens vers des recherches associées.

Dans Excel, choisissez la feuille, recherchez du texte et utilisez les filtres
disponibles. La consultation ne modifie pas le fichier stocké. Pour une vidéo
SharePoint intégrée, utilisez les commandes du lecteur ; l'accès Microsoft à la
source reste nécessaire. Le SSO seul ne déchiffre pas les fichiers protégés.

## Gérer un document selon ses droits

Dans l'administration ou la modération, **État** permet de retrouver brouillons,
publiés et archives selon les options du menu. Combinez-le avec la recherche ;
changer ce filtre revient à la première page sans changer l'état d'un document.

**Éditer les métadonnées** corrige titre, description, langue, catégorie et champs
facultatifs sans créer de version. **Nouvelle version** sert à remplacer le
fichier, avec un résumé des changements. La langue du document est indépendante
de la langue de l'interface. Lorsqu'elle est disponible, la comparaison textuelle
montre les valeurs Avant/Après de la version précédente.

La publication demande de vérifier le récapitulatif et le choix de notification.
Les revues et rappels sont configurés séparément dans la gouvernance. Une date
de revue dans les métadonnées ne planifie pas automatiquement une revue.

## Documents sensibles

Un document sensible ne peut être créé que par un utilisateur désigné par un
administrateur. Celui-ci peut le partager avec des personnes nommées, pour une
durée choisie ou à vie : ouvrez le document publié, dépliez **Partager ce
document sensible**, saisissez le destinataire (suggestions de l'annuaire) et
la durée. Pour un groupe AD, prévisualisez les destinataires avant confirmation :
l'aperçu ne crée aucun partage et n'envoie aucun e-mail. Si un document sensible
est partagé avec vous, retrouvez-le sous **Documents sensibles partagés avec moi** sur la
page d'accueil. Pour les fichiers partagés, l'accès est en lecture seule et sans
téléchargement ; le filigrane dépend du format pris en charge. L'accès s'arrête
à l'expiration ou à la révocation. Pour un lien, ISMS contrôle l'accès à sa fiche ;
les permissions et la protection du contenu distant dépendent du service source.

Les notifications suivent les canaux et destinataires configurés. En cas d'e-mail
absent, un administrateur peut vérifier l'état de l'envoi dans l'observabilité.
« Accepté » correspond à la prise en charge par le fournisseur, sans preuve de
réception dans la boîte. Les droits ordinaires de l'espace ne remplacent pas un
partage sensible nominatif ou par groupe autorisé.

Voir [Gestion documentaire](document-management.md) et les
[captures anonymisées](screenshots/README.md).
