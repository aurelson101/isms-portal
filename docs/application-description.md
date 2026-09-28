# Description complète - ISMS Portal

## Résumé exécutif

ISMS Portal est une application web de gestion documentaire et de gouvernance de la sécurité de l'information. Elle centralise les politiques, procédures, guides, preuves et documents de référence. Son objectif est de diffuser une documentation fiable, versionnée, contrôlée et accessible uniquement aux personnes autorisées.

L'application est à la fois une GED et un outil de pilotage ISMS. Elle couvre le cycle de vie documentaire, les ACL, les approbations, les revues, les signalements, les demandes d'accès, les alertes, l'audit, les contrôles, les exceptions et les actions correctives.

## Utilisateurs et rôles

| Rôle | Responsabilités principales |
| --- | --- |
| Utilisateur | Recherche, consultation, prévisualisation, téléchargement autorisé, favoris, demandes d'accès et signalements. |
| Modérateur | Dépôt, modification, publication, nouvelle version, archivage, suppression et traitement des revues selon ses ACL. |
| Administrateur | Gestion des espaces, catégories, ACL, comptes, modérateurs, annuaire, certificats, alertes, stockage, audit et gouvernance. |

Les droits sont contrôlés par l'API, avec un refus par défaut. Un modérateur peut être restreint par espace ou catégorie. Un administrateur peut accorder un droit à un utilisateur ou à un groupe Active Directory, de manière permanente ou temporaire.

## Gestion documentaire

Les formats acceptés sont PDF, Word DOCX et Excel XLSX. Au dépôt, l'auteur renseigne l'espace, la catégorie éventuelle, la langue, le titre, la description, le résumé des changements et la sensibilité. Le fichier est analysé par ClamAV avant son traitement. Un document sensible peut recevoir un filigrane selon la configuration choisie.

Un document suit un cycle de vie : brouillon, revue, publié, archivé ou supprimé. Une nouvelle version conserve l'historique, les dates et le résumé des changements. La conservation physique est maîtrisée afin de ne pas encombrer le stockage. L'administration affiche vingt documents par page avec navigation.

Les capacités read, preview et download sont distinctes. Un utilisateur peut donc lire ou prévisualiser un document sans pouvoir le télécharger. Les documents sont rangés dans des espaces, catégories et sous-catégories, par exemple Documents généraux, IT, RH ou zones métier spécifiques.

## ACL, identités et authentification

Les ACL sont attribuées aux groupes Active Directory, comptes locaux de secours ou rôles de gestion. Elles sont évaluées côté serveur sur l'espace et la catégorie. Les groupes Active Directory peuvent être imbriqués et sont résolus par le connecteur annuaire configuré.

L'application prend en charge LDAP/LDAPS et Microsoft Entra ID. LDAPS sur TCP/636 est recommandé : certificat CA valide, nom DNS complet du contrôleur et validation TLS active. LDAP non chiffré doit être réservé à un réseau isolé. Après une authentification Entra, l'API peut résoudre les groupes applicables depuis Active Directory. Les secrets de bind LDAP sont chiffrés et ne sont jamais renvoyés par l'API.

## Approbations, revues et signalements

ISMS Portal crée des demandes horodatées pour les opérations nécessitant une validation. Chaque demande contient le demandeur, le document, la version, le commentaire, l'approbateur ou modérateur affecté, l'échéance et la décision. Un demandeur ne peut pas approuver sa propre demande.

Les modérateurs et administrateurs autorisés approuvent ou refusent depuis une page authentifiée. Les commentaires internes de modération restent séparés des commentaires envoyés au demandeur. Les revues documentaires peuvent être planifiées, notamment annuellement. Les signalements permettent aux utilisateurs de déclarer une erreur ou un problème sur un document.

Le module de gouvernance centralise les revues, accès permanents, contrôles et SoA, rétention, santé des identités, incidents et CAPA, exceptions, preuves et indicateurs. Les listes sont paginées pour conserver une interface lisible.

## Notifications et e-mails

L'application envoie des e-mails lors d'une publication, nouvelle version, demande d'approbation, décision, revue assignée, revue annuelle ou signalement. Les destinataires sont calculés à partir des ACL, groupes AD et rôles concernés; l'attribut Active Directory mail doit être renseigné.

Les modèles sont en anglais, responsives et contextualisés. Ils indiquent le titre, la description, la catégorie, la version et un lien vers le portail. Les liens d'approbation redirigent vers une page authentifiée avec les décisions possibles. Microsoft Graph et SMTP sont deux canaux distincts, chacun avec son propre test d'envoi.

## Espace personnel

Chaque utilisateur dispose d'un espace personnel qui regroupe les documents à lire, documents récemment consultés, recherches sauvegardées, demandes d'accès, signalements, notifications et préférences d'affichage. La densité, la taille du texte, le contraste et la réduction d'animation sont configurables. L'interface est adaptée aux postes de travail, tablettes et mobiles.

## Architecture technique actuelle

```text
Utilisateurs internes
        |
      HTTPS / 443
        |
Reverse proxy de l'hôte Linux
        |
  Docker publié localement sur 127.0.0.1:8080
        |
Proxy Nginx Docker
   |                     \
Frontend Next.js       API NestJS
                           |-- PostgreSQL
                           |-- Redis / BullMQ
                           |-- Worker asynchrone
                           |-- ClamAV
                           |-- Stockage documentaire persistant
                           |-- Active Directory LDAP/LDAPS
                           `-- Microsoft Graph ou SMTP
```

Le frontend Next.js fournit l'interface utilisateur. L'API NestJS applique les règles métier, ACL, authentification, validations, opérations documentaires et intégrations. Le worker traite les tâches asynchrones : synchronisations LDAP, alertes, e-mails et planification des revues.

PostgreSQL stocke comptes, groupes, ACL, métadonnées, versions, demandes, décisions, configurations et audit. Redis sert de cache et de transport aux files BullMQ. ClamAV analyse les dépôts. Le volume documentaire conserve les fichiers originaux et les copies distribuées. Les réseaux Docker sont internes et seul le proxy HTTPS est exposé; le port 8080 reste local à l'hôte.

## Sécurité et supervision

Les opérations sensibles sont journalisées avec identité, action, ressource, résultat, date et identifiant de corrélation. Les administrateurs disposent d'un journal d'audit et d'exports contrôlés. Les journaux techniques doivent être centralisés dans une supervision adaptée pour respecter la durée de conservation attendue par l'organisation.

Les contrôles principaux sont les ACL validées côté API, la séparation des droits de lecture, prévisualisation et téléchargement, l'analyse antivirus, les sessions contrôlées, le MFA administrateur lorsqu'il est configuré, TLS, le chiffrement applicatif des secrets, la corbeille, la restauration contrôlée et la surveillance de PostgreSQL, Redis, ClamAV et du stockage.

## Microsoft Graph, SMTP et secrets

Microsoft Graph est le canal recommandé pour Microsoft 365. Il utilise une application Entra ID, un certificat X.509 et le flux client_credentials. L'autorisation Mail.Send doit être consentie par le locataire et restreinte dans Exchange à la boîte partagée ISMS autorisée. Sans cette restriction, l'application pourrait envoyer des messages au nom d'autres boîtes.

SMTP est une solution indépendante, par exemple pour Mailjet ou un relais tiers. Les identifiants SMTP et Graph ne doivent jamais être mutualisés. Certificats, mots de passe et clés doivent être stockés sur le serveur ou dans un gestionnaire de secrets, jamais dans Git ou une image Docker.

## Stockage et sauvegardes

Le stockage principal est le volume documentaire persistant. Des cibles S3 compatibles ou SMB/CIFS peuvent être configurées selon les besoins. Pour SMB, SMB 3.x est obligatoire. Toute cible doit réussir un test de disponibilité avant de recevoir des documents.

Une sauvegarde complète contient PostgreSQL et les fichiers documentaires. Restaurer uniquement l'un des deux ne suffit pas à reconstruire la GED. Les restaurations doivent être testées régulièrement dans un environnement isolé, avec contrôle des tailles et empreintes des fichiers.

## Hébergement Azure recommandé

L'application peut être hébergée sur une VM Linux Azure avec Docker Compose dans une première phase. Azure Application Gateway WAF v2 ou Azure Front Door Premium protège l'entrée HTTPS. PostgreSQL, Redis, stockage et Key Vault doivent être accessibles via des réseaux privés et Private Endpoints.

La cible Azure recommandée comprend :

- Application Gateway WAF ou Front Door Premium pour l'exposition web;
- VM Linux ou VM Scale Set pour les conteneurs; AKS est à évaluer si la haute disponibilité ou l'orchestration le justifie;
- Azure Database for PostgreSQL Flexible Server et Azure Cache for Redis;
- Azure Files Premium en SMB 3.x ou une cible S3 compatible validée;
- Azure Key Vault et identité managée pour secrets et certificats;
- VPN site-à-site ou ExpressRoute vers Active Directory/LDAPS;
- Azure Monitor, Log Analytics et Defender for Cloud.

## Exploitation

L'exploitation comprend la surveillance des services, échecs de jobs, espace documentaire, Redis, certificats, sauvegardes et alertes de sécurité. Les mises à jour de l'hôte Linux, Docker, images, dépendances et signatures ClamAV suivent une procédure de changement et une validation avant production.

Ne jamais utiliser docker compose down -v en exploitation, car cette commande supprime les volumes persistants. Le nettoyage des images inutilisées se fait avec docker image prune -f après contrôle de santé, sans toucher aux volumes.

## Export Word

```powershell
pandoc .\application-description.md -o .\description-complete-isms-portal.docx
```

