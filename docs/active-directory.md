# Active Directory

Créer un compte de service dédié, en lecture seule, sans ouverture de session
interactive. Il doit uniquement pouvoir lire les utilisateurs, groupes et
appartenances dans les bases DN configurées. Ne lui attribuer aucun rôle
administrateur de domaine.

Dans **Administration → Synchronisation LDAP**, renseigner :

1. domaine et contrôleurs primaire/secondaire ;
2. `LDAP` ou, de préférence, `LDAPS` sur TCP/636 ;
3. Base DN, User Base DN et Group Base DN les plus restreints possibles ;
4. DN et secret du compte de service ;
5. filtres utilisateurs/groupes et attributs ;
6. CA publique importée pour LDAPS ;
7. intervalle, timeout, tentatives et activation.

Le secret de bind est chiffré en AES-256-GCM et n’est jamais retourné par l’API.
Le bouton **Tester** vérifie DNS, TCP, TLS strict, bind, recherche utilisateur et
recherche groupe. **Synchroniser** importe les groupes et leurs effectifs puis
journalise le résultat. Le contrôleur secondaire est utilisé après échec et
tentatives sur le primaire.

Groupes de démonstration : `Domain Users`, `ITAD`, `HRAD`, `FINANCEAD`,
`MANAGEMENTAD`, `ISMS-ADMINS` et `ISMS-SUPER-ADMINS`.

Test isolé, sans AD de production :

```bash
./scripts/test-ldaps-functional.sh
```

Le test génère une CA éphémère, démarre OpenLDAP, impose la validation TLS et du
nom `ldap-test`, vérifie bind/recherches/synchronisation, puis détruit son
environnement et ses volumes de test.
