# Certificats LDAPS

Importer uniquement des CA publiques PEM/CRT/CER. L’API refuse toute clé privée,
valide X.509, calcule SHA-256 et bloque les doublons. La validation du nom
d’hôte et de la chaîne reste obligatoire. Un certificat lié à un connecteur
actif doit être remplacé ou le connecteur désactivé avant suppression.

