# Captures du 31 octobre 2026

Ces PNG sont des captures réelles du frontend, prises avec Playwright et des
réponses API de démonstration. Identités, documents et métadonnées sont fictifs ;
aucun logo, domaine, compte ou contenu interne de production n'est publié.
Les images du README sont séparées des références des tests de régression visuelle.
La surcouche de développement du framework est exclue des captures.

| Capture                                                            | Écran                               |
| ------------------------------------------------------------------ | ----------------------------------- |
| `portal-desktop.png` / `portal-mobile.png`                         | Accueil ordinateur et mobile        |
| `explorer-desktop.png`                                             | Explorateur documentaire            |
| `workspace-desktop.png`                                            | Espace personnel                    |
| `admin-metadata-list.png` / `admin-metadata-windows.png`           | Administration, Liste et Fenêtres   |
| `moderator-documents-list.png` / `moderator-documents-windows.png` | Modération, Liste et Fenêtres       |
| `metadata-editor.png`                                              | Éditeur de métadonnées facultatives |

Pour les régénérer, démarrer le frontend local dans un premier terminal :

```powershell
npm exec -w @isms/web -- next dev --hostname 127.0.0.1 --port 3107
```

Dans un second terminal PowerShell, avec Edge installé :

```powershell
$env:ISMS_README_SCREENSHOTS = "1"
$env:ISMS_DEMO_URL = "http://127.0.0.1:3107"
$env:PLAYWRIGHT_CHANNEL = "msedge"
npx playwright test --config tests/readme-screenshots.config.ts
```

La configuration dédiée n'utilise ni connexion SSO réelle ni API de production.
Le scénario est désactivé dans les recettes ordinaires, sauf activation explicite.
Vérifier visuellement les captures et leur anonymisation avant publication.
