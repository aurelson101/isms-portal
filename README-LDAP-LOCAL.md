# Configuration LDAP/LDAPS — exemple générique

> Ce guide ne contient aucun secret. Le mot de passe du compte de bind doit
> être saisi dans l’administration et ne doit jamais être ajouté à Git.

## Paramètres à saisir

| Champ                 | Valeur                             |
| --------------------- | ---------------------------------- |
| Domaine               | `example.com`                      |
| Contrôleur primaire   | `<À_COMPLÉTER_FQDN_DC_PRIMAIRE>`   |
| Contrôleur secondaire | `<À_COMPLÉTER_FQDN_DC_SECONDAIRE>` |
| Protocole conseillé   | `LDAPS`                            |
| Port LDAPS            | `636`                              |
| Base DN               | `DC=example,DC=com`                |
| User Base DN          | `OU=Users,DC=example,DC=com`       |
| Group Base DN         | `<À_COMPLÉTER>`                    |
| Bind DN fourni        | `isms_bind`                        |
| Mot de passe Bind     | `<MOT_DE_PASSE_NON_STOCKE>`        |

## Points à confirmer

1. Renseigner les noms DNS complets des deux contrôleurs, par exemple
   `dc01.example.com` et `dc02.example.com`.
2. Confirmer le `Group Base DN` contenant les groupes à synchroniser.
3. Vérifier le format accepté pour le compte de service :
   `isms_bind`, `isms_bind@example.com` ou son DN LDAP complet.
4. Pour LDAPS, importer dans l’administration le certificat public de
   l’autorité ayant signé les certificats des contrôleurs.
5. Saisir le mot de passe directement dans l’administration. Il sera chiffré
   au repos et ne sera pas retourné par l’API.

## Filtres Active Directory conseillés

```text
Filtre utilisateur : (&(objectCategory=person)(objectClass=user))
Filtre groupe      : (objectClass=group)
Attribut utilisateur : sAMAccountName
Attribut groupe      : cn
Attribut email       : mail
```

Après saisie, exécuter dans l’ordre : **Tester**, vérifier DNS/TCP/TLS/Bind,
puis **Synchroniser**.

En LDAP, les contrôleurs acceptent une adresse IP ou un nom d’hôte. En LDAPS,
utiliser obligatoirement les noms DNS complets présents dans les certificats,
par exemple `dc04.example.com` et `dc05.example.com`.
