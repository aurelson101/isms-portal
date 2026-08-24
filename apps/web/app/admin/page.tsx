"use client";

import {
  createContext,
  FormEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Icon, type IconName } from "../icons";
import { adminEnglishCatalog } from "../i18n/catalogs";

type Locale = "fr" | "en";
type Authentication = {
  source: string;
  ssoConnected: boolean;
  sessionExpiresAt: string | null;
  loginUrl: string | null;
  logoutUrl: string | null;
  diagnostics: {
    groupCount: number;
    mappedSpaceCount: number;
    administrator: boolean;
    administratorAccount: boolean;
  };
};
const AdminLocaleContext = createContext<Locale>("fr");
const ConfirmContext = createContext<(message: string) => Promise<boolean>>(
  async () => false,
);
const useAdminI18n = () => {
  const locale = useContext(AdminLocaleContext);
  return {
    locale,
    t: (fr: string, en?: string) =>
      locale === "fr"
        ? fr
        : en ||
          adminEnglishCatalog[fr as keyof typeof adminEnglishCatalog] ||
          fr,
  };
};
const localizedStatus = (locale: Locale, value: string) => {
  const labels: Record<string, [string, string]> = {
    ACTIVE: ["Actif", "Active"],
    INACTIVE: ["Inactif", "Inactive"],
    PUBLISHED: ["Publié", "Published"],
    ARCHIVED: ["Archivé", "Archived"],
    DRAFT: ["Brouillon", "Draft"],
    QUARANTINED: ["En quarantaine", "Quarantined"],
    CLEAN: ["Sain", "Clean"],
    SUCCESS: ["Succès", "Success"],
    ERROR: ["Erreur", "Error"],
    VALID: ["Valide", "Valid"],
    EXPIRED: ["Expiré", "Expired"],
  };
  const label = labels[value.toUpperCase()];
  return label ? label[locale === "fr" ? 0 : 1] : value;
};

type Tab =
  | "dashboard"
  | "groups"
  | "rules"
  | "spaces"
  | "documents"
  | "incidents"
  | "directory"
  | "certificates"
  | "audit"
  | "observability"
  | "health"
  | "settings";
type Group = {
  id: string;
  name: string;
  distinguishedName: string;
  description?: string;
  memberCount: number;
  active: boolean;
  lastSyncedAt?: string;
  accessRules: Array<{ space: Space }>;
};
type DirectoryGroupSuggestion = {
  connectionId: string;
  connectionName: string;
  name: string;
  distinguishedName: string;
  description: string | null;
  memberCount: number;
};
type Space = {
  id: string;
  slug: string;
  nameFr: string;
  nameEn: string;
  categories?: Category[];
  _count?: { documents: number; accessRules: number };
  ownerGroup?: { id: string; name: string; active: boolean } | null;
};
type Category = {
  id: string;
  slug: string;
  nameFr: string;
  nameEn: string;
  spaceId: string;
};
type Rule = {
  id: string;
  groupId: string;
  spaceId: string;
  group: Group;
  space: Space;
  showMenu: boolean;
  read: boolean;
  search: boolean;
  preview: boolean;
  download: boolean;
  upload: boolean;
  edit: boolean;
  publish: boolean;
  archive: boolean;
  validFrom?: string | null;
  validUntil?: string | null;
  justification?: string | null;
};
type RuleTemplate = Omit<
  Rule,
  | "groupId"
  | "spaceId"
  | "group"
  | "space"
  | "validFrom"
  | "validUntil"
  | "justification"
> & { name: string; description?: string | null };
type Certificate = {
  id: string;
  name: string;
  subject: string;
  issuer: string;
  fingerprintSha256: string;
  validFrom: string;
  validTo: string;
  status: string;
  inUse: boolean;
  connections: Array<{ id: string; name: string; enabled: boolean }>;
};
type DirectoryConnection = {
  id: string;
  name: string;
  domain: string;
  primaryHost: string;
  secondaryHost?: string;
  port: number;
  protocol: "LDAP" | "LDAPS";
  baseDn: string;
  userBaseDn?: string;
  groupBaseDn?: string;
  bindDn: string;
  userFilter: string;
  groupFilter: string;
  loginAttribute: string;
  usernameAttribute: string;
  groupAttribute: string;
  emailAttribute: string;
  nestedGroups: boolean;
  syncIntervalMinutes: number;
  timeoutMs: number;
  retries: number;
  enabled: boolean;
  lastTestStatus?: string;
  lastTestAt?: string;
  caCertificateId?: string;
  syncJobs?: Array<{
    id: string;
    status: string;
    details?: {
      groups?: number;
      selectedGroups?: number;
      removedGroups?: number;
      removedRules?: number;
      error?: string;
    };
    startedAt: string;
    finishedAt?: string;
  }>;
};
type AdminDocument = {
  id: string;
  status: string;
  sensitive: boolean;
  watermarkPosition: "HEADER" | "CENTER" | "FOOTER";
  translations: Array<{ locale: string; title: string }>;
  space: Space;
  category?: Category;
  versions: Array<{ locale: string; version: number }>;
};
type Dashboard = {
  groups: number;
  rules: number;
  spaces: number;
  documents: number;
  syncErrors: number;
};
type Audit = {
  id: string;
  occurredAt: string;
  identity: string;
  action: string;
  resource: string;
  result: string;
  correlationId: string;
};
type AnnualIncidentReport = {
  id: string;
  year: number;
  totalIncidents: number;
  criticalIncidents: number;
  resolvedIncidents: number;
  summary: string;
  lessonsLearned: string | null;
  status: "DRAFT" | "PUBLISHED";
  updatedAt: string;
};

const tabs: Array<[Tab, IconName, string, string]> = [
  ["dashboard", "home", "Tableau de bord", "Dashboard"],
  ["groups", "groups", "Groupes Active Directory", "Active Directory groups"],
  ["rules", "rules", "Règles d’accès", "Access rules"],
  ["spaces", "folder", "Espaces documentaires", "Document spaces"],
  ["documents", "documents", "Documents", "Documents"],
  ["incidents", "audit", "Rapports d’incidents", "Incident reports"],
  ["directory", "sync", "Synchronisation LDAP", "LDAP synchronization"],
  ["certificates", "certificate", "Certificats CA", "CA certificates"],
  ["audit", "audit", "Journal d’audit", "Audit log"],
  ["observability", "health", "Observabilité", "Observability"],
  ["health", "health", "Santé des services", "Service health"],
  ["settings", "settings", "Configuration", "Settings"],
];
const permissionKeys = [
  "showMenu",
  "read",
  "search",
  "preview",
  "download",
  "upload",
  "edit",
  "publish",
  "archive",
] as const;
const permissionLabels: Record<
  (typeof permissionKeys)[number],
  [string, string]
> = {
  showMenu: ["Menu", "Menu"],
  read: ["Consulter", "View"],
  search: ["Rechercher", "Search"],
  preview: ["Prévisualiser", "Preview"],
  download: ["Télécharger", "Download"],
  upload: ["Déposer", "Upload"],
  edit: ["Modifier", "Edit"],
  publish: ["Publier", "Publish"],
  archive: ["Archiver", "Archive"],
};

const emptyRule = (
  groupId = "",
  spaceId = "",
): Omit<Rule, "id" | "group" | "space"> => ({
  groupId,
  spaceId,
  showMenu: false,
  read: false,
  search: false,
  preview: false,
  download: false,
  upload: false,
  edit: false,
  publish: false,
  archive: false,
  validFrom: null,
  validUntil: null,
  justification: "",
});

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    if (
      typeof window !== "undefined" &&
      (response.status === 401 || response.status === 403) &&
      (url.startsWith("/api/admin/") || url === "/api/health/details")
    ) {
      const identityResponse = await fetch("/api/admin/check", {
        cache: "no-store",
      }).catch(() => null);
      const identity = identityResponse?.ok
        ? ((await identityResponse.json().catch(() => null)) as {
            isAdmin?: boolean;
          } | null)
        : null;
      if (!identity?.isAdmin) {
        const requested = `${window.location.pathname}${window.location.hash}`;
        window.location.replace(
          `/admin/login?return=${encodeURIComponent(requested)}`,
        );
      }
    }
    const payload = (await response
      .json()
      .catch(() => ({ message: response.statusText }))) as {
      message?: string | string[];
    };
    throw new Error(
      Array.isArray(payload.message)
        ? payload.message.join(", ")
        : payload.message || response.statusText,
    );
  }
  return response.json() as Promise<T>;
}

export default function Admin() {
  const [locale, setLocale] = useState<Locale>("fr");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [connections, setConnections] = useState<DirectoryConnection[]>([]);
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [incidentReports, setIncidentReports] = useState<
    AnnualIncidentReport[]
  >([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [ruleEditorOpen, setRuleEditorOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState(emptyRule());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [identity, setIdentity] = useState<{
    username: string;
    displayName: string;
    profilePhoto: string | null;
    primaryAdmin: boolean;
    locale: Locale | null;
    authentication: Authentication;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    message: string;
    resolve: (accepted: boolean) => void;
  } | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [expandedNavigationGroups, setExpandedNavigationGroups] = useState<
    Set<string>
  >(() => new Set(["overview"]));
  const adminLoadedRef = useRef(false);
  const t = (fr: string, en?: string) =>
    locale === "fr"
      ? fr
      : en || adminEnglishCatalog[fr as keyof typeof adminEnglishCatalog] || fr;
  useEffect(() => {
    const activeGroup =
      tabs.findIndex(([key]) => key === tab) === 0
        ? "overview"
        : tabs.findIndex(([key]) => key === tab) < 6
          ? "content"
          : tabs.findIndex(([key]) => key === tab) < 9
            ? "infrastructure"
            : "system";
    setExpandedNavigationGroups((current) =>
      current.has(activeGroup) ? current : new Set([...current, activeGroup]),
    );
  }, [tab]);
  const confirmAction = useCallback(
    (message: string) =>
      new Promise<boolean>((resolve) => {
        setConfirmation({ message, resolve });
      }),
    [],
  );
  const closeConfirmation = (accepted: boolean) => {
    confirmation?.resolve(accepted);
    setConfirmation(null);
  };

  const refresh = useCallback(async () => {
    if (adminLoadedRef.current) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const me = await api<{
        isAdmin: boolean;
        username: string;
        displayName: string;
        profilePhoto: string | null;
        primaryAdmin: boolean;
        locale: Locale | null;
        authentication: Authentication;
      }>("/api/admin/check");
      if (!me.isAdmin) {
        setIsAdmin(false);
        const requested = `${window.location.pathname}${window.location.hash}`;
        window.location.replace(
          `/admin/login?return=${encodeURIComponent(requested)}`,
        );
        return;
      }
      setIsAdmin(true);
      setIdentity(me);
      const preferred =
        (localStorage.getItem("isms-locale") as Locale | null) ||
        me.locale ||
        (navigator.language.startsWith("en") ? "en" : "fr");
      setLocale(preferred);
      document.documentElement.lang = preferred;
      const [
        dashboardResult,
        groupsResult,
        spacesResult,
        rulesResult,
        certificatesResult,
        connectionsResult,
        documentsResult,
        incidentReportsResult,
        auditResult,
        healthResult,
      ] = await Promise.all([
        api<Dashboard>("/api/admin/dashboard"),
        api<Group[]>("/api/admin/groups"),
        api<Space[]>("/api/admin/spaces"),
        api<Rule[]>("/api/admin/access-rules"),
        api<Certificate[]>("/api/admin/certificates"),
        api<DirectoryConnection[]>("/api/admin/directory-connections"),
        api<AdminDocument[]>("/api/admin/documents"),
        api<AnnualIncidentReport[]>("/api/admin/incident-reports"),
        api<{ items: Audit[] }>("/api/admin/audit?limit=100"),
        api<Record<string, unknown>>("/api/health/details"),
      ]);
      setDashboard(dashboardResult);
      setGroups(groupsResult);
      setSpaces(spacesResult);
      setRules(rulesResult);
      setCertificates(certificatesResult);
      setConnections(connectionsResult);
      setDocuments(documentsResult);
      setIncidentReports(incidentReportsResult);
      setAudit(auditResult.items);
      setHealth(healthResult);
    } catch (currentError) {
      setError((currentError as Error).message);
    } finally {
      adminLoadedRef.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const changeLocale = async (next: Locale) => {
    setLocale(next);
    localStorage.setItem("isms-locale", next);
    document.documentElement.lang = next;
    await fetch("/api/me/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    }).catch(() => undefined);
  };

  useEffect(() => {
    const synchronizeTabWithLocation = () => {
      const requested = window.location.hash.slice(1) as Tab;
      setTab(tabs.some(([key]) => key === requested) ? requested : "dashboard");
      setNavigationOpen(false);
      setError("");
      setNotice("");
    };
    synchronizeTabWithLocation();
    window.addEventListener("hashchange", synchronizeTabWithLocation);
    void refresh();
    return () =>
      window.removeEventListener("hashchange", synchronizeTabWithLocation);
  }, [refresh]);
  useEffect(() => {
    const closeNavigation = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNavigationOpen(false);
    };
    window.addEventListener("keydown", closeNavigation);
    return () => window.removeEventListener("keydown", closeNavigation);
  }, []);
  useEffect(() => {
    const checkSession = async () => {
      const response = await fetch("/api/admin/check", {
        cache: "no-store",
      }).catch(() => null);
      if (!response?.ok) {
        setSessionExpired(true);
        return;
      }
      const currentIdentity = (await response.json()) as typeof identity & {
        isAdmin: boolean;
      };
      if (!currentIdentity?.isAdmin) {
        const requested = `${window.location.pathname}${window.location.hash}`;
        window.location.replace(
          `/admin/login?return=${encodeURIComponent(requested)}`,
        );
        return;
      }
      setIdentity(currentIdentity);
      setSessionExpired(false);
    };
    const timer = window.setInterval(() => void checkSession(), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const selectTab = (next: Tab) => {
    setTab(next);
    setNavigationOpen(false);
    setError("");
    setNotice("");
    window.history.replaceState(null, "", `/admin#${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const selectRule = (rule: Rule) => {
    setSelectedRule(rule);
    setRuleEditorOpen(true);
    setRuleDraft(
      permissionKeys.reduce((draft, key) => ({ ...draft, [key]: rule[key] }), {
        groupId: rule.groupId,
        spaceId: rule.spaceId,
        validFrom: rule.validFrom || null,
        validUntil: rule.validUntil || null,
        justification: rule.justification || "",
      }) as Omit<Rule, "id" | "group" | "space">,
    );
  };
  const filteredRules = useMemo(
    () =>
      rules.filter((rule) =>
        `${rule.group.name} ${rule.space.nameFr} ${rule.space.nameEn}`
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [rules, search],
  );

  const saveRule = async () => {
    try {
      if (!ruleDraft.groupId || !ruleDraft.spaceId)
        throw new Error(
          t(
            "Sélectionnez un groupe et un espace.",
            "Select a group and a space.",
          ),
        );
      if (selectedRule) {
        await api(`/api/admin/access-rules/${selectedRule.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ruleDraft),
        });
      } else {
        await api("/api/admin/access-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ruleDraft),
        });
      }
      setNotice(
        t(
          "Règle enregistrée et immédiatement appliquée.",
          "Rule saved and applied immediately.",
        ),
      );
      setSelectedRule(null);
      setRuleDraft(emptyRule());
      setRuleEditorOpen(false);
      await refresh();
    } catch (currentError) {
      setError((currentError as Error).message);
    }
  };

  if (isAdmin === false)
    return (
      <main className="access-denied">
        <h1>{t("Accès refusé")}</h1>
        <p>
          {t(
            "Votre identité ne possède pas le rôle administrateur.",
            "Your identity does not have the administrator role.",
          )}
        </p>
        <a href="/">{t("Retour au portail")}</a>
      </main>
    );

  if (isAdmin === null)
    return (
      <main className="login-shell" aria-busy="true">
        <section className="login-card" aria-live="polite">
          <div className="login-brand">
            <span aria-hidden="true">🛡️</span>
            <div>
              <strong>ISMS Portal</strong>
              <small>{t("Administration sécurisée")}</small>
            </div>
          </div>
          <p className="loading-state">{t("Chargement…")}</p>
        </section>
      </main>
    );

  return (
    <AdminLocaleContext.Provider value={locale}>
      <ConfirmContext.Provider value={confirmAction}>
        <div className="admin-shell" aria-busy={refreshing}>
          <aside className={navigationOpen ? "navigation-open" : ""}>
            <div className="sidebar-heading">
              <div className="brand">
                <div className="shield">
                  <Icon name="shield" />
                </div>
                <div>
                  <strong>ISMS Portal</strong>
                  <small>{t("Administration sécurisée")}</small>
                </div>
              </div>
              <button
                type="button"
                className="navigation-toggle"
                aria-controls="admin-navigation"
                aria-expanded={navigationOpen}
                aria-label={t("Afficher la navigation")}
                onClick={() => setNavigationOpen((current) => !current)}
              >
                <Icon name={navigationOpen ? "close" : "menu"} />
              </button>
            </div>
            <nav id="admin-navigation" aria-label="Administration">
              {[
                ["overview", t("Vue d’ensemble"), tabs.slice(0, 1)],
                ["content", t("Contenu et accès"), tabs.slice(1, 6)],
                ["infrastructure", t("Infrastructure"), tabs.slice(6, 9)],
                ["system", t("Système"), tabs.slice(9)],
              ].map(([groupId, groupLabel, groupTabs]) => (
                <div
                  className={`admin-navigation-group ${expandedNavigationGroups.has(groupId as string) ? "expanded" : ""}`}
                  key={groupLabel as string}
                >
                  <button
                    type="button"
                    className="admin-navigation-heading"
                    aria-controls={`admin-navigation-${groupId as string}`}
                    aria-expanded={expandedNavigationGroups.has(
                      groupId as string,
                    )}
                    onClick={() =>
                      setExpandedNavigationGroups((current) => {
                        const next = new Set(current);
                        if (next.has(groupId as string))
                          next.delete(groupId as string);
                        else next.add(groupId as string);
                        return next;
                      })
                    }
                  >
                    <span>{groupLabel as string}</span>
                    <Icon className="submenu-chevron" name="chevron" />
                  </button>
                  <div
                    className="admin-navigation-submenu"
                    id={`admin-navigation-${groupId as string}`}
                    hidden={!expandedNavigationGroups.has(groupId as string)}
                  >
                    {(groupTabs as typeof tabs).map(
                      ([key, icon, labelFr, labelEn]) => (
                        <button
                          type="button"
                          aria-current={tab === key ? "page" : undefined}
                          className={tab === key ? "active" : ""}
                          key={key}
                          onClick={() => selectTab(key)}
                        >
                          <Icon name={icon} />{" "}
                          <span>{locale === "fr" ? labelFr : labelEn}</span>
                        </button>
                      ),
                    )}
                  </div>
                </div>
              ))}
            </nav>
            <a className="back-link" href="/">
              ← {t("Retour au portail")}
            </a>
          </aside>
          <main>
            <header>
              <div className="admin-search">
                <Icon name="search" />
                <input
                  aria-label={t("Rechercher dans la section…")}
                  list={tab === "groups" ? "ad-group-suggestions" : undefined}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={
                    tab === "groups"
                      ? t(
                          "Rechercher ou sélectionner un groupe AD…",
                          "Search or select an AD group…",
                        )
                      : t("Rechercher dans la section…")
                  }
                />
                {search && (
                  <button
                    type="button"
                    className="admin-search-clear"
                    aria-label={t("Effacer la recherche")}
                    onClick={() => setSearch("")}
                  >
                    ×
                  </button>
                )}
              </div>
              {tab === "groups" && (
                <datalist id="ad-group-suggestions">
                  {groups.map((group) => (
                    <option value={group.name} key={group.id}>
                      {group.distinguishedName}
                    </option>
                  ))}
                </datalist>
              )}
              <div
                className="admin-language"
                role="group"
                aria-label={t("Langue de l’interface")}
              >
                <button
                  type="button"
                  aria-pressed={locale === "fr"}
                  onClick={() => void changeLocale("fr")}
                >
                  FR
                </button>
                <button
                  type="button"
                  aria-pressed={locale === "en"}
                  onClick={() => void changeLocale("en")}
                >
                  EN
                </button>
              </div>
              <button className="refresh-button" onClick={() => void refresh()}>
                <Icon name="sync" /> <span>{t("Actualiser")}</span>
              </button>
              <div className="admin-profile">
                <button
                  type="button"
                  className="admin-profile-button"
                  aria-haspopup="menu"
                  aria-expanded={profileOpen}
                  onClick={() => setProfileOpen((current) => !current)}
                >
                  {identity?.profilePhoto ? (
                    <img src={identity.profilePhoto} alt="" />
                  ) : (
                    <span className="admin-avatar" aria-hidden="true">
                      {(identity?.displayName || "Admin")
                        .split(/\s+/u)
                        .map((part) => part[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                  )}
                  <span className="admin-identity">
                    <strong>
                      {identity?.displayName || t("Administrateur ISMS")}
                    </strong>
                    <small>{identity?.username || "…"}</small>
                  </span>
                  <span aria-hidden="true">⌄</span>
                </button>
                {profileOpen && (
                  <div className="account-menu admin-profile-menu" role="menu">
                    <strong>
                      {identity?.displayName || t("Administrateur ISMS")}
                    </strong>
                    <small>{identity?.username}</small>
                    <span
                      className={
                        identity?.authentication.ssoConnected
                          ? "auth-status connected"
                          : "auth-status local"
                      }
                    >
                      {identity?.authentication.ssoConnected
                        ? t("SSO connecté")
                        : t("Administrateur local")}
                    </span>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setProfileOpen(false);
                        selectTab("settings");
                      }}
                    >
                      {t("Mon profil")}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="danger"
                      onClick={() =>
                        api("/api/auth/logout?scope=admin", {
                          method: "POST",
                        }).then(() =>
                          window.location.assign("/admin/login?loggedout=1"),
                        )
                      }
                    >
                      {t("Se déconnecter")}
                    </button>
                  </div>
                )}
              </div>
            </header>
            {error && (
              <div className="admin-alert error" role="alert">
                <span>{error}</span>
                <div>
                  <button onClick={() => void refresh()}>
                    {t("Réessayer")}
                  </button>
                  <button onClick={() => setError("")} aria-label={t("Fermer")}>
                    ×
                  </button>
                </div>
              </div>
            )}
            {notice && (
              <div className="admin-alert success" role="status">
                {notice}
                <button onClick={() => setNotice("")}>×</button>
              </div>
            )}
            {loading ? (
              <AdminSkeleton
                label={t(
                  "Chargement de l’administration…",
                  "Loading administration…",
                )}
              />
            ) : (
              <>
                {tab === "dashboard" && (
                  <DashboardPanel
                    dashboard={dashboard}
                    onNavigate={selectTab}
                  />
                )}
                {tab === "groups" && (
                  <GroupsPanel
                    groups={groups}
                    search={search}
                    onChanged={refresh}
                    onError={setError}
                    onNotice={setNotice}
                  />
                )}
                {tab === "rules" && (
                  <RulesPanel
                    rules={filteredRules}
                    groups={groups}
                    spaces={spaces}
                    selected={selectedRule}
                    onSelect={selectRule}
                    onNew={() => {
                      setSelectedRule(null);
                      setRuleDraft(emptyRule());
                      setRuleEditorOpen(true);
                    }}
                    onChanged={refresh}
                    onError={setError}
                    onNotice={setNotice}
                  />
                )}
                {tab === "spaces" && (
                  <SpacesPanel
                    spaces={spaces}
                    onChanged={refresh}
                    onError={setError}
                  />
                )}
                {tab === "documents" && (
                  <DocumentsPanel
                    documents={documents}
                    spaces={spaces}
                    onChanged={refresh}
                    onError={setError}
                  />
                )}
                {tab === "incidents" && (
                  <IncidentReportsPanel
                    reports={incidentReports}
                    search={search}
                    onChanged={refresh}
                    onError={setError}
                    onNotice={setNotice}
                  />
                )}
                {tab === "directory" && (
                  <DirectoryPanel
                    connections={connections}
                    certificates={certificates}
                    onChanged={refresh}
                    onError={setError}
                    onNotice={setNotice}
                  />
                )}
                {tab === "certificates" && (
                  <CertificatesPanel
                    certificates={certificates}
                    onChanged={refresh}
                    onError={setError}
                    onNotice={setNotice}
                  />
                )}
                {tab === "audit" && <AuditPanel events={audit} />}
                {tab === "observability" && (
                  <ObservabilityPanel
                    dashboard={dashboard}
                    events={audit}
                    health={health}
                    onNotice={setNotice}
                  />
                )}
                {tab === "health" && <HealthPanel health={health} />}
                {tab === "settings" && (
                  <SettingsPanel
                    identity={identity}
                    onError={setError}
                    onNotice={setNotice}
                  />
                )}
              </>
            )}
          </main>
          {tab === "rules" && ruleEditorOpen && (
            <section className="drawer" aria-label={t("Éditeur de règle")}>
              <h2>
                {selectedRule
                  ? `Règle ${selectedRule.group.name} → ${selectedRule.space.nameFr}`
                  : t("Nouvelle règle")}
              </h2>
              <label>
                {t("Groupe AD")}
                <select
                  autoFocus
                  value={ruleDraft.groupId}
                  onChange={(event) =>
                    setRuleDraft({ ...ruleDraft, groupId: event.target.value })
                  }
                >
                  <option value="">{t("Sélectionner…")}</option>
                  {groups.map((group) => (
                    <option value={group.id} key={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("Espace")}
                <select
                  value={ruleDraft.spaceId}
                  onChange={(event) =>
                    setRuleDraft({ ...ruleDraft, spaceId: event.target.value })
                  }
                >
                  <option value="">{t("Sélectionner…")}</option>
                  {spaces.map((spaceItem) => (
                    <option value={spaceItem.id} key={spaceItem.id}>
                      {locale === "fr" ? spaceItem.nameFr : spaceItem.nameEn}
                    </option>
                  ))}
                </select>
              </label>
              <h3>{t("Permissions accordées")}</h3>
              {permissionKeys.map((key) => (
                <label className="toggle" key={key}>
                  {permissionLabels[key][locale === "fr" ? 0 : 1]}
                  <input
                    type="checkbox"
                    checked={ruleDraft[key]}
                    onChange={(event) =>
                      setRuleDraft({
                        ...ruleDraft,
                        [key]: event.target.checked,
                      })
                    }
                  />
                </label>
              ))}
              <label>
                {t("Justification")}
                <textarea
                  maxLength={500}
                  value={ruleDraft.justification || ""}
                  onChange={(event) =>
                    setRuleDraft({
                      ...ruleDraft,
                      justification: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                {t("Début de validité")}
                <input
                  type="datetime-local"
                  value={ruleDraft.validFrom?.slice(0, 16) || ""}
                  onChange={(event) =>
                    setRuleDraft({
                      ...ruleDraft,
                      validFrom: event.target.value
                        ? new Date(event.target.value).toISOString()
                        : null,
                    })
                  }
                />
              </label>
              <label>
                {t("Expiration")}
                <input
                  type="datetime-local"
                  value={ruleDraft.validUntil?.slice(0, 16) || ""}
                  onChange={(event) =>
                    setRuleDraft({
                      ...ruleDraft,
                      validUntil: event.target.value
                        ? new Date(event.target.value).toISOString()
                        : null,
                    })
                  }
                />
              </label>
              <div className="notice">
                {t(
                  "Les changements s’appliquent immédiatement aux membres du groupe.",
                  "Changes apply immediately to group members.",
                )}
              </div>
              <div className="actions">
                {selectedRule && (
                  <button
                    className="danger"
                    onClick={async () => {
                      if (!(await confirmAction(t("Supprimer cette règle ?"))))
                        return;
                      await api(`/api/admin/access-rules/${selectedRule.id}`, {
                        method: "DELETE",
                      })
                        .then(async () => {
                          setSelectedRule(null);
                          setRuleDraft(emptyRule());
                          setRuleEditorOpen(false);
                          await refresh();
                        })
                        .catch((currentError) =>
                          setError((currentError as Error).message),
                        );
                    }}
                  >
                    {t("Supprimer")}
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedRule(null);
                    setRuleDraft(emptyRule());
                    setRuleEditorOpen(false);
                  }}
                >
                  {t("Annuler")}
                </button>
                <button className="primary" onClick={() => void saveRule()}>
                  {t("Enregistrer")}
                </button>
              </div>
            </section>
          )}
          {sessionExpired && (
            <div className="confirmation-backdrop">
              <section
                className="confirmation-dialog"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="admin-session-expired"
              >
                <h2 id="admin-session-expired">{t("Session expirée")}</h2>
                <p>
                  {t(
                    "Reconnectez-vous pour poursuivre l’administration.",
                    "Sign in again to continue administration.",
                  )}
                </p>
                <button
                  className="primary"
                  onClick={() =>
                    window.location.assign(
                      identity?.authentication.loginUrl || window.location.href,
                    )
                  }
                >
                  {t("Se reconnecter")}
                </button>
              </section>
            </div>
          )}
        </div>
        {confirmation && (
          <ConfirmationDialog
            message={confirmation.message}
            title={t("Confirmer l’action")}
            cancelLabel={t("Annuler")}
            confirmLabel={t("Confirmer")}
            onClose={closeConfirmation}
          />
        )}
      </ConfirmContext.Provider>
    </AdminLocaleContext.Provider>
  );
}

function ConfirmationDialog({
  message,
  title,
  cancelLabel,
  confirmLabel,
  onClose,
}: {
  message: string;
  title: string;
  cancelLabel: string;
  confirmLabel: string;
  onClose: (accepted: boolean) => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div
      className="confirmation-backdrop"
      role="presentation"
      onMouseDown={() => onClose(false)}
    >
      <section
        className="confirmation-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirmation-title">{title}</h2>
        <p id="confirmation-message">{message}</p>
        <div className="confirmation-actions">
          <button ref={cancelRef} type="button" onClick={() => onClose(false)}>
            {cancelLabel}
          </button>
          <button
            className="danger solid-danger"
            type="button"
            onClick={() => onClose(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function AdminSkeleton({ label }: { label: string }) {
  return (
    <div className="admin-skeleton" role="status" aria-label={label}>
      <span>{label}</span>
      <div className="skeleton-line wide" />
      <div className="skeleton-grid">
        <div />
        <div />
        <div />
      </div>
      <div className="skeleton-line" />
      <div className="skeleton-line wide" />
    </div>
  );
}

function EmptyState({
  fr,
  en,
  compact = false,
}: {
  fr: string;
  en: string;
  compact?: boolean;
}) {
  const { t } = useAdminI18n();
  return (
    <p className={`admin-empty ${compact ? "compact" : ""}`}>{t(fr, en)}</p>
  );
}

function DashboardPanel({
  dashboard,
  onNavigate,
}: {
  dashboard: Dashboard | null;
  onNavigate: (tab: Tab) => void;
}) {
  const { t } = useAdminI18n();
  const stats = [
    [t("Groupes AD synchronisés"), dashboard?.groups ?? 0],
    [t("Règles actives"), dashboard?.rules ?? 0],
    [t("Espaces protégés"), dashboard?.spaces ?? 0],
    [t("Documents"), dashboard?.documents ?? 0],
    [t("Erreurs de synchronisation"), dashboard?.syncErrors ?? 0],
  ];
  return (
    <>
      <h1>{t("Tableau de bord")}</h1>
      <p className="lead">{t("État réel de la plateforme ISMS.")}</p>
      <div className="stats">
        {stats.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <section
        className="dashboard-shortcuts"
        aria-labelledby="shortcuts-title"
      >
        <div>
          <h2 id="shortcuts-title">{t("Actions fréquentes")}</h2>
          <p>{t("Accédez directement aux principales gestions ISMS.")}</p>
        </div>
        <div>
          <button type="button" onClick={() => onNavigate("documents")}>
            <Icon name="documents" /> {t("Gérer les documents")}
          </button>
          <button type="button" onClick={() => onNavigate("rules")}>
            <Icon name="rules" /> {t("Gérer les accès")}
          </button>
          <button type="button" onClick={() => onNavigate("directory")}>
            <Icon name="sync" /> {t("Synchroniser l’annuaire")}
          </button>
        </div>
      </section>
    </>
  );
}

function GroupsPanel({
  groups,
  search,
  onChanged,
  onError,
  onNotice,
}: {
  groups: Group[];
  search: string;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const { locale, t } = useAdminI18n();
  const confirmAction = useContext(ConfirmContext);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directorySuggestions, setDirectorySuggestions] = useState<
    DirectoryGroupSuggestion[]
  >([]);
  const [selectedDirectoryGroup, setSelectedDirectoryGroup] =
    useState<DirectoryGroupSuggestion | null>(null);
  const [directorySearchLoading, setDirectorySearchLoading] = useState(false);
  const [directorySearchComplete, setDirectorySearchComplete] = useState(false);
  const [form, setForm] = useState({
    name: "",
    distinguishedName: "",
    description: "",
  });
  const filtered = groups.filter((group) =>
    `${group.name} ${group.distinguishedName}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  useEffect(() => {
    const query = directoryQuery.trim();
    if (query.length < 2 || selectedDirectoryGroup) {
      setDirectorySuggestions([]);
      setDirectorySearchLoading(false);
      setDirectorySearchComplete(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setDirectorySearchLoading(true);
      void api<DirectoryGroupSuggestion[]>(
        `/api/admin/directory-connections/groups/search?q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      )
        .then(setDirectorySuggestions)
        .catch((error) => {
          if ((error as Error).name !== "AbortError")
            onError((error as Error).message);
        })
        .finally(() => {
          setDirectorySearchLoading(false);
          setDirectorySearchComplete(true);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [directoryQuery, onError, selectedDirectoryGroup]);
  return (
    <>
      <h1>{t("Groupes Active Directory")}</h1>
      <p className="lead">
        {t(
          "Seuls les groupes recherchés puis ajoutés ici sont conservés et actualisés lors des synchronisations.",
          "Only groups searched for and added here are retained and refreshed during synchronization.",
        )}
      </p>
      <form
        className="admin-form inline-form directory-group-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const endpoint = selectedDirectoryGroup
            ? "/api/admin/groups/import"
            : "/api/admin/groups";
          const body = selectedDirectoryGroup
            ? {
                connectionId: selectedDirectoryGroup.connectionId,
                distinguishedName: selectedDirectoryGroup.distinguishedName,
              }
            : form;
          await api(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
            .then(async () => {
              setForm({ name: "", distinguishedName: "", description: "" });
              setDirectoryQuery("");
              setSelectedDirectoryGroup(null);
              onNotice(
                selectedDirectoryGroup
                  ? t("Groupe importé depuis Active Directory.")
                  : t(
                      "Référence de groupe AD ajoutée.",
                      "AD group reference added.",
                    ),
              );
              await onChanged();
            })
            .catch((error) => onError(error.message));
        }}
      >
        <h2>{t("Ajouter un groupe AD")}</h2>
        <input
          aria-label={t("Nom du groupe AD")}
          required
          placeholder={t("Nom du groupe")}
          value={form.name}
          onChange={(event) => {
            setSelectedDirectoryGroup(null);
            setForm({ ...form, name: event.target.value });
          }}
        />
        <div className="directory-group-picker">
          <input
            aria-label={t("Rechercher ou saisir le DN du groupe AD")}
            required
            placeholder={t("Rechercher dans AD (ex. Skill) ou saisir un DN")}
            value={directoryQuery}
            onChange={(event) => {
              const value = event.target.value;
              setDirectoryQuery(value);
              setSelectedDirectoryGroup(null);
              setDirectorySearchComplete(false);
              setForm({ ...form, distinguishedName: value });
            }}
          />
          {directorySearchLoading && (
            <small>{t("Recherche dans Active Directory…")}</small>
          )}
          {!directorySearchLoading &&
            directoryQuery.trim().length >= 2 &&
            !selectedDirectoryGroup &&
            directorySearchComplete &&
            directorySuggestions.length === 0 && (
              <small>{t("Aucun groupe AD trouvé.")}</small>
            )}
          {directorySuggestions.length > 0 && !selectedDirectoryGroup && (
            <div
              className="directory-group-suggestions"
              role="listbox"
              aria-label={t("Groupes trouvés dans Active Directory")}
            >
              {directorySuggestions.map((suggestion) => (
                <button
                  type="button"
                  role="option"
                  key={`${suggestion.connectionId}:${suggestion.distinguishedName}`}
                  onClick={() => {
                    setSelectedDirectoryGroup(suggestion);
                    setDirectoryQuery(suggestion.name);
                    setForm({
                      name: suggestion.name,
                      distinguishedName: suggestion.distinguishedName,
                      description: suggestion.description || "",
                    });
                  }}
                >
                  <strong>{suggestion.name}</strong>
                  <span>{suggestion.distinguishedName}</span>
                  <small>
                    {suggestion.connectionName} · {suggestion.memberCount}{" "}
                    {t("membre(s)")}
                  </small>
                </button>
              ))}
            </div>
          )}
          {selectedDirectoryGroup && (
            <small className="success-text">
              {t("Sélection AD")} : {selectedDirectoryGroup.distinguishedName}
            </small>
          )}
        </div>
        <input
          aria-label={t("Description du groupe AD")}
          placeholder={t("Description")}
          value={form.description}
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
        />
        <button className="primary">{t("Ajouter")}</button>
      </form>
      <div className="admin-table-wrap">
        <table className="admin-actions-table">
          <thead>
            <tr>
              <th>{t("Nom")}</th>
              <th>DN</th>
              <th>{t("Source")}</th>
              <th>{t("Membres")}</th>
              <th>{t("Dernière synchro")}</th>
              <th>{t("Espaces")}</th>
              <th>{t("État")}</th>
              <th>{t("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <EmptyState
                    compact
                    fr="Aucun groupe ne correspond à cette recherche."
                    en="No group matches this search."
                  />
                </td>
              </tr>
            )}
            {filtered.map((group) => (
              <tr key={group.id}>
                <td>
                  <strong>{group.name}</strong>
                  <small>{group.description}</small>
                </td>
                <td>{group.distinguishedName}</td>
                <td>
                  {group.lastSyncedAt ? t("Synchronisé AD") : t("Ajout local")}
                </td>
                <td>{group.memberCount}</td>
                <td>
                  {group.lastSyncedAt
                    ? new Date(group.lastSyncedAt).toLocaleString(locale)
                    : t("Jamais")}
                </td>
                <td>
                  {group.accessRules
                    .map((rule) =>
                      locale === "fr" ? rule.space.nameFr : rule.space.nameEn,
                    )
                    .join(", ") || "—"}
                </td>
                <td>
                  <mark>{group.active ? t("Actif") : t("Inactif")}</mark>
                </td>
                <td>
                  <button
                    className="danger"
                    onClick={async () => {
                      const warning = t(
                        `${group.lastSyncedAt ? "Ce groupe synchronisé pourra revenir à la prochaine synchronisation. " : ""}${group.accessRules.length} règle(s) associée(s) seront supprimée(s). Continuer ?`,
                        `${group.lastSyncedAt ? "This synchronized group may return during the next synchronization. " : ""}${group.accessRules.length} associated rule(s) will be deleted. Continue?`,
                      );
                      if (!(await confirmAction(warning))) return;
                      await api(`/api/admin/groups/${group.id}`, {
                        method: "DELETE",
                      })
                        .then(async () => {
                          onNotice(t("Groupe supprimé."));
                          await onChanged();
                        })
                        .catch((error) => onError(error.message));
                    }}
                  >
                    {t("Supprimer")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RulesPanel({
  rules,
  groups,
  spaces,
  selected,
  onSelect,
  onNew,
  onChanged,
  onError,
  onNotice,
}: {
  rules: Rule[];
  groups: Group[];
  spaces: Space[];
  selected: Rule | null;
  onSelect: (rule: Rule) => void;
  onNew: () => void;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const { locale, t } = useAdminI18n();
  return (
    <>
      <h1>{t("Gestion des droits d’accès")}</h1>
      <p className="lead">
        {t(
          "L’administrateur conserve tous les droits ; cette matrice s’applique aux utilisateurs standards.",
          "Administrators retain all rights; this matrix applies to standard users.",
        )}
      </p>
      <section className="matrix">
        <div className="matrix-heading">
          <h2>{t("Matrice des autorisations")}</h2>
          <button type="button" className="primary" onClick={onNew}>
            <Icon name="add" /> {t("Ajouter une règle")}
          </button>
        </div>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Groupe")}</th>
                <th>{t("Espace")}</th>
                {permissionKeys.map((key) => (
                  <th key={key}>
                    {permissionLabels[key][locale === "fr" ? 0 : 1]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 && (
                <tr>
                  <td colSpan={2 + permissionKeys.length}>
                    <EmptyState
                      compact
                      fr="Aucune règle d’accès ne correspond à cette recherche."
                      en="No access rule matches this search."
                    />
                  </td>
                </tr>
              )}
              {rules.map((rule) => (
                <tr
                  className={selected?.id === rule.id ? "selected-row" : ""}
                  key={rule.id}
                  onClick={() => onSelect(rule)}
                >
                  <td>
                    <strong>{rule.group.name}</strong>
                  </td>
                  <td>
                    {locale === "fr" ? rule.space.nameFr : rule.space.nameEn}
                  </td>
                  {permissionKeys.map((key) => (
                    <td key={key}>{rule[key] ? "✓" : "—"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <AccessGovernancePanel
        rules={rules}
        groups={groups}
        spaces={spaces}
        onChanged={onChanged}
        onError={onError}
        onNotice={onNotice}
      />
    </>
  );
}

function AccessGovernancePanel({
  rules,
  groups,
  spaces,
  onChanged,
  onError,
  onNotice,
}: {
  rules: Rule[];
  groups: Group[];
  spaces: Space[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const { locale, t } = useAdminI18n();
  const [templates, setTemplates] = useState<RuleTemplate[]>([]);
  const [anomalies, setAnomalies] = useState<
    Array<{
      ruleId: string;
      group: string;
      space: string;
      severity: string;
      message: string;
    }>
  >([]);
  const [attention, setAttention] = useState<{
    total: number;
    high: number;
    spacesWithoutOwner: number;
    snapshotMissing: boolean;
  } | null>(null);
  const [snapshots, setSnapshots] = useState<
    Array<{
      id: string;
      label: string;
      sha256: string;
      createdAt: string;
    }>
  >([]);
  const [simulationIdentity, setSimulationIdentity] = useState("");
  const [simulationGroups, setSimulationGroups] = useState("");
  const [simulation, setSimulation] = useState<{
    groups: string[];
    spaces: Array<
      Space & { permissions: Record<(typeof permissionKeys)[number], boolean> }
    >;
  } | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templatePermissions, setTemplatePermissions] = useState(emptyRule());
  const [templateToApply, setTemplateToApply] = useState("");
  const [templateGroup, setTemplateGroup] = useState("");
  const [templateSpace, setTemplateSpace] = useState("");
  const [matrixRules, setMatrixRules] = useState<Rule[]>(rules);
  const [diff, setDiff] = useState<
    Array<{
      groupId: string;
      spaceId: string;
      newRule: boolean;
      changes: Array<{ permission: string; before: boolean; after: boolean }>;
    }>
  >([]);
  const [snapshotLabel, setSnapshotLabel] = useState("");
  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState("");
  const [comparison, setComparison] = useState<{
    changed: boolean;
    summary: { ruleChanges: number; ownerChanges: number };
  } | null>(null);

  const loadGovernance = useCallback(async () => {
    try {
      const [nextTemplates, nextAnomalies, nextAttention, nextSnapshots] =
        await Promise.all([
          api<RuleTemplate[]>("/api/admin/access-rule-templates"),
          api<typeof anomalies>("/api/admin/access-rules/anomalies"),
          api<NonNullable<typeof attention>>("/api/admin/access-attention"),
          api<typeof snapshots>("/api/admin/access-snapshots"),
        ]);
      setTemplates(nextTemplates);
      setAnomalies(nextAnomalies);
      setAttention(nextAttention);
      setSnapshots(nextSnapshots);
    } catch (error) {
      onError((error as Error).message);
    }
  }, [onError]);

  useEffect(() => {
    setMatrixRules(rules);
  }, [rules]);
  useEffect(() => {
    void loadGovernance();
  }, [loadGovernance]);

  const serializableRule = (rule: Rule) => ({
    groupId: rule.groupId,
    spaceId: rule.spaceId,
    ...Object.fromEntries(permissionKeys.map((key) => [key, rule[key]])),
    validFrom: rule.validFrom || undefined,
    validUntil: rule.validUntil || undefined,
    justification: rule.justification || undefined,
  });

  return (
    <section className="access-governance">
      <h2>{t("Gouvernance des accès")}</h2>
      <div className="summary-grid">
        <article>
          <strong>{attention?.total ?? "—"}</strong>
          <span>{t("éléments à examiner")}</span>
        </article>
        <article>
          <strong>{attention?.high ?? "—"}</strong>
          <span>{t("alertes prioritaires")}</span>
        </article>
        <article>
          <strong>{attention?.spacesWithoutOwner ?? "—"}</strong>
          <span>{t("espaces sans propriétaire")}</span>
        </article>
      </div>

      <details open>
        <summary>{t("Simuler les droits effectifs")}</summary>
        <div className="admin-form inline-form">
          <input
            aria-label={t("Identité utilisateur")}
            placeholder="alice@example.com"
            value={simulationIdentity}
            onChange={(event) => setSimulationIdentity(event.target.value)}
          />
          <input
            aria-label={t(
              "Groupes séparés par des virgules",
              "Comma-separated groups",
            )}
            placeholder="Finance Readers, ISO Owners"
            value={simulationGroups}
            onChange={(event) => setSimulationGroups(event.target.value)}
          />
          <button
            type="button"
            className="primary"
            onClick={() =>
              void api<NonNullable<typeof simulation>>(
                "/api/admin/access-rules/simulate",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    identity: simulationIdentity || undefined,
                    groups: simulationGroups
                      .split(",")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  }),
                },
              )
                .then(setSimulation)
                .catch((error) => onError(error.message))
            }
          >
            {t("Simuler")}
          </button>
        </div>
        {simulation && (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Espace")}</th>
                  {permissionKeys.map((key) => (
                    <th key={key}>
                      {permissionLabels[key][locale === "fr" ? 0 : 1]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {simulation.spaces.map((space) => (
                  <tr key={space.id}>
                    <td>{locale === "fr" ? space.nameFr : space.nameEn}</td>
                    {permissionKeys.map((key) => (
                      <td key={key}>{space.permissions[key] ? "✓" : "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>

      <details>
        <summary>{t("Modèles de permissions")}</summary>
        <div className="admin-form inline-form">
          <input
            aria-label={t("Nom du modèle")}
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
          />
          {permissionKeys.map((key) => (
            <label className="toggle" key={key}>
              {permissionLabels[key][locale === "fr" ? 0 : 1]}
              <input
                type="checkbox"
                checked={templatePermissions[key]}
                onChange={(event) =>
                  setTemplatePermissions({
                    ...templatePermissions,
                    [key]: event.target.checked,
                  })
                }
              />
            </label>
          ))}
          <button
            type="button"
            disabled={templateName.trim().length < 2}
            onClick={() =>
              void api("/api/admin/access-rule-templates", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: templateName,
                  description: "",
                  ...Object.fromEntries(
                    permissionKeys.map((key) => [
                      key,
                      templatePermissions[key],
                    ]),
                  ),
                }),
              })
                .then(async () => {
                  setTemplateName("");
                  setTemplatePermissions(emptyRule());
                  await loadGovernance();
                })
                .catch((error) => onError(error.message))
            }
          >
            {t("Créer le modèle")}
          </button>
        </div>
        <ul>
          {templates.map((template) => (
            <li key={template.id}>
              <strong>{template.name}</strong> —{" "}
              {permissionKeys.filter((key) => template[key]).length}{" "}
              {t("droits")}
            </li>
          ))}
        </ul>
        <div className="admin-form inline-form">
          <select
            aria-label={t("Modèle à appliquer")}
            value={templateToApply}
            onChange={(event) => setTemplateToApply(event.target.value)}
          >
            <option value="">{t("Choisir un modèle")}</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <select
            aria-label={t("Groupe cible")}
            value={templateGroup}
            onChange={(event) => setTemplateGroup(event.target.value)}
          >
            <option value="">{t("Choisir un groupe")}</option>
            {groups
              .filter((group) => group.active)
              .map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
          </select>
          <select
            aria-label={t("Espace cible")}
            value={templateSpace}
            onChange={(event) => setTemplateSpace(event.target.value)}
          >
            <option value="">{t("Choisir un espace")}</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {locale === "fr" ? space.nameFr : space.nameEn}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!templateToApply || !templateGroup || !templateSpace}
            onClick={() => {
              const template = templates.find(
                (item) => item.id === templateToApply,
              );
              const group = groups.find((item) => item.id === templateGroup);
              const space = spaces.find((item) => item.id === templateSpace);
              if (!template || !group || !space) return;
              setMatrixRules((current) => {
                const index = current.findIndex(
                  (rule) =>
                    rule.groupId === group.id && rule.spaceId === space.id,
                );
                const permissions = Object.fromEntries(
                  permissionKeys.map((key) => [key, template[key]]),
                ) as Pick<Rule, (typeof permissionKeys)[number]>;
                if (index >= 0)
                  return current.map((rule, ruleIndex) =>
                    ruleIndex === index ? { ...rule, ...permissions } : rule,
                  );
                return [
                  ...current,
                  {
                    ...emptyRule(),
                    ...permissions,
                    id: `draft:${group.id}:${space.id}`,
                    groupId: group.id,
                    spaceId: space.id,
                    group,
                    space,
                    validFrom: null,
                    validUntil: null,
                    justification: null,
                  },
                ];
              });
              setDiff([]);
            }}
          >
            {t("Appliquer à la matrice")}
          </button>
        </div>
      </details>

      <details>
        <summary>{t("Matrice modifiable et aperçu")}</summary>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("Groupe")}</th>
                <th>{t("Espace")}</th>
                {permissionKeys.map((key) => (
                  <th key={key}>
                    {permissionLabels[key][locale === "fr" ? 0 : 1]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrixRules.map((rule, index) => (
                <tr key={rule.id}>
                  <td>{rule.group.name}</td>
                  <td>
                    {locale === "fr" ? rule.space.nameFr : rule.space.nameEn}
                  </td>
                  {permissionKeys.map((key) => (
                    <td key={key}>
                      <input
                        type="checkbox"
                        aria-label={`${rule.group.name} ${rule.space.slug} ${key}`}
                        checked={rule[key]}
                        onChange={(event) =>
                          setMatrixRules((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, [key]: event.target.checked }
                                : item,
                            ),
                          )
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="button-row">
          <button
            type="button"
            onClick={() =>
              void api<typeof diff>("/api/admin/access-rules/diff", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  rules: matrixRules.map(serializableRule),
                }),
              })
                .then(setDiff)
                .catch((error) => onError(error.message))
            }
          >
            {t("Prévisualiser les changements")}
          </button>
          <button
            type="button"
            className="primary"
            disabled={diff.length === 0}
            onClick={() =>
              void api("/api/admin/access-rules/bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  rules: matrixRules.map(serializableRule),
                }),
              })
                .then(async () => {
                  setDiff([]);
                  onNotice(t("Matrice enregistrée."));
                  await onChanged();
                  await loadGovernance();
                })
                .catch((error) => onError(error.message))
            }
          >
            {t("Enregistrer en lot")}
          </button>
        </div>
        {diff.length > 0 && (
          <p>
            {diff.length} {t("règle(s) modifiée(s)")}
          </p>
        )}
      </details>

      <details>
        <summary>{t("Propriétaires d’espace")}</summary>
        {spaces.map((space) => (
          <label key={space.id} className="owner-row">
            <span>{locale === "fr" ? space.nameFr : space.nameEn}</span>
            <select
              value={space.ownerGroup?.id || ""}
              onChange={(event) =>
                void api(`/api/admin/spaces/${space.id}/owner`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    groupId: event.target.value || undefined,
                  }),
                })
                  .then(onChanged)
                  .catch((error) => onError(error.message))
              }
            >
              <option value="">{t("Sans propriétaire")}</option>
              {groups
                .filter((group) => group.active)
                .map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </details>

      <details>
        <summary>{t("Historique signé des droits")}</summary>
        <div className="admin-form inline-form">
          <input
            aria-label={t("Libellé de l’instantané")}
            value={snapshotLabel}
            onChange={(event) => setSnapshotLabel(event.target.value)}
          />
          <button
            type="button"
            disabled={snapshotLabel.trim().length < 2}
            onClick={() =>
              void api("/api/admin/access-snapshots", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: snapshotLabel }),
              })
                .then(async () => {
                  setSnapshotLabel("");
                  await loadGovernance();
                })
                .catch((error) => onError(error.message))
            }
          >
            {t("Créer un instantané")}
          </button>
          <select
            value={compareFrom}
            onChange={(event) => setCompareFrom(event.target.value)}
          >
            <option value="">{t("État initial")}</option>
            {snapshots.map((snapshot) => (
              <option value={snapshot.id} key={snapshot.id}>
                {snapshot.label}
              </option>
            ))}
          </select>
          <select
            value={compareTo}
            onChange={(event) => setCompareTo(event.target.value)}
          >
            <option value="">{t("État final")}</option>
            {snapshots.map((snapshot) => (
              <option value={snapshot.id} key={snapshot.id}>
                {snapshot.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!compareFrom || !compareTo}
            onClick={() =>
              void api<NonNullable<typeof comparison>>(
                `/api/admin/access-snapshots/compare?from=${encodeURIComponent(compareFrom)}&to=${encodeURIComponent(compareTo)}`,
              )
                .then(setComparison)
                .catch((error) => onError(error.message))
            }
          >
            {t("Comparer")}
          </button>
        </div>
        {comparison && (
          <p>
            {comparison.changed
              ? t("Les droits ont changé.")
              : t("Aucun changement.")}{" "}
            {comparison.summary.ruleChanges} {t("règle(s) modifiée(s)")},{" "}
            {comparison.summary.ownerChanges} {t("propriétaire(s) modifié(s)")}
          </p>
        )}
        <ul>
          {snapshots.map((snapshot) => (
            <li key={snapshot.id}>
              {snapshot.label} — {new Date(snapshot.createdAt).toLocaleString()}{" "}
              <a href={`/api/admin/access-snapshots/${snapshot.id}/export`}>
                {t("Exporter l’instantané signé")}
              </a>
            </li>
          ))}
        </ul>
      </details>

      <details>
        <summary>
          {t("Anomalies détectées")} ({anomalies.length})
        </summary>
        <ul className="attention-list">
          {anomalies.map((anomaly, index) => (
            <li key={`${anomaly.ruleId}:${anomaly.message}:${index}`}>
              <mark>{anomaly.severity}</mark> {anomaly.group} → {anomaly.space}:{" "}
              {anomaly.message}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function SpacesPanel({
  spaces,
  onChanged,
  onError,
}: {
  spaces: Space[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const { locale, t } = useAdminI18n();
  const confirmAction = useContext(ConfirmContext);
  const [form, setForm] = useState({ slug: "", nameFr: "", nameEn: "" });
  const [category, setCategory] = useState({
    spaceId: "",
    slug: "",
    nameFr: "",
    nameEn: "",
  });
  const [editedCategoryId, setEditedCategoryId] = useState("");
  const [creationMode, setCreationMode] = useState<"space" | "category" | null>(
    null,
  );
  const editorRef = useRef<HTMLDivElement>(null);
  const categoryCount = spaces.reduce(
    (total, space) => total + (space.categories?.length || 0),
    0,
  );
  const documentCount = spaces.reduce(
    (total, space) => total + (space._count?.documents || 0),
    0,
  );
  const resetCategory = () => {
    setEditedCategoryId("");
    setCategory({ spaceId: "", slug: "", nameFr: "", nameEn: "" });
    setCreationMode(null);
  };
  return (
    <>
      <div className="content-management-heading">
        <div>
          <h1>{t("Espaces documentaires")}</h1>
          <p className="lead">
            {t("Organisez les documents par espace puis par catégorie.")}
          </p>
        </div>
        <div className="content-management-actions">
          <button
            type="button"
            onClick={() => {
              setCreationMode("space");
              setEditedCategoryId("");
            }}
          >
            <Icon name="add" /> {t("Nouvel espace")}
          </button>
          <button
            type="button"
            className="primary"
            disabled={spaces.length === 0}
            onClick={() => {
              setCreationMode("category");
              setEditedCategoryId("");
              setCategory({ spaceId: "", slug: "", nameFr: "", nameEn: "" });
            }}
          >
            <Icon name="add" /> {t("Nouvelle catégorie")}
          </button>
        </div>
      </div>

      <section className="content-summary" aria-label={t("Résumé du contenu")}>
        <div>
          <strong>{spaces.length}</strong>
          <span>{t("espaces")}</span>
        </div>
        <div>
          <strong>{categoryCount}</strong>
          <span>{t("catégories")}</span>
        </div>
        <div>
          <strong>{documentCount}</strong>
          <span>{t("documents")}</span>
        </div>
      </section>

      <div ref={editorRef}>
        {creationMode === "space" && (
          <form
            className="admin-form content-editor"
            onSubmit={async (event) => {
              event.preventDefault();
              await api("/api/admin/spaces", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(form),
              })
                .then(async () => {
                  setForm({ slug: "", nameFr: "", nameEn: "" });
                  setCreationMode(null);
                  await onChanged();
                })
                .catch((error) => onError(error.message));
            }}
          >
            <div className="content-editor-heading">
              <div>
                <Icon name="folder" />
                <h2>{t("Créer un espace")}</h2>
              </div>
              <button
                type="button"
                onClick={() => setCreationMode(null)}
                aria-label={t("Fermer")}
              >
                <Icon name="close" />
              </button>
            </div>
            <label>
              {t("Identifiant technique")}
              <input
                required
                placeholder="ex: finance"
                value={form.slug}
                onChange={(event) =>
                  setForm({ ...form, slug: event.target.value })
                }
              />
            </label>
            <label>
              {t("Nom français")}
              <input
                required
                value={form.nameFr}
                onChange={(event) =>
                  setForm({ ...form, nameFr: event.target.value })
                }
              />
            </label>
            <label>
              {t("Nom anglais")}
              <input
                required
                value={form.nameEn}
                onChange={(event) =>
                  setForm({ ...form, nameEn: event.target.value })
                }
              />
            </label>
            <div className="content-editor-actions">
              <button type="button" onClick={() => setCreationMode(null)}>
                {t("Annuler")}
              </button>
              <button className="primary">{t("Créer")}</button>
            </div>
          </form>
        )}
        {creationMode === "category" && (
          <form
            className="admin-form content-editor category-editor"
            onSubmit={async (event) => {
              event.preventDefault();
              const url = editedCategoryId
                ? `/api/admin/categories/${editedCategoryId}`
                : "/api/admin/categories";
              await api(url, {
                method: editedCategoryId ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(category),
              })
                .then(async () => {
                  resetCategory();
                  await onChanged();
                })
                .catch((error) => onError(error.message));
            }}
          >
            <div className="content-editor-heading">
              <div>
                <Icon name="folder" />
                <h2>
                  {editedCategoryId
                    ? t("Modifier la catégorie")
                    : t("Créer une catégorie")}
                </h2>
              </div>
              <button
                type="button"
                onClick={resetCategory}
                aria-label={t("Fermer")}
              >
                <Icon name="close" />
              </button>
            </div>
            <label>
              {t("Espace de la catégorie")}
              <select
                required
                value={category.spaceId}
                onChange={(event) =>
                  setCategory({ ...category, spaceId: event.target.value })
                }
              >
                <option value="">{t("Espace…")}</option>
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {locale === "fr" ? space.nameFr : space.nameEn}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Identifiant technique")}
              <input
                required
                placeholder="ex: procedures"
                value={category.slug}
                onChange={(event) =>
                  setCategory({ ...category, slug: event.target.value })
                }
              />
            </label>
            <label>
              {t("Nom français de la catégorie")}
              <input
                required
                value={category.nameFr}
                onChange={(event) =>
                  setCategory({ ...category, nameFr: event.target.value })
                }
              />
            </label>
            <label>
              {t("Nom anglais de la catégorie")}
              <input
                required
                value={category.nameEn}
                onChange={(event) =>
                  setCategory({ ...category, nameEn: event.target.value })
                }
              />
            </label>
            <div className="content-editor-actions">
              <button type="button" onClick={resetCategory}>
                {t("Annuler")}
              </button>
              <button className="primary">
                {editedCategoryId ? t("Enregistrer") : t("Créer")}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="space-management-list">
        {spaces.length === 0 && (
          <EmptyState
            fr="Aucun espace documentaire n’est configuré."
            en="No document space is configured."
          />
        )}
        {spaces.map((space) => (
          <article className="space-management-card" key={space.id}>
            <header>
              <span className="space-management-icon">
                <Icon name="folder" />
              </span>
              <div className="space-management-title">
                <h2>{locale === "fr" ? space.nameFr : space.nameEn}</h2>
                <code>{space.slug}</code>
              </div>
              <div className="space-management-counts">
                <span>
                  <strong>{space._count?.documents || 0}</strong>{" "}
                  {t("documents")}
                </span>
                <span>
                  <strong>{space.categories?.length || 0}</strong>{" "}
                  {t("catégories")}
                </span>
                <span>
                  <strong>{space._count?.accessRules || 0}</strong>{" "}
                  {t("règles")}
                </span>
              </div>
              <div className="space-management-header-actions">
                <button
                  type="button"
                  onClick={() => {
                    setCreationMode("category");
                    setEditedCategoryId("");
                    setCategory({
                      spaceId: space.id,
                      slug: "",
                      nameFr: "",
                      nameEn: "",
                    });
                    requestAnimationFrame(() =>
                      editorRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      }),
                    );
                  }}
                >
                  <Icon name="add" /> {t("Ajouter une catégorie")}
                </button>
                <button
                  type="button"
                  className="danger"
                  onClick={async () => {
                    if (
                      await confirmAction(
                        t(
                          `Archiver ${space.nameFr} ?`,
                          `Archive ${space.nameEn}?`,
                        ),
                      )
                    )
                      await api(`/api/admin/spaces/${space.id}`, {
                        method: "DELETE",
                      })
                        .then(onChanged)
                        .catch((error) => onError(error.message));
                  }}
                >
                  <Icon name="archive" />
                  <span>{t("Archiver")}</span>
                </button>
              </div>
            </header>
            <div className="space-category-list">
              {!space.categories?.length && (
                <EmptyState
                  compact
                  fr="Aucune catégorie dans cet espace."
                  en="No category in this space."
                />
              )}
              {space.categories?.map((item) => (
                <div className="space-category-row" key={item.id}>
                  <span className="space-category-icon">
                    <Icon name="folder" />
                  </span>
                  <span className="space-category-name">
                    <strong>
                      {locale === "fr" ? item.nameFr : item.nameEn}
                    </strong>
                    <small>{locale === "fr" ? item.nameEn : item.nameFr}</small>
                  </span>
                  <code>{item.slug}</code>
                  <span className="button-row">
                    <button
                      type="button"
                      onClick={() => {
                        setEditedCategoryId(item.id);
                        setCategory({
                          spaceId: item.spaceId,
                          slug: item.slug,
                          nameFr: item.nameFr,
                          nameEn: item.nameEn,
                        });
                        setCreationMode("category");
                        requestAnimationFrame(() =>
                          editorRef.current?.scrollIntoView({
                            behavior: "smooth",
                            block: "center",
                          }),
                        );
                      }}
                    >
                      {t("Modifier")}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={async () => {
                        if (
                          !(await confirmAction(
                            t(
                              `Supprimer la catégorie ${item.nameFr} ? Les documents associés seront conservés sans catégorie.`,
                              `Delete category ${item.nameEn}? Associated documents will be kept without a category.`,
                            ),
                          ))
                        )
                          return;
                        await api(`/api/admin/categories/${item.id}`, {
                          method: "DELETE",
                        })
                          .then(async () => {
                            if (editedCategoryId === item.id) resetCategory();
                            await onChanged();
                          })
                          .catch((error) => onError(error.message));
                      }}
                    >
                      {t("Supprimer")}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function DocumentsPanel({
  documents,
  spaces,
  onChanged,
  onError,
}: {
  documents: AdminDocument[];
  spaces: Space[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const { locale, t } = useAdminI18n();
  const confirmAction = useContext(ConfirmContext);
  const [spaceId, setSpaceId] = useState("");
  const [sensitive, setSensitive] = useState(false);
  const [watermarkPosition, setWatermarkPosition] = useState<
    "HEADER" | "CENTER" | "FOOTER"
  >("CENTER");
  const selectedSpace = spaces.find((space) => space.id === spaceId);
  return (
    <>
      <h1>{t("Documents")}</h1>
      <form
        className="admin-form upload-form"
        onSubmit={async (event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const formElement = event.currentTarget;
          const data = new FormData(formElement);
          await api("/api/admin/documents", { method: "POST", body: data })
            .then(async () => {
              formElement.reset();
              setSpaceId("");
              setSensitive(false);
              setWatermarkPosition("CENTER");
              await onChanged();
            })
            .catch((error) => onError(error.message));
        }}
      >
        <h2>{t("Déposer une version")}</h2>
        <p>
          {t(
            "Formats acceptés : PDF, Word DOCX et Excel XLSX. Les utilisateurs les consultent en lecture seule.",
            "Accepted formats: PDF, Word DOCX and Excel XLSX. Users view them in read-only mode.",
          )}
        </p>
        <label>
          {t("Espace")}
          <select
            name="spaceId"
            required
            value={spaceId}
            onChange={(event) => setSpaceId(event.target.value)}
          >
            <option value="">{t("Sélectionner…")}</option>
            {spaces.map((space) => (
              <option value={space.id} key={space.id}>
                {locale === "fr" ? space.nameFr : space.nameEn}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Catégorie")}
          <select name="categoryId">
            <option value="">{t("Sans catégorie")}</option>
            {selectedSpace?.categories?.map((item) => (
              <option value={item.id} key={item.id}>
                {locale === "fr" ? item.nameFr : item.nameEn}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="document-language-field">
          <legend>{t("Langue du document")}</legend>
          <div className="document-language-options">
            <label className="document-language-option">
              <input name="locale" type="radio" value="fr" defaultChecked />
              <span>FR</span>
            </label>
            <label className="document-language-option">
              <input name="locale" type="radio" value="en" />
              <span>EN</span>
            </label>
          </div>
          <small>{t("Indique uniquement la langue du fichier.")}</small>
        </fieldset>
        <label>
          {t("Titre")}
          <input name="title" required maxLength={255} />
        </label>
        <label>
          {t("Description")}
          <textarea name="description" maxLength={2000} />
        </label>
        <label>
          {t("Fichier")}
          <input name="file" type="file" required accept=".pdf,.docx,.xlsx" />
        </label>
        <label className="check">
          <input
            name="sensitive"
            value="true"
            type="checkbox"
            checked={sensitive}
            onChange={(event) => setSensitive(event.target.checked)}
          />{" "}
          {t("Document sensible")}
        </label>
        {sensitive && (
          <section className="watermark-config">
            <label>
              {t("Position du filigrane")}
              <select
                name="watermarkPosition"
                value={watermarkPosition}
                onChange={(event) =>
                  setWatermarkPosition(
                    event.target.value as "HEADER" | "CENTER" | "FOOTER",
                  )
                }
              >
                <option value="HEADER">{t("Haut de page")}</option>
                <option value="CENTER">{t("Milieu de page")}</option>
                <option value="FOOTER">{t("Bas de page")}</option>
              </select>
            </label>
            <div>
              <strong>{t("Aperçu du filigrane")}</strong>
              <div className="watermark-preview" aria-live="polite">
                <span
                  className={`sensitive-watermark ${watermarkPosition.toLowerCase()}`}
                >
                  SENSITIVE DOCUMENT
                </span>
              </div>
            </div>
          </section>
        )}
        <button className="primary">{t("Déposer et analyser")}</button>
      </form>
      <div className="admin-table-wrap">
        <table className="admin-actions-table">
          <thead>
            <tr>
              <th>{t("Titre")}</th>
              <th>{t("Espace")}</th>
              <th>{t("Langue du document")}</th>
              <th>{t("État")}</th>
              <th>{t("Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState
                    compact
                    fr="Aucun document n’a encore été déposé."
                    en="No document has been uploaded yet."
                  />
                </td>
              </tr>
            )}
            {documents.map((document) => (
              <tr key={document.id}>
                <td>
                  {document.translations.map((item) => item.title).join(" / ")}
                </td>
                <td>
                  {locale === "fr"
                    ? document.space.nameFr
                    : document.space.nameEn}
                </td>
                <td>
                  <div
                    className="document-language-badges"
                    aria-label={t("Langue du document")}
                  >
                    {Array.from(
                      new Set(
                        document.versions.map((version) => version.locale),
                      ),
                    ).map((documentLocale) => (
                      <span
                        className="document-language-badge"
                        key={documentLocale}
                      >
                        {documentLocale.toUpperCase()}
                      </span>
                    ))}
                  </div>
                </td>
                <td>{localizedStatus(locale, document.status)}</td>
                <td>
                  <div className="document-actions">
                    {document.status !== "PUBLISHED" && (
                      <button
                        className="document-action publish"
                        onClick={() =>
                          api(`/api/admin/documents/${document.id}/publish`, {
                            method: "POST",
                          })
                            .then(onChanged)
                            .catch((error) => onError(error.message))
                        }
                      >
                        <Icon name="publish" />
                        {t("Publier")}
                      </button>
                    )}
                    {document.status !== "ARCHIVED" && (
                      <button
                        className="document-action archive"
                        onClick={() =>
                          api(`/api/admin/documents/${document.id}/archive`, {
                            method: "POST",
                          })
                            .then(onChanged)
                            .catch((error) => onError(error.message))
                        }
                      >
                        <Icon name="archive" />
                        {t("Archiver")}
                      </button>
                    )}
                    {document.status === "ARCHIVED" && (
                      <button
                        className="document-action restore"
                        onClick={() =>
                          api(`/api/admin/documents/${document.id}/restore`, {
                            method: "POST",
                          })
                            .then(onChanged)
                            .catch((error) => onError(error.message))
                        }
                      >
                        <Icon name="restore" />
                        {t("Restaurer")}
                      </button>
                    )}
                    <button
                      className="document-action delete"
                      onClick={async () => {
                        if (
                          !(await confirmAction(
                            t(
                              "Supprimer définitivement ce document et tous ses fichiers ?",
                            ),
                          ))
                        )
                          return;
                        await api(`/api/admin/documents/${document.id}`, {
                          method: "DELETE",
                        })
                          .then(onChanged)
                          .catch((error) => onError(error.message));
                      }}
                    >
                      <Icon name="delete" />
                      {t("Supprimer")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DirectoryPanel({
  connections,
  certificates,
  onChanged,
  onError,
  onNotice,
}: {
  connections: DirectoryConnection[];
  certificates: Certificate[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const { locale, t } = useAdminI18n();
  const confirmAction = useContext(ConfirmContext);
  const [editing, setEditing] = useState<DirectoryConnection | null>(null);
  const [synchronizingId, setSynchronizingId] = useState<string | null>(null);
  const [selectedProtocol, setSelectedProtocol] = useState<"LDAP" | "LDAPS">(
    "LDAPS",
  );
  useEffect(() => {
    setSelectedProtocol(editing?.protocol || "LDAPS");
  }, [editing]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const values = Object.fromEntries(new FormData(formElement));
    const body = {
      name: values.name,
      domain: values.domain,
      primaryHost: values.primaryHost,
      secondaryHost: values.secondaryHost || undefined,
      port: Number(values.port),
      protocol: values.protocol,
      baseDn: values.baseDn,
      userBaseDn: values.userBaseDn || undefined,
      groupBaseDn: values.groupBaseDn || undefined,
      bindDn: values.bindDn,
      bindSecret: values.bindSecret,
      userFilter: values.userFilter,
      groupFilter: values.groupFilter,
      loginAttribute: values.loginAttribute,
      usernameAttribute: values.usernameAttribute,
      groupAttribute: values.groupAttribute,
      emailAttribute: values.emailAttribute,
      nestedGroups: values.nestedGroups === "on",
      syncIntervalMinutes: Number(values.syncIntervalMinutes),
      timeoutMs: Number(values.timeoutMs),
      retries: Number(values.retries),
      enabled: values.enabled === "on",
      caCertificateId: values.caCertificateId || null,
    };
    await api(
      editing
        ? `/api/admin/directory-connections/${editing.id}`
        : "/api/admin/directory-connections",
      {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    )
      .then(async () => {
        formElement.reset();
        setEditing(null);
        onNotice(
          editing ? t("Connecteur modifié.") : t("Connecteur enregistré."),
        );
        await onChanged();
      })
      .catch((error) => onError(error.message));
  };
  return (
    <>
      <h1>{t("Synchronisation LDAP/LDAPS")}</h1>
      <form
        key={editing?.id || "new"}
        className="admin-form directory-form"
        onSubmit={submit}
      >
        <h2>
          {editing ? t("Modifier le connecteur") : t("Nouveau connecteur")}
        </h2>
        <label>
          {t("Nom")}
          <input
            name="name"
            required
            defaultValue={editing?.name || "Active Directory"}
          />
        </label>
        <label>
          {t("Domaine")}
          <input
            name="domain"
            required
            defaultValue={editing?.domain}
            placeholder="corp.example.local"
          />
        </label>
        <label>
          {t("Contrôleur primaire")}
          <input
            name="primaryHost"
            required
            defaultValue={editing?.primaryHost}
            placeholder={
              selectedProtocol === "LDAP" ? "10.1.1.4" : "dc04.example.com"
            }
          />
          <small className="field-hint">
            {selectedProtocol === "LDAP"
              ? t("LDAP : adresse IP ou nom d’hôte.")
              : t(
                  "LDAPS : nom d’hôte complet obligatoire, identique au certificat.",
                )}
          </small>
        </label>
        <label>
          {t("Contrôleur secondaire")}
          <input
            name="secondaryHost"
            defaultValue={editing?.secondaryHost}
            placeholder={
              selectedProtocol === "LDAP" ? "10.1.1.5" : "dc05.example.com"
            }
          />
        </label>
        <label>
          {t("Protocole")}
          <select
            name="protocol"
            value={selectedProtocol}
            onChange={(event) =>
              setSelectedProtocol(event.target.value as "LDAP" | "LDAPS")
            }
          >
            <option>LDAPS</option>
            <option>LDAP</option>
          </select>
        </label>
        <label>
          Port
          <input
            name="port"
            type="number"
            defaultValue={editing?.port || 636}
          />
        </label>
        <label>
          Base DN
          <input
            name="baseDn"
            required
            defaultValue={editing?.baseDn}
            placeholder="DC=corp,DC=example,DC=local"
          />
        </label>
        <label>
          User Base DN
          <input name="userBaseDn" defaultValue={editing?.userBaseDn} />
        </label>
        <label>
          Group Base DN
          <input name="groupBaseDn" defaultValue={editing?.groupBaseDn} />
        </label>
        <label>
          Bind DN
          <input name="bindDn" required defaultValue={editing?.bindDn} />
        </label>
        <label>
          {t("Secret du compte de service")}
          <input
            name="bindSecret"
            type="password"
            required={!editing}
            minLength={12}
            autoComplete="new-password"
            placeholder={
              editing
                ? t(
                    "Laisser vide pour conserver le secret",
                    "Leave blank to keep the current secret",
                  )
                : undefined
            }
          />
        </label>
        <label>
          {t("Filtre utilisateurs")}
          <input
            name="userFilter"
            defaultValue={editing?.userFilter || "(objectClass=user)"}
          />
        </label>
        <label>
          {t("Filtre groupes")}
          <input
            name="groupFilter"
            defaultValue={editing?.groupFilter || "(objectClass=group)"}
          />
        </label>
        <label>
          {t("Attribut du login court")}
          <input
            name="loginAttribute"
            defaultValue={editing?.loginAttribute || "sAMAccountName"}
          />
        </label>
        <label>
          {t("Attribut utilisateur")}
          <input
            name="usernameAttribute"
            defaultValue={editing?.usernameAttribute || "mail"}
          />
        </label>
        <label>
          {t("Attribut groupe")}
          <input
            name="groupAttribute"
            defaultValue={editing?.groupAttribute || "cn"}
          />
        </label>
        <label>
          {t("Attribut email")}
          <input
            name="emailAttribute"
            defaultValue={editing?.emailAttribute || "mail"}
          />
        </label>
        <label>
          {t("Certificat CA")}
          <select
            name="caCertificateId"
            defaultValue={editing?.caCertificateId || ""}
          >
            <option value="">{t("Aucun (LDAP uniquement)")}</option>
            {certificates.map((certificate) => (
              <option value={certificate.id} key={certificate.id}>
                {certificate.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Intervalle (minutes)")}
          <input
            name="syncIntervalMinutes"
            type="number"
            defaultValue={editing?.syncIntervalMinutes || 60}
          />
        </label>
        <label>
          Timeout (ms)
          <input
            name="timeoutMs"
            type="number"
            defaultValue={editing?.timeoutMs || 5000}
          />
        </label>
        <label>
          {t("Tentatives")}
          <input
            name="retries"
            type="number"
            defaultValue={editing?.retries ?? 2}
          />
        </label>
        <label className="check">
          <input
            name="nestedGroups"
            type="checkbox"
            defaultChecked={editing?.nestedGroups ?? true}
          />{" "}
          {t("Groupes imbriqués")}
        </label>
        <label className="check">
          <input
            name="enabled"
            type="checkbox"
            defaultChecked={editing?.enabled ?? false}
          />{" "}
          {t("Activer après validation")}
        </label>
        <button className="primary">
          {editing ? t("Enregistrer les modifications") : t("Enregistrer")}
        </button>
        {editing && (
          <button type="button" onClick={() => setEditing(null)}>
            {t("Annuler")}
          </button>
        )}
      </form>
      <div className="admin-card directory-purge-card">
        <div>
          <h2>{t("Changer d’Active Directory")}</h2>
          <p>
            {t(
              "Supprime tous les groupes synchronisés et leurs règles d’accès avant de configurer un autre annuaire. Les groupes ajoutés localement sont conservés.",
            )}
          </p>
        </div>
        <button
          type="button"
          className="danger"
          onClick={async () => {
            if (
              !(await confirmAction(
                t(
                  "Purger tous les groupes synchronisés et leurs règles d’accès ? Cette action ne modifie pas Active Directory.",
                ),
              ))
            )
              return;
            await api<{ groups: number; rules: number }>(
              "/api/admin/directory-connections/purge",
              { method: "POST" },
            )
              .then(async (result) => {
                onNotice(
                  t(
                    `Purge terminée : ${result.groups} groupe(s) et ${result.rules} règle(s) supprimé(s).`,
                    `Purge complete: ${result.groups} group(s) and ${result.rules} rule(s) deleted.`,
                  ),
                );
                await onChanged();
              })
              .catch((error) => onError(error.message));
          }}
        >
          <Icon name="delete" />
          {t("Purger les données AD")}
        </button>
      </div>
      <div className="card-grid">
        {connections.length === 0 && (
          <EmptyState
            fr="Aucun connecteur LDAP/LDAPS n’est configuré. Utilisez le formulaire ci-dessus pour en créer un."
            en="No LDAP/LDAPS connector is configured. Use the form above to create one."
          />
        )}
        {connections.map((connection) => {
          const latestSync = connection.syncJobs?.[0];
          return (
            <article className="admin-card" key={connection.id}>
              <h2>{connection.name}</h2>
              <p>
                {connection.protocol}://{connection.primaryHost}:
                {connection.port}
              </p>
              <p>
                {t("Test")}:{" "}
                {connection.lastTestStatus
                  ? localizedStatus(locale, connection.lastTestStatus)
                  : t("Jamais")}{" "}
                · {connection.enabled ? t("Actif") : t("Inactif")}
              </p>
              <div
                className={`directory-sync-status ${latestSync?.status === "ERROR" ? "error" : ""}`}
                aria-live="polite"
              >
                <strong>{t("Dernière synchronisation")} :</strong>{" "}
                {latestSync ? (
                  <>
                    {localizedStatus(locale, latestSync.status)} ·{" "}
                    {new Date(
                      latestSync.finishedAt || latestSync.startedAt,
                    ).toLocaleString(locale)}
                    {latestSync.status === "SUCCESS" &&
                      latestSync.details?.groups !== undefined && (
                        <small>
                          {t(
                            `${latestSync.details.groups} groupe(s) sélectionné(s) actualisé(s).`,
                            `${latestSync.details.groups} selected group(s) refreshed.`,
                          )}
                        </small>
                      )}
                    {latestSync.details?.error && (
                      <small>{latestSync.details.error}</small>
                    )}
                  </>
                ) : (
                  t("Jamais")
                )}
              </div>
              <div className="button-row">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(connection);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  {t("Modifier")}
                </button>
                <button
                  onClick={() =>
                    api<{ status: string }>(
                      `/api/admin/directory-connections/${connection.id}/test`,
                      { method: "POST" },
                    )
                      .then(async (result) => {
                        onNotice(`${t("Test")} ${result.status}`);
                        await onChanged();
                      })
                      .catch((error) => onError(error.message))
                  }
                >
                  {t("Tester")}
                </button>
                <button
                  disabled={synchronizingId !== null}
                  onClick={async () => {
                    setSynchronizingId(connection.id);
                    try {
                      const result = await api<{
                        status: string;
                        groups?: number;
                        selectedGroups?: number;
                        error?: string;
                      }>(
                        `/api/admin/directory-connections/${connection.id}/synchronize`,
                        { method: "POST" },
                      );
                      if (result.status !== "SUCCESS") {
                        onError(
                          result.error ||
                            t(
                              "La synchronisation de l’annuaire a échoué.",
                              "Directory synchronization failed.",
                            ),
                        );
                      } else {
                        onNotice(
                          t(
                            `Synchronisation réussie : ${result.groups || 0} groupe(s) sélectionné(s) actualisé(s).`,
                            `Synchronization successful: ${result.groups || 0} selected group(s) refreshed.`,
                          ),
                        );
                      }
                      await onChanged();
                    } catch (error) {
                      onError((error as Error).message);
                    } finally {
                      setSynchronizingId(null);
                    }
                  }}
                >
                  {synchronizingId === connection.id
                    ? t("Synchronisation en cours…")
                    : t("Synchroniser")}
                </button>
                <button
                  className="danger"
                  onClick={() =>
                    api(`/api/admin/directory-connections/${connection.id}`, {
                      method: "DELETE",
                    })
                      .then(onChanged)
                      .catch((error) => onError(error.message))
                  }
                >
                  {t("Désactiver")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function CertificatesPanel({
  certificates,
  onChanged,
  onError,
  onNotice,
}: {
  certificates: Certificate[];
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const { locale, t } = useAdminI18n();
  const confirmAction = useContext(ConfirmContext);
  const [contentBase64, setContentBase64] = useState("");
  const [name, setName] = useState("");
  const readCertificate = async (file?: File) => {
    if (!file) {
      setContentBase64("");
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > 48 * 1024) {
      throw new Error(t("Le certificat dépasse la taille maximale de 48 Kio."));
    }
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    setContentBase64(window.btoa(binary));
  };
  return (
    <>
      <h1>{t("Certificats CA")}</h1>
      <p className="lead">
        {t(
          "Un ou deux certificats publics maximum, stockés dans PostgreSQL et séparés des documents.",
          "A maximum of one or two public certificates, stored in PostgreSQL and kept separate from documents.",
        )}
      </p>
      <form
        className="admin-form inline-form"
        onSubmit={async (event) => {
          event.preventDefault();
          await api("/api/admin/certificates", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, contentBase64 }),
          })
            .then(async () => {
              setName("");
              setContentBase64("");
              onNotice(t("Certificat importé."));
              await onChanged();
            })
            .catch((error) => onError(error.message));
        }}
      >
        <input
          required
          placeholder={t("Nom convivial")}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          type="file"
          required
          accept=".pem,.crt,.cer,.p7b,.p7c,application/x-x509-ca-cert,application/pkix-cert,application/pkcs7-mime"
          onChange={(event) => {
            const inputElement = event.currentTarget;
            void readCertificate(inputElement.files?.[0]).catch((error) => {
              setContentBase64("");
              inputElement.value = "";
              onError((error as Error).message);
            });
          }}
        />
        <small className="field-hint">
          {t(
            "Formats acceptés : certificat ou chaîne ADCS X.509 PEM, DER ou PKCS#7 (.pem, .crt, .cer, .p7b, .p7c), sans clé privée.",
          )}
        </small>
        <button className="primary" disabled={certificates.length >= 2}>
          {t("Importer")}
        </button>
      </form>
      <div className="card-grid">
        {certificates.length === 0 && (
          <EmptyState
            fr="Aucun certificat CA public n’est importé."
            en="No public CA certificate has been imported."
          />
        )}
        {certificates.map((certificate) => (
          <article className="admin-card" key={certificate.id}>
            <h2>{certificate.name}</h2>
            <p>
              <mark>{localizedStatus(locale, certificate.status)}</mark>{" "}
              {certificate.inUse ? t("· utilisé") : ""}
            </p>
            <small>
              {t("Sujet")}: {certificate.subject}
            </small>
            <small>
              {t("Émetteur")}: {certificate.issuer}
            </small>
            <small>
              {t("Expire")}:{" "}
              {new Date(certificate.validTo).toLocaleDateString(locale)}
            </small>
            <small>SHA-256 : {certificate.fingerprintSha256}</small>
            <div className="button-row">
              <button
                onClick={() =>
                  api<{ status: string }>(
                    `/api/admin/certificates/${certificate.id}/test`,
                    { method: "POST" },
                  )
                    .then((result) => onNotice(`Certificat ${result.status}`))
                    .catch((error) => onError(error.message))
                }
              >
                {t("Tester")}
              </button>
              <a href={`/api/admin/certificates/${certificate.id}/public`}>
                {t("Télécharger")}
              </a>
              <button
                className="danger"
                onClick={async () => {
                  const warning = certificate.inUse
                    ? t(
                        "Les connecteurs actifs associés seront désactivés. Continuer ?",
                        "Associated active connectors will be disabled. Continue?",
                      )
                    : t(
                        "Supprimer ce certificat ?",
                        "Delete this certificate?",
                      );
                  if (await confirmAction(warning))
                    await api(`/api/admin/certificates/${certificate.id}`, {
                      method: "DELETE",
                    })
                      .then(onChanged)
                      .catch((error) => onError(error.message));
                }}
              >
                {t("Supprimer")}
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function IncidentReportsPanel({
  reports,
  search,
  onChanged,
  onError,
  onNotice,
}: {
  reports: AnnualIncidentReport[];
  search: string;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const { locale, t } = useAdminI18n();
  const confirmAction = useContext(ConfirmContext);
  const emptyDraft = (): Omit<AnnualIncidentReport, "id" | "updatedAt"> => ({
    year: new Date().getFullYear(),
    totalIncidents: 0,
    criticalIncidents: 0,
    resolvedIncidents: 0,
    summary: "",
    lessonsLearned: "",
    status: "DRAFT",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);
  const filtered = reports.filter((report) =>
    `${report.year} ${report.summary} ${report.lessonsLearned || ""}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const totals = filtered.reduce(
    (result, report) => ({
      incidents: result.incidents + report.totalIncidents,
      critical: result.critical + report.criticalIncidents,
      resolved: result.resolved + report.resolvedIncidents,
    }),
    { incidents: 0, critical: 0, resolved: 0 },
  );
  const overallResolutionRate = totals.incidents
    ? Math.round((totals.resolved / totals.incidents) * 100)
    : 0;
  const reset = () => {
    setEditingId(null);
    setDraft(emptyDraft());
  };
  const edit = (report: AnnualIncidentReport) => {
    setEditingId(report.id);
    setDraft({
      year: report.year,
      totalIncidents: report.totalIncidents,
      criticalIncidents: report.criticalIncidents,
      resolvedIncidents: report.resolvedIncidents,
      summary: report.summary,
      lessonsLearned: report.lessonsLearned || "",
      status: report.status,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const save = async () => {
    setSaving(true);
    try {
      await api(
        editingId
          ? `/api/admin/incident-reports/${editingId}`
          : "/api/admin/incident-reports",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      onNotice(
        editingId ? t("Rapport annuel mis à jour.") : t("Rapport annuel créé."),
      );
      reset();
      await onChanged();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="incident-reports-panel">
      <h1>{t("Rapports d’incidents annuels")}</h1>
      <p className="lead">
        {t(
          "Consolidez les incidents, leur résolution et les enseignements de chaque année.",
        )}
      </p>
      <form
        className="admin-form incident-report-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h2>
          {editingId ? t("Modifier le rapport") : t("Nouveau rapport annuel")}
        </h2>
        <div className="incident-metrics-form">
          <label>
            {t("Année")}
            <input
              type="number"
              min="2000"
              max="2100"
              value={draft.year}
              onChange={(event) =>
                setDraft({ ...draft, year: Number(event.target.value) })
              }
              required
            />
          </label>
          {[
            ["totalIncidents", t("Incidents totaux")],
            ["criticalIncidents", t("Incidents critiques")],
            ["resolvedIncidents", t("Incidents résolus")],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                min="0"
                max="1000000"
                value={draft[key as keyof typeof draft] as number}
                onChange={(event) =>
                  setDraft({ ...draft, [key]: Number(event.target.value) })
                }
                required
              />
            </label>
          ))}
          <label>
            {t("Statut")}
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  status: event.target.value as "DRAFT" | "PUBLISHED",
                })
              }
            >
              <option value="DRAFT">{t("Brouillon")}</option>
              <option value="PUBLISHED">{t("Publié")}</option>
            </select>
          </label>
        </div>
        <label>
          {t("Synthèse annuelle")}
          <textarea
            minLength={3}
            maxLength={10000}
            value={draft.summary}
            onChange={(event) =>
              setDraft({ ...draft, summary: event.target.value })
            }
            required
          />
        </label>
        <label>
          {t("Enseignements et actions d’amélioration")}
          <textarea
            maxLength={10000}
            value={draft.lessonsLearned || ""}
            onChange={(event) =>
              setDraft({ ...draft, lessonsLearned: event.target.value })
            }
          />
        </label>
        <div className="button-row">
          <button className="primary" disabled={saving}>
            {saving ? t("Enregistrement…") : t("Enregistrer le rapport")}
          </button>
          {editingId && (
            <button type="button" onClick={reset}>
              {t("Annuler")}
            </button>
          )}
        </div>
      </form>
      <section
        className="incident-register-summary"
        aria-label={t("Synthèse du registre annuel")}
      >
        <div>
          <strong>{filtered.length}</strong>
          <span>{t("Années suivies")}</span>
        </div>
        <div>
          <strong>{totals.incidents}</strong>
          <span>{t("Incidents cumulés")}</span>
        </div>
        <div>
          <strong>{totals.critical}</strong>
          <span>{t("Incidents critiques")}</span>
        </div>
        <div>
          <strong>{overallResolutionRate}%</strong>
          <span>{t("Résolution globale")}</span>
        </div>
      </section>
      <div className="annual-report-list-heading" aria-hidden="true">
        <span>{t("Année")}</span>
        <span>{t("Statut")}</span>
        <span>{t("Total")}</span>
        <span>{t("Critiques")}</span>
        <span>{t("Résolus")}</span>
        <span>{t("Résolution")}</span>
        <span>{t("Actions")}</span>
      </div>
      <div className="incident-report-list">
        {filtered.map((report) => {
          const resolutionRate = report.totalIncidents
            ? Math.round(
                (report.resolvedIncidents / report.totalIncidents) * 100,
              )
            : 0;
          return (
            <article className="incident-report-card" key={report.id}>
              <div className="annual-report-row">
                <h2>{report.year}</h2>
                <mark>{localizedStatus(locale, report.status)}</mark>
                <strong data-label={t("Total")}>{report.totalIncidents}</strong>
                <strong data-label={t("Critiques")}>
                  {report.criticalIncidents}
                </strong>
                <strong data-label={t("Résolus")}>
                  {report.resolvedIncidents}
                </strong>
                <strong data-label={t("Résolution")}>{resolutionRate}%</strong>
                <div className="annual-report-actions">
                  <button onClick={() => edit(report)}>{t("Modifier")}</button>
                  <button
                    className="danger"
                    onClick={async () => {
                      if (
                        !(await confirmAction(
                          t("Supprimer ce rapport annuel ?"),
                        ))
                      )
                        return;
                      await api(`/api/admin/incident-reports/${report.id}`, {
                        method: "DELETE",
                      })
                        .then(async () => {
                          if (editingId === report.id) reset();
                          onNotice(t("Rapport annuel supprimé."));
                          await onChanged();
                        })
                        .catch((error) => onError(error.message));
                    }}
                  >
                    {t("Supprimer")}
                  </button>
                </div>
              </div>
              <details className="annual-report-details">
                <summary>
                  {t("Afficher la synthèse et les enseignements")}
                </summary>
                <div>
                  <section>
                    <h3>{t("Synthèse annuelle")}</h3>
                    <p>{report.summary}</p>
                  </section>
                  {report.lessonsLearned && (
                    <section>
                      <h3>{t("Enseignements")}</h3>
                      <p>{report.lessonsLearned}</p>
                    </section>
                  )}
                  <small>
                    {t("Dernière mise à jour")} :{" "}
                    {new Date(report.updatedAt).toLocaleString(locale)}
                  </small>
                </div>
              </details>
            </article>
          );
        })}
        {!filtered.length && (
          <p className="admin-empty">{t("Aucun rapport annuel.")}</p>
        )}
      </div>
    </div>
  );
}

function ObservabilityPanel({
  dashboard,
  events,
  health,
  onNotice,
}: {
  dashboard: Dashboard | null;
  events: Audit[];
  health: Record<string, unknown> | null;
  onNotice: (message: string) => void;
}) {
  const { t } = useAdminI18n();
  const [operations, setOperations] = useState<{
    failures: number;
    denied: number;
    accessRequests: number;
    reports: number;
    unreadNotifications: number;
  } | null>(null);
  const [workItems, setWorkItems] = useState<{
    accessRequests: Array<{
      id: string;
      identity: string;
      justification: string;
      status: string;
    }>;
    reports: Array<{
      id: string;
      identity: string;
      reason: string;
      status: string;
    }>;
  }>({ accessRequests: [], reports: [] });
  const [integrationState, setIntegrationState] = useState<
    Record<string, boolean>
  >({});
  const [portalOrigin, setPortalOrigin] = useState("");
  const [alertPolicy, setAlertPolicy] = useState({
    enabled: false,
    channel: "none",
    destinationReference: "",
    fiveXxPercent: "5",
    deniedPerMinute: "20",
  });
  const reloadOperations = useCallback(async () => {
    const [summaryResponse, workResponse, integrationsResponse] =
      await Promise.all([
        fetch("/api/admin/operations/summary", { cache: "no-store" }),
        fetch("/api/admin/operations/work-items", { cache: "no-store" }),
        fetch("/api/admin/operations/integrations", { cache: "no-store" }),
      ]);
    if (summaryResponse.ok) setOperations(await summaryResponse.json());
    if (workResponse.ok) setWorkItems(await workResponse.json());
    if (integrationsResponse.ok) {
      const result = (await integrationsResponse.json()) as {
        settings: Array<{ key: string; value: { enabled?: boolean } }>;
      };
      setIntegrationState(
        Object.fromEntries(
          result.settings.map((setting) => [
            setting.key.replace("observability.", ""),
            Boolean(setting.value.enabled),
          ]),
        ),
      );
    }
  }, []);
  useEffect(() => {
    void reloadOperations();
  }, [reloadOperations]);
  useEffect(() => {
    setPortalOrigin(window.location.origin);
  }, []);
  const failures = events.filter((event) => event.result !== "success").length;
  const services =
    health && typeof health.services === "object" && health.services
      ? Object.values(health.services as Record<string, boolean>)
      : [];
  const healthyServices = services.filter(Boolean).length;
  const detectedPortalUrl = portalOrigin || "<URL_PUBLIQUE_DU_PORTAIL>";
  const detectedHost = portalOrigin ? new URL(portalOrigin).hostname : "<HOTE>";
  const hostType =
    detectedHost === "localhost" ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(detectedHost) ||
    detectedHost.includes(":")
      ? t("adresse IP du serveur")
      : t("domaine publié par Nginx");
  const integrations = [
    {
      name: "Prometheus / Grafana",
      description: t(
        "Collecte des métriques privées et création de tableaux de bord.",
      ),
      config: `# Portail détecté : ${detectedPortalUrl}\n# Collecteur connecté au réseau Docker privé uniquement\nscrape_configs:\n  - job_name: isms-api\n    metrics_path: /metrics\n    static_configs:\n      - targets: ["api:3001"]\nrule_files:\n  - /etc/prometheus/isms-alerts.yml`,
    },
    {
      name: "Syslog / rsyslog",
      description: t("Centralisation des journaux JSON Docker via TLS."),
      config: `# Configuration limitée aux services du portail\nSYSLOG_ADDRESS=tcp+tls://<SYSLOG_HOST>:6514 \\\n  docker compose -f docker-compose.yml \\\n  -f deploy/compose/observability-syslog.yml up -d`,
    },
    {
      name: "Wazuh",
      description: t(
        "Décodage des événements JSON, corrélation et alertes SIEM.",
      ),
      config: `<!-- Portail détecté : ${detectedPortalUrl} -->\n<localfile>\n  <log_format>json</log_format>\n  <location>/var/log/isms-portal/events.json</location>\n</localfile>\n<!-- Importer deploy/monitoring/wazuh-isms-rules.xml -->`,
    },
    {
      name: "Zabbix",
      description: t(
        "Supervision de disponibilité, capacité et erreurs applicatives.",
      ),
      config: `Importer deploy/monitoring/zabbix-isms-template.yaml\n{$ISMS.URL}=${detectedPortalUrl}\n{$ISMS.METRICS.URL}=http://api:3001/metrics\n# Le serveur/proxy Zabbix doit rejoindre le réseau privé.`,
    },
  ];
  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    onNotice(t("Configuration copiée."));
  };

  return (
    <section className="observability-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t("Exploitation et SIEM")}</span>
          <h1>{t("Observabilité")}</h1>
          <p>
            {t(
              "Visualisez les signaux essentiels et préparez les intégrations sans exposer les métriques sur Internet.",
            )}
          </p>
        </div>
      </div>
      <div className="summary-grid">
        <article>
          <strong>
            {healthyServices}/{services.length || "—"}
          </strong>
          <span>{t("services disponibles")}</span>
        </article>
        <article>
          <strong>{failures}</strong>
          <span>{t("échecs dans le journal chargé")}</span>
        </article>
        <article>
          <strong>{dashboard?.syncErrors ?? "—"}</strong>
          <span>{t("erreurs de synchronisation")}</span>
        </article>
        <article>
          <strong>{operations?.denied ?? failures}</strong>
          <span>{t("refus sur les dernières 24 heures")}</span>
        </article>
      </div>
      <div className="summary-grid">
        <article>
          <strong>{operations?.accessRequests ?? "—"}</strong>
          <span>{t("demandes d’accès en attente")}</span>
        </article>
        <article>
          <strong>{operations?.reports ?? "—"}</strong>
          <span>{t("signalements documentaires ouverts")}</span>
        </article>
        <article>
          <strong>{operations?.unreadNotifications ?? "—"}</strong>
          <span>{t("notifications non lues")}</span>
        </article>
        <article>
          <strong>{operations?.failures ?? "—"}</strong>
          <span>{t("échecs applicatifs sur 24 heures")}</span>
        </article>
      </div>
      <div className="admin-alert observability-warning">
        {t("Adresse du portail détectée automatiquement")}:{" "}
        <strong>{detectedPortalUrl}</strong> ({hostType}).
      </div>
      <div className="admin-alert warning observability-warning">
        {t(
          "Le point /metrics reste accessible uniquement depuis le réseau privé de l’API. Les secrets et certificats doivent rester dans le gestionnaire de secrets de l’infrastructure.",
        )}
      </div>
      <div className="admin-alert observability-warning">
        {t(
          "Architecture recommandée : Prometheus ou Zabbix collecte les métriques sur le réseau privé ; rsyslog normalise les journaux ; Wazuh les corrèle. Évitez de faire collecter le même signal par plusieurs agents.",
        )}
      </div>
      <div className="admin-alert observability-warning">
        {t(
          "Le réseau isms-portal_observability est dédié aux collecteurs autorisés. Il n’est pas interne et n’expose aucun port hôte : un collecteur Docker externe peut le rejoindre explicitement.",
        )}
      </div>
      <div className="integration-grid">
        {integrations.map((integration) => {
          const tool = integration.name.toLowerCase().includes("prometheus")
            ? "prometheus"
            : integration.name.toLowerCase().includes("syslog")
              ? "syslog"
              : integration.name.toLowerCase();
          return (
            <article className="integration-card" key={integration.name}>
              <h2>{integration.name}</h2>
              <label className="toggle-line">
                <input
                  type="checkbox"
                  checked={Boolean(integrationState[tool])}
                  onChange={async (event) => {
                    const enabled = event.target.checked;
                    const response = await fetch(
                      `/api/admin/operations/integrations/${tool}`,
                      {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ enabled }),
                      },
                    );
                    if (response.ok) {
                      setIntegrationState((current) => ({
                        ...current,
                        [tool]: enabled,
                      }));
                      onNotice(
                        enabled
                          ? t("Intégration optionnelle activée.")
                          : t("Intégration optionnelle désactivée."),
                      );
                    }
                  }}
                />
                {t("Activer cette intégration optionnelle")}
              </label>
              <p>{integration.description}</p>
              <pre>
                <code>{integration.config}</code>
              </pre>
              <button
                type="button"
                onClick={() => void copy(integration.config)}
              >
                {t("Copier la configuration")}
              </button>
              <a
                href={`/api/admin/operations/integrations/${tool}/download?portalUrl=${encodeURIComponent(detectedPortalUrl)}`}
              >
                {t("Télécharger la configuration")}
              </a>
              <button
                type="button"
                onClick={async () => {
                  const response = await fetch(
                    `/api/admin/operations/integrations/${tool}/test`,
                  );
                  onNotice(
                    response.ok
                      ? t(
                          "Application prête ; test externe à effectuer depuis le collecteur.",
                        )
                      : t("Test indisponible."),
                  );
                }}
              >
                {t("Tester la préparation")}
              </button>
            </article>
          );
        })}
      </div>
      <form
        className="admin-form observability-policy"
        onSubmit={async (event) => {
          event.preventDefault();
          const response = await fetch("/api/admin/operations/alert-policy", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(alertPolicy),
          });
          onNotice(
            response.ok
              ? t("Politique d’alerte enregistrée.")
              : t("Politique d’alerte invalide."),
          );
        }}
      >
        <h2>{t("Seuils et canal d’alerte")}</h2>
        <label className="toggle-line">
          <input
            type="checkbox"
            checked={alertPolicy.enabled}
            onChange={(event) =>
              setAlertPolicy((current) => ({
                ...current,
                enabled: event.target.checked,
              }))
            }
          />
          {t("Activer les alertes externes")}
        </label>
        <label>
          {t("Taux 5xx maximal (%)")}
          <input
            inputMode="decimal"
            value={alertPolicy.fiveXxPercent}
            onChange={(event) =>
              setAlertPolicy((current) => ({
                ...current,
                fiveXxPercent: event.target.value,
              }))
            }
          />
        </label>
        <label>
          {t("Refus maximaux par minute")}
          <input
            inputMode="numeric"
            value={alertPolicy.deniedPerMinute}
            onChange={(event) =>
              setAlertPolicy((current) => ({
                ...current,
                deniedPerMinute: event.target.value,
              }))
            }
          />
        </label>
        <label>
          {t("Canal")}
          <select
            value={alertPolicy.channel}
            onChange={(event) =>
              setAlertPolicy((current) => ({
                ...current,
                channel: event.target.value,
              }))
            }
          >
            <option value="none">—</option>
            <option value="email">E-mail</option>
            <option value="teams">Teams</option>
            <option value="slack">Slack</option>
            <option value="webhook">Webhook</option>
          </select>
        </label>
        <label>
          {t("Référence de destination ou secret")}
          <input
            value={alertPolicy.destinationReference}
            placeholder="<SECRET_DANS_GESTIONNAIRE>"
            onChange={(event) =>
              setAlertPolicy((current) => ({
                ...current,
                destinationReference: event.target.value,
              }))
            }
          />
        </label>
        <button>{t("Enregistrer la politique")}</button>
      </form>
      <section className="operations-work-items">
        <h2>{t("Demandes et signalements à traiter")}</h2>
        {[...workItems.accessRequests, ...workItems.reports].length === 0 ? (
          <p>{t("Aucun élément en attente.")}</p>
        ) : (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("Type")}</th>
                  <th>{t("Identité")}</th>
                  <th>{t("Motif")}</th>
                  <th>{t("Action")}</th>
                </tr>
              </thead>
              <tbody>
                {workItems.accessRequests
                  .filter((item) => item.status === "PENDING")
                  .map((item) => (
                    <tr key={item.id}>
                      <td>{t("Demande d’accès")}</td>
                      <td>{item.identity}</td>
                      <td>{item.justification}</td>
                      <td>
                        <button
                          onClick={async () => {
                            await fetch(
                              `/api/admin/operations/access-requests/${item.id}`,
                              {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: "APPROVED" }),
                              },
                            );
                            await reloadOperations();
                          }}
                        >
                          {t("Approuver")}
                        </button>
                        <button
                          onClick={async () => {
                            await fetch(
                              `/api/admin/operations/access-requests/${item.id}`,
                              {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: "REJECTED" }),
                              },
                            );
                            await reloadOperations();
                          }}
                        >
                          {t("Refuser")}
                        </button>
                      </td>
                    </tr>
                  ))}
                {workItems.reports
                  .filter((item) => item.status === "OPEN")
                  .map((item) => (
                    <tr key={item.id}>
                      <td>{t("Signalement")}</td>
                      <td>{item.identity}</td>
                      <td>{item.reason}</td>
                      <td>
                        <button
                          onClick={async () => {
                            await fetch(
                              `/api/admin/operations/document-reports/${item.id}`,
                              {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: "RESOLVED" }),
                              },
                            );
                            await reloadOperations();
                          }}
                        >
                          {t("Marquer traité")}
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="lead">
        {t(
          "Les exemples complets et les règles d’alerte se trouvent dans deploy/monitoring.",
        )}
      </p>
    </section>
  );
}

function AuditPanel({ events }: { events: Audit[] }) {
  const { t } = useAdminI18n();
  return (
    <>
      <div className="section-actions">
        <div>
          <h1>{t("Journal d’audit")}</h1>
          <p className="lead">{t("Événements UTC sans secrets.")}</p>
          <small className="retention-note">
            {t("Conservation automatique des 50 événements les plus récents.")}
          </small>
        </div>
        <a href="/api/admin/audit/export?format=csv">{t("Exporter CSV")}</a>
        <a href="/api/admin/audit/export?format=json">{t("Exporter JSON")}</a>
      </div>
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date UTC</th>
              <th>{t("Identité")}</th>
              <th>{t("Action")}</th>
              <th>{t("Ressource")}</th>
              <th>{t("Résultat")}</th>
              <th>{t("Corrélation")}</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={6}>
                  <EmptyState
                    compact
                    fr="Aucun événement d’audit n’est disponible."
                    en="No audit event is available."
                  />
                </td>
              </tr>
            )}
            {events.map((event) => (
              <tr key={event.id}>
                <td>{new Date(event.occurredAt).toISOString()}</td>
                <td>{event.identity}</td>
                <td>{event.action}</td>
                <td>{event.resource}</td>
                <td>{event.result}</td>
                <td>{event.correlationId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function HealthPanel({ health }: { health: Record<string, unknown> | null }) {
  const { t } = useAdminI18n();
  return (
    <>
      <h1>{t("Santé des services")}</h1>
      <pre className="health-output">{JSON.stringify(health, null, 2)}</pre>
      <p className="retention-note">
        {t("Métriques Prometheus disponibles sur le réseau API privé.")}
      </p>
    </>
  );
}

function SettingsPanel({
  identity,
  onError,
  onNotice,
}: {
  identity: {
    username: string;
    displayName: string;
    profilePhoto: string | null;
    primaryAdmin: boolean;
    authentication: Authentication;
  } | null;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const { t } = useAdminI18n();
  const confirmAction = useContext(ConfirmContext);
  const [key, setKey] = useState("certificates.expiry-alert-days");
  const [value, setValue] = useState('{"days":[90,60,30,15,7]}');
  const [accounts, setAccounts] = useState<
    Array<{
      id: string;
      username: string;
      displayName: string;
      source: string;
      mfaEnabled: boolean;
      primary: boolean;
      justification: string | null;
      validUntil: string | null;
      lastAuthorizedAt: string | null;
      lastReviewedAt: string | null;
      reviewDueAt: string | null;
    }>
  >([]);
  const [profilePhoto, setProfilePhoto] = useState(
    identity?.profilePhoto || "",
  );
  const [mfaSetup, setMfaSetup] = useState<{
    secret: string;
    otpauthUrl: string;
  } | null>(null);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryUsersLoading, setDirectoryUsersLoading] = useState(false);
  const [directoryUsers, setDirectoryUsers] = useState<
    Array<{ username: string; displayName: string; email: string | null }>
  >([]);
  const [selectedDirectoryUser, setSelectedDirectoryUser] = useState<{
    username: string;
    displayName: string;
    email: string | null;
  } | null>(null);
  const [adminGroups, setAdminGroups] = useState<
    Array<{
      id: string;
      name: string;
      distinguishedName: string;
      justification: string;
      validUntil: string | null;
      lastAuthorizedAt: string | null;
      reviewDueAt: string | null;
    }>
  >([]);
  const [adminGroupQuery, setAdminGroupQuery] = useState("");
  const [adminGroupsLoading, setAdminGroupsLoading] = useState(false);
  const [adminGroupSuggestions, setAdminGroupSuggestions] = useState<
    DirectoryGroupSuggestion[]
  >([]);
  const [selectedAdminGroup, setSelectedAdminGroup] =
    useState<DirectoryGroupSuggestion | null>(null);
  const [administratorFilter, setAdministratorFilter] = useState("");
  const [directoryAdminJustification, setDirectoryAdminJustification] =
    useState("");
  const [directoryAdminValidUntil, setDirectoryAdminValidUntil] = useState("");
  const [groupAdminJustification, setGroupAdminJustification] = useState("");
  const [groupAdminValidUntil, setGroupAdminValidUntil] = useState("");
  const [administratorGrantPending, setAdministratorGrantPending] = useState<
    "user" | "group" | null
  >(null);
  const [adminSessions, setAdminSessions] = useState<
    Array<{
      id: string;
      createdAt: string;
      lastUsedAt: string;
      expiresAt: string;
      sourceIp: string | null;
      adminAccount: { username: string; displayName: string; source: string };
    }>
  >([]);
  const filteredAccounts = useMemo(() => {
    const query = administratorFilter.trim().toLowerCase();
    if (!query) return accounts;
    return accounts.filter((account) =>
      `${account.displayName} ${account.username} ${account.source}`
        .toLowerCase()
        .includes(query),
    );
  }, [accounts, administratorFilter]);
  const localAdministratorCount = accounts.filter(
    (account) => account.source === "LOCAL",
  ).length;
  const directoryAdministratorCount = accounts.filter(
    (account) => account.source === "DIRECTORY",
  ).length;
  const loadAccounts = useCallback(
    () =>
      api<typeof accounts>("/api/admin/accounts")
        .then(setAccounts)
        .catch((error) => onError(error.message)),
    [onError],
  );
  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);
  const loadAdminGroups = useCallback(
    () =>
      api<typeof adminGroups>("/api/admin/accounts/groups")
        .then(setAdminGroups)
        .catch((error) => onError(error.message)),
    [onError],
  );
  useEffect(() => {
    if (identity) {
      void loadAdminGroups();
      void api<typeof adminSessions>("/api/admin/accounts/sessions/active")
        .then(setAdminSessions)
        .catch((error) => onError(error.message));
    }
  }, [identity, loadAdminGroups, onError]);
  useEffect(() => {
    setSelectedDirectoryUser(null);
    if (directoryQuery.trim().length < 2) {
      setDirectoryUsers([]);
      setDirectoryUsersLoading(false);
      return;
    }
    const controller = new AbortController();
    setDirectoryUsersLoading(true);
    const timer = window.setTimeout(() => {
      api<typeof directoryUsers>(
        `/api/admin/accounts/directory-users/${encodeURIComponent(directoryQuery)}`,
        { signal: controller.signal },
      )
        .then(setDirectoryUsers)
        .catch((error) => {
          if ((error as Error).name !== "AbortError") onError(error.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setDirectoryUsersLoading(false);
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [directoryQuery, onError]);
  useEffect(() => {
    setSelectedAdminGroup(null);
    if (adminGroupQuery.trim().length < 2) {
      setAdminGroupSuggestions([]);
      setAdminGroupsLoading(false);
      return;
    }
    const controller = new AbortController();
    setAdminGroupsLoading(true);
    const timer = window.setTimeout(() => {
      api<DirectoryGroupSuggestion[]>(
        `/api/admin/accounts/directory-groups/${encodeURIComponent(adminGroupQuery)}`,
        { signal: controller.signal },
      )
        .then(setAdminGroupSuggestions)
        .catch((error) => {
          if ((error as Error).name !== "AbortError") onError(error.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setAdminGroupsLoading(false);
        });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [adminGroupQuery, onError]);
  const addDirectoryAdministrator = async () => {
    if (administratorGrantPending) return;
    if (!selectedDirectoryUser) {
      onError(t("Sélectionnez d’abord un utilisateur AD dans les résultats."));
      return;
    }
    if (directoryAdminJustification.trim().length < 3) {
      onError(t("Renseignez une justification d’au moins trois caractères."));
      return;
    }
    setAdministratorGrantPending("user");
    try {
      await api("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Directory sessions use the normalized mail attribute as their
          // stable identity. Persist the same value for administrator grants
          // so a selected sAMAccountName can actually match after sign-in.
          username:
            selectedDirectoryUser.email?.trim().toLowerCase() ||
            selectedDirectoryUser.username,
          displayName: selectedDirectoryUser.displayName,
          source: "DIRECTORY",
          justification: directoryAdminJustification.trim(),
          validUntil: directoryAdminValidUntil || undefined,
        }),
      });
      setDirectoryQuery("");
      setDirectoryUsers([]);
      setSelectedDirectoryUser(null);
      setDirectoryAdminJustification("");
      setDirectoryAdminValidUntil("");
      await loadAccounts();
      onNotice(t("Administrateur ajouté."));
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setAdministratorGrantPending(null);
    }
  };
  const addDirectoryAdministratorGroup = async () => {
    if (administratorGrantPending) return;
    if (!selectedAdminGroup) {
      onError(t("Sélectionnez d’abord un groupe AD dans les résultats."));
      return;
    }
    if (groupAdminJustification.trim().length < 3) {
      onError(t("Renseignez une justification d’au moins trois caractères."));
      return;
    }
    setAdministratorGrantPending("group");
    try {
      await api("/api/admin/accounts/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedAdminGroup.name,
          distinguishedName: selectedAdminGroup.distinguishedName,
          justification: groupAdminJustification.trim(),
          validUntil: groupAdminValidUntil || undefined,
        }),
      });
      setAdminGroupQuery("");
      setAdminGroupSuggestions([]);
      setSelectedAdminGroup(null);
      setGroupAdminJustification("");
      setGroupAdminValidUntil("");
      await loadAdminGroups();
      onNotice(t("Groupe administrateur ajouté."));
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setAdministratorGrantPending(null);
    }
  };
  return (
    <>
      <h1>{t("Configuration")}</h1>
      <section className="admin-card profile-settings">
        <h2>{t("Profil administrateur")}</h2>
        {profilePhoto && (
          <img className="profile-photo" src={profilePhoto} alt="" />
        )}
        <form
          className="admin-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const values = Object.fromEntries(
              new FormData(event.currentTarget),
            );
            await api("/api/admin/accounts/me/profile", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                displayName: values.displayName,
                profilePhoto: profilePhoto || null,
              }),
            })
              .then(() => onNotice(t("Profil enregistré.")))
              .catch((error) => onError(error.message));
          }}
        >
          <label>
            {t("Nom affiché")}
            <input
              name="displayName"
              defaultValue={identity?.displayName}
              required
            />
          </label>
          <label>
            {t("Photo de profil")}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 256 * 1024) {
                  onError(
                    t(
                      "La photo doit faire moins de 256 Kio.",
                      "The photo must be smaller than 256 KiB.",
                    ),
                  );
                  return;
                }
                const reader = new FileReader();
                reader.onload = () => setProfilePhoto(String(reader.result));
                reader.readAsDataURL(file);
              }}
            />
          </label>
          <button className="primary">{t("Enregistrer")}</button>
        </form>
        {identity?.authentication.source === "local-admin" && (
          <form
            className="admin-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const formElement = event.currentTarget;
              const values = Object.fromEntries(new FormData(formElement));
              await api("/api/admin/accounts/me/password", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
              })
                .then(() => window.location.assign("/admin/login"))
                .catch((error) => onError(error.message));
            }}
          >
            <h3>{t("Changer le mot de passe")}</h3>
            <input
              name="currentPassword"
              type="password"
              placeholder={t("Mot de passe actuel")}
              required
            />
            <input
              name="newPassword"
              type="password"
              minLength={14}
              placeholder={t(
                "Nouveau mot de passe (14 caractères minimum)",
                "New password (14 characters minimum)",
              )}
              required
            />
            <button>{t("Changer le mot de passe")}</button>
          </form>
        )}
        {identity?.authentication.source === "local-admin" && (
          <div className="mfa-settings">
            <h3>{t("Authentification MFA")}</h3>
            {!mfaSetup ? (
              <button
                onClick={() =>
                  api<{ secret: string; otpauthUrl: string }>(
                    "/api/admin/accounts/me/mfa/setup",
                    { method: "POST" },
                  )
                    .then(setMfaSetup)
                    .catch((error) => onError(error.message))
                }
              >
                {t("Configurer le MFA")}
              </button>
            ) : (
              <form
                className="admin-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const code = new FormData(event.currentTarget).get("code");
                  await api("/api/admin/accounts/me/mfa/confirm", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ code }),
                  })
                    .then(async () => {
                      setMfaSetup(null);
                      onNotice(t("MFA activé."));
                      await loadAccounts();
                    })
                    .catch((error) => onError(error.message));
                }}
              >
                <p>
                  {t(
                    "Ajoutez cette clé dans Microsoft Authenticator, Google Authenticator ou une application TOTP :",
                    "Add this key to Microsoft Authenticator, Google Authenticator, or another TOTP app:",
                  )}
                </p>
                <code>{mfaSetup.secret}</code>
                <input
                  name="code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  placeholder="000000"
                  required
                />
                <button className="primary">{t("Confirmer le MFA")}</button>
              </form>
            )}
          </div>
        )}
      </section>
      {identity && (
        <section className="admin-card administrator-management">
          <h2>{t("Comptes administrateurs")}</h2>
          <p className="retention-note">
            {t(
              "Tous les administrateurs peuvent accorder ou retirer ces droits. Le compte principal reste protégé contre la suppression.",
              "All administrators can grant or revoke these rights. The primary account remains protected against deletion.",
            )}
          </p>
          <div
            className="administrator-summary"
            aria-label={t("Résumé des administrateurs")}
          >
            <div>
              <strong>{localAdministratorCount}</strong>
              <span>{t("Comptes locaux")}</span>
            </div>
            <div>
              <strong>{directoryAdministratorCount}</strong>
              <span>{t("Utilisateurs AD")}</span>
            </div>
            <div>
              <strong>{adminGroups.length}</strong>
              <span>{t("Groupes AD administrateurs")}</span>
            </div>
          </div>
          <label className="administrator-filter">
            {t("Filtrer les administrateurs")}
            <input
              type="search"
              value={administratorFilter}
              onChange={(event) => setAdministratorFilter(event.target.value)}
              placeholder={t("Nom, identifiant ou source")}
            />
          </label>
          <div className="admin-account-list">
            {filteredAccounts.map((account) => (
              <div key={account.id}>
                <span>
                  <strong>{account.displayName}</strong>
                  <small>{account.username}</small>
                  <span className="administrator-badges">
                    <span>
                      {account.source === "LOCAL"
                        ? t("Compte local")
                        : t("Utilisateur AD")}
                    </span>
                    <span>
                      {account.primary ? t("Principal") : t("Administrateur")}
                    </span>
                    <span>
                      {account.source === "LOCAL"
                        ? `MFA ${account.mfaEnabled ? "✓" : "—"}`
                        : t("MFA géré par l’identité")}
                    </span>
                  </span>
                  <small>
                    {account.justification || t("Aucune justification")}
                  </small>
                  <small>
                    {t("Dernière utilisation")}:{" "}
                    {account.lastAuthorizedAt
                      ? new Date(account.lastAuthorizedAt).toLocaleString()
                      : "—"}{" "}
                    · {t("Revue avant")}:{" "}
                    {account.reviewDueAt
                      ? new Date(account.reviewDueAt).toLocaleDateString()
                      : "—"}{" "}
                    · {t("Expiration")}:{" "}
                    {account.validUntil
                      ? new Date(account.validUntil).toLocaleString()
                      : t("Sans expiration")}
                  </small>
                </span>
                <div className="administrator-row-actions">
                  <button
                    onClick={() =>
                      api(`/api/admin/accounts/${account.id}/review`, {
                        method: "PUT",
                      })
                        .then(loadAccounts)
                        .catch((error) => onError(error.message))
                    }
                  >
                    {t("Recertifier")}
                  </button>
                  {!account.primary && (
                    <button
                      className="danger"
                      onClick={async () => {
                        if (
                          !(await confirmAction(
                            t("Supprimer cet administrateur ?"),
                          ))
                        )
                          return;
                        await api(`/api/admin/accounts/${account.id}`, {
                          method: "DELETE",
                        })
                          .then(loadAccounts)
                          .catch((error) => onError(error.message));
                      }}
                    >
                      {t("Supprimer")}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!filteredAccounts.length && (
              <p className="admin-empty compact">
                {t("Aucun administrateur correspondant.")}
              </p>
            )}
          </div>
          <div className="administrator-grant-grid">
            <form
              className="admin-form administrator-grant-card"
              onSubmit={async (event) => {
                event.preventDefault();
                const formElement = event.currentTarget;
                const values = Object.fromEntries(new FormData(formElement));
                await api("/api/admin/accounts", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    ...values,
                    source: "LOCAL",
                    validUntil: values.validUntil || undefined,
                  }),
                })
                  .then(async () => {
                    formElement.reset();
                    await loadAccounts();
                  })
                  .catch((error) => onError(error.message));
              }}
            >
              <h3>{t("Ajouter un administrateur local")}</h3>
              <input
                name="displayName"
                placeholder={t("Nom affiché")}
                required
              />
              <input name="username" placeholder={t("Identifiant")} required />
              <input
                name="password"
                type="password"
                minLength={14}
                placeholder={t("Mot de passe fort")}
                required
              />
              <textarea
                name="justification"
                minLength={3}
                maxLength={500}
                placeholder={t("Justification du privilège")}
                required
              />
              <label>
                {t("Expiration facultative")}
                <input name="validUntil" type="datetime-local" />
              </label>
              <button className="primary">{t("Ajouter")}</button>
            </form>
            <div className="administrator-grant-card directory-admin-grant">
              <h3>{t("Ajouter un utilisateur Active Directory")}</h3>
              <label>
                {t(
                  "Rechercher un utilisateur Active Directory",
                  "Search for an Active Directory user",
                )}
                <input
                  value={directoryQuery}
                  onChange={(event) => setDirectoryQuery(event.target.value)}
                  placeholder={t(
                    "Nom, identifiant ou e-mail",
                    "Name, username or email",
                  )}
                />
              </label>
              <label>
                {t("Justification du privilège")}
                <textarea
                  value={directoryAdminJustification}
                  onChange={(event) =>
                    setDirectoryAdminJustification(event.target.value)
                  }
                  minLength={3}
                  maxLength={500}
                  placeholder={t("Motif de cet accès administrateur")}
                  required
                />
              </label>
              <label>
                {t("Expiration facultative")}
                <input
                  type="datetime-local"
                  value={directoryAdminValidUntil}
                  onChange={(event) =>
                    setDirectoryAdminValidUntil(event.target.value)
                  }
                />
              </label>
              <div className="directory-user-results">
                {directoryUsers.map((user) => (
                  <button
                    type="button"
                    key={user.username}
                    className={
                      selectedDirectoryUser?.username === user.username
                        ? "selected"
                        : ""
                    }
                    aria-pressed={
                      selectedDirectoryUser?.username === user.username
                    }
                    onClick={() => setSelectedDirectoryUser(user)}
                  >
                    <strong>{user.displayName}</strong>
                    <small>{user.email || user.username}</small>
                  </button>
                ))}
              </div>
              <p className="directory-search-status" aria-live="polite">
                {directoryUsersLoading
                  ? t("Recherche en cours…")
                  : directoryQuery.trim().length >= 2 && !directoryUsers.length
                    ? t("Aucun utilisateur AD trouvé.")
                    : directoryQuery.trim().length < 2
                      ? t("Saisissez au moins deux caractères.")
                      : ""}
              </p>
              <button
                type="button"
                className="primary administrator-add-button"
                disabled={administratorGrantPending !== null}
                onClick={() => void addDirectoryAdministrator()}
              >
                <Icon name="add" />
                {" "}
                {administratorGrantPending === "user"
                  ? t("Ajout en cours…")
                  : t("Ajouter l’utilisateur sélectionné")}
              </button>
            </div>
            <div className="administrator-grant-card directory-admin-grant">
              <h3>{t("Ajouter un groupe Active Directory")}</h3>
              <p className="retention-note">
                {t(
                  "Tous les membres détectés de ce groupe disposeront des droits administratifs complets.",
                )}
              </p>
              <label>
                {t("Rechercher un groupe AD")}
                <input
                  value={adminGroupQuery}
                  onChange={(event) => setAdminGroupQuery(event.target.value)}
                  placeholder={t("Nom du groupe")}
                />
              </label>
              <label>
                {t("Justification du privilège")}
                <textarea
                  value={groupAdminJustification}
                  onChange={(event) =>
                    setGroupAdminJustification(event.target.value)
                  }
                  minLength={3}
                  maxLength={500}
                  placeholder={t("Motif de cet accès administrateur")}
                  required
                />
              </label>
              <label>
                {t("Expiration facultative")}
                <input
                  type="datetime-local"
                  value={groupAdminValidUntil}
                  onChange={(event) =>
                    setGroupAdminValidUntil(event.target.value)
                  }
                />
              </label>
              <div className="directory-user-results">
                {adminGroupSuggestions.map((group) => (
                  <button
                    type="button"
                    key={`${group.connectionId}:${group.distinguishedName}`}
                    className={
                      selectedAdminGroup?.distinguishedName ===
                      group.distinguishedName
                        ? "selected"
                        : ""
                    }
                    aria-pressed={
                      selectedAdminGroup?.distinguishedName ===
                      group.distinguishedName
                    }
                    onClick={() => setSelectedAdminGroup(group)}
                  >
                    <strong>{group.name}</strong>
                    <small>{group.distinguishedName}</small>
                  </button>
                ))}
              </div>
              <p className="directory-search-status" aria-live="polite">
                {adminGroupsLoading
                  ? t("Recherche en cours…")
                  : adminGroupQuery.trim().length >= 2 &&
                      !adminGroupSuggestions.length
                    ? t("Aucun groupe AD trouvé.")
                    : adminGroupQuery.trim().length < 2
                      ? t("Saisissez au moins deux caractères.")
                      : ""}
              </p>
              <button
                type="button"
                className="primary administrator-add-button"
                disabled={administratorGrantPending !== null}
                onClick={() => void addDirectoryAdministratorGroup()}
              >
                <Icon name="add" />
                {" "}
                {administratorGrantPending === "group"
                  ? t("Ajout en cours…")
                  : t("Ajouter le groupe sélectionné")}
              </button>
              <div className="admin-account-list">
                {adminGroups.map((group) => (
                  <div key={group.id}>
                    <span>
                      <strong>{group.name}</strong>
                      <small>{group.distinguishedName}</small>
                      <small>{group.justification}</small>
                      <small>
                        {t("Dernière utilisation")}:{" "}
                        {group.lastAuthorizedAt
                          ? new Date(group.lastAuthorizedAt).toLocaleString()
                          : "—"}{" "}
                        · {t("Revue avant")}:{" "}
                        {group.reviewDueAt
                          ? new Date(group.reviewDueAt).toLocaleDateString()
                          : "—"}{" "}
                        · {t("Expiration")}:{" "}
                        {group.validUntil
                          ? new Date(group.validUntil).toLocaleString()
                          : t("Sans expiration")}
                      </small>
                    </span>
                    <div className="administrator-row-actions">
                      <button
                        onClick={() =>
                          api(`/api/admin/accounts/groups/${group.id}/review`, {
                            method: "PUT",
                          })
                            .then(loadAdminGroups)
                            .catch((error) => onError(error.message))
                        }
                      >
                        {t("Recertifier")}
                      </button>
                      <button
                        className="danger"
                        onClick={async () => {
                          if (
                            !(await confirmAction(
                              t(
                                "Retirer les droits administratifs de ce groupe AD ?",
                              ),
                            ))
                          )
                            return;
                          await api(`/api/admin/accounts/groups/${group.id}`, {
                            method: "DELETE",
                          })
                            .then(loadAdminGroups)
                            .catch((error) => onError(error.message));
                        }}
                      >
                        {t("Supprimer")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="administrator-sessions">
            <h3>{t("Sessions administrateur actives")}</h3>
            {adminSessions.map((session) => (
              <div key={session.id}>
                <span>
                  <strong>{session.adminAccount.displayName}</strong>
                  <small>
                    {session.adminAccount.username} · {t("Adresse IP")}:{" "}
                    {session.sourceIp || "—"} · {t("Dernière utilisation")}:{" "}
                    {new Date(session.lastUsedAt).toLocaleString()} ·{" "}
                    {t("Expiration")}:{" "}
                    {new Date(session.expiresAt).toLocaleString()}
                  </small>
                </span>
                <button
                  className="danger"
                  onClick={() =>
                    api(`/api/admin/accounts/sessions/${session.id}`, {
                      method: "DELETE",
                    })
                      .then(() =>
                        setAdminSessions((current) =>
                          current.filter((item) => item.id !== session.id),
                        ),
                      )
                      .catch((error) => onError(error.message))
                  }
                >
                  {t("Révoquer")}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
      <section
        className="sso-diagnostic"
        aria-labelledby="sso-diagnostic-title"
      >
        <h2 id="sso-diagnostic-title">{t("Diagnostic SSO sécurisé")}</h2>
        <p>
          {t(
            "Seuls les totaux et les correspondances d’autorisation sont affichés. Les claims bruts ne sont jamais exposés.",
            "Only counts and authorization mappings are displayed. Raw claims are never exposed.",
          )}
        </p>
        <dl>
          <dt>{t("Source d’identité")}</dt>
          <dd>{identity?.authentication.source || "—"}</dd>
          <dt>{t("Groupes reçus")}</dt>
          <dd>{identity?.authentication.diagnostics.groupCount ?? "—"}</dd>
          <dt>{t("Espaces associés")}</dt>
          <dd>
            {identity?.authentication.diagnostics.mappedSpaceCount ?? "—"}
          </dd>
          <dt>{t("Compte administrateur associé")}</dt>
          <dd>
            {identity?.authentication.diagnostics.administratorAccount
              ? t("Oui")
              : t("Non")}
          </dd>
          <dt>{t("Expiration de session")}</dt>
          <dd>
            {identity?.authentication.sessionExpiresAt
              ? new Date(
                  identity.authentication.sessionExpiresAt,
                ).toLocaleString()
              : t("Non communiquée")}
          </dd>
        </dl>
        {identity?.authentication.logoutUrl && (
          <a className="button-link" href={identity.authentication.logoutUrl}>
            {t("Se déconnecter du SSO")}
          </a>
        )}
        {["local-admin", "directory-session"].includes(
          identity?.authentication.source || "",
        ) && (
          <button
            type="button"
            className="button-link"
            onClick={() =>
              api("/api/auth/logout?scope=admin", { method: "POST" }).then(() =>
                window.location.assign("/admin/login?loggedout=1"),
              )
            }
          >
            {t("Se déconnecter")}
          </button>
        )}
      </section>
      <form
        className="admin-form"
        onSubmit={async (event) => {
          event.preventDefault();
          try {
            await api(`/api/admin/settings/${key}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(JSON.parse(value)),
            });
            onNotice(t("Paramètre enregistré."));
          } catch (error) {
            onError((error as Error).message);
          }
        }}
      >
        <label>
          {t("Clé")}
          <input value={key} onChange={(event) => setKey(event.target.value)} />
        </label>
        <label>
          {t("Valeur JSON")}
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <button className="primary">{t("Enregistrer")}</button>
      </form>
    </>
  );
}
