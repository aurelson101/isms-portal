"use client";

import { useState } from "react";
import type { Locale } from "./i18n/locale";
import { ExternalDocumentLink } from "./external-document-link";

const copy = {
  fr: {
    source: "Type de document",
    file: "Fichier",
    link: "Lien / vidéo SharePoint",
    url: "Lien SharePoint ou site web",
    image: "Petite image (facultative)",
    hint: "Collez le lien complet. Les vidéos SharePoint compatibles proposent un lecteur et une ouverture externe.",
    sensitive:
      "Pour un lien sensible, ISMS contrôle l’accès au lien. Les droits du site externe restent nécessaires ; ISMS ne chiffre ni ne filigrane le fichier distant.",
  },
  en: {
    source: "Document type",
    file: "File",
    link: "Link / SharePoint video",
    url: "SharePoint or website link",
    image: "Small image (optional)",
    hint: "Paste the full link. Supported SharePoint videos provide a player and an external link.",
    sensitive:
      "For a sensitive link, ISMS controls access to the link. External site permissions are still required; ISMS does not encrypt or watermark the remote file.",
  },
  es: {
    source: "Tipo de documento",
    file: "Archivo",
    link: "Enlace / vídeo de SharePoint",
    url: "Enlace de SharePoint o sitio web",
    image: "Imagen pequeña (opcional)",
    hint: "Pegue el enlace completo. Los vídeos compatibles de SharePoint incluyen un reproductor y un enlace externo.",
    sensitive:
      "Para un enlace sensible, ISMS controla el acceso al enlace. Se requieren los permisos del sitio externo; ISMS no cifra ni añade marcas de agua al archivo remoto.",
  },
  sk: {
    source: "Typ dokumentu",
    file: "Súbor",
    link: "Odkaz / video SharePoint",
    url: "Odkaz na SharePoint alebo web",
    image: "Malý obrázok (voliteľný)",
    hint: "Vložte celý odkaz. Podporované videá SharePoint ponúkajú prehrávač a externý odkaz.",
    sensitive:
      "Pri citlivom odkaze ISMS riadi prístup k odkazu. Povolenia externého webu sú naďalej potrebné; ISMS vzdialený súbor nešifruje ani neoznačuje vodoznakom.",
  },
};

export function DocumentSourceChoice({
  external,
  onChange,
  locale,
}: {
  external: boolean;
  onChange: (external: boolean) => void;
  locale: Locale;
}) {
  const t = copy[locale];
  return (
    <fieldset className="document-source-choice">
      <legend>{t.source}</legend>
      <div className="document-source-options">
        {[false, true].map((value) => (
          <label className="check" key={String(value)}>
            <input
              type="radio"
              name="documentSource"
              checked={external === value}
              onChange={() => onChange(value)}
            />
            {value ? t.link : t.file}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ExternalSourceFields({ locale }: { locale: Locale }) {
  const [url, setUrl] = useState("");
  const t = copy[locale];
  return (
    <fieldset className="document-source-fields">
      <legend>{t.link}</legend>
      <label>
        {t.url}
        <input
          name="url"
          type="url"
          required
          maxLength={2000}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <small>{t.hint}</small>
      <label>
        {t.image}
        <input
          name="thumbnail"
          type="file"
          accept="image/png,image/jpeg,image/webp"
        />
      </label>
      <p className="muted">{t.sensitive}</p>
      {url.trim() && (
        <div className="document-external-link">
          <ExternalDocumentLink
            url={url.trim()}
            title={t.link}
            locale={locale}
          />
        </div>
      )}
    </fieldset>
  );
}
