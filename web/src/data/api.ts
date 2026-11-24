// Callable fonksiyon istemcisi. Hata mesajı kullanıcıya gösterilecek Türkçe metindir.
import { httpsCallable } from 'firebase/functions';
import { DISCIPLINE, PROJECT_ID } from '@shared/constants';
import type { Confidence, FacadeColumn, Spec } from '@shared/types';
import { functions } from '../firebase';
import { LOCAL, LOCAL_READONLY } from '../local';

export interface Result {
  batchId: string;
  changed: number;
}

const OFFLINE = 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.';

export function apiErrorMessage(e: unknown): string {
  const code = (e as { code?: string }).code ?? '';
  const msg = ((e as { message?: string }).message ?? '').replace(/\s*\[\d{3}\]$/, '');
  if (code === 'functions/unavailable' || code === 'functions/deadline-exceeded') return OFFLINE;
  if (code === 'functions/internal' && (!msg || msg === 'internal' || msg === 'INTERNAL')) return OFFLINE;
  return msg || OFFLINE;
}

function call<I, O = Result>(name: string) {
  return async (input: I): Promise<O> => {
    if (LOCAL) throw new Error(LOCAL_READONLY);
    try {
      // Firebase istemcisi undefined alanı null gönderir; şemalar isteğe bağlı alanda null kabul etmez → JSON turu undefined'ı atar.
      const data = JSON.parse(JSON.stringify({ projectId: PROJECT_ID, discipline: DISCIPLINE, ...input }));
      const r = await httpsCallable(functions, name)(data);
      return r.data as O;
    } catch (e) {
      throw new Error(apiErrorMessage(e));
    }
  };
}

type Id = { itemId: string };
export const api = {
  correctItem: call<Id & { value: number; confidence?: Confidence; reason: string }>('correctItem'),
  setItemFormula: call<Id & { formula: string; reason: string }>('setItemFormula'),
  setItemStatus: call<Id & { status: 'kontrol_edildi' | 'sorunlu' | 'yeniden_kontrol' | 'kontrol_edilmedi'; note?: string }>('setItemStatus'),
  finalizeItem: call<Id>('finalizeItem'),
  unlockItem: call<Id & { reason: string }>('unlockItem'),
  acknowledgeItem: call<Id & { note?: string }>('acknowledgeItem'),
  createItem: call<{
    poz: string; name: string; unit: string; code?: string | null; kind: 'measured' | 'derived';
    value?: number | null; formula?: string; method?: string; drawings?: string[]; reason: string;
  }>('createItem'),
  cancelItem: call<Id & { reason: string }>('cancelItem'),
  restoreItem: call<Id & { reason: string }>('restoreItem'),
  updateItemInfo: call<Id & { name?: string; code?: string | null; unit?: string; method?: string; confidence?: Confidence; drawings?: string[]; specs?: Spec[]; reason?: string }>('updateItemInfo'),
  updateRoom: call<{ roomId: string; area?: number; floor?: string; ceilingLower?: string | null; ceilingUpper?: string | null; ch?: string | null; flooring?: string | null; note?: string | null; reason: string }>('updateRoom'),
  updateFacadeCell: call<{ rowId: string; column: FacadeColumn; value: number; reason: string }>('updateFacadeCell'),
  setMaterialFormula: call<{ materialId: string; formula: string | null; reason: string }>('setMaterialFormula'),
};
export type Api = typeof api;
