# Certificats LDAPS

L’administrateur peut importer un ou deux certificats CA publics depuis
**Administration → Certificats CA**. Formats acceptés : PEM, CRT et CER contenant
un certificat X.509 lisible. L’API refuse clés privées, non-CA, doublons et
contenus supérieurs à la limite.

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
