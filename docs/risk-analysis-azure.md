# Fiche d'analyse de risques - ISMS Portal sur Azure

**Statut :** document d'architecture et de traitement des risques  
**Périmètre :** ISMS Portal, son infrastructure d'hébergement, les identités,
les documents et les notifications  
**Propriétaire :** RSSI / responsable applicatif ISMS  
**Revue :** annuelle et à chaque changement significatif d'architecture

## 1. Objet et méthode

Cette fiche décrit le fonctionnement de l'application, l'architecture Docker
actuelle et une architecture cible Azure. Elle sert de support au registre des
risques ISMS et ne remplace pas une homologation, un audit de configuration ou
un test d'intrusion.

La cotation utilise une échelle de 1 à 5 pour la vraisemblance (V) et l'impact
(I). Le niveau brut est `V x I` : 1-4 faible, 5-9 modéré, 10-14 élevé et 15-25
critique. Le risque résiduel est évalué après application des mesures listées.

## 2. Fonctionnement de l'application

ISMS Portal est une GED et un portail de gouvernance ISMS. Il permet notamment
de déposer, analyser, versionner, publier, consulter, archiver ou supprimer des
documents. Les droits de lecture, prévisualisation, téléchargement, modification
et publication sont contrôlés côté API, par défaut en refus, à partir des ACL
des sections, catégories, groupes Active Directory et rôles administrateur ou
modérateur.

Les utilisateurs s'authentifient par LDAP/LDAPS, ou par Microsoft Entra ID avec
résolution des groupes depuis l'annuaire. Les administrateurs et modérateurs
gèrent les ACL, les documents, les revues, les approbations, les signalements et
la conservation. Les courriels de publication, revue, approbation et décision
sont mis en file dans Redis/BullMQ puis envoyés par Microsoft Graph avec
certificat applicatif ou par SMTP configuré séparément.

Les documents passent par ClamAV avant leur traitement. PostgreSQL conserve les
métadonnées, ACL, paramètres, traces d'audit et états des workflows. Le stockage
persistant contient les fichiers documentaires. Base et fichiers doivent toujours
être sauvegardés et restaurés ensemble.

## 3. Architecture actuelle

```text
Utilisateurs internes
        |
      HTTPS 443
        |
Reverse proxy hôte (TLS, pare-feu)
        |
  127.0.0.1:8080
        |
Proxy Nginx Docker
   |                 \
Next.js frontend    NestJS API
                        |-- PostgreSQL (métadonnées, ACL, audit)
                        |-- Redis / BullMQ
                        |-- ClamAV
                        |-- volume documentaire persistant
                        |-- LDAP/LDAPS / Active Directory
                        |-- Microsoft Graph ou SMTP
                        |
                    Worker BullMQ (synchronisations et alertes)
```

Seul le proxy est exposé. PostgreSQL, Redis, ClamAV, API, worker et le volume
documentaire restent sur les réseaux Docker internes. Le port Docker 8080 doit
être publié uniquement sur `127.0.0.1`; le frontal HTTPS est le seul point
d'entrée utilisateur.

## 4. Architecture cible Azure recommandée

La cible suivante conserve le fonctionnement Docker actuel tout en supprimant
les principaux points uniques de défaillance. Elle peut être mise en oeuvre par
étapes; AKS n'est pas nécessaire pour un premier déploiement maîtrisé.

```text
Internet / réseau organisation
        |
Azure Front Door Premium ou Application Gateway WAF
        |
Réseau virtuel Azure - sous-réseau applicatif privé
        |
Azure VM ou VM Scale Set Linux
  Nginx hôte -> Docker Compose (proxy, frontend, API, worker, ClamAV)
        |                 |                 |
 Private Endpoint    VPN/ExpressRoute     Microsoft Graph
        |                 |                 |
 Azure Database      Active Directory     Boîte partagée approuvée
 for PostgreSQL      / LDAPS
        |
Azure Cache for Redis (ou Redis Docker avec réplication planifiée)
        |
Stockage documentaire :
  - volume principal local chiffré et sauvegardé, ou
  - Azure Files Premium monté en SMB 3.x, ou
  - stockage S3 compatible validé par l'application.
```

### Services Azure à privilégier

| Besoin                | Service recommandé                                 | Exigence principale                                           |
| --------------------- | -------------------------------------------------- | ------------------------------------------------------------- |
| Entrée web            | Application Gateway WAF v2 ou Front Door Premium   | TLS, WAF, journalisation, limitation d'exposition             |
| Calcul                | VM Linux dédiée ou VM Scale Set                    | disque chiffré, mises à jour, sauvegarde, accès SSH restreint |
| Base de données       | Azure Database for PostgreSQL Flexible Server      | zone privée, sauvegardes, haute disponibilité selon criticité |
| Cache / files de jobs | Azure Cache for Redis                              | accès privé, TLS, supervision                                 |
| Documents SMB         | Azure Files Premium                                | SMB 3.x obligatoire, chiffrement en transit, montage privé    |
| Secrets               | Azure Key Vault                                    | identité managée, rotation, pas de secret dans Git ou image   |
| Supervision           | Azure Monitor, Log Analytics et Defender for Cloud | alertes, conservation, diagnostic sécurité                    |
| Connectivité AD       | VPN site-à-site ou ExpressRoute                    | LDAPS/636, DNS interne, flux minimaux                         |

Azure Blob Storage n'est à utiliser pour les documents que via une intégration
validée par l'application (S3 compatible ou passerelle). Ne pas le présenter
comme un volume POSIX/SMB direct. Pour un partage Windows/NAS, le montage se
fait sur l'hôte Docker et l'application utilise le chemin de stockage validé.

## 5. Exigences de sécurité d'architecture

1. Placer l'application, PostgreSQL, Redis, Azure Files et Key Vault sur des
   réseaux privés. Aucun port de données ne doit être exposé à Internet.
2. Publier exclusivement HTTPS/443, appliquer TLS moderne, HSTS, WAF et des
   règles de limitation adaptées.
3. Préférer LDAPS/636 avec noms DNS complets et CA publique importée. LDAP/389
   ne convient qu'à un réseau isolé et contrôlé.
4. Utiliser Key Vault ou des secrets Docker protégés pour les mots de passe,
   clés de chiffrement et certificats Graph. Ne jamais les mettre dans `.env`
   versionné, une image ou une documentation.
5. Pour Microsoft Graph, utiliser un certificat X.509, `Mail.Send` et une
   Application Access Policy Exchange qui limite l'envoi à la boîte partagée
   ISMS approuvée.
6. Sauvegarder PostgreSQL **et** le stockage documentaire de façon cohérente,
   chiffrée, avec une rétention définie et des restaurations testées.
7. Centraliser les journaux techniques et d'audit dans Log Analytics ou un SIEM.
   La rétention locale de l'application ne doit pas constituer l'unique preuve
   d'audit réglementaire.
8. Appliquer les mises à jour de l'hôte, Docker, images, dépendances Node.js et
   signatures ClamAV dans une fenêtre de maintenance contrôlée.

## 6. Registre synthétique des risques

| ID   | Risque                                                    |   V |   I | Brut | Mesures existantes / prévues                                             | Risque résiduel | Traitement                         |
| ---- | --------------------------------------------------------- | --: | --: | ---: | ------------------------------------------------------------------------ | --------------: | ---------------------------------- |
| R-01 | Exposition Internet de PostgreSQL, Redis ou Docker        |   3 |   5 |   15 | réseaux Docker internes, port 8080 local, NSG et Private Endpoints Azure |               5 | Réduire                            |
| R-02 | ACL erronée donnant accès à un document                   |   3 |   5 |   15 | contrôle côté API, refus par défaut, ACL section/catégorie/groupe, audit |               8 | Réduire / revue trimestrielle      |
| R-03 | Interception d'identifiants LDAP                          |   3 |   5 |   15 | LDAPS, validation CA et nom DNS, compte de lecture dédié                 |               5 | Éviter LDAP/389 hors réseau isolé  |
| R-04 | Certificat Graph ou secret expiré/compromis               |   3 |   4 |   12 | certificat X.509, Key Vault, alerte d'expiration, test d'envoi           |               6 | Réduire                            |
| R-05 | Application Graph capable d'envoyer depuis trop de boîtes |   3 |   4 |   12 | `Mail.Send` limité par Application Access Policy Exchange                |               4 | Réduire / contrôler annuellement   |
| R-06 | Rançongiciel ou suppression de documents                  |   3 |   5 |   15 | ClamAV, corbeille, ACL, sauvegardes immuables et tests de restauration   |               8 | Réduire                            |
| R-07 | Perte conjointe des métadonnées et des fichiers           |   3 |   5 |   15 | sauvegarde cohérente PostgreSQL + documents, exercice de restauration    |               6 | Réduire                            |
| R-08 | Indisponibilité d'une VM ou d'une zone Azure              |   3 |   4 |   12 | sauvegardes, supervision; HA PostgreSQL et VM secondaire selon RTO/RPO   |               6 | Réduire / accepter selon criticité |
| R-09 | Fichier malveillant déposé dans la GED                    |   3 |   4 |   12 | analyse ClamAV, quarantaine/échec de traitement, restrictions de formats |               6 | Réduire                            |
| R-10 | Preuves d'audit insuffisantes ou trop courtes             |   3 |   4 |   12 | journal applicatif, export, centralisation SIEM recommandée              |               6 | Réduire                            |
| R-11 | Vulnérabilité d'image ou dépendance compromise            |   3 |   4 |   12 | images épinglées, CI, scan de vulnérabilités et mises à jour planifiées  |               6 | Réduire                            |
| R-12 | Indisponibilité ou incohérence du stockage externe        |   2 |   5 |   10 | sonde de stockage, SMB 3.x, sauvegarde, test préalable avant activation  |               5 | Réduire                            |

## 7. Plan de traitement priorisé

| Priorité | Action                                                                      | Responsable             | Preuve attendue                           |
| -------- | --------------------------------------------------------------------------- | ----------------------- | ----------------------------------------- |
| P1       | Mettre en place Key Vault et l'identité managée pour les secrets Azure      | Infrastructure          | coffre, rôles RBAC, procédure de rotation |
| P1       | Restreindre Graph à la boîte partagée ISMS via Exchange                     | Messagerie              | Application Access Policy et test d'envoi |
| P1       | Sauvegarder base et documents avec test de restauration trimestriel         | Exploitation            | rapport de restauration et empreintes     |
| P1       | Utiliser LDAPS, VPN/ExpressRoute et DNS interne                             | Infrastructure / AD     | test TLS et matrice de flux               |
| P2       | Centraliser les journaux dans Log Analytics/SIEM avec rétention définie     | RSSI / Exploitation     | tableau de bord et politique de rétention |
| P2       | Déployer WAF, alertes Azure Monitor et Defender for Cloud                   | Infrastructure          | alertes testées et rapports               |
| P2       | Définir RTO/RPO, procédure de bascule et seconde capacité applicative       | Métier / Infrastructure | exercice de continuité                    |
| P3       | Évaluer le passage à Azure Database for PostgreSQL et Azure Cache for Redis | Architecture            | étude de migration et test de charge      |

## 8. Exploitation et critères d'acceptation

Avant mise en production Azure, valider au minimum :

- accès HTTPS, en-têtes de sécurité et absence de port de données public ;
- authentification LDAPS/Entra, résolution des groupes et ACL de test ;
- dépôt, analyse ClamAV, prévisualisation et récupération d'un document ;
- publication contrôlée et notification Graph/SMTP de test ;
- restauration d'un document et d'une base dans un environnement isolé ;
- état `healthy` des services, espace de stockage et métriques ;
- alertes de certificat, échec de jobs, saturation Redis, 5xx et capacité disque ;
- validation des rôles Azure RBAC, des Private Endpoints et des journaux.

## 9. Décision de risque

Le responsable ISMS accepte uniquement les risques résiduels documentés après
validation des actions P1. Toute exception doit préciser son périmètre, son
propriétaire, sa date d'expiration, les mesures compensatoires et la prochaine
date de revue.

## Références internes

- [Architecture détaillée](architecture.md)
- [Installation Docker](installation.md)
- [Active Directory et LDAPS](active-directory.md)
- [Modèle d'autorisations](permissions.md)
- [Stockage documentaire](document-storage.md)
- [Référence développeur](developer-reference.md)
