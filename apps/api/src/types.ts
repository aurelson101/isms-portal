import type { Request } from 'express';

export type Identity = { username: string; displayName: string; groups: string[] };
export type IsmsRequest = Request & { identity: Identity; correlationId: string };

export const spaces = [
  { slug: 'general', nameFr: 'Documents généraux', nameEn: 'General documents', groups: ['Domain Users'] },
  { slug: 'it', nameFr: 'IT', nameEn: 'IT', groups: ['ITAD'] },
  { slug: 'hr', nameFr: 'Ressources humaines', nameEn: 'Human resources', groups: ['HRAD'] },
  { slug: 'finance', nameFr: 'Finance', nameEn: 'Finance', groups: ['FINANCEAD'] },
  { slug: 'management', nameFr: 'Direction', nameEn: 'Management', groups: ['MANAGEMENTAD'] },
];

export const documents = [
  { id: 'policy-security', space: 'general', category: 'policies', titleFr: "Politique de sécurité de l’information", titleEn: 'Information security policy', locales: ['fr', 'en'] },
  { id: 'incident-reporting', space: 'general', category: 'procedures', titleFr: "Procédure de signalement d’un incident", titleEn: 'Incident reporting procedure', locales: ['fr', 'en'] },
  { id: 'vpn-guide', space: 'it', category: 'guides', titleFr: "Guide d’utilisation du VPN", titleEn: 'VPN user guide', locales: ['fr'] },
];

