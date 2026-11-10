"use client";

import type { Locale } from "./i18n/locale";
import { translate } from "./i18n/translate";
import { sharePointVideoEmbedUrl } from "./sharepoint-video";

const playerCopy = {
  fr: {
    open: "Ouvrir dans SharePoint",
    help: "La vidéo nécessite vos autorisations SharePoint. Si elle ne se charge pas, ouvrez-la dans SharePoint pour vous connecter à Microsoft.",
  },
  en: {
    open: "Open in SharePoint",
    help: "The video requires your SharePoint permissions. If it does not load, open it in SharePoint to sign in to Microsoft.",
  },
  es: {
    open: "Abrir en SharePoint",
    help: "El vídeo requiere sus permisos de SharePoint. Si no se carga, ábralo en SharePoint para iniciar sesión en Microsoft.",
  },
  sk: {
    open: "Otvoriť v SharePointe",
    help: "Video vyžaduje vaše povolenia v SharePointe. Ak sa nenačíta, otvorte ho v SharePointe a prihláste sa do Microsoftu.",
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
      <a
        className="primary-link"
        href={source.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {player
          ? copy.open
          : translate(locale, "Ouvrir le lien externe", "Open external link")}
      </a>
      <small>{source.host}</small>
    </>
  );
}
