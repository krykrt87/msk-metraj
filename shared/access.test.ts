import { describe, expect, it } from 'vitest';
import { can } from './access';
import type { UserProfile } from './types';

const p = (role: UserProfile['role'], drawings: boolean, active = true): UserProfile => ({
  uid: role, email: '', name: role, role, active, access: { 'msk-4199': { A: { view: true, drawings } } },
});

describe('can', () => {
  it('rol tablosu', () => {
    expect(can(p('admin', true), 'admin')).toBe(true);
    expect(can(p('admin', true), 'edit')).toBe(true);
    expect(can(p('kontrolcu', true), 'edit')).toBe(true);
    expect(can(p('kontrolcu', true), 'admin')).toBe(false);
    expect(can(p('satinalma', false), 'view')).toBe(true);
    expect(can(p('satinalma', false), 'edit')).toBe(false);
    expect(can(p('satinalma', false), 'drawings')).toBe(false);
    expect(can(p('kontrolcu', true), 'drawings')).toBe(true);
  });
  it('pasif, profilsiz veya erişimsiz kullanıcı hiçbir şey yapamaz', () => {
    expect(can(p('admin', true, false), 'view')).toBe(false);
    expect(can(null, 'view')).toBe(false);
    expect(can({ ...p('admin', true), access: {} }, 'view')).toBe(false);
  });
});
