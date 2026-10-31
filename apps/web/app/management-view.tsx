"use client";
import { useEffect, useState } from "react";
import type { Locale } from "./i18n/locale";
import { Icon } from "./icons";
import { documentLabel } from "./document-management-copy";
import "./document-management.css";

type ManagementView = "list" | "grid";
const storageKey = "isms-management-view";
export function useManagementView() {
  const [view, setView] = useState<ManagementView>("list");
  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === "grid") setView("grid");
    } catch {
      /* The default remains usable without browser storage. */
    }
  }, []);
  const changeView = (value: ManagementView) => {
    setView(value);
    try {
      localStorage.setItem(storageKey, value);
    } catch {
      /* The selection still applies to this page. */
    }
  };
  return [view, changeView] as const;
}
export function ManagementViewToggle({
  locale,
  view,
  onChange,
}: {
  locale: Locale;
  view: ManagementView;
  onChange: (value: ManagementView) => void;
}) {
  return (
    <div
      className="management-view-toggle"
      role="group"
      aria-label={documentLabel(locale, "display")}
    >
      {(["list", "grid"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={view === value}
          className={`document-action${view === value ? " primary" : ""}`}
          onClick={() => onChange(value)}
        >
          <Icon name={value} />
          {documentLabel(locale, value)}
        </button>
      ))}
    </div>
  );
}
