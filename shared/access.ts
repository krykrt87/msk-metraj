// Arayüzde gösterim kararı. Gerçek yetki sunucuda (kurallar + fonksiyonlar) uygulanır.
import { DISCIPLINE, PROJECT_ID } from './constants';
import type { UserProfile } from './types';

export type Ability = 'view' | 'edit' | 'admin' | 'drawings';

export function can(profile: UserProfile | null | undefined, ability: Ability, p = PROJECT_ID, d = DISCIPLINE): boolean {
  if (!profile || profile.active !== true) return false;
  const acc = profile.access?.[p]?.[d];
  if (!acc?.view) return false;
  switch (ability) {
    case 'view':
      return true;
    case 'drawings':
      return acc.drawings === true;
    case 'edit':
      return profile.role === 'admin' || profile.role === 'kontrolcu';
    case 'admin':
      return profile.role === 'admin';
  }
}
