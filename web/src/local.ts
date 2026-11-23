// Yerel mod (npm run dev = vite --mode yerel): Firebase yok; veri vite sunucusunun /local uçlarından (work/ çıktıları) okunur, değişiklik kaydedilmez.
import { DISCIPLINE, PROJECT_ID } from '@shared/constants';
import type { FacadeRow, Finding, Item, Material, Room, UserProfile } from '@shared/types';
import type { SummaryRow } from './data/types';

export const LOCAL = import.meta.env.MODE === 'yerel';

export interface LocalData {
  discipline: { name: string; groups: { key: string; title: string }[]; summary: SummaryRow[]; methodText: string[]; facadeNotes: string[] };
  items: Item[];
  rooms: Room[];
  facade: FacadeRow[];
  materials: Material[];
  findings: Finding[];
}

export async function localJson<T>(name: string): Promise<T> {
  const r = await fetch(`/local/${name}`);
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as T;
}

let data: Promise<LocalData> | null = null;
export const localData = () => (data ??= localJson<LocalData>('data.json').catch((e) => ((data = null), Promise.reject(e))));

export const LOCAL_PROFILE: UserProfile = {
  uid: 'yerel',
  email: 'yerel@makine',
  name: 'Yerel kullanıcı',
  role: 'admin',
  active: true,
  access: { [PROJECT_ID]: { [DISCIPLINE]: { view: true, drawings: true } } },
};

export const LOCAL_READONLY = 'Yerel modda (emülatörsüz) değişiklik kaydedilmez. Kaydetmek için uygulamayı "npm run dev:emu" ile açın.';
