"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "./icons";
import { portalCatalog as copy } from "./i18n/catalogs";

type Locale = "fr" | "en";
type ViewMode = "list" | "grid";
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
  administer: boolean;
};
type Space = {
  id: string;
  slug: string;
  nameFr: string;
  nameEn: string;
  permissions?: SpacePermissions;
};
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
    administer: boolean;
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
      mappedSpaceCount: number;
      administrator: boolean;
      adminGroupMatchCount: number;
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
  onDelete,
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
  onDelete: (document: PortalDocument) => void;
  viewMode?: ViewMode;
}) {
  const t = copy[locale];
  if (documents.length === 0) return <p className="empty-state">{t.empty}</p>;
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
            <button
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
              >
                <Icon name="download" />
              </a>
            ) : (
              <button className="download" disabled>
                <Icon name="download" />
              </button>
            )}
            {(document.permissions.edit ||
              document.permissions.publish ||
              document.permissions.archive ||
              document.permissions.administer) && (
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
                {document.permissions.administer && (
                  <button
                    type="button"
                    className="danger"
                    onClick={() => onDelete(document)}
                  >
                    {t.delete}
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
  const [category, setCategory] = useState(explorerMode ? "policies" : "");
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
  const [deleting, setDeleting] = useState<PortalDocument | null>(null);
  const [actionError, setActionError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [viewerExpanded, setViewerExpanded] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const loadDocuments = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setLoadError(false);
      const parameters = new URLSearchParams();
      if (query.trim()) parameters.set("q", query.trim());
      if (category) parameters.set("category", category);
      if (space) parameters.set("space", space);
      parameters.set("sort", "recent");
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
    [query, category, space, page],
  );

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const requestedCategory = parameters.get("category");
    const requestedSpace = parameters.get("space");
    const requestedQuery = parameters.get("q");
    setPage(Math.max(1, Number(parameters.get("page")) || 1));
    if (requestedCategory) {
      setCategory(requestedCategory);
      setSpace("");
    }
    if (requestedSpace) {
      setSpace(requestedSpace);
      setCategory("");
    }
    if (requestedQuery) {
      setQuery(requestedQuery);
      setCategory("");
      setSpace("");
    }
    const savedView = localStorage.getItem("isms-document-view");
    if (savedView === "grid" || savedView === "list") setViewMode(savedView);
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
    fetch("/api/me")
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
    if (!explorerMode) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => void loadDocuments(controller.signal),
      query ? 300 : 0,
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [explorerMode, loadDocuments, query]);

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

  const selectCategory = (next: string) => {
    if (!explorerMode) {
      window.location.assign(`/explorer?category=${encodeURIComponent(next)}`);
      return;
    }
    setQuery("");
    setCategory(next);
    setSpace("");
    setPage(1);
    window.history.replaceState(
      null,
      "",
      `/explorer?category=${encodeURIComponent(next)}`,
    );
  };
  const changeViewMode = (next: ViewMode) => {
    setViewMode(next);
    localStorage.setItem("isms-document-view", next);
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
      `/explorer?space=${encodeURIComponent(next)}`,
    );
  };
  const selectHome = () => {
    window.location.assign("/");
  };
  const changePage = (next: number) => {
    const target = Math.min(Math.max(1, next), Math.max(1, totalPages));
    setPage(target);
    const parameters = new URLSearchParams();
    if (query.trim()) parameters.set("q", query.trim());
    if (category) parameters.set("category", category);
    if (space) parameters.set("space", space);
    if (target > 1) parameters.set("page", String(target));
    window.history.replaceState(null, "", `/explorer?${parameters}`);
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const t = copy[locale];
  const categoryLabel =
    category === "policies"
      ? t.policies
      : category === "procedures"
        ? t.procedures
        : category === "guides"
          ? t.guides
          : "";
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
  const selectedSpace = identity?.spaces.find((item) => item.slug === space);

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <div className="shield">
            <Icon name="shield" />
          </div>
          <div>
            <strong>ISMS Portal</strong>
            <small>{t.systemName}</small>
          </div>
        </div>
        <nav aria-label={t.navigation}>
          <button
            type="button"
            className={!explorerMode ? "active" : ""}
            onClick={selectHome}
          >
            <Icon name="home" /> <span>{t.home}</span>
          </button>
          <button
            className={category === "policies" ? "active" : ""}
            onClick={() => selectCategory("policies")}
          >
            <Icon name="policy" /> <span>{t.policies}</span>
          </button>
          <button
            className={category === "procedures" ? "active" : ""}
            onClick={() => selectCategory("procedures")}
          >
            <Icon name="procedure" /> <span>{t.procedures}</span>
          </button>
          <button
            className={category === "guides" ? "active" : ""}
            onClick={() => selectCategory("guides")}
          >
            <Icon name="guide" /> <span>{t.guides}</span>
          </button>
          {identity?.spaces
            .filter((item) => item.slug !== "general")
            .map((item) => (
              <button
                type="button"
                className={space === item.slug ? "active" : ""}
                onClick={() => selectSpace(item.slug)}
                key={item.id}
              >
                <Icon name="folder" />{" "}
                <span>{locale === "fr" ? item.nameFr : item.nameEn}</span>
              </button>
            ))}
        </nav>
        <div className="secure">
          ✓ <span>{t.secured}</span>
        </div>
      </aside>
      <main>
        <header>
          <div className="language">
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
          <button aria-label={t.search} type="submit">
            <Icon name="search" />
          </button>
        </form>
        {!explorerMode && (
          <section className="cards" aria-label={t.spaces}>
            {(
              [
                ["policy", "policies", t.policies],
                ["procedure", "procedures", t.procedures],
                ["guide", "guides", t.guides],
              ] as const
            ).map(([icon, key, label]) => (
              <article key={key}>
                <div className="card-icon">
                  <Icon name={icon as IconName} />
                </div>
                <h2>{label}</h2>
                <p>
                  {locale === "fr"
                    ? "Documents autorisés dans cette catégorie"
                    : "Authorized documents in this category"}
                </p>
                <button onClick={() => selectCategory(key)}>{t.consult}</button>
              </article>
            ))}
            {identity?.spaces
              .filter((item) => item.slug !== "general")
              .map((item) => (
                <article className="access" key={item.id}>
                  <div className="card-icon">
                    <Icon name="folder" />
                  </div>
                  <div>
                    <h2>{locale === "fr" ? item.nameFr : item.nameEn}</h2>
                    <p>
                      {locale === "fr"
                        ? "Accessible selon vos autorisations"
                        : "Available through your permissions"}
                    </p>
                    <button
                      type="button"
                      onClick={() => selectSpace(item.slug)}
                    >
                      {t.consult}
                    </button>
                  </div>
                </article>
              ))}
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
                {category ? (
                  <section
                    className="explorer-heading"
                    aria-labelledby="explorer-title"
                  >
                    <div>
                      <span>{t.explorer}</span>
                      <h2 id="explorer-title">{categoryLabel}</h2>
                      <p>
                        {total}{" "}
                        {total === 1 ? t.documentCountOne : t.documentCount}
                      </p>
                    </div>
                    <div
                      className="view-switcher"
                      role="group"
                      aria-label={t.explorer}
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
                  </section>
                ) : (
                  <div className="explorer-title-row">
                    <h2 className="section-title">
                      {query || space ? t.search : t.recent}
                    </h2>
                    <div className="explorer-space-actions">
                      {space && selectedSpace?.permissions?.administer && (
                        <span className="permission-badge">
                          <Icon name="settings" />
                          {t.administerSpace}
                        </span>
                      )}
                      {space &&
                        (selectedSpace?.permissions?.upload ||
                          selectedSpace?.permissions?.administer) && (
                          <button
                            type="button"
                            className="primary"
                            onClick={() => setDepositOpen(true)}
                          >
                            <Icon name="upload" />
                            {t.deposit}
                          </button>
                        )}
                    </div>
                  </div>
                )}
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
                  onDelete={setDeleting}
                  viewMode={category ? viewMode : "list"}
                />
                {actionError && (
                  <p className="error-state" role="alert">
                    {actionError}
                  </p>
                )}
                <nav className="document-pagination" aria-label={t.pagination}>
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
            {openedVersion && opened.permissions.preview ? (
              <>
                {openedVersion.storedFile.mimeType === "application/pdf" ||
                openedVersion.storedFile.mimeType.startsWith("image/") ? (
                  <iframe
                    title={titleFor(opened, openedLocale || locale)}
                    src={`/api/documents/${opened.id}/content?locale=${openedLocale}`}
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
              <label>
                {t.language}
                <select name="locale" defaultValue={locale}>
                  <option value="fr">FR</option>
                  <option value="en">EN</option>
                </select>
              </label>
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
      {deleting && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setDeleting(null)}
        >
          <section
            className="modal small-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-document-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 id="delete-document-title">{t.deleteDocument}</h2>
            <p>{t.deleteDocumentWarning}</p>
            <strong>{titleFor(deleting, locale)}</strong>
            <div className="button-row">
              <button
                type="button"
                className="danger"
                onClick={async () => {
                  const response = await fetch(
                    `/api/documents/${deleting.id}`,
                    {
                      method: "DELETE",
                    },
                  );
                  if (!response.ok) {
                    setActionError(t.error);
                    return;
                  }
                  setDeleting(null);
                  await loadDocuments();
                }}
              >
                {t.confirmDelete}
              </button>
              <button type="button" onClick={() => setDeleting(null)}>
                {t.cancel}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default function Home() {
  return <Portal />;
}
