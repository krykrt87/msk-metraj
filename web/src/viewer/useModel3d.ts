import { useEffect, useState } from 'react';
import { getBytes, ref } from 'firebase/storage';
import { DISCIPLINE, PROJECT_ID } from '@shared/constants';
import type { Model3, Underlay } from '@shared/model3d';
import { storage } from '../firebase';
import { LOCAL, localJson } from '../local';

let cache: Promise<Model3> | null = null;

/** Metraj aktarımıyla Storage'a yüklenen 3B model (kurallardan geçen getBytes ile). enabled=false: indirilmez (telefon). */
export function useModel3d(enabled = true): { model: Model3 | null; error: string | null } {
  const [model, setModel] = useState<Model3 | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    cache ??= LOCAL ? localJson<Model3>('model3d.json') : getBytes(ref(storage, `projects/${PROJECT_ID}/disciplines/${DISCIPLINE}/model/model3d.json`)).then((b) => JSON.parse(new TextDecoder().decode(b)) as Model3);
    cache.then(
      (m) => live && setModel(m),
      (e: unknown) => {
        cache = null;
        if (live) setError((e as { code?: string }).code === 'storage/object-not-found' ? '3B model henüz yüklenmemiş (metraj aktarımını çalıştırın).' : `3B model okunamadı: ${(e as Error).message}`);
      },
    );
    return () => {
      live = false;
    };
  }, [enabled]);
  return { model, error };
}

let ulCache: Promise<Underlay> | null = null;

/** Plan altlığı (~birkaç MB): yalnız bir plan açılınca indirilir. */
export function useUnderlay(enabled: boolean): { underlay: Underlay | null; error: string | null } {
  const [underlay, setUnderlay] = useState<Underlay | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    ulCache ??= LOCAL ? localJson<Underlay>('underlay.json') : getBytes(ref(storage, `projects/${PROJECT_ID}/disciplines/${DISCIPLINE}/model/underlay.json`)).then((b) => JSON.parse(new TextDecoder().decode(b)) as Underlay);
    ulCache.then(
      (u) => live && setUnderlay(u),
      (e: unknown) => {
        ulCache = null;
        if (live) setError((e as { code?: string }).code === 'storage/object-not-found' ? 'Plan altlığı henüz yüklenmemiş (metraj aktarımını çalıştırın).' : `Plan altlığı okunamadı: ${(e as Error).message}`);
      },
    );
    return () => {
      live = false;
    };
  }, [enabled]);
  return { underlay, error };
}
