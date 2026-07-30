'use client';
import { useEffect, useMemo, useState } from 'react';

type Locale = 'fr' | 'en';
const copy = {
  fr: { welcome: 'Bienvenue Aurélien', subtitle: 'Retrouvez rapidement les documents qui vous concernent.',
    search: 'Rechercher une politique, une procédure ou un guide…', home: 'Accueil', policies: 'Politiques',
    procedures: 'Procédures', guides: 'Guides', consult: 'Consulter', popular: 'Documents les plus consultés',
    secured: 'Accès sécurisé par Active Directory', open: 'Ouvrir', unavailable: 'Disponible uniquement dans une autre langue' },
  en: { welcome: 'Welcome Aurélien', subtitle: 'Quickly find the documents relevant to you.',
    search: 'Search for a policy, procedure or guide…', home: 'Home', policies: 'Policies',
    procedures: 'Procedures', guides: 'Guides', consult: 'Browse', popular: 'Most viewed documents',
    secured: 'Secured by Active Directory', open: 'Open', unavailable: 'Available in another language only' },
};
const demoDocs = [
  { id: 'policy-security', titleFr: "Politique de sécurité de l’information", titleEn: 'Information security policy', category: 'policies', locales: ['fr','en'] },
  { id: 'incident-reporting', titleFr: "Procédure de signalement d’un incident", titleEn: 'Incident reporting procedure', category: 'procedures', locales: ['fr','en'] },
  { id: 'vpn-guide', titleFr: "Guide d’utilisation du VPN", titleEn: 'VPN user guide', category: 'guides', locales: ['fr'] },
];

export default function Home() {
  const [locale, setLocale] = useState<Locale>('fr');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const saved = localStorage.getItem('isms-locale') as Locale | null;
    setLocale(saved || (navigator.language.startsWith('en') ? 'en' : 'fr'));
  }, []);
  const changeLocale = (next: Locale) => { setLocale(next); localStorage.setItem('isms-locale', next); document.documentElement.lang = next; };
  const t = copy[locale];
  const docs = useMemo(() => demoDocs.filter((d) => (locale === 'fr' ? d.titleFr : d.titleEn).toLowerCase().includes(query.toLowerCase())), [locale, query]);
  return <div className="shell">
    <aside>
      <div className="brand"><div className="shield">♙</div><div><strong>ISMS Portal</strong><small>Système de management<br/>de la sécurité de l’information</small></div></div>
      <nav aria-label="Navigation principale">
        <a className="active" href="#">⌂ <span>{t.home}</span></a>
        <a href="#policies">♢ <span>{t.policies}</span></a>
        <a href="#procedures">▤ <span>{t.procedures}</span></a>
        <a href="#guides">▭ <span>{t.guides}</span></a>
      </nav>
      <div className="secure">✓ <span>{t.secured}</span></div>
    </aside>
    <main>
      <header><div className="language"><button onClick={() => changeLocale('fr')} aria-pressed={locale === 'fr'}>FR</button><i/> <button onClick={() => changeLocale('en')} aria-pressed={locale === 'en'}>EN</button></div><span className="help">?</span><span className="avatar">AM</span><span>Aurélien Martin⌄</span></header>
      <h1>{t.welcome}</h1><p className="lead">{t.subtitle}</p>
      <label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.search} aria-label={t.search}/><button aria-label="Rechercher">⌕</button></label>
      <section className="cards">
        {([['♢','policies'],['☷','procedures'],['▭','guides']] as const).map(([icon,key]) =>
          <article id={key} key={key}><div className="card-icon">{icon}</div><h2>{t[key]}</h2><p>{key === 'policies' ? (locale === 'fr' ? "Règles et engagements de l’entreprise" : 'Company rules and commitments') : key === 'procedures' ? (locale === 'fr' ? 'Étapes et consignes à suivre' : 'Steps and instructions') : (locale === 'fr' ? 'Aide et bonnes pratiques' : 'Help and best practices')}</p><button>{t.consult}</button></article>)}
        <article className="access"><div className="card-icon">▣</div><div><h2>Documents IT</h2><p>{locale === 'fr' ? 'Accessible via vos autorisations' : 'Available through your permissions'}</p><mark>● {locale === 'fr' ? 'Accès autorisé' : 'Access granted'}</mark></div></article>
      </section>
      <h2 className="section-title">{t.popular}</h2>
      <section className="documents">
        {docs.map((doc) => <div className="document" key={doc.id}><span className="file">PDF</span><strong>{locale === 'fr' ? doc.titleFr : doc.titleEn}</strong><span className="category">{t[doc.category as keyof typeof t]}</span><span className="locales">{doc.locales.map((l) => <b className={locale === l ? 'selected' : ''} key={l}>{l.toUpperCase()}</b>)}</span><button>{t.open}</button><button className="download" aria-label="Télécharger">⇩</button>{!doc.locales.includes(locale) && <small>{t.unavailable}</small>}</div>)}
      </section>
    </main>
  </div>;
}

