"use client";

import type { Locale } from "./i18n/locale";
import { translate } from "./i18n/translate";
import { sharePointVideoEmbedUrl } from "./sharepoint-video";

const playerCopy = {
  fr: {
    help: "Utilisez les commandes du lecteur pour le plein écran ou « Ouvrir dans le navigateur ». Votre compte Microsoft doit être autorisé dans SharePoint.",
  },
  en: {
    help: "Use the player controls for full screen or Open in browser. Your Microsoft account must have access in SharePoint.",
  },
  es: {
    help: "Use los controles del reproductor para pantalla completa o Abrir en el navegador. Su cuenta Microsoft debe tener acceso en SharePoint.",
  },
  sk: {
    help: "Použite ovládanie prehrávača na celú obrazovku alebo otvorenie v prehliadači. Vaše konto Microsoft musí mať prístup v SharePointe.",
  },
};

export function ExternalDocumentLink({
  url,
  title,
  locale,
}: {
  url: string;
  title: string;
  locale: Locale;
}) {
  let source: URL;
  try {
    source = new URL(url);
    if (!["https:", "http:"].includes(source.protocol)) return null;
  } catch {
    return null;
  }
  const player = sharePointVideoEmbedUrl(url);
  const copy = playerCopy[locale];
  return (
    <>
      {player && (
        <>
          <iframe
            className="sharepoint-video-player"
            src={player}
            title={title}
            loading="lazy"
            allow="fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <p className="muted">{copy.help}</p>
        </>
      )}
      {!player && (
        <>
          <a
            className="primary-link"
            href={source.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {translate(locale, "Ouvrir le lien externe", "Open external link")}
          </a>
          <small>{source.host}</small>
        </>
      )}
    </>
  );
}
