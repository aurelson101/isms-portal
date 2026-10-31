"use client";

import { translate } from "./i18n/translate";
import type { Locale } from "./i18n/locale";

import { useEffect, useState } from "react";

export function StorageSelect({
  spaceId,
  locale,
  admin = false,
}: {
  spaceId: string;
  locale: Locale;
  admin?: boolean;
}) {
  const [options, setOptions] = useState<
    Array<{ id: string; name: string; type: string }>
  >([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setOptions([]);
    setFailed(false);
    if (spaceId) {
      fetch(
        admin
          ? "/api/admin/storage-targets/options"
          : `/api/storage-options?spaceId=${encodeURIComponent(spaceId)}`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error();
          setOptions(await response.json());
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        });
    }
    return () => controller.abort();
  }, [spaceId, admin]);

  return (
    <label className="storage-select">
      {translate(locale, "Stockage", "Storage")}
      <select key={spaceId} name="storageTargetId" defaultValue="primary">
        <option value="primary">
          {translate(
            locale,
            "Stockage principal (par défaut)",
            "Primary storage (default)",
          )}
        </option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name} ({option.type.toUpperCase()})
          </option>
        ))}
      </select>
      {failed && (
        <small role="status">
          {translate(
            locale,
            "Stockages optionnels indisponibles.",
            "Optional storage is unavailable.",
          )}
        </small>
      )}
    </label>
  );
}
