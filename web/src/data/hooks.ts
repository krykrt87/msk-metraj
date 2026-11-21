import { collection, doc, onSnapshot, orderBy, query, where, type DocumentData, type Query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { DISCIPLINE, PROJECT_ID } from '@shared/constants';
import type { Drawing, FacadeRow, Finding, HistoryEntry, Item, Material, Revision, Room, TargetType } from '@shared/types';
import type { SummaryRow } from './types';
import { db } from '../firebase';

export const BASE = `projects/${PROJECT_ID}/disciplines/${DISCIPLINE}`;

export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

function useQuery<T>(make: () => Query<DocumentData> | null, deps: unknown[]): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: true, error: null });
  useEffect(() => {
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

export const useItems = () => useQuery<Item>(() => query(coll('items'), orderBy('order')), []);
export const useRooms = () => useQuery<Room>(() => query(coll('rooms'), orderBy('order')), []);
export const useFacade = () => useQuery<FacadeRow>(() => coll('facade'), []);
export const useMaterials = () => useQuery<Material>(() => query(coll('materials'), orderBy('no')), []);
export const useFindings = () => useQuery<Finding & { id: string }>(() => query(coll('findings'), orderBy('no')), []);
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
      onSnapshot(
        doc(db, BASE),
        (snap) => setState({ data: (snap.data() as DisciplineDoc) ?? null, loading: false, error: null }),
        (error) => setState({ data: null, loading: false, error }),
      ),
    [],
  );
  return state;
}
