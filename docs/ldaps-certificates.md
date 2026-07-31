# Certificats LDAPS

L’administrateur peut importer un ou deux certificats CA publics depuis
**Administration → Certificats CA**. L’API reconnaît le contenu, indépendamment
de l’extension : certificat X.509 PEM/DER ou chaîne ADCS PKCS#7 (`.pem`, `.crt`,
`.cer`, `.p7b`, `.p7c`). Elle extrait uniquement les CA publiques et refuse clés
privées, fichiers sans CA, doublons et contenus supérieurs à la limite.

Un fichier `.cer` n’est pas nécessairement un certificat X.509 unique : ADCS
peut fournir une chaîne PKCS#7 avec cette extension. L’import prend explicitement
en charge ce cas. Si la chaîne contient plusieurs nouvelles CA, elles sont
importées ensemble tant que la limite globale de deux certificats n’est pas
dépassée.

Pour chaque CA, l’écran affiche sujet, émetteur, empreinte SHA-256, validité,
statut et connecteurs associés. Les actions disponibles sont tester, télécharger
la partie publique et supprimer.

Les certificats et métadonnées sont conservés dans PostgreSQL, jamais dans le
volume documentaire. Aucune clé privée n’est attendue ni acceptée.

La suppression reste une décision administrateur. Si la CA est utilisée,
l’interface avertit que les connecteurs concernés seront désactivés ; l’API les
désactive, détache la CA puis journalise la suppression. La validation TLS et du
nom d’hôte n’est jamais contournée.

Les seuils d’alerte recommandés sont 90, 60, 30, 15 et 7 jours.
