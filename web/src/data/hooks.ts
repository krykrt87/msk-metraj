import { collection, doc, onSnapshot, orderBy, query, where, type DocumentData, type Query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { DISCIPLINE, PROJECT_ID } from '@shared/constants';
import type { Drawing, FacadeRow, Finding, HistoryEntry, Item, Material, Revision, Room, TargetType } from '@shared/types';
import type { SummaryRow } from './types';
import { db } from '../firebase';
import { LOCAL, localData, type LocalData } from '../local';

export const BASE = `projects/${PROJECT_ID}/disciplines/${DISCIPLINE}`;

export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

/** local: yerel modda work/ verisinden seçim; verilmezse (geçmiş, yorum, pafta) yerel modda boş liste. */
function useQuery<T>(make: () => Query<DocumentData> | null, deps: unknown[], local?: (d: LocalData) => T[]): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: true, error: null });
  useEffect(() => {
    if (LOCAL) {
      let live = true;
      if (!local) setState({ data: [], loading: false, error: null });
      else localData().then((d) => live && setState({ data: local(d), loading: false, error: null }), (error: Error) => live && setState({ data: [], loading: false, error }));
      return () => {
        live = false;
      };
    }
    const q = make();
    if (!q) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      q,
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T), loading: false, error: null }),
      (error) => setState({ data: [], loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

const coll = (name: string) => collection(db, `${BASE}/${name}`);

export const useItems = () => useQuery<Item>(() => query(coll('items'), orderBy('order')), [], (d) => d.items);
export const useRooms = () => useQuery<Room>(() => query(coll('rooms'), orderBy('order')), [], (d) => d.rooms);
export const useFacade = () => useQuery<FacadeRow>(() => coll('facade'), [], (d) => d.facade);
export const useMaterials = () => useQuery<Material>(() => query(coll('materials'), orderBy('no')), [], (d) => d.materials);
export const useFindings = () => useQuery<Finding & { id: string }>(() => query(coll('findings'), orderBy('no')), [], (d) => d.findings.map((f) => ({ ...f, id: String(f.no) })));
export const useDrawings = (enabled = true) => useQuery<Drawing>(() => (enabled ? query(coll('drawings'), orderBy('code')) : null), [enabled]);
export const useRevisions = (code: string | null) =>
  useQuery<Revision>(() => (code ? query(collection(db, `${BASE}/drawings/${code}/revisions`), orderBy('uploadedAt', 'desc')) : null), [code]);

export const useHistory = (target: { type: TargetType; id: string } | null) =>
  useQuery<HistoryEntry & { id: string }>(
    () => (target ? query(coll('history'), where('target.type', '==', target.type), where('target.id', '==', target.id), orderBy('at', 'desc')) : null),
    [target?.type, target?.id],
  );

export interface Comment {
  id: string;
  target: { type: TargetType; id: string };
  text: string;
  by: { uid: string; name: string };
  at: { toDate(): Date } | null;
}
export const useComments = (target: { type: TargetType; id: string } | null) =>
  useQuery<Comment>(
    () => (target ? query(coll('comments'), where('target.type', '==', target.type), where('target.id', '==', target.id), orderBy('at')) : null),
    [target?.type, target?.id],
  );

export interface DisciplineDoc {
  name: string;
  groups: { key: string; title: string }[];
  summary: SummaryRow[];
  methodText: string[];
  facadeNotes: string[];
}
export function useDiscipline(): Live<DisciplineDoc | null> {
  const [state, setState] = useState<Live<DisciplineDoc | null>>({ data: null, loading: true, error: null });
  useEffect(
    () =>
      LOCAL
        ? void localData().then((d) => setState({ data: d.discipline, loading: false, error: null }), (error: Error) => setState({ data: null, loading: false, error }))
        : onSnapshot(
        doc(db, BASE),
        (snap) => setState({ data: (snap.data() as DisciplineDoc) ?? null, loading: false, error: null }),
        (error) => setState({ data: null, loading: false, error }),
      ),
    [],
  );
  return state;
}
