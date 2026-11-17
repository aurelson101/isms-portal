"use client";
import { useEffect, useRef, useState } from "react";
import { documentLabel } from "./document-management-copy";
import { readLocale, type Locale } from "./i18n/locale";
import "./document-management.css";

export function DuplicateUploadNotice() {
  const [duplicate, setDuplicate] = useState<{
    slug: string;
    title: string;
  } | null>(null);
  const [locale, setLocale] = useState<Locale>("fr");
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const close = () => {
    setDuplicate(null);
    if (returnFocus.current?.isConnected) returnFocus.current.focus();
  };
  useEffect(() => {
    if (duplicate) closeButton.current?.focus();
  }, [duplicate]);
  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (
        detail &&
        typeof detail.slug === "string" &&
        typeof detail.title === "string"
      ) {
        if (!closeButton.current?.contains(document.activeElement))
          returnFocus.current = document.activeElement as HTMLElement | null;
        setLocale(readLocale());
        setDuplicate({ slug: detail.slug, title: detail.title });
      }
    };
    window.addEventListener("isms:duplicate-upload", show);
    return () => window.removeEventListener("isms:duplicate-upload", show);
  }, []);
  if (!duplicate) return null;
  return (
    <aside
      role="alert"
      className="duplicate-upload-notice"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <strong>{documentLabel(locale, "duplicate")}</strong>
      <p>{duplicate.title}</p>
      <div className="button-row">
        <a
          href={`/documents/${encodeURIComponent(duplicate.slug)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {documentLabel(locale, "open")}
        </a>
        <a
          href={`/moderator?q=${encodeURIComponent(duplicate.title)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          {documentLabel(locale, "version")}
        </a>
        <button ref={closeButton} type="button" onClick={close}>
          {documentLabel(locale, "close")}
        </button>
      </div>
    </aside>
  );
}
