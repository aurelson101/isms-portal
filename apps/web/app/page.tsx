"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { portalCatalog as copy } from "./i18n/catalogs";

type Locale = "fr" | "en";
type ViewMode = "list" | "grid";
type DocumentSort = "recent" | "popular";
type PdfZoom = number | "page-width" | "page-fit";
type WatermarkPosition = "HEADER" | "CENTER" | "FOOTER";
type SpacePermissions = {
  showMenu: boolean;
  read: boolean;
  search: boolean;
  preview: boolean;
  download: boolean;
  upload: boolean;
  edit: boolean;
  publish: boolean;
  archive: boolean;
};
type Space = {
  id: string;
  slug: string;
  nameFr: string;
  nameEn: string;
  permissions?: SpacePermissions;
  categories: Category[];
};
type Category = {
  id: string;
  slug: string;
  nameFr: string;
  nameEn: string;
  spaceId: string;
  documentCount?: number;
};

const populatedCategories = (space: Space) =>
  space.categories.filter((category) => category.documentCount !== 0);
type Translation = {
  locale: string;
  title: string;
  description?: string | null;
};
type Version = {
  locale: string;
  version: number;
  storedFile: { mimeType: string; originalName: string; size: string | number };
};
type PortalDocument = {
  id: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | "QUARANTINED";
  sensitive: boolean;
  watermarkPosition: WatermarkPosition;
  publishedAt: string;
  viewCount: number;
  downloadCount: number;
  space: Space;
  category: { slug: string; nameFr: string; nameEn: string } | null;
  translations: Translation[];
  versions: Version[];
  permissions: {
    preview: boolean;
    download: boolean;
    upload: boolean;
    edit: boolean;
    publish: boolean;
    archive: boolean;
  };
};
type PaginatedDocuments = {
  items: PortalDocument[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
type Identity = {
  displayName: string;
  username: string;
  isAdmin: boolean;
  locale: Locale | null;
  authentication: {
    source: string;
    ssoConnected: boolean;
    sessionExpiresAt: string | null;
    loginUrl: string | null;
    logoutUrl: string | null;
    diagnostics: {
      groupCount: number;
      matchedGroups?: string[];
      mappedSpaceCount: number;
      administrator: boolean;
      administratorAccount: boolean;
    };
  };
  spaces: Space[];
};

const wordMime =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const excelMime =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function fileLabel(mimeType?: string) {
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType === wordMime) return "DOCX";
  if (mimeType === excelMime) return "XLSX";
  if (mimeType?.startsWith("image/")) return "IMG";
  return "FILE";
}

function SensitiveWatermark({ position }: { position: WatermarkPosition }) {
  return (
    <span
      className={`sensitive-watermark ${position.toLowerCase()}`}
      aria-hidden="true"
    >
      SENSITIVE DOCUMENT
    </span>
  );
}

function OfficePreview({
  url,
  mimeType,
  locale,
}: {
  url: string;
  mimeType: string;
  locale: Locale;
}) {
  const t = copy[locale];
  const [text, setText] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setText("");
    setRows([]);
    setTruncated(false);
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("preview");
        const arrayBuffer = await response.arrayBuffer();
        if (mimeType === wordMime) {
          const mammoth = await import("mammoth");
          const result = await mammoth.extractRawText({ arrayBuffer });
          setTruncated(result.value.length > 200_000);
          setText(result.value.slice(0, 200_000));
        } else {
          const { strFromU8, unzipSync } = await import("fflate");
          const files = unzipSync(new Uint8Array(arrayBuffer), {
            filter: (file) => {
              const wanted =
                file.name === "xl/sharedStrings.xml" ||
                /^xl\/worksheets\/sheet\d+\.xml$/.test(file.name);
              return wanted && file.originalSize <= 8 * 1024 * 1024;
            },
          });
          const parser = new DOMParser();
          const sharedXml = files["xl/sharedStrings.xml"];
          const shared = sharedXml
            ? Array.from(
                parser
                  .parseFromString(strFromU8(sharedXml), "application/xml")
                  .getElementsByTagName("si"),
              ).map((item) =>
                Array.from(item.getElementsByTagName("t"))
                  .map((node) => node.textContent || "")
                  .join(""),
              )
            : [];
          const sheetName = Object.keys(files)
            .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
            .sort()[0];
          if (!sheetName) throw new Error("worksheet");
          const sheet = parser.parseFromString(
            strFromU8(files[sheetName]),
            "application/xml",
          );
          const allRows = Array.from(sheet.getElementsByTagName("row"));
          setTruncated(allRows.length > 100);
          setRows(
            allRows.slice(0, 100).map((row) => {
              const values: string[] = [];
              Array.from(row.getElementsByTagName("c"))
                .slice(0, 30)
                .forEach((cell) => {
                  const reference = cell.getAttribute("r") || "";
                  const letters = reference.match(/[A-Z]+/)?.[0] || "A";
                  const column =
                    letters
                      .split("")
                      .reduce(
                        (value, letter) =>
                          value * 26 + letter.charCodeAt(0) - 64,
                        0,
                      ) - 1;
                  const raw =
                    cell.getElementsByTagName("v")[0]?.textContent || "";
                  const inline = Array.from(cell.getElementsByTagName("t"))
                    .map((node) => node.textContent || "")
                    .join("");
                  values[column] =
                    cell.getAttribute("t") === "s"
                      ? shared[Number(raw)] || ""
                      : inline || raw;
                });
              return values;
            }),
          );
        }
        setState("ready");
      })
      .catch((error) => {
        if ((error as Error).name !== "AbortError") setState("error");
      });
    return () => controller.abort();
  }, [mimeType, url]);

  if (state === "loading")
    return <p className="loading-state">{t.previewLoading}</p>;
  if (state === "error") return <p className="error-state">{t.previewError}</p>;
  return (
    <div className="office-preview" aria-label={t.readonly}>
      <strong className="readonly-label">{t.readonly}</strong>
      {mimeType === wordMime ? (
        <pre>{text}</pre>
      ) : (
        <div className="sheet-preview">
          <table>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {truncated && <small>{t.truncated}</small>}
    </div>
  );
}

const titleFor = (document: PortalDocument, locale: Locale) =>
  document.translations.find((translation) => translation.locale === locale)
    ?.title ||
  document.translations[0]?.title ||
  document.id;

function DocumentRows({
  documents,
  locale,
  selectedLocales,
  onLocale,
  onOpen,
  onEdit,
  onTransition,
  viewMode = "list",
}: {
  documents: PortalDocument[];
  locale: Locale;
  selectedLocales: Record<string, Locale>;
  onLocale: (id: string, locale: Locale) => void;
  onOpen: (document: PortalDocument) => void;
  onEdit: (document: PortalDocument) => void;
  onTransition: (
    document: PortalDocument,
    action: "publish" | "archive" | "restore",
  ) => void;
  viewMode?: ViewMode;
}) {
  const t = copy[locale];
  if (documents.length === 0)
    return (
      <div className="empty-state" role="status">
        <Icon name="folder" />
        <strong>{t.empty}</strong>
        <span>{t.emptyHint}</span>
      </div>
    );
  return (
    <section
      className={`documents ${viewMode === "grid" ? "document-grid" : "document-list"}`}
    >
      {documents.map((document) => {
        const available = Array.from(
          new Set(document.versions.map((version) => version.locale)),
        ) as Locale[];
        const selected = available.includes(selectedLocales[document.id])
          ? selectedLocales[document.id]
          : available.includes(locale)
            ? locale
            : available[0];
        const translation = document.translations.find(
          (item) => item.locale === selected,
        );
        return (
          <div className="document" key={document.id}>
            <span className="file">
              {fileLabel(document.versions[0]?.storedFile.mimeType)}
            </span>
            <button className="document-title" onClick={() => onOpen(document)}>
              {translation?.title || titleFor(document, locale)}
            </button>
            <span className="category">
              {document.category
                ? locale === "fr"
                  ? document.category.nameFr
                  : document.category.nameEn
                : "—"}
            </span>
            <span className="locales">
              {(["fr", "en"] as Locale[]).map((item) => (
                <button
                  className={selected === item ? "selected" : ""}
                  disabled={!available.includes(item)}
                  title={!available.includes(item) ? t.unavailable : undefined}
                  onClick={() => onLocale(document.id, item)}
                  key={item}
                >
                  {item.toUpperCase()}
                </button>
              ))}
            </span>
            <span className="document-row-actions">
              <button
                className="document-open"
                onClick={() => onOpen(document)}
                disabled={!document.permissions.preview}
              >
                {t.open}
              </button>
              {selected && document.permissions.download ? (
                <a
                  className="download"
                  href={`/api/documents/${document.id}/download?locale=${selected}`}
                  aria-label={t.download}
                  title={t.download}
                >
                  <Icon name="download" />
                </a>
              ) : (
                <button className="download" disabled aria-label={t.download}>
                  <Icon name="download" />
                </button>
              )}
              {(document.permissions.edit ||
                document.permissions.publish ||
                document.permissions.archive) && (
                <span
                  className="document-manage-actions"
                  aria-label={t.permissionsGranted}
                >
                  {document.permissions.edit && (
                    <button type="button" onClick={() => onEdit(document)}>
                      {t.edit}
                    </button>
                  )}
                  {document.permissions.publish &&
                    document.status !== "PUBLISHED" && (
                      <button
                        type="button"
                        onClick={() => onTransition(document, "publish")}
                      >
                        {t.publish}
                      </button>
                    )}
                  {document.permissions.archive &&
                    document.status !== "ARCHIVED" && (
                      <button
                        type="button"
                        onClick={() => onTransition(document, "archive")}
                      >
                        {t.archive}
                      </button>
                    )}
                  {document.permissions.archive &&
                    document.status === "ARCHIVED" && (
                      <button
                        type="button"
                        onClick={() => onTransition(document, "restore")}
                      >
                        {t.restore}
                      </button>
                    )}
                </span>
              )}
            </span>
            {!available.includes(locale) && <small>{t.unavailable}</small>}
          </div>
        );
      })}
    </section>
  );
}

export function Portal({ explorerMode = false }: { explorerMode?: boolean }) {
  const [locale, setLocale] = useState<Locale>("fr");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [space, setSpace] = useState("");
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedLocales, setSelectedLocales] = useState<
    Record<string, Locale>
  >({});
  const [opened, setOpened] = useState<PortalDocument | null>(null);
  const [editing, setEditing] = useState<PortalDocument | null>(null);
  const [depositOpen, setDepositOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [documentSort, setDocumentSort] = useState<DocumentSort>("recent");
  const [viewerExpanded, setViewerExpanded] = useState(false);
  const [pdfZoom, setPdfZoom] = useState<PdfZoom>("page-width");
  const [sessionExpired, setSessionExpired] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setLoadError(false);
      const parameters = new URLSearchParams();
      if (query.trim()) parameters.set("q", query.trim());
      if (category) parameters.set("categoryId", category);
      if (space) parameters.set("space", space);
      parameters.set("sort", documentSort);
      parameters.set("page", String(page));
      parameters.set("limit", "10");
      try {
        const response = await fetch(`/api/documents?${parameters}`, {
          signal,
        });
        if (!response.ok) throw new Error("documents");
        const result = (await response.json()) as PaginatedDocuments;
        setDocuments(result.items);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        if (result.page !== page) {
          setPage(result.page);
          const currentUrl = new URL(window.location.href);
          if (result.page > 1)
            currentUrl.searchParams.set("page", String(result.page));
          else currentUrl.searchParams.delete("page");
          window.history.replaceState(
            null,
            "",
            `${currentUrl.pathname}${currentUrl.search}`,
          );
        }
      } catch (error) {
        if ((error as Error).name !== "AbortError") setLoadError(true);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [query, category, space, page, documentSort],
  );

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const requestedCategory = parameters.get("categoryId");
    const legacyCategory = parameters.get("category");
    const requestedSpace = parameters.get("space");
    const requestedQuery = parameters.get("q");
    const requestedSort = parameters.get("sort");
    setPage(Math.max(1, Number(parameters.get("page")) || 1));
    if (requestedCategory) {
      setCategory(requestedCategory);
      setSpace(requestedSpace || "");
    } else if (legacyCategory) {
      setCategory(legacyCategory);
      setSpace("");
    }
    if (requestedSpace && !requestedCategory && !legacyCategory) {
      setSpace(requestedSpace);
      setCategory("");
    }
    if (requestedQuery) {
      setQuery(requestedQuery);
      setCategory("");
      setSpace("");
    }
    if (requestedSort === "popular") setDocumentSort("popular");
    const savedView = localStorage.getItem("isms-document-view");
    if (savedView === "grid" || savedView === "list") setViewMode(savedView);
  }, []);

  useEffect(() => {
    const closeNavigation = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavigationOpen(false);
      if (
        event.key === "/" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement) &&
        !(event.target instanceof HTMLSelectElement)
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeNavigation);
    return () => window.removeEventListener("keydown", closeNavigation);
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      const response = await fetch("/api/me", { cache: "no-store" }).catch(
        () => null,
      );
      if (!response?.ok) {
        setSessionExpired(true);
        return;
      }
      setIdentity((await response.json()) as Identity);
      setSessionExpired(false);
    };
    const timer = window.setInterval(() => void checkSession(), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch("/api/me?refresh=1", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          window.location.assign("/login?return=/");
          throw new Error("authentication-required");
        }
        if (!response.ok) throw new Error("identity");
        return response.json() as Promise<Identity>;
      })
      .then((currentIdentity) => {
        setIdentity(currentIdentity);
        const saved =
          currentIdentity.locale ||
          (localStorage.getItem("isms-locale") as Locale | null);
        const preferred =
          saved || (navigator.language.startsWith("en") ? "en" : "fr");
        setLocale(preferred);
        document.documentElement.lang = preferred;
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    if (!explorerMode || !identity) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => void loadDocuments(controller.signal),
      query ? 300 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [explorerMode, identity, loadDocuments, query]);

  useEffect(() => {
    if (!category && !space && !query) return;
    const timer = window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [category, space, query]);

  const changeLocale = async (next: Locale) => {
    setLocale(next);
    localStorage.setItem("isms-locale", next);
    document.documentElement.lang = next;
    setSelectedLocales((current) => ({ ...current }));
    await fetch("/api/me/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    }).catch(() => undefined);
  };

  const selectCategory = (spaceSlug: string, categoryId: string) => {
    if (!explorerMode) {
      window.location.assign(
        `/explorer?space=${encodeURIComponent(spaceSlug)}&categoryId=${encodeURIComponent(categoryId)}`,
      );
      return;
    }
    setQuery("");
    setCategory(categoryId);
    setSpace(spaceSlug);
    setPage(1);
    window.history.replaceState(
      null,
      "",
      `/explorer?space=${encodeURIComponent(spaceSlug)}&categoryId=${encodeURIComponent(categoryId)}${documentSort === "popular" ? "&sort=popular" : ""}`,
    );
  };
  const changeViewMode = (next: ViewMode) => {
    setViewMode(next);
    localStorage.setItem("isms-document-view", next);
  };
  const changeDocumentSort = (next: DocumentSort) => {
    setDocumentSort(next);
    setPage(1);
    const parameters = new URLSearchParams(window.location.search);
    parameters.delete("page");
    if (next === "popular") parameters.set("sort", next);
    else parameters.delete("sort");
    window.history.replaceState(
      null,
      "",
      `/explorer${parameters.size ? `?${parameters}` : ""}`,
    );
  };
  const transitionDocument = async (
    document: PortalDocument,
    action: "publish" | "archive" | "restore",
  ) => {
    setActionError("");
    const response = await fetch(`/api/documents/${document.id}/${action}`, {
      method: "POST",
    });
    if (!response.ok) {
      setActionError(t.error);
      return;
    }
    setOpened(null);
    await loadDocuments();
  };
  const selectSpace = (next: string) => {
    if (!explorerMode) {
      window.location.assign(`/explorer?space=${encodeURIComponent(next)}`);
      return;
    }
    setQuery("");
    setSpace(next);
    setCategory("");
    setPage(1);
    window.history.replaceState(
      null,
      "",
      `/explorer?space=${encodeURIComponent(next)}${documentSort === "popular" ? "&sort=popular" : ""}`,
    );
  };
  const selectHome = () => {
    window.location.assign("/");
  };
  const clearFilters = () => {
    setQuery("");
    setCategory("");
    setSpace("");
    setPage(1);
    setDocumentSort("recent");
    window.history.replaceState(null, "", "/explorer");
  };
  const changePage = (next: number) => {
    const target = Math.min(Math.max(1, next), Math.max(1, totalPages));
    setPage(target);
    const parameters = new URLSearchParams();
    if (query.trim()) parameters.set("q", query.trim());
    if (category) parameters.set("categoryId", category);
    if (space) parameters.set("space", space);
    if (documentSort === "popular") parameters.set("sort", documentSort);
    if (target > 1) parameters.set("page", String(target));
    window.history.replaceState(null, "", `/explorer?${parameters}`);
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const t = copy[locale];
  const selectedCategory = identity?.spaces
    .flatMap((item) => item.categories)
    .find((item) => item.id === category);
  const categoryLabel = selectedCategory
    ? locale === "fr"
      ? selectedCategory.nameFr
      : selectedCategory.nameEn
    : category;
  const initials = useMemo(
    () =>
      (identity?.displayName || "ISMS")
        .split(/\s+/)
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [identity],
  );
  const openedLocale = opened
    ? selectedLocales[opened.id] ||
      (opened.versions.some((version) => version.locale === locale)
        ? locale
        : (opened.versions[0]?.locale as Locale))
    : null;
  const openedVersion = opened?.versions.find(
    (version) => version.locale === openedLocale,
  );
  const openedPdf = openedVersion?.storedFile.mimeType === "application/pdf";
  const openedContentUrl = openedVersion
    ? `/api/documents/${opened?.id}/content?locale=${openedLocale}`
    : "";
  const pdfSource = openedPdf
    ? `${openedContentUrl}#toolbar=1&navpanes=0&zoom=${pdfZoom}`
    : openedContentUrl;
  const selectedSpace = identity?.spaces.find((item) => item.slug === space);

  const changePdfZoom = useCallback(
    (direction: -1 | 1) => {
      const current = typeof pdfZoom === "number" ? pdfZoom : 100;
      setPdfZoom(Math.min(200, Math.max(50, current + direction * 25)));
    },
    [pdfZoom],
  );

  useEffect(() => {
    setPdfZoom("page-width");
  }, [opened?.id, openedLocale]);

  useEffect(() => {
    if (!openedPdf) return;
    const handlePdfShortcut = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        changePdfZoom(1);
      } else if (event.key === "-") {
        event.preventDefault();
        changePdfZoom(-1);
      } else if (event.key === "0") {
        event.preventDefault();
        setPdfZoom("page-width");
      }
    };
    window.addEventListener("keydown", handlePdfShortcut);
    return () => window.removeEventListener("keydown", handlePdfShortcut);
  }, [openedPdf, changePdfZoom]);

  return (
    <div className="shell">
      <aside className={navigationOpen ? "navigation-open" : ""}>
        <div className="sidebar-heading">
          <div className="brand">
            <div className="shield">
              <Icon name="shield" />
            </div>
            <div>
              <strong>ISMS Portal</strong>
              <small>{t.systemName}</small>
            </div>
          </div>
          <button
            type="button"
            className="navigation-toggle"
            aria-controls="portal-navigation"
            aria-expanded={navigationOpen}
            aria-label={navigationOpen ? t.closeNavigation : t.openNavigation}
            onClick={() => setNavigationOpen((current) => !current)}
          >
            <Icon name={navigationOpen ? "close" : "menu"} />
          </button>
        </div>
        <nav id="portal-navigation" aria-label={t.navigation}>
          <button
            type="button"
            className={!explorerMode ? "active" : ""}
            onClick={selectHome}
          >
            <Icon name="home" /> <span>{t.home}</span>
          </button>
          {identity?.spaces.map((item) => (
            <div className="navigation-space" key={item.id}>
              <button
                type="button"
                className={`space-menu ${space === item.slug && !category ? "active" : ""}`}
                onClick={() => selectSpace(item.slug)}
              >
                <Icon name="folder" />{" "}
                <span>{locale === "fr" ? item.nameFr : item.nameEn}</span>
              </button>
              {populatedCategories(item).length > 0 && (
                <div className="category-submenu">
                  {populatedCategories(item).map((itemCategory) => (
                    <button
                      type="button"
                      className={`category-menu ${category === itemCategory.id ? "active" : ""}`}
                      onClick={() => selectCategory(item.slug, itemCategory.id)}
                      key={itemCategory.id}
                    >
                      <Icon name="folder" />{" "}
                      <span>
                        {locale === "fr"
                          ? itemCategory.nameFr
                          : itemCategory.nameEn}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="secure">
          ✓ <span>{t.secured}</span>
        </div>
      </aside>
      <main>
        <header>
          <div
            className="language"
            role="group"
            aria-label={t.interfaceLanguage}
          >
            <button
              onClick={() => void changeLocale("fr")}
              aria-pressed={locale === "fr"}
            >
              FR
            </button>
            <i />{" "}
            <button
              onClick={() => void changeLocale("en")}
              aria-pressed={locale === "en"}
            >
              EN
            </button>
          </div>
          <button
            className="help"
            onClick={() => setHelpOpen(true)}
            aria-label={t.help}
          >
            ?
          </button>
          <button
            className="account-button"
            onClick={() => setAccountOpen((current) => !current)}
            aria-expanded={accountOpen}
          >
            <span className="avatar">{initials}</span>
            <span>{identity?.displayName || "…"}⌄</span>
          </button>
          {accountOpen && (
            <div className="account-menu">
              <strong>{identity?.displayName}</strong>
              <small>{identity?.username}</small>
              <span
                className={
                  identity?.authentication.ssoConnected
                    ? "auth-status connected"
                    : "auth-status local"
                }
              >
                {identity?.authentication.ssoConnected
                  ? t.ssoConnected
                  : identity?.authentication.source === "directory-session"
                    ? t.directorySession
                    : t.localAdminSession}
              </span>
              {identity?.isAdmin && <a href="/admin">{t.administration}</a>}
              {identity && (
                <dl className="session-diagnostics">
                  {!identity.isAdmin && (
                    <>
                      <dt>{t.groupsDetected}</dt>
                      <dd>{identity.authentication.diagnostics.groupCount}</dd>
                      <dt>{t.groupsRecognized}</dt>
                      <dd>
                        {(identity.authentication.diagnostics.matchedGroups
                          ?.length ?? 0) > 0 ? (
                          <details className="matched-groups">
                            <summary>
                              {
                                identity.authentication.diagnostics
                                  .matchedGroups?.length
                              }
                            </summary>
                            <ul>
                              {identity.authentication.diagnostics.matchedGroups?.map(
                                (group) => (
                                  <li key={group}>{group}</li>
                                ),
                              )}
                            </ul>
                          </details>
                        ) : (
                          t.noRecognizedGroup
                        )}
                      </dd>
                    </>
                  )}
                  <dt>{t.spacesMapped}</dt>
                  <dd>
                    {identity.authentication.diagnostics.mappedSpaceCount}
                  </dd>
                  <dt>{t.sessionExpiry}</dt>
                  <dd>
                    {identity.authentication.sessionExpiresAt
                      ? new Date(
                          identity.authentication.sessionExpiresAt,
                        ).toLocaleString(locale)
                      : t.noExpiry}
                  </dd>
                </dl>
              )}
              {identity?.authentication.logoutUrl && (
                <a href={identity.authentication.logoutUrl}>{t.signOut}</a>
              )}
              {identity &&
                ["directory-session", "local-admin"].includes(
                  identity.authentication.source,
                ) && (
                  <button
                    type="button"
                    onClick={() =>
                      fetch("/api/auth/logout?scope=user", {
                        method: "POST",
                      }).then(() =>
                        window.location.assign("/login?loggedout=1"),
                      )
                    }
                  >
                    {t.signOut}
                  </button>
                )}
            </div>
          )}
        </header>
        <h1>
          {explorerMode
            ? t.explorer
            : `${t.welcome} ${identity?.displayName || "…"}`}
        </h1>
        <p className="lead">
          {explorerMode
            ? locale === "fr"
              ? "Choisissez une catégorie ou un espace, puis ouvrez vos documents dans le lecteur sécurisé."
              : "Choose a category or space, then open your documents in the secure viewer."
            : t.subtitle}
        </p>
        <form
          className="search"
          onSubmit={(event) => {
            event.preventDefault();
            if (explorerMode) {
              const parameters = new URLSearchParams();
              if (query.trim()) parameters.set("q", query.trim());
              if (documentSort === "popular") {
                parameters.set("sort", documentSort);
              }
              window.history.replaceState(
                null,
                "",
                `/explorer${parameters.size ? `?${parameters}` : ""}`,
              );
              void loadDocuments();
            } else {
              window.location.assign(
                `/explorer?q=${encodeURIComponent(query.trim())}`,
              );
            }
          }}
        >
          <span>
            <Icon name="search" />
          </span>
          <input
            ref={searchInputRef}
            value={query}
            onChange={(event) => {
              const value = event.target.value;
              setQuery(value);
              setPage(1);
              if (value.trim()) {
                setCategory("");
                setSpace("");
              }
            }}
            placeholder={t.search}
            aria-label={t.search}
          />
          {query && (
            <button
              className="search-clear"
              aria-label={t.clearSearch}
              title={t.clearSearch}
              type="button"
              onClick={() => {
                setQuery("");
                setPage(1);
              }}
            >
              <Icon name="close" />
            </button>
          )}
          <button aria-label={t.search} type="submit">
            <Icon name="search" />
          </button>
        </form>
        {explorerMode && (query || space || category) && (
          <div className="active-context" aria-label={t.activeFilters}>
            <div>
              <span>{t.currentSelection}</span>
              <strong>
                {query
                  ? `“${query}”`
                  : category
                    ? categoryLabel
                    : selectedSpace
                      ? locale === "fr"
                        ? selectedSpace.nameFr
                        : selectedSpace.nameEn
                      : t.explorer}
              </strong>
            </div>
            <button type="button" onClick={clearFilters}>
              {t.clearFilters}
            </button>
          </div>
        )}
        {!explorerMode && (
          <section className="cards" aria-label={t.spaces}>
            {identity?.spaces.map((item) => {
              const categories = populatedCategories(item);
              const count = categories.reduce(
                (sum, itemCategory) => sum + (itemCategory.documentCount || 0),
                0,
              );
              return (
                <article className="space-card" key={item.id}>
                  <div className="card-icon">
                    <Icon name="folder" />
                  </div>
                  <h2>{locale === "fr" ? item.nameFr : item.nameEn}</h2>
                  <p className="space-card-count">
                    {count} {count === 1 ? t.documentCountOne : t.documentCount}
                  </p>
                  {categories.length > 0 && (
                    <div className="category-links">
                      {categories.slice(0, 4).map((itemCategory) => (
                        <button
                          type="button"
                          key={itemCategory.id}
                          onClick={() =>
                            selectCategory(item.slug, itemCategory.id)
                          }
                        >
                          {locale === "fr"
                            ? itemCategory.nameFr
                            : itemCategory.nameEn}
                          <span>{itemCategory.documentCount || 0}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button type="button" onClick={() => selectSpace(item.slug)}>
                    {t.browseSpace} <Icon name="chevron" />
                  </button>
                </article>
              );
            })}
          </section>
        )}
        {explorerMode && (
          <div ref={resultsRef} className="results-anchor" tabIndex={-1}>
            {loadError && (
              <p role="alert" className="error-state">
                {t.error}
              </p>
            )}
            {loading ? (
              <p className="loading-state">{t.loading}</p>
            ) : (
              <>
                <section
                  className="explorer-heading"
                  aria-labelledby="explorer-title"
                >
                  <div>
                    <span>{t.explorer}</span>
                    <h2 id="explorer-title">
                      {category
                        ? categoryLabel
                        : query
                          ? t.searchResults
                          : selectedSpace
                            ? locale === "fr"
                              ? selectedSpace.nameFr
                              : selectedSpace.nameEn
                            : t.recent}
                    </h2>
                    <p>
                      {total}{" "}
                      {total === 1 ? t.documentCountOne : t.documentCount}
                    </p>
                  </div>
                  <div className="explorer-controls">
                    {space && selectedSpace?.permissions?.upload && (
                      <button
                        type="button"
                        className="primary"
                        onClick={() => setDepositOpen(true)}
                      >
                        <Icon name="upload" />
                        {t.deposit}
                      </button>
                    )}
                    <label className="document-sort">
                      <span>{t.sortBy}</span>
                      <select
                        value={documentSort}
                        onChange={(event) =>
                          changeDocumentSort(event.target.value as DocumentSort)
                        }
                      >
                        <option value="recent">{t.sortRecent}</option>
                        <option value="popular">{t.sortPopular}</option>
                      </select>
                    </label>
                    <div
                      className="view-switcher"
                      role="group"
                      aria-label={t.displayMode}
                    >
                      <button
                        type="button"
                        aria-pressed={viewMode === "grid"}
                        aria-label={t.gridView}
                        title={t.gridView}
                        onClick={() => changeViewMode("grid")}
                      >
                        <Icon name="grid" />
                        <span>{locale === "fr" ? "Fenêtres" : "Windows"}</span>
                      </button>
                      <button
                        type="button"
                        aria-pressed={viewMode === "list"}
                        aria-label={t.listView}
                        title={t.listView}
                        onClick={() => changeViewMode("list")}
                      >
                        <Icon name="list" />
                        <span>{locale === "fr" ? "Liste" : "List"}</span>
                      </button>
                    </div>
                  </div>
                </section>
                <DocumentRows
                  documents={documents}
                  locale={locale}
                  selectedLocales={selectedLocales}
                  onLocale={(id, next) =>
                    setSelectedLocales((current) => ({
                      ...current,
                      [id]: next,
                    }))
                  }
                  onOpen={setOpened}
                  onEdit={setEditing}
                  onTransition={(document, action) =>
                    void transitionDocument(document, action)
                  }
                  viewMode={viewMode}
                />
                {actionError && (
                  <p className="error-state" role="alert">
                    {actionError}
                  </p>
                )}
                {totalPages > 1 && (
                  <nav
                    className="document-pagination"
                    aria-label={t.pagination}
                  >
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => changePage(page - 1)}
                    >
                      ← {t.previous}
                    </button>
                    <span aria-live="polite">
                      {t.page} {page} {t.of} {Math.max(1, totalPages)}
                    </span>
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => changePage(page + 1)}
                    >
                      {t.next} →
                    </button>
                  </nav>
                )}
              </>
            )}
          </div>
        )}
      </main>
      {helpOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setHelpOpen(false)}
        >
          <section
            className="modal small-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setHelpOpen(false)}
              aria-label={t.close}
            >
              ×
            </button>
            <h2 id="help-title">{t.help}</h2>
            <p>{t.helpText}</p>
          </section>
        </div>
      )}
      {sessionExpired && (
        <div className="modal-backdrop">
          <section
            className="modal small-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="session-expired-title"
          >
            <h2 id="session-expired-title">{t.sessionExpired}</h2>
            <button
              className="primary"
              onClick={() =>
                window.location.assign(
                  identity?.authentication.loginUrl || window.location.href,
                )
              }
            >
              {t.reconnect}
            </button>
          </section>
        </div>
      )}
      {opened && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            setViewerExpanded(false);
            setOpened(null);
          }}
        >
          <section
            className={`modal document-modal ${viewerExpanded ? "expanded" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="viewer-header">
              <h2 id="document-title">
                {titleFor(opened, openedLocale || locale)}
              </h2>
              <div className="viewer-actions">
                <button
                  type="button"
                  onClick={() => setViewerExpanded((current) => !current)}
                  aria-label={viewerExpanded ? t.collapse : t.expand}
                  title={viewerExpanded ? t.collapse : t.expand}
                >
                  <Icon name={viewerExpanded ? "collapse" : "expand"} />
                </button>
                <button
                  className="modal-close"
                  onClick={() => {
                    setViewerExpanded(false);
                    setOpened(null);
                  }}
                  aria-label={t.close}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="modal-locales">
              {(["fr", "en"] as Locale[]).map((item) => (
                <button
                  key={item}
                  disabled={
                    !opened.versions.some((version) => version.locale === item)
                  }
                  className={openedLocale === item ? "selected" : ""}
                  onClick={() =>
                    setSelectedLocales((current) => ({
                      ...current,
                      [opened.id]: item,
                    }))
                  }
                >
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
            {openedPdf && opened?.permissions.preview && (
              <div
                className="pdf-toolbar"
                role="toolbar"
                aria-label={t.pdfControls}
              >
                <div className="pdf-zoom-controls">
                  <button
                    type="button"
                    onClick={() => changePdfZoom(-1)}
                    disabled={pdfZoom === 50}
                    aria-label={t.zoomOut}
                    title={`${t.zoomOut} (-)`}
                  >
                    −
                  </button>
                  <output aria-label={t.zoomLevel}>
                    {typeof pdfZoom === "number" ? `${pdfZoom}%` : "Auto"}
                  </output>
                  <button
                    type="button"
                    onClick={() => changePdfZoom(1)}
                    disabled={pdfZoom === 200}
                    aria-label={t.zoomIn}
                    title={`${t.zoomIn} (+)`}
                  >
                    +
                  </button>
                </div>
                <button
                  type="button"
                  className={pdfZoom === "page-width" ? "selected" : ""}
                  onClick={() => setPdfZoom("page-width")}
                  aria-pressed={pdfZoom === "page-width"}
                >
                  {t.fitWidth}
                </button>
                <button
                  type="button"
                  className={pdfZoom === "page-fit" ? "selected" : ""}
                  onClick={() => setPdfZoom("page-fit")}
                  aria-pressed={pdfZoom === "page-fit"}
                >
                  {t.fitPage}
                </button>
                <a
                  href={openedContentUrl}
                  target="_blank"
                  rel="noreferrer"
                  title={t.openNewTab}
                >
                  {t.openNewTab}
                </a>
              </div>
            )}
            {openedVersion && opened.permissions.preview ? (
              <>
                <div className="document-preview-frame">
                  {openedVersion.storedFile.mimeType === "application/pdf" ||
                  openedVersion.storedFile.mimeType.startsWith("image/") ? (
                    <iframe
                      title={titleFor(opened, openedLocale || locale)}
                      key={pdfSource}
                      src={pdfSource}
                    />
                  ) : [wordMime, excelMime].includes(
                      openedVersion.storedFile.mimeType,
                    ) ? (
                    <OfficePreview
                      url={`/api/documents/${opened.id}/content?locale=${openedLocale}`}
                      mimeType={openedVersion.storedFile.mimeType}
                      locale={locale}
                    />
                  ) : (
                    <p>{t.previewError}</p>
                  )}
                  {opened.sensitive && (
                    <SensitiveWatermark position={opened.watermarkPosition} />
                  )}
                </div>
                {opened.permissions.download ? (
                  <a
                    className="primary-link"
                    href={`/api/documents/${opened.id}/download?locale=${openedLocale}`}
                  >
                    {t.download}
                  </a>
                ) : (
                  <strong className="readonly-label">{t.readonly}</strong>
                )}
              </>
            ) : openedVersion ? (
              <p>{t.previewUnavailable}</p>
            ) : (
              <p>{t.fileUnavailable}</p>
            )}
          </section>
        </div>
      )}
      {editing && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal small-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-document-title"
          >
            <h2 id="edit-document-title">{t.edit}</h2>
            <form
              className="admin-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const values = Object.fromEntries(
                  new FormData(event.currentTarget),
                );
                const response = await fetch(
                  `/api/documents/${editing.id}/metadata`,
                  {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(values),
                  },
                );
                if (!response.ok) {
                  setActionError(t.error);
                  return;
                }
                setEditing(null);
                await loadDocuments();
              }}
            >
              <label>
                {locale === "fr" ? "Langue" : "Language"}
                <select name="locale" defaultValue={locale}>
                  <option value="fr">FR</option>
                  <option value="en">EN</option>
                </select>
              </label>
              <label>
                {locale === "fr" ? "Titre" : "Title"}
                <input
                  name="title"
                  required
                  defaultValue={titleFor(editing, locale)}
                />
              </label>
              <label>
                {locale === "fr" ? "Description" : "Description"}
                <textarea
                  name="description"
                  defaultValue={
                    editing.translations.find(
                      (translation) => translation.locale === locale,
                    )?.description || ""
                  }
                />
              </label>
              <div className="button-row">
                <button className="primary">{t.save}</button>
                <button type="button" onClick={() => setEditing(null)}>
                  {t.cancel}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {depositOpen && selectedSpace && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setDepositOpen(false)}
        >
          <section
            className="modal small-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deposit-document-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="deposit-document-title">{t.depositDocument}</h2>
            <p>
              {locale === "fr" ? selectedSpace.nameFr : selectedSpace.nameEn}
            </p>
            <form
              className="admin-form"
              onSubmit={async (event) => {
                event.preventDefault();
                setActionError("");
                const data = new FormData(event.currentTarget);
                data.set("spaceId", selectedSpace.id);
                const response = await fetch("/api/documents/upload", {
                  method: "POST",
                  body: data,
                });
                if (!response.ok) {
                  setActionError(t.depositError);
                  return;
                }
                setDepositOpen(false);
                await loadDocuments();
              }}
            >
              <fieldset className="document-language-field">
                <legend>{t.documentLanguage}</legend>
                <div className="document-language-options">
                  <label className="document-language-option">
                    <input
                      name="locale"
                      type="radio"
                      value="fr"
                      defaultChecked={locale === "fr"}
                    />
                    <span>FR</span>
                  </label>
                  <label className="document-language-option">
                    <input
                      name="locale"
                      type="radio"
                      value="en"
                      defaultChecked={locale === "en"}
                    />
                    <span>EN</span>
                  </label>
                </div>
                <small>{t.documentLanguageHint}</small>
              </fieldset>
              <label>
                {t.title}
                <input name="title" required maxLength={200} />
              </label>
              <label>
                {t.description}
                <textarea name="description" maxLength={2000} />
              </label>
              <label>
                {t.file}
                <input
                  name="file"
                  type="file"
                  required
                  accept=".pdf,.docx,.xlsx"
                />
              </label>
              <small>{t.acceptedFiles}</small>
              {actionError && <p className="error-state">{actionError}</p>}
              <div className="button-row">
                <button className="primary">{t.deposit}</button>
                <button type="button" onClick={() => setDepositOpen(false)}>
                  {t.cancel}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return <Portal />;
}
