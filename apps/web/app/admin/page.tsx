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
    adminGroupMatchCount: number;
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
  | "directory"
  | "certificates"
  | "audit"
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
type Space = {
  id: string;
  slug: string;
  nameFr: string;
  nameEn: string;
  categories?: Category[];
  _count?: { documents: number; accessRules: number };
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
  administer: boolean;
};
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
};
type AdminDocument = {
  id: string;
  status: string;
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

const tabs: Array<[Tab, IconName, string, string]> = [
  ["dashboard", "home", "Tableau de bord", "Dashboard"],
  ["groups", "groups", "Groupes Active Directory", "Active Directory groups"],
  ["rules", "rules", "Règles d’accès", "Access rules"],
  ["spaces", "folder", "Espaces documentaires", "Document spaces"],
  ["documents", "documents", "Documents", "Documents"],
  ["directory", "sync", "Synchronisation LDAP", "LDAP synchronization"],
  ["certificates", "certificate", "Certificats CA", "CA certificates"],
  ["audit", "audit", "Journal d’audit", "Audit log"],
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
  "administer",
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
  administer: ["Administrer", "Administer"],
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
  administer: false,
});

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
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
  const [audit, setAudit] = useState<Audit[]>([]);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);
  const [ruleDraft, setRuleDraft] = useState(emptyRule());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [identity, setIdentity] = useState<{
    displayName: string;
    locale: Locale | null;
    demoMode: boolean;
    authentication: Authentication;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<{
    message: string;
    resolve: (accepted: boolean) => void;
  } | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const t = (fr: string, en?: string) =>
    locale === "fr"
      ? fr
      : en || adminEnglishCatalog[fr as keyof typeof adminEnglishCatalog] || fr;
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
    setLoading(true);
    setError("");
    try {
      const [
        me,
        dashboardResult,
        groupsResult,
        spacesResult,
        rulesResult,
        certificatesResult,
        connectionsResult,
        documentsResult,
        auditResult,
        healthResult,
      ] = await Promise.all([
        api<{
          isAdmin: boolean;
          displayName: string;
          locale: Locale | null;
          demoMode: boolean;
          authentication: Authentication;
        }>("/api/me"),
        api<Dashboard>("/api/admin/dashboard"),
        api<Group[]>("/api/admin/groups"),
        api<Space[]>("/api/admin/spaces"),
        api<Rule[]>("/api/admin/access-rules"),
        api<Certificate[]>("/api/admin/certificates"),
        api<DirectoryConnection[]>("/api/admin/directory-connections"),
        api<AdminDocument[]>("/api/admin/documents"),
        api<{ items: Audit[] }>("/api/admin/audit?limit=100"),
        api<Record<string, unknown>>("/api/health/details"),
      ]);
      setIsAdmin(me.isAdmin);
      setIdentity(me);
      const preferred =
        me.locale ||
        (localStorage.getItem("isms-locale") as Locale | null) ||
        (navigator.language.startsWith("en") ? "en" : "fr");
      setLocale(preferred);
      document.documentElement.lang = preferred;
      setDashboard(dashboardResult);
      setGroups(groupsResult);
      setSpaces(spacesResult);
      setRules(rulesResult);
      setCertificates(certificatesResult);
      setConnections(connectionsResult);
      setDocuments(documentsResult);
      setAudit(auditResult.items);
      setHealth(healthResult);
    } catch (currentError) {
      setError((currentError as Error).message);
    } finally {
      setLoading(false);
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
    const requested = window.location.hash.slice(1) as Tab;
    if (tabs.some(([key]) => key === requested)) setTab(requested);
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const checkSession = async () => {
      const response = await fetch("/api/me", { cache: "no-store" }).catch(
        () => null,
      );
      if (!response?.ok) {
        setSessionExpired(true);
        return;
      }
      setIdentity(await response.json());
      setSessionExpired(false);
    };
    const timer = window.setInterval(() => void checkSession(), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const selectTab = (next: Tab) => {
    setTab(next);
    setError("");
    setNotice("");
    window.history.replaceState(null, "", `/admin#${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const selectRule = (rule: Rule) => {
    setSelectedRule(rule);
    setRuleDraft(
      permissionKeys.reduce((draft, key) => ({ ...draft, [key]: rule[key] }), {
        groupId: rule.groupId,
        spaceId: rule.spaceId,
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

  return (
    <AdminLocaleContext.Provider value={locale}>
      <ConfirmContext.Provider value={confirmAction}>
        <div className="admin-shell">
          <aside>
            <div className="brand">
              <div className="shield">
                <Icon name="shield" />
              </div>
              <div>
                <strong>ISMS Portal</strong>
                <small>{t("Administration sécurisée")}</small>
              </div>
            </div>
            <nav aria-label="Administration">
              {tabs.map(([key, icon, labelFr, labelEn]) => (
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
              ))}
            </nav>
            <a className="back-link" href="/">
              ← {t("Retour au portail")}
            </a>
          </aside>
          <main>
            <header>
              <input
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
              {tab === "groups" && (
                <datalist id="ad-group-suggestions">
                  {groups.map((group) => (
                    <option value={group.name} key={group.id}>
                      {group.distinguishedName}
                    </option>
                  ))}
                </datalist>
              )}
              <div className="admin-language" aria-label={t("Langue")}>
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
              <div className="admin-identity">
                <strong>
                  {identity?.displayName || t("Administrateur ISMS")}
                </strong>
                <span
                  className={
                    identity?.authentication.ssoConnected
                      ? "auth-status connected"
                      : "auth-status demo"
                  }
                >
                  {identity?.authentication.ssoConnected
                    ? t("SSO connecté")
                    : t("Session de démonstration")}
                </span>
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
                  <DashboardPanel dashboard={dashboard} />
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
                    selected={selectedRule}
                    onSelect={selectRule}
                    onNew={() => {
                      setSelectedRule(null);
                      setRuleDraft(emptyRule());
                    }}
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
          {tab === "rules" && (
            <section className="drawer">
              <h2>
                {selectedRule
                  ? `Règle ${selectedRule.group.name} → ${selectedRule.space.nameFr}`
                  : t("Nouvelle règle")}
              </h2>
              <label>
                {t("Groupe AD")}
                <select
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
                        .then(refresh)
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

function DashboardPanel({ dashboard }: { dashboard: Dashboard | null }) {
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
  return (
    <>
      <h1>{t("Groupes Active Directory")}</h1>
      <p className="lead">
        {t(
          "Les groupes synchronisés reviennent lors de la prochaine synchronisation s’ils sont supprimés localement.",
          "Synchronized groups return during the next synchronization if they are deleted locally.",
        )}
      </p>
      <form
        className="admin-form inline-form"
        onSubmit={async (event) => {
          event.preventDefault();
          await api("/api/admin/groups", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          })
            .then(async () => {
              setForm({ name: "", distinguishedName: "", description: "" });
              onNotice(
                t(
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
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
        <input
          aria-label={t("DN du groupe AD")}
          required
          placeholder="CN=Groupe,OU=Groups,DC=entreprise,DC=local"
          value={form.distinguishedName}
          onChange={(event) =>
            setForm({ ...form, distinguishedName: event.target.value })
          }
        />
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
        <table>
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
  selected,
  onSelect,
  onNew,
}: {
  rules: Rule[];
  selected: Rule | null;
  onSelect: (rule: Rule) => void;
  onNew: () => void;
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
          <button className="primary" onClick={onNew}>
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
    </>
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
  const resetCategory = () => {
    setEditedCategoryId("");
    setCategory({ spaceId: "", slug: "", nameFr: "", nameEn: "" });
  };
  return (
    <>
      <h1>{t("Espaces documentaires")}</h1>
      <form
        className="admin-form inline-form"
        onSubmit={async (event) => {
          event.preventDefault();
          await api("/api/admin/spaces", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(form),
          })
            .then(async () => {
              setForm({ slug: "", nameFr: "", nameEn: "" });
              await onChanged();
            })
            .catch((error) => onError(error.message));
        }}
      >
        <h2>{t("Créer un espace")}</h2>
        <input
          required
          placeholder="slug"
          value={form.slug}
          onChange={(event) => setForm({ ...form, slug: event.target.value })}
        />
        <input
          required
          placeholder={t("Nom français")}
          value={form.nameFr}
          onChange={(event) => setForm({ ...form, nameFr: event.target.value })}
        />
        <input
          required
          placeholder={t("Nom anglais")}
          value={form.nameEn}
          onChange={(event) => setForm({ ...form, nameEn: event.target.value })}
        />
        <button className="primary">{t("Créer")}</button>
      </form>
      <form
        className="admin-form inline-form"
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
        <h2>
          {editedCategoryId
            ? t("Modifier la catégorie")
            : t("Créer une catégorie")}
        </h2>
        <select
          aria-label={t("Espace de la catégorie")}
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
        <input
          aria-label={t("Slug de la catégorie")}
          required
          placeholder="slug"
          value={category.slug}
          onChange={(event) =>
            setCategory({ ...category, slug: event.target.value })
          }
        />
        <input
          aria-label={t("Nom français de la catégorie")}
          required
          placeholder={t("Nom français")}
          value={category.nameFr}
          onChange={(event) =>
            setCategory({ ...category, nameFr: event.target.value })
          }
        />
        <input
          aria-label={t("Nom anglais de la catégorie")}
          required
          placeholder={t("Nom anglais")}
          value={category.nameEn}
          onChange={(event) =>
            setCategory({ ...category, nameEn: event.target.value })
          }
        />
        <button className="primary">
          {editedCategoryId ? t("Enregistrer") : t("Créer")}
        </button>
        {editedCategoryId && (
          <button type="button" onClick={resetCategory}>
            {t("Annuler")}
          </button>
        )}
      </form>
      <div className="card-grid">
        {spaces.length === 0 && (
          <EmptyState
            fr="Aucun espace documentaire n’est configuré."
            en="No document space is configured."
          />
        )}
        {spaces.map((space) => (
          <article className="admin-card" key={space.id}>
            <h2>{locale === "fr" ? space.nameFr : space.nameEn}</h2>
            <small>
              {space.slug} · {space._count?.documents || 0} {t("documents")} ·{" "}
              {space._count?.accessRules || 0} {t("règles")}
            </small>
            <ul>
              {space.categories?.map((item) => (
                <li key={item.id}>
                  <span>
                    {item.nameFr} / {item.nameEn} <small>{item.slug}</small>
                  </span>
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
                        window.scrollTo({ top: 0, behavior: "smooth" });
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
                </li>
              ))}
            </ul>
            <button
              className="danger"
              onClick={async () => {
                if (
                  await confirmAction(
                    t(`Archiver ${space.nameFr} ?`, `Archive ${space.nameEn}?`),
                  )
                )
                  await api(`/api/admin/spaces/${space.id}`, {
                    method: "DELETE",
                  })
                    .then(onChanged)
                    .catch((error) => onError(error.message));
              }}
            >
              {t("Archiver")}
            </button>
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
  const selectedSpace = spaces.find((space) => space.id === spaceId);
  return (
    <>
      <h1>{t("Documents")}</h1>
      <form
        className="admin-form upload-form"
        onSubmit={async (event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          await api("/api/admin/documents", { method: "POST", body: data })
            .then(async () => {
              event.currentTarget.reset();
              setSpaceId("");
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
        <label>
          {t("Langue")}
          <select name="locale" defaultValue="fr">
            <option value="fr">{t("Français")}</option>
            <option value="en">English</option>
          </select>
        </label>
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
          <input name="sensitive" value="true" type="checkbox" />{" "}
          {t("Document sensible")}
        </label>
        <button className="primary">{t("Déposer et analyser")}</button>
      </form>
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("Titre")}</th>
              <th>{t("Espace")}</th>
              <th>{t("Langues")}</th>
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
                  {Array.from(
                    new Set(document.versions.map((version) => version.locale)),
                  )
                    .join(", ")
                    .toUpperCase()}
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
  const [editing, setEditing] = useState<DirectoryConnection | null>(null);
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
          {t("Attribut utilisateur")}
          <input
            name="usernameAttribute"
            defaultValue={editing?.usernameAttribute || "sAMAccountName"}
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
      <div className="card-grid">
        {connections.length === 0 && (
          <EmptyState
            fr="Aucun connecteur LDAP/LDAPS n’est configuré. Utilisez le formulaire ci-dessus pour en créer un."
            en="No LDAP/LDAPS connector is configured. Use the form above to create one."
          />
        )}
        {connections.map((connection) => (
          <article className="admin-card" key={connection.id}>
            <h2>{connection.name}</h2>
            <p>
              {connection.protocol}://{connection.primaryHost}:{connection.port}
            </p>
            <p>
              {t("Test")}:{" "}
              {connection.lastTestStatus
                ? localizedStatus(locale, connection.lastTestStatus)
                : t("Jamais")}{" "}
              · {connection.enabled ? t("Actif") : t("Inactif")}
            </p>
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
                onClick={() =>
                  api<{ status: string }>(
                    `/api/admin/directory-connections/${connection.id}/synchronize`,
                    { method: "POST" },
                  )
                    .then(async (result) => {
                      onNotice(`${t("Synchronisation")} ${result.status}`);
                      await onChanged();
                    })
                    .catch((error) => onError(error.message))
                }
              >
                {t("Synchroniser")}
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
        ))}
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
          onChange={(event) =>
            void readCertificate(event.target.files?.[0]).catch((error) => {
              setContentBase64("");
              event.currentTarget.value = "";
              onError((error as Error).message);
            })
          }
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

function AuditPanel({ events }: { events: Audit[] }) {
  const { t } = useAdminI18n();
  return (
    <>
      <div className="section-actions">
        <div>
          <h1>{t("Journal d’audit")}</h1>
          <p className="lead">{t("Événements UTC sans secrets.")}</p>
          <small className="retention-note">
            {t("Conservation automatique des 20 événements les plus récents.")}
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
      <p>
        <a href="/api/metrics">{t("Métriques Prometheus")}</a>
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
    displayName: string;
    authentication: Authentication;
  } | null;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const { t } = useAdminI18n();
  const [key, setKey] = useState("certificates.expiry-alert-days");
  const [value, setValue] = useState('{"days":[90,60,30,15,7]}');
  return (
    <>
      <h1>{t("Configuration")}</h1>
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
          <dt>{t("Groupes administrateur associés")}</dt>
          <dd>
            {identity?.authentication.diagnostics.adminGroupMatchCount ?? "—"}
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
