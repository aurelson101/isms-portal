'use client';
import { useState } from 'react';
const rules = [
  ['ITAD','IT',true,true,true,true,false], ['SÉCURITÉ-AD',"Sécurité de l’information",true,true,true,true,false],
  ['HRAD','Ressources humaines',true,true,false,false,false], ['FINANCEAD','Finance',true,true,false,false,false],
  ['MANAGEMENTAD','Direction',true,true,true,true,true], ['Domain Users','Documents généraux',true,true,false,false,false],
];
export default function Admin() {
  const [selected, setSelected] = useState(0);
  return <div className="admin-shell"><aside><div className="brand"><div className="shield">♙</div><div><strong>ISMS Portal</strong><small>Administration sécurisée</small></div></div><nav>{['Tableau de bord','Groupes Active Directory',"Règles d’accès",'Espaces documentaires','Documents','Synchronisation LDAP','Certificats CA',"Journal d’audit",'Santé des services','Configuration'].map((x,i)=><a className={i===2?'active':''} key={x}>{['⌂','♧','♢','□','▤','⟳','♙','☷','♡','⚙'][i]} <span>{x}</span></a>)}</nav></aside>
    <main><header><input placeholder="Rechercher un groupe ou un espace…"/><span>♧</span><span>?</span><strong>Administrateur ISMS⌄</strong></header><h1>Gestion des droits d’accès</h1><p className="lead">Les autorisations sont appliquées automatiquement selon les groupes Active Directory.</p>
    <div className="stats">{[['Groupes AD synchronisés','16'],['Règles actives','28'],['Espaces protégés','9'],['Erreurs de synchronisation','0']].map(x=><article key={x[0]}><span>{x[0]}</span><strong>{x[1]}</strong></article>)}</div>
    <section className="matrix"><h2>Matrice des autorisations</h2><div className="filters"><button>Tous les groupes⌄</button><button>Tous les espaces⌄</button><input placeholder="Rechercher dans la matrice…"/><button className="primary">＋ Ajouter une règle</button></div>
    <table><thead><tr><th>Groupe Active Directory</th><th>Menu / espace</th>{['Voir','Télécharger','Déposer','Modifier','Administrer'].map(x=><th key={x}>{x}</th>)}<th>Statut</th></tr></thead><tbody>{rules.map((r,i)=><tr className={selected===i?'selected-row':''} key={String(r[0])} onClick={()=>setSelected(i)}><td><strong>{r[0]}</strong></td><td>{r[1]}</td>{r.slice(2).map((v,j)=><td key={j}><input type="checkbox" checked={Boolean(v)} readOnly/></td>)}<td><mark>● Active</mark></td></tr>)}</tbody></table></section></main>
    <section className="drawer"><h2>Règle {rules[selected][0]} → {rules[selected][1]}</h2><label>Groupe AD<input value={String(rules[selected][0])} readOnly/></label><label>Espace<input value={String(rules[selected][1])} readOnly/></label><h3>Permissions accordées</h3>{['Afficher le menu','Consulter les documents','Télécharger','Déposer des documents','Modifier',"Administrer l’espace"].map((x,i)=><label className="toggle" key={x}>{x}<input type="checkbox" defaultChecked={i<4}/></label>)}<div className="notice">✓ Les changements seront appliqués automatiquement aux membres du groupe.</div><div className="actions"><button>Annuler</button><button className="primary">Enregistrer la règle</button></div></section>
  </div>;
}

