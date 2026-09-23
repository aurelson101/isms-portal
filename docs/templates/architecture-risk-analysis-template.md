# Analyse de risques d'architecture - [Nom du service]

> Modèle à compléter pour produire une fiche de risque exploitable en comité
> sécurité ou exportable en document Word.

## Informations du document

| Champ | Valeur |
| --- | --- |
| Service / application | [Nom] |
| Propriétaire métier | [Nom / équipe] |
| Propriétaire technique | [Nom / équipe] |
| RSSI / DPO consulté | [Nom] |
| Version | [v1.0] |
| Date | [JJ/MM/AAAA] |
| Prochaine revue | [JJ/MM/AAAA] |
| Classification | [Interne / Confidentiel / Restreint] |
| Statut | [Brouillon / À valider / Approuvé] |

## 1. Objet, périmètre et hypothèses

### Objet

Décrire la finalité du service, les utilisateurs concernés et les décisions que
cette analyse doit permettre de prendre.

### Périmètre inclus

- [Application, API, interfaces d'administration]
- [Données et fichiers]
- [Identités, annuaire, SSO]
- [Infrastructure, réseau, supervision, sauvegardes]
- [Prestataires et services externes]

### Hors périmètre

- [Exemple : poste de travail utilisateur, sauf accès au navigateur]
- [Exemple : réseau du prestataire, hors interface contractuelle]

### Hypothèses et dépendances

| Hypothèse / dépendance | Propriétaire | Validation nécessaire |
| --- | --- | --- |
| [Exemple : Active Directory disponible] | [Équipe AD] | [Test LDAPS] |
| [Exemple : sauvegarde externalisée] | [Exploitation] | [Test de restauration] |

## 2. Description fonctionnelle

Décrire les fonctions qui manipulent de l'information : consultation,
création, modification, validation, publication, administration, export,
notification et suppression.

| Fonction | Utilisateurs | Données traitées | Exigences de sécurité |
| --- | --- | --- | --- |
| [Consulter un document] | [Utilisateurs autorisés] | [Document / métadonnées] | [Confidentialité, traçabilité] |
| [Publier] | [Modérateur] | [Version, commentaire] | [Intégrité, approbation] |
| [Administrer] | [Administrateur] | [ACL, comptes, paramètres] | [Privilèges minimaux, audit] |

## 3. Architecture et flux de données

### Schéma d'architecture

Remplacer les éléments entre crochets par les composants réels.

```text
Utilisateurs
    |
HTTPS / VPN / accès interne
    |
[WAF ou reverse proxy]
    |
[Frontend] ----> [API]
                    |-- [Base de données]
                    |-- [Stockage documentaire]
                    |-- [File de traitements]
                    |-- [Antivirus / analyse]
                    |-- [Annuaire / SSO]
                    `-- [Messagerie / notifications]
```

### Composants

| Composant | Rôle | Hébergement | Données | Exposition réseau |
| --- | --- | --- | --- | --- |
| [Frontend] | [Interface utilisateur] | [Azure VM / App Service] | [Aucune persistance] | [HTTPS] |
| [API] | [Logique métier et ACL] | [Conteneur privé] | [Sessions / métadonnées] | [Interne] |
| [Base] | [Persistance] | [Azure Database for PostgreSQL] | [Données métier] | [Privé] |
| [Stockage] | [Fichiers] | [Azure Files SMB 3.x / S3 validé] | [Documents] | [Privé] |

### Flux sensibles

| ID | Source | Destination | Protocole | Données | Chiffrement | Authentification |
| --- | --- | --- | --- | --- | --- | --- |
| F-01 | [Navigateur] | [Proxy] | [HTTPS/443] | [Session, documents] | [TLS] | [SSO / MFA] |
| F-02 | [API] | [AD] | [LDAPS/636] | [Identité, groupes] | [TLS] | [Compte lecture seul] |
| F-03 | [API] | [Graph] | [HTTPS/443] | [Notifications] | [TLS] | [Certificat applicatif] |

## 4. Données et exigences de sécurité

| Catégorie | Exemples | Classification | Confidentialité | Intégrité | Disponibilité | Conservation |
| --- | --- | --- | ---: | ---: | ---: | --- |
| Documents | [Politiques, procédures] | [Interne] | [Moyenne] | [Élevée] | [Moyenne] | [Durée] |
| Identités | [Nom, e-mail, groupes] | [Donnée personnelle] | [Élevée] | [Élevée] | [Moyenne] | [Durée] |
| Journaux | [Actions, horodatage] | [Confidentiel] | [Moyenne] | [Élevée] | [Moyenne] | [Durée] |

## 5. Méthode de cotation

### Vraisemblance (V)

| Valeur | Définition |
| ---: | --- |
| 1 | Très improbable |
| 2 | Improbable |
| 3 | Possible |
| 4 | Probable |
| 5 | Très probable |

### Impact (I)

| Valeur | Définition |
| ---: | --- |
| 1 | Négligeable |
| 2 | Limité |
| 3 | Significatif |
| 4 | Majeur |
| 5 | Critique |

`Niveau brut = V x I` : 1-4 faible, 5-9 modéré, 10-14 élevé, 15-25 critique.

## 6. Registre des risques

| ID | Scénario de risque | Actif / données | V | I | Brut | Mesures existantes | Risque résiduel | Décision / traitement | Propriétaire | Échéance |
| --- | --- | --- | ---: | ---: | ---: | --- | ---: | --- | --- | --- |
| R-01 | [Accès non autorisé] | [Documents] | [3] | [5] | [15] | [ACL, MFA, audit] | [6] | [Réduire] | [Nom] | [Date] |
| R-02 | [Indisponibilité] | [Application] | [3] | [4] | [12] | [Supervision, sauvegarde] | [6] | [Réduire] | [Nom] | [Date] |
| R-03 | [Perte de données] | [Base et stockage] | [3] | [5] | [15] | [Sauvegarde, restauration] | [6] | [Réduire] | [Nom] | [Date] |
| R-04 | [Compte à privilèges compromis] | [Administration] | [3] | [5] | [15] | [MFA, moindre privilège] | [8] | [Réduire] | [Nom] | [Date] |
| R-05 | [Fichier malveillant] | [Documents] | [3] | [4] | [12] | [Antivirus, formats autorisés] | [6] | [Réduire] | [Nom] | [Date] |
| R-06 | [Secret ou certificat exposé] | [Intégrations] | [3] | [4] | [12] | [Key Vault, rotation] | [4] | [Réduire] | [Nom] | [Date] |

## 7. Plan de traitement

| Priorité | Action | Risque(s) | Responsable | Échéance | Preuve de réalisation | Statut |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | [Exemple : activer les Private Endpoints] | [R-01] | [Infrastructure] | [Date] | [Capture / configuration] | [À faire] |
| P1 | [Exemple : test de restauration] | [R-03] | [Exploitation] | [Date] | [Rapport signé] | [À faire] |
| P2 | [Exemple : centraliser les journaux] | [R-02, R-04] | [RSSI] | [Date] | [Tableau de bord] | [À faire] |

## 8. Contrôles Azure à vérifier

- [ ] WAF actif devant le service web et HTTPS uniquement.
- [ ] NSG restrictifs; aucune base ni cache accessible publiquement.
- [ ] Private Endpoints pour PostgreSQL, Redis, stockage et Key Vault.
- [ ] Identité managée et Key Vault pour les secrets/certificats.
- [ ] Chiffrement au repos, TLS en transit et rotation documentée.
- [ ] VPN/ExpressRoute et LDAPS pour les flux Active Directory.
- [ ] Azure Monitor, Log Analytics, alertes et Defender for Cloud.
- [ ] Sauvegardes testées de la base et des documents; RTO/RPO validés.
- [ ] Si SMB est retenu : SMB 3.x obligatoire et partage privé.

## 9. Continuité d'activité

| Élément | RTO cible | RPO cible | Sauvegarde | Test de restauration |
| --- | --- | --- | --- | --- |
| [Application] | [x h] | [x h] | [Image / IaC] | [Fréquence] |
| [Base de données] | [x h] | [x h] | [PITR / export] | [Fréquence] |
| [Documents] | [x h] | [x h] | [Snapshot / copie] | [Fréquence] |

## 10. Validation

| Rôle | Nom | Décision | Date | Signature / preuve |
| --- | --- | --- | --- | --- |
| Responsable métier | [Nom] | [Approuvé / Refusé] | [Date] | [Référence] |
| Responsable technique | [Nom] | [Approuvé / Refusé] | [Date] | [Référence] |
| RSSI | [Nom] | [Acceptation des risques résiduels] | [Date] | [Référence] |

## Export Word

Le Markdown peut être converti en `.docx` avec Pandoc :

```powershell
pandoc .\architecture-risk-analysis-template.md -o .\analyse-risques-architecture.docx
```

Avant export, remplacer tous les champs entre crochets et supprimer les lignes
de démonstration inutiles.
