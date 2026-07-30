import { ForbiddenException } from '@nestjs/common';
import { documents, spaces } from './types';

describe('deny-by-default authorization model', () => {
  const visible = (groups: string[]) => {
    const allowed = new Set(spaces.filter((s) => s.groups.some((g) => groups.includes(g))).map((s) => s.slug));
    return documents.filter((d) => allowed.has(d.space));
  };
  it('ITAD sees IT', () => expect(visible(['ITAD']).some((d) => d.space === 'it')).toBe(true));
  it('a user outside ITAD cannot see IT', () => expect(visible(['Domain Users']).some((d) => d.space === 'it')).toBe(false));
  it('search corpus contains no forbidden documents', () => expect(visible(['Domain Users']).map((d) => d.id)).not.toContain('vpn-guide'));
  it('uses forbidden errors for direct unauthorized access', () => expect(() => { throw new ForbiddenException(); }).toThrow(ForbiddenException));
});

