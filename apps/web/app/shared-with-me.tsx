"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout as fetch } from "./http-client";
import { translate } from "./i18n/translate";
import type { Locale } from "./i18n/locale";

type SharedDocument = {
  id: string;
  slug: string;
  expiresAt: string | null;
  translations: Array<{ locale: string; title: string }>;
};

// Sensitive documents that someone shared with the signed-in user.
export function SharedWithMe({ locale }: { locale: Locale }) {
  const [items, setItems] = useState<SharedDocument[]>([]);
  useEffect(() => {
    void fetch("/api/sensitive/shared-with-me", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : []))
      .then((data: SharedDocument[]) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]));
  }, []);
  if (items.length === 0) return null;
  return (
    <section
      className="shared-with-me"
      aria-label={translate(
        locale,
        "Documents sensibles partagés avec moi",
        "Sensitive documents shared with me",
      )}
    >
      <h2>
        {translate(
          locale,
          "Documents sensibles partagés avec moi",
          "Sensitive documents shared with me",
        )}
      </h2>
      <ul className="plain-list">
        {items.map((item) => {
          const title =
            item.translations.find((entry) => entry.locale === locale)?.title ||
            item.translations[0]?.title ||
            item.slug;
          return (
            <li key={item.id}>
              <a href={`/documents/${encodeURIComponent(item.slug)}`}>{title}</a>{" "}
              <small>
                {item.expiresAt
                  ? `${translate(locale, "jusqu’au", "until")} ${new Date(item.expiresAt).toLocaleString(locale)}`
                  : translate(locale, "à vie", "lifetime")}
              </small>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
