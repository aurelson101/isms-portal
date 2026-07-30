'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Icon, type IconName } from '../icons';

type Tab = 'dashboard' | 'groups' | 'rules' | 'spaces' | 'documents' | 'directory' | 'certificates' | 'audit' | 'health' | 'settings';
type Group = { id: string; name: string; distinguishedName: string; description?: string; memberCount: number; active: boolean; lastSyncedAt?: string; accessRules: Array<{ space: Space }> };
type Space = { id: string; slug: string; nameFr: string; nameEn: string; categories?: Category[]; _count?: { documents: number; accessRules: number } };
type Category = { id: string; slug: string; nameFr: string; nameEn: string; spaceId: string };
type Rule = {
  id: string; groupId: string; spaceId: string; group: Group; space: Space;
  showMenu: boolean; read: boolean; search: boolean; preview: boolean; download: boolean;
  upload: boolean; edit: boolean; publish: boolean; archive: boolean; administer: boolean;
};
type Certificate = {
  id: string; name: string; subject: string; issuer: string; fingerprintSha256: string;
  validFrom: string; validTo: string; status: string; inUse: boolean;
  connections: Array<{ id: string; name: string; enabled: boolean }>;
};
type DirectoryConnection = {
  id: string; name: string; domain: string; primaryHost: string; secondaryHost?: string;
  port: number; protocol: 'LDAP' | 'LDAPS'; enabled: boolean; lastTestStatus?: string;
  lastTestAt?: string; caCertificateId?: string;
};
type AdminDocument = {
  id: string; status: string; translations: Array<{ locale: string; title: string }>;
  space: Space; category?: Category; versions: Array<{ locale: string; version: number }>;
};
type Dashboard = { groups: number; rules: number; spaces: number; documents: number; syncErrors: number };
type Audit = { id: string; occurredAt: string; identity: string; action: string; resource: string; result: string; correlationId: string };

const tabs: Array<[Tab, IconName, string]> = [
  ['dashboard', 'home', 'Tableau de bord'],
  ['groups', 'groups', 'Groupes Active Directory'],
  ['rules', 'rules', 'Règles d’accès'],
  ['spaces', 'folder', 'Espaces documentaires'],
  ['documents', 'documents', 'Documents'],
  ['directory', 'sync', 'Synchronisation LDAP'],
  ['certificates', 'certificate', 'Certificats CA'],
  ['audit', 'audit', 'Journal d’audit'],
  ['health', 'health', 'Santé des services'],
  ['settings', 'settings', 'Configuration'],
];
const permissionKeys = ['showMenu', 'read', 'search', 'preview', 'download', 'upload', 'edit', 'publish', 'archive', 'administer'] as const;
const permissionLabels: Record<(typeof permissionKeys)[number], string> = {
  showMenu: 'Menu', read: 'Consulter', search: 'Rechercher', preview: 'Prévisualiser',
  download: 'Télécharger', upload: 'Déposer', edit: 'Modifier', publish: 'Publier',
  archive: 'Archiver', administer: 'Administrer',
};

const emptyRule = (groupId = '', spaceId = ''): Omit<Rule, 'id' | 'group' | 'space'> => ({
  groupId, spaceId, showMenu: false, read: false, search: false, preview: false,
  download: false, upload: false, edit: false, publish: false, archive: false, administer: false,
});

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText })) as { message?: string | string[] };
    throw new Error(Array.isArray(payload.message) ? payload.message.join(', ') : payload.message || response.statusText);
  }
  return response.json() as Promise<T>;
}

export default function Admin() {
  const [tab, setTab] = useState<Tab>('dashboard');
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
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [me, dashboardResult, groupsResult, spacesResult, rulesResult, certificatesResult, connectionsResult, documentsResult, auditResult, healthResult] = await Promise.all([
        api<{ isAdmin: boolean }>('/api/me'),
        api<Dashboard>('/api/admin/dashboard'),
        api<Group[]>('/api/admin/groups'),
        api<Space[]>('/api/admin/spaces'),
        api<Rule[]>('/api/admin/access-rules'),
        api<Certificate[]>('/api/admin/certificates'),
        api<DirectoryConnection[]>('/api/admin/directory-connections'),
        api<AdminDocument[]>('/api/admin/documents'),
        api<{ items: Audit[] }>('/api/admin/audit?limit=100'),
        api<Record<string, unknown>>('/api/health/details'),
      ]);
      setIsAdmin(me.isAdmin);
      setDashboard(dashboardResult); setGroups(groupsResult); setSpaces(spacesResult);
      setRules(rulesResult); setCertificates(certificatesResult); setConnections(connectionsResult);
      setDocuments(documentsResult); setAudit(auditResult.items); setHealth(healthResult);
    } catch (currentError) {
      setError((currentError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const requested = window.location.hash.slice(1) as Tab;
    if (tabs.some(([key]) => key === requested)) setTab(requested);
    void refresh();
  }, [refresh]);
  const selectTab = (next: Tab) => {
    setTab(next);
    setError('');
    setNotice('');
    window.history.replaceState(null, '', `/admin#${next}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const selectRule = (rule: Rule) => {
    setSelectedRule(rule);
    setRuleDraft(permissionKeys.reduce((draft, key) => ({ ...draft, [key]: rule[key] }), {
      groupId: rule.groupId, spaceId: rule.spaceId,
    }) as Omit<Rule, 'id' | 'group' | 'space'>);
  };
  const filteredRules = useMemo(() => rules.filter((rule) =>
    `${rule.group.name} ${rule.space.nameFr} ${rule.space.nameEn}`.toLowerCase().includes(search.toLowerCase())), [rules, search]);

  const saveRule = async () => {
    try {
      if (!ruleDraft.groupId || !ruleDraft.spaceId) throw new Error('Sélectionnez un groupe et un espace.');
      if (selectedRule) {
        await api(`/api/admin/access-rules/${selectedRule.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ruleDraft),
        });
      } else {
        await api('/api/admin/access-rules', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ruleDraft),
        });
      }
      setNotice('Règle enregistrée et immédiatement appliquée.');
      setSelectedRule(null); setRuleDraft(emptyRule());
      await refresh();
    } catch (currentError) { setError((currentError as Error).message); }
  };

  if (isAdmin === false) return <main className="access-denied"><h1>Accès refusé</h1><p>Votre identité ne possède pas le rôle administrateur.</p><a href="/">Retour au portail</a></main>;

  return <div className="admin-shell">
    <aside>
      <div className="brand"><div className="shield"><Icon name="shield"/></div><div><strong>ISMS Portal</strong><small>Administration sécurisée</small></div></div>
      <nav aria-label="Administration">{tabs.map(([key, icon, label]) =>
        <button type="button" aria-current={tab === key ? 'page' : undefined} className={tab === key ? 'active' : ''} key={key} onClick={() => selectTab(key)}><Icon name={icon}/> <span>{label}</span></button>)}</nav>
      <a className="back-link" href="/">← Retour au portail</a>
    </aside>
    <main>
      <header><input list={tab === 'groups' ? 'ad-group-suggestions' : undefined} value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tab === 'groups' ? 'Rechercher ou sélectionner un groupe AD…' : 'Rechercher dans la section…'}/>{tab === 'groups' && <datalist id="ad-group-suggestions">{groups.map((group) => <option value={group.name} key={group.id}>{group.distinguishedName}</option>)}</datalist>}<button onClick={() => void refresh()}>Actualiser</button><strong>Administrateur ISMS</strong></header>
      {error && <div className="admin-alert error" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}
      {notice && <div className="admin-alert success" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}
      {loading ? <p className="loading-state">Chargement de l’administration…</p> : <>
        {tab === 'dashboard' && <DashboardPanel dashboard={dashboard}/>}
        {tab === 'groups' && <GroupsPanel groups={groups} search={search} onChanged={refresh} onError={setError} onNotice={setNotice}/>}
        {tab === 'rules' && <RulesPanel rules={filteredRules} selected={selectedRule} onSelect={selectRule} onNew={() => { setSelectedRule(null); setRuleDraft(emptyRule()); }}/>}
        {tab === 'spaces' && <SpacesPanel spaces={spaces} onChanged={refresh} onError={setError}/>}
        {tab === 'documents' && <DocumentsPanel documents={documents} spaces={spaces} onChanged={refresh} onError={setError}/>}
        {tab === 'directory' && <DirectoryPanel connections={connections} certificates={certificates} onChanged={refresh} onError={setError} onNotice={setNotice}/>}
        {tab === 'certificates' && <CertificatesPanel certificates={certificates} onChanged={refresh} onError={setError} onNotice={setNotice}/>}
        {tab === 'audit' && <AuditPanel events={audit}/>}
        {tab === 'health' && <HealthPanel health={health}/>}
        {tab === 'settings' && <SettingsPanel onError={setError} onNotice={setNotice}/>}
      </>}
    </main>
    {tab === 'rules' && <section className="drawer">
      <h2>{selectedRule ? `Règle ${selectedRule.group.name} → ${selectedRule.space.nameFr}` : 'Nouvelle règle'}</h2>
      <label>Groupe AD<select value={ruleDraft.groupId} onChange={(event) => setRuleDraft({ ...ruleDraft, groupId: event.target.value })}><option value="">Sélectionner…</option>{groups.map((group) => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>
      <label>Espace<select value={ruleDraft.spaceId} onChange={(event) => setRuleDraft({ ...ruleDraft, spaceId: event.target.value })}><option value="">Sélectionner…</option>{spaces.map((spaceItem) => <option value={spaceItem.id} key={spaceItem.id}>{spaceItem.nameFr}</option>)}</select></label>
      <h3>Permissions accordées</h3>
      {permissionKeys.map((key) => <label className="toggle" key={key}>{permissionLabels[key]}<input type="checkbox" checked={ruleDraft[key]} onChange={(event) => setRuleDraft({ ...ruleDraft, [key]: event.target.checked })}/></label>)}
      <div className="notice">Les changements s’appliquent immédiatement aux membres du groupe.</div>
      <div className="actions">
        {selectedRule && <button className="danger" onClick={async () => {
          if (!window.confirm('Supprimer cette règle ?')) return;
          await api(`/api/admin/access-rules/${selectedRule.id}`, { method: 'DELETE' }).then(refresh).catch((currentError) => setError((currentError as Error).message));
        }}>Supprimer</button>}
        <button onClick={() => { setSelectedRule(null); setRuleDraft(emptyRule()); }}>Annuler</button>
        <button className="primary" onClick={() => void saveRule()}>Enregistrer</button>
      </div>
    </section>}
  </div>;
}

function DashboardPanel({ dashboard }: { dashboard: Dashboard | null }) {
  const stats = [
    ['Groupes AD synchronisés', dashboard?.groups ?? 0],
    ['Règles actives', dashboard?.rules ?? 0],
    ['Espaces protégés', dashboard?.spaces ?? 0],
    ['Documents', dashboard?.documents ?? 0],
    ['Erreurs de synchronisation', dashboard?.syncErrors ?? 0],
  ];
  return <><h1>Tableau de bord</h1><p className="lead">État réel de la plateforme ISMS.</p><div className="stats">{stats.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div></>;
}

function GroupsPanel({ groups, search, onChanged, onError, onNotice }: {
  groups: Group[];
  search: string;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  onNotice: (message: string) => void;
}) {
  const [form, setForm] = useState({ name: '', distinguishedName: '', description: '' });
  const filtered = groups.filter((group) => `${group.name} ${group.distinguishedName}`.toLowerCase().includes(search.toLowerCase()));
  return <><h1>Groupes Active Directory</h1><p className="lead">Les groupes synchronisés reviennent lors de la prochaine synchronisation s’ils sont supprimés localement.</p>
    <form className="admin-form inline-form" onSubmit={async (event) => {
      event.preventDefault();
      await api('/api/admin/groups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      }).then(async () => {
        setForm({ name: '', distinguishedName: '', description: '' });
        onNotice('Référence de groupe AD ajoutée.');
        await onChanged();
      }).catch((error) => onError(error.message));
    }}><h2>Ajouter un groupe AD</h2><input aria-label="Nom du groupe AD" required placeholder="Nom du groupe" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })}/><input aria-label="DN du groupe AD" required placeholder="CN=Groupe,OU=Groups,DC=entreprise,DC=local" value={form.distinguishedName} onChange={(event) => setForm({ ...form, distinguishedName: event.target.value })}/><input aria-label="Description du groupe AD" placeholder="Description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/><button className="primary">Ajouter</button></form>
    <div className="admin-table-wrap"><table><thead><tr><th>Nom</th><th>DN</th><th>Source</th><th>Membres</th><th>Dernière synchro</th><th>Espaces</th><th>État</th><th>Actions</th></tr></thead><tbody>{filtered.map((group) => <tr key={group.id}><td><strong>{group.name}</strong><small>{group.description}</small></td><td>{group.distinguishedName}</td><td>{group.lastSyncedAt ? 'Synchronisé AD' : 'Ajout local'}</td><td>{group.memberCount}</td><td>{group.lastSyncedAt ? new Date(group.lastSyncedAt).toLocaleString('fr') : 'Jamais'}</td><td>{group.accessRules.map((rule) => rule.space.nameFr).join(', ') || '—'}</td><td><mark>{group.active ? 'Actif' : 'Inactif'}</mark></td><td><button className="danger" onClick={async () => { const warning = `${group.lastSyncedAt ? 'Ce groupe synchronisé pourra revenir à la prochaine synchronisation. ' : ''}${group.accessRules.length} règle(s) associée(s) seront supprimée(s). Continuer ?`; if (!window.confirm(warning)) return; await api(`/api/admin/groups/${group.id}`, { method: 'DELETE' }).then(async () => { onNotice('Groupe supprimé.'); await onChanged(); }).catch((error) => onError(error.message)); }}>Supprimer</button></td></tr>)}</tbody></table></div></>;
}

function RulesPanel({ rules, selected, onSelect, onNew }: { rules: Rule[]; selected: Rule | null; onSelect: (rule: Rule) => void; onNew: () => void }) {
  return <><h1>Gestion des droits d’accès</h1><p className="lead">L’administrateur conserve tous les droits ; cette matrice s’applique aux utilisateurs standards.</p>
    <section className="matrix"><div className="matrix-heading"><h2>Matrice des autorisations</h2><button className="primary" onClick={onNew}>＋ Ajouter une règle</button></div>
      <div className="admin-table-wrap"><table><thead><tr><th>Groupe</th><th>Espace</th>{permissionKeys.map((key) => <th key={key}>{permissionLabels[key]}</th>)}</tr></thead><tbody>{rules.map((rule) => <tr className={selected?.id === rule.id ? 'selected-row' : ''} key={rule.id} onClick={() => onSelect(rule)}><td><strong>{rule.group.name}</strong></td><td>{rule.space.nameFr}</td>{permissionKeys.map((key) => <td key={key}>{rule[key] ? '✓' : '—'}</td>)}</tr>)}</tbody></table></div>
    </section></>;
}

function SpacesPanel({ spaces, onChanged, onError }: { spaces: Space[]; onChanged: () => Promise<void>; onError: (message: string) => void }) {
  const [form, setForm] = useState({ slug: '', nameFr: '', nameEn: '' });
  const [category, setCategory] = useState({ spaceId: '', slug: '', nameFr: '', nameEn: '' });
  const [editedCategoryId, setEditedCategoryId] = useState('');
  const resetCategory = () => {
    setEditedCategoryId('');
    setCategory({ spaceId: '', slug: '', nameFr: '', nameEn: '' });
  };
  return <><h1>Espaces documentaires</h1>
    <form className="admin-form inline-form" onSubmit={async (event) => {
      event.preventDefault();
      await api('/api/admin/spaces', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) }).then(async () => { setForm({ slug: '', nameFr: '', nameEn: '' }); await onChanged(); }).catch((error) => onError(error.message));
    }}><h2>Créer un espace</h2><input required placeholder="slug" value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })}/><input required placeholder="Nom français" value={form.nameFr} onChange={(event) => setForm({ ...form, nameFr: event.target.value })}/><input required placeholder="Nom anglais" value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })}/><button className="primary">Créer</button></form>
    <form className="admin-form inline-form" onSubmit={async (event) => {
      event.preventDefault();
      const url = editedCategoryId ? `/api/admin/categories/${editedCategoryId}` : '/api/admin/categories';
      await api(url, { method: editedCategoryId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(category) })
        .then(async () => { resetCategory(); await onChanged(); })
        .catch((error) => onError(error.message));
    }}><h2>{editedCategoryId ? 'Modifier la catégorie' : 'Créer une catégorie'}</h2><select aria-label="Espace de la catégorie" required value={category.spaceId} onChange={(event) => setCategory({ ...category, spaceId: event.target.value })}><option value="">Espace…</option>{spaces.map((space) => <option key={space.id} value={space.id}>{space.nameFr}</option>)}</select><input aria-label="Slug de la catégorie" required placeholder="slug" value={category.slug} onChange={(event) => setCategory({ ...category, slug: event.target.value })}/><input aria-label="Nom français de la catégorie" required placeholder="Nom français" value={category.nameFr} onChange={(event) => setCategory({ ...category, nameFr: event.target.value })}/><input aria-label="Nom anglais de la catégorie" required placeholder="Nom anglais" value={category.nameEn} onChange={(event) => setCategory({ ...category, nameEn: event.target.value })}/><button className="primary">{editedCategoryId ? 'Enregistrer' : 'Créer'}</button>{editedCategoryId && <button type="button" onClick={resetCategory}>Annuler</button>}</form>
    <div className="card-grid">{spaces.map((space) => <article className="admin-card" key={space.id}><h2>{space.nameFr}</h2><small>{space.slug} · {space._count?.documents || 0} documents · {space._count?.accessRules || 0} règles</small><ul>{space.categories?.map((item) => <li key={item.id}><span>{item.nameFr} / {item.nameEn} <small>{item.slug}</small></span><span className="button-row"><button type="button" onClick={() => { setEditedCategoryId(item.id); setCategory({ spaceId: item.spaceId, slug: item.slug, nameFr: item.nameFr, nameEn: item.nameEn }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Modifier</button><button type="button" className="danger" onClick={async () => { if (!window.confirm(`Supprimer la catégorie ${item.nameFr} ? Les documents associés seront conservés sans catégorie.`)) return; await api(`/api/admin/categories/${item.id}`, { method: 'DELETE' }).then(async () => { if (editedCategoryId === item.id) resetCategory(); await onChanged(); }).catch((error) => onError(error.message)); }}>Supprimer</button></span></li>)}</ul><button className="danger" onClick={async () => { if (window.confirm(`Archiver ${space.nameFr} ?`)) await api(`/api/admin/spaces/${space.id}`, { method: 'DELETE' }).then(onChanged).catch((error) => onError(error.message)); }}>Archiver</button></article>)}</div>
  </>;
}

function DocumentsPanel({ documents, spaces, onChanged, onError }: { documents: AdminDocument[]; spaces: Space[]; onChanged: () => Promise<void>; onError: (message: string) => void }) {
  const [spaceId, setSpaceId] = useState('');
  const selectedSpace = spaces.find((space) => space.id === spaceId);
  return <><h1>Documents</h1><form className="admin-form upload-form" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await api('/api/admin/documents', { method: 'POST', body: data }).then(async () => { event.currentTarget.reset(); setSpaceId(''); await onChanged(); }).catch((error) => onError(error.message));
  }}><h2>Déposer une version</h2><label>Espace<select name="spaceId" required value={spaceId} onChange={(event) => setSpaceId(event.target.value)}><option value="">Sélectionner…</option>{spaces.map((space) => <option value={space.id} key={space.id}>{space.nameFr}</option>)}</select></label><label>Catégorie<select name="categoryId"><option value="">Sans catégorie</option>{selectedSpace?.categories?.map((item) => <option value={item.id} key={item.id}>{item.nameFr}</option>)}</select></label><label>Langue<select name="locale" defaultValue="fr"><option value="fr">Français</option><option value="en">English</option></select></label><label>Titre<input name="title" required maxLength={255}/></label><label>Description<textarea name="description" maxLength={2000}/></label><label>Fichier<input name="file" type="file" required accept=".pdf,.docx,.xlsx,.pptx,.txt,.png,.jpg,.jpeg,.gif"/></label><label className="check"><input name="sensitive" value="true" type="checkbox"/> Document sensible</label><button className="primary">Déposer et analyser</button></form>
    <div className="admin-table-wrap"><table><thead><tr><th>Titre</th><th>Espace</th><th>Langues</th><th>État</th><th>Actions</th></tr></thead><tbody>{documents.map((document) => <tr key={document.id}><td>{document.translations.map((item) => item.title).join(' / ')}</td><td>{document.space.nameFr}</td><td>{Array.from(new Set(document.versions.map((version) => version.locale))).join(', ').toUpperCase()}</td><td>{document.status}</td><td>{document.status !== 'PUBLISHED' && <button onClick={() => api(`/api/admin/documents/${document.id}/publish`, { method: 'POST' }).then(onChanged).catch((error) => onError(error.message))}>Publier</button>} {document.status !== 'ARCHIVED' && <button onClick={() => api(`/api/admin/documents/${document.id}/archive`, { method: 'POST' }).then(onChanged).catch((error) => onError(error.message))}>Archiver</button>} {document.status === 'ARCHIVED' && <button onClick={() => api(`/api/admin/documents/${document.id}/restore`, { method: 'POST' }).then(onChanged).catch((error) => onError(error.message))}>Restaurer</button>}</td></tr>)}</tbody></table></div>
  </>;
}

function DirectoryPanel({ connections, certificates, onChanged, onError, onNotice }: { connections: DirectoryConnection[]; certificates: Certificate[]; onChanged: () => Promise<void>; onError: (message: string) => void; onNotice: (message: string) => void }) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body = {
      name: values.name, domain: values.domain, primaryHost: values.primaryHost,
      secondaryHost: values.secondaryHost || undefined, port: Number(values.port),
      protocol: values.protocol, baseDn: values.baseDn, userBaseDn: values.userBaseDn || undefined,
      groupBaseDn: values.groupBaseDn || undefined, bindDn: values.bindDn, bindSecret: values.bindSecret,
      userFilter: values.userFilter, groupFilter: values.groupFilter,
      usernameAttribute: values.usernameAttribute, groupAttribute: values.groupAttribute,
      emailAttribute: values.emailAttribute, nestedGroups: values.nestedGroups === 'on',
      syncIntervalMinutes: Number(values.syncIntervalMinutes), timeoutMs: Number(values.timeoutMs),
      retries: Number(values.retries), enabled: values.enabled === 'on',
      caCertificateId: values.caCertificateId || null,
    };
    await api('/api/admin/directory-connections', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(async () => { event.currentTarget.reset(); onNotice('Connecteur enregistré.'); await onChanged(); })
      .catch((error) => onError(error.message));
  };
  return <><h1>Synchronisation LDAP/LDAPS</h1><form className="admin-form directory-form" onSubmit={submit}><h2>Nouveau connecteur</h2>
    <label>Nom<input name="name" required defaultValue="Active Directory"/></label><label>Domaine<input name="domain" required placeholder="corp.example.local"/></label>
    <label>Contrôleur primaire<input name="primaryHost" required/></label><label>Contrôleur secondaire<input name="secondaryHost"/></label>
    <label>Protocole<select name="protocol" defaultValue="LDAPS"><option>LDAPS</option><option>LDAP</option></select></label><label>Port<input name="port" type="number" defaultValue="636"/></label>
    <label>Base DN<input name="baseDn" required placeholder="DC=corp,DC=example,DC=local"/></label><label>User Base DN<input name="userBaseDn"/></label><label>Group Base DN<input name="groupBaseDn"/></label>
    <label>Bind DN<input name="bindDn" required/></label><label>Secret du compte de service<input name="bindSecret" type="password" required minLength={12} autoComplete="new-password"/></label>
    <label>Filtre utilisateurs<input name="userFilter" defaultValue="(objectClass=user)"/></label><label>Filtre groupes<input name="groupFilter" defaultValue="(objectClass=group)"/></label>
    <label>Attribut utilisateur<input name="usernameAttribute" defaultValue="sAMAccountName"/></label><label>Attribut groupe<input name="groupAttribute" defaultValue="cn"/></label><label>Attribut email<input name="emailAttribute" defaultValue="mail"/></label>
    <label>Certificat CA<select name="caCertificateId"><option value="">Aucun (LDAP uniquement)</option>{certificates.map((certificate) => <option value={certificate.id} key={certificate.id}>{certificate.name}</option>)}</select></label>
    <label>Intervalle (minutes)<input name="syncIntervalMinutes" type="number" defaultValue="60"/></label><label>Timeout (ms)<input name="timeoutMs" type="number" defaultValue="5000"/></label><label>Tentatives<input name="retries" type="number" defaultValue="2"/></label>
    <label className="check"><input name="nestedGroups" type="checkbox" defaultChecked/> Groupes imbriqués</label><label className="check"><input name="enabled" type="checkbox"/> Activer après validation</label>
    <button className="primary">Enregistrer</button></form>
    <div className="card-grid">{connections.map((connection) => <article className="admin-card" key={connection.id}><h2>{connection.name}</h2><p>{connection.protocol}://{connection.primaryHost}:{connection.port}</p><p>Test : {connection.lastTestStatus || 'Jamais'} · {connection.enabled ? 'Actif' : 'Inactif'}</p><div className="button-row"><button onClick={() => api<{ status: string }>(`/api/admin/directory-connections/${connection.id}/test`, { method: 'POST' }).then(async (result) => { onNotice(`Test ${result.status}`); await onChanged(); }).catch((error) => onError(error.message))}>Tester</button><button onClick={() => api<{ status: string }>(`/api/admin/directory-connections/${connection.id}/synchronize`, { method: 'POST' }).then(async (result) => { onNotice(`Synchronisation ${result.status}`); await onChanged(); }).catch((error) => onError(error.message))}>Synchroniser</button><button className="danger" onClick={() => api(`/api/admin/directory-connections/${connection.id}`, { method: 'DELETE' }).then(onChanged).catch((error) => onError(error.message))}>Désactiver</button></div></article>)}</div>
  </>;
}

function CertificatesPanel({ certificates, onChanged, onError, onNotice }: { certificates: Certificate[]; onChanged: () => Promise<void>; onError: (message: string) => void; onNotice: (message: string) => void }) {
  const [pem, setPem] = useState('');
  const [name, setName] = useState('');
  return <><h1>Certificats CA</h1><p className="lead">Un ou deux certificats publics maximum, stockés dans PostgreSQL et jamais dans MinIO.</p>
    <form className="admin-form inline-form" onSubmit={async (event) => {
      event.preventDefault();
      await api('/api/admin/certificates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, pem }) }).then(async () => { setName(''); setPem(''); onNotice('Certificat importé.'); await onChanged(); }).catch((error) => onError(error.message));
    }}><input required placeholder="Nom convivial" value={name} onChange={(event) => setName(event.target.value)}/><input type="file" required accept=".pem,.crt,.cer" onChange={async (event) => setPem(event.target.files?.[0] ? await event.target.files[0].text() : '')}/><button className="primary" disabled={certificates.length >= 2}>Importer</button></form>
    <div className="card-grid">{certificates.map((certificate) => <article className="admin-card" key={certificate.id}><h2>{certificate.name}</h2><p><mark>{certificate.status}</mark> {certificate.inUse ? '· utilisé' : ''}</p><small>Sujet : {certificate.subject}</small><small>Émetteur : {certificate.issuer}</small><small>Expire : {new Date(certificate.validTo).toLocaleDateString('fr')}</small><small>SHA-256 : {certificate.fingerprintSha256}</small><div className="button-row"><button onClick={() => api<{ status: string }>(`/api/admin/certificates/${certificate.id}/test`, { method: 'POST' }).then((result) => onNotice(`Certificat ${result.status}`)).catch((error) => onError(error.message))}>Tester</button><a href={`/api/admin/certificates/${certificate.id}/public`}>Télécharger</a><button className="danger" onClick={async () => { const warning = certificate.inUse ? 'Les connecteurs actifs associés seront désactivés. Continuer ?' : 'Supprimer ce certificat ?'; if (window.confirm(warning)) await api(`/api/admin/certificates/${certificate.id}`, { method: 'DELETE' }).then(onChanged).catch((error) => onError(error.message)); }}>Supprimer</button></div></article>)}</div>
  </>;
}

function AuditPanel({ events }: { events: Audit[] }) {
  return <><div className="section-actions"><div><h1>Journal d’audit</h1><p className="lead">Événements UTC sans secrets.</p></div><a href="/api/admin/audit/export?format=csv">Exporter CSV</a><a href="/api/admin/audit/export?format=json">Exporter JSON</a></div><div className="admin-table-wrap"><table><thead><tr><th>Date UTC</th><th>Identité</th><th>Action</th><th>Ressource</th><th>Résultat</th><th>Corrélation</th></tr></thead><tbody>{events.map((event) => <tr key={event.id}><td>{new Date(event.occurredAt).toISOString()}</td><td>{event.identity}</td><td>{event.action}</td><td>{event.resource}</td><td>{event.result}</td><td>{event.correlationId}</td></tr>)}</tbody></table></div></>;
}

function HealthPanel({ health }: { health: Record<string, unknown> | null }) {
  return <><h1>Santé des services</h1><pre className="health-output">{JSON.stringify(health, null, 2)}</pre><p><a href="/api/metrics">Métriques Prometheus</a></p></>;
}

function SettingsPanel({ onError, onNotice }: { onError: (message: string) => void; onNotice: (message: string) => void }) {
  const [key, setKey] = useState('certificates.expiry-alert-days');
  const [value, setValue] = useState('{"days":[90,60,30,15,7]}');
  return <><h1>Configuration</h1><form className="admin-form" onSubmit={async (event) => { event.preventDefault(); try { await api(`/api/admin/settings/${key}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(JSON.parse(value)) }); onNotice('Paramètre enregistré.'); } catch (error) { onError((error as Error).message); } }}><label>Clé<input value={key} onChange={(event) => setKey(event.target.value)}/></label><label>Valeur JSON<textarea value={value} onChange={(event) => setValue(event.target.value)}/></label><button className="primary">Enregistrer</button></form></>;
}
