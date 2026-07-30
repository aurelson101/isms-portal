'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Locale = 'fr' | 'en';
type Space = { id: string; slug: string; nameFr: string; nameEn: string };
type Translation = { locale: string; title: string; description?: string | null };
type Version = {
  locale: string;
  version: number;
  storedFile: { mimeType: string; originalName: string; size: string | number };
};
type PortalDocument = {
  id: string;
  sensitive: boolean;
  publishedAt: string;
  viewCount: number;
  downloadCount: number;
  space: Space;
  category: { slug: string; nameFr: string; nameEn: string } | null;
  translations: Translation[];
  versions: Version[];
};
type Identity = {
  displayName: string;
  username: string;
  isAdmin: boolean;
  locale: Locale | null;
  demoMode: boolean;
  spaces: Space[];
};

const copy = {
  fr: {
    welcome: 'Bienvenue', subtitle: 'Retrouvez rapidement les documents qui vous concernent.',
    search: 'Rechercher une politique, une procédure ou un guide…', home: 'Accueil',
    policies: 'Politiques', procedures: 'Procédures', guides: 'Guides',
    consult: 'Consulter', popular: 'Documents les plus consultés', recent: 'Documents récemment publiés',
    secured: 'Accès sécurisé par Active Directory', open: 'Ouvrir', download: 'Télécharger',
    unavailable: 'Disponible uniquement dans une autre langue', loading: 'Chargement…',
    empty: 'Aucun document autorisé ne correspond à votre recherche.',
    error: 'Les documents sont temporairement indisponibles.', help: 'Aide',
    helpText: 'Recherchez, ouvrez ou téléchargez uniquement les documents autorisés par vos groupes Active Directory.',
    close: 'Fermer', administration: 'Administration', account: 'Préférences du compte',
    demo: 'Mode démonstration — aucune donnée de production', spaces: 'Espaces autorisés',
    fileUnavailable: 'Aucun fichier disponible dans cette langue.',
  },
  en: {
    welcome: 'Welcome', subtitle: 'Quickly find the documents relevant to you.',
    search: 'Search for a policy, procedure or guide…', home: 'Home',
    policies: 'Policies', procedures: 'Procedures', guides: 'Guides',
    consult: 'Browse', popular: 'Most viewed documents', recent: 'Recently published documents',
    secured: 'Secured by Active Directory', open: 'Open', download: 'Download',
    unavailable: 'Available in another language only', loading: 'Loading…',
    empty: 'No authorized document matches your search.',
    error: 'Documents are temporarily unavailable.', help: 'Help',
    helpText: 'Search, open or download only documents authorized by your Active Directory groups.',
    close: 'Close', administration: 'Administration', account: 'Account preferences',
    demo: 'Demo mode — no production data', spaces: 'Authorized spaces',
    fileUnavailable: 'No file is available in this language.',
  },
} as const;

const titleFor = (document: PortalDocument, locale: Locale) =>
  document.translations.find((translation) => translation.locale === locale)?.title
  || document.translations[0]?.title
  || document.id;

function DocumentRows({
  documents, locale, selectedLocales, onLocale, onOpen,
}: {
  documents: PortalDocument[];
  locale: Locale;
  selectedLocales: Record<string, Locale>;
  onLocale: (id: string, locale: Locale) => void;
  onOpen: (document: PortalDocument) => void;
}) {
  const t = copy[locale];
  if (documents.length === 0) return <p className="empty-state">{t.empty}</p>;
  return <section className="documents">
    {documents.map((document) => {
      const available = Array.from(new Set(document.versions.map((version) => version.locale))) as Locale[];
      const selected = available.includes(selectedLocales[document.id])
        ? selectedLocales[document.id]
        : available.includes(locale) ? locale : available[0];
      const translation = document.translations.find((item) => item.locale === selected);
      return <div className="document" key={document.id}>
        <span className="file">{document.versions[0]?.storedFile.mimeType === 'application/pdf' ? 'PDF' : 'FILE'}</span>
        <button className="document-title" onClick={() => onOpen(document)}>{translation?.title || titleFor(document, locale)}</button>
        <span className="category">{document.category ? (locale === 'fr' ? document.category.nameFr : document.category.nameEn) : '—'}</span>
        <span className="locales">
          {(['fr', 'en'] as Locale[]).map((item) =>
            <button
              className={selected === item ? 'selected' : ''}
              disabled={!available.includes(item)}
              title={!available.includes(item) ? t.unavailable : undefined}
              onClick={() => onLocale(document.id, item)}
              key={item}
            >{item.toUpperCase()}</button>)}
        </span>
        <button onClick={() => onOpen(document)}>{t.open}</button>
        {selected
          ? <a className="download" href={`/api/documents/${document.id}/download?locale=${selected}`} aria-label={t.download}>⇩</a>
          : <button className="download" disabled>⇩</button>}
        {!available.includes(locale) && <small>{t.unavailable}</small>}
      </div>;
    })}
  </section>;
}

export default function Home() {
  const [locale, setLocale] = useState<Locale>('fr');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [space, setSpace] = useState('');
  const [documents, setDocuments] = useState<PortalDocument[]>([]);
  const [popular, setPopular] = useState<PortalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedLocales, setSelectedLocales] = useState<Record<string, Locale>>({});
  const [opened, setOpened] = useState<PortalDocument | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  const loadDocuments = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(false);
    const parameters = new URLSearchParams();
    if (query.trim()) parameters.set('q', query.trim());
    if (category) parameters.set('category', category);
    if (space) parameters.set('space', space);
    parameters.set('sort', 'recent');
    try {
      const response = await fetch(`/api/documents?${parameters}`, { signal });
      if (!response.ok) throw new Error('documents');
      setDocuments(await response.json() as PortalDocument[]);
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setLoadError(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [query, category, space]);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const requestedCategory = parameters.get('category');
    const requestedSpace = parameters.get('space');
    if (requestedCategory) setCategory(requestedCategory);
    if (requestedSpace) setSpace(requestedSpace);
  }, []);

  useEffect(() => {
    fetch('/api/me')
      .then(async (response) => {
        if (!response.ok) throw new Error('identity');
        return response.json() as Promise<Identity>;
      })
      .then((currentIdentity) => {
        setIdentity(currentIdentity);
        const saved = currentIdentity.locale || localStorage.getItem('isms-locale') as Locale | null;
        const preferred = saved || (navigator.language.startsWith('en') ? 'en' : 'fr');
        setLocale(preferred);
        document.documentElement.lang = preferred;
      })
      .catch(() => setLoadError(true));
    fetch('/api/documents?sort=popular')
      .then((response) => response.ok ? response.json() as Promise<PortalDocument[]> : Promise.reject())
      .then((items) => setPopular(items.slice(0, 5)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadDocuments(controller.signal), query ? 300 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadDocuments, query]);

  useEffect(() => {
    if (!category && !space && !query) return;
    const timer = window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [category, space, query]);

  const changeLocale = async (next: Locale) => {
    setLocale(next);
    localStorage.setItem('isms-locale', next);
    document.documentElement.lang = next;
    setSelectedLocales((current) => ({ ...current }));
    await fetch('/api/me/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: next }),
    }).catch(() => undefined);
  };

  const selectCategory = (next: string) => {
    setQuery('');
    setCategory(next);
    setSpace('');
    window.history.replaceState(null, '', `/?category=${encodeURIComponent(next)}`);
  };
  const selectSpace = (next: string) => {
    setQuery('');
    setSpace(next);
    setCategory('');
    window.history.replaceState(null, '', `/?space=${encodeURIComponent(next)}`);
  };
  const selectHome = () => {
    setQuery('');
    setCategory('');
    setSpace('');
    window.history.replaceState(null, '', '/');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const t = copy[locale];
  const initials = useMemo(() => (identity?.displayName || 'ISMS').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase(), [identity]);
  const openedLocale = opened
    ? selectedLocales[opened.id] || (opened.versions.some((version) => version.locale === locale) ? locale : opened.versions[0]?.locale as Locale)
    : null;
  const openedVersion = opened?.versions.find((version) => version.locale === openedLocale);

  return <div className="shell">
    <aside>
      <div className="brand"><div className="shield" aria-hidden="true">♙</div><div><strong>ISMS Portal</strong><small>Information Security<br/>Management System</small></div></div>
      <nav aria-label="Navigation principale">
        <button type="button" className={!category && !space ? 'active' : ''} onClick={selectHome}>⌂ <span>{t.home}</span></button>
        <button className={category === 'policies' ? 'active' : ''} onClick={() => selectCategory('policies')}>♢ <span>{t.policies}</span></button>
        <button className={category === 'procedures' ? 'active' : ''} onClick={() => selectCategory('procedures')}>▤ <span>{t.procedures}</span></button>
        <button className={category === 'guides' ? 'active' : ''} onClick={() => selectCategory('guides')}>▭ <span>{t.guides}</span></button>
        {identity?.spaces.filter((item) => item.slug !== 'general').map((item) =>
          <button type="button" className={space === item.slug ? 'active' : ''} onClick={() => selectSpace(item.slug)} key={item.id}>
            □ <span>{locale === 'fr' ? item.nameFr : item.nameEn}</span>
          </button>)}
      </nav>
      <div className="secure">✓ <span>{t.secured}</span></div>
    </aside>
    <main>
      {identity?.demoMode && <div className="demo-banner" role="status">{t.demo}</div>}
      <header>
        <div className="language"><button onClick={() => void changeLocale('fr')} aria-pressed={locale === 'fr'}>FR</button><i/> <button onClick={() => void changeLocale('en')} aria-pressed={locale === 'en'}>EN</button></div>
        <button className="help" onClick={() => setHelpOpen(true)} aria-label={t.help}>?</button>
        <button className="account-button" onClick={() => setAccountOpen((current) => !current)} aria-expanded={accountOpen}>
          <span className="avatar">{initials}</span><span>{identity?.displayName || '…'}⌄</span>
        </button>
        {accountOpen && <div className="account-menu">
          <strong>{identity?.displayName}</strong><small>{identity?.username}</small>
          {identity?.isAdmin && <a href="/admin">{t.administration}</a>}
        </div>}
      </header>
      <h1>{t.welcome} {identity?.displayName || '…'}</h1>
      <p className="lead">{t.subtitle}</p>
      <form className="search" onSubmit={(event) => { event.preventDefault(); void loadDocuments(); }}>
        <span aria-hidden="true">⌕</span>
        <input value={query} onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          if (value.trim()) {
            setCategory('');
            setSpace('');
          }
        }} placeholder={t.search} aria-label={t.search}/>
        <button aria-label={t.search} type="submit">⌕</button>
      </form>
      <section className="cards" aria-label={t.spaces}>
        {([
          ['♢', 'policies', t.policies],
          ['☷', 'procedures', t.procedures],
          ['▭', 'guides', t.guides],
        ] as const).map(([icon, key, label]) =>
          <article key={key}><div className="card-icon">{icon}</div><h2>{label}</h2>
            <p>{locale === 'fr' ? 'Documents autorisés dans cette catégorie' : 'Authorized documents in this category'}</p>
            <button onClick={() => selectCategory(key)}>{t.consult}</button>
          </article>)}
        {identity?.spaces.filter((item) => item.slug !== 'general').map((item) =>
          <article className="access" key={item.id}><div className="card-icon">▣</div><div>
            <h2>{locale === 'fr' ? item.nameFr : item.nameEn}</h2>
            <p>{locale === 'fr' ? 'Accessible selon vos autorisations' : 'Available through your permissions'}</p>
            <button type="button" onClick={() => selectSpace(item.slug)}>{t.consult}</button>
          </div></article>)}
      </section>
      <div ref={resultsRef} className="results-anchor" tabIndex={-1}>
      {loadError && <p role="alert" className="error-state">{t.error}</p>}
      {loading ? <p className="loading-state">{t.loading}</p> : <>
        <h2 className="section-title">{query || category || space ? t.search : t.recent}</h2>
        <DocumentRows documents={documents} locale={locale} selectedLocales={selectedLocales}
          onLocale={(id, next) => setSelectedLocales((current) => ({ ...current, [id]: next }))}
          onOpen={setOpened}/>
      </>}
      {!query && !category && !space && popular.length > 0 && <>
        <h2 className="section-title">{t.popular}</h2>
        <DocumentRows documents={popular} locale={locale} selectedLocales={selectedLocales}
          onLocale={(id, next) => setSelectedLocales((current) => ({ ...current, [id]: next }))}
          onOpen={setOpened}/>
      </>}
      </div>
    </main>
    {helpOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setHelpOpen(false)}>
      <section className="modal small-modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={() => setHelpOpen(false)} aria-label={t.close}>×</button>
        <h2 id="help-title">{t.help}</h2><p>{t.helpText}</p>
      </section>
    </div>}
    {opened && <div className="modal-backdrop" role="presentation" onMouseDown={() => setOpened(null)}>
      <section className="modal document-modal" role="dialog" aria-modal="true" aria-labelledby="document-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={() => setOpened(null)} aria-label={t.close}>×</button>
        <h2 id="document-title">{titleFor(opened, openedLocale || locale)}</h2>
        <div className="modal-locales">{(['fr', 'en'] as Locale[]).map((item) =>
          <button key={item} disabled={!opened.versions.some((version) => version.locale === item)}
            className={openedLocale === item ? 'selected' : ''}
            onClick={() => setSelectedLocales((current) => ({ ...current, [opened.id]: item }))}>{item.toUpperCase()}</button>)}</div>
        {openedVersion ? <>
          {openedVersion.storedFile.mimeType === 'application/pdf' || openedVersion.storedFile.mimeType.startsWith('image/')
            ? <iframe title={titleFor(opened, openedLocale || locale)} src={`/api/documents/${opened.id}/content?locale=${openedLocale}`}/>
            : <p>{openedVersion.storedFile.originalName}</p>}
          <a className="primary-link" href={`/api/documents/${opened.id}/download?locale=${openedLocale}`}>{t.download}</a>
        </> : <p>{t.fileUnavailable}</p>}
      </section>
    </div>}
  </div>;
}
