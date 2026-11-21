import { useEffect, useState } from 'react';
import { getBytes, ref } from 'firebase/storage';
import { DISCIPLINE, PROJECT_ID } from '@shared/constants';
import type { Model3 } from '@shared/model3d';
import { storage } from '../firebase';

let cache: Promise<Model3> | null = null;

/** Metraj aktarımıyla Storage'a yüklenen 3B model (kurallardan geçen getBytes ile). */
export function useModel3d(): { model: Model3 | null; error: string | null } {
  const [model, setModel] = useState<Model3 | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    cache ??= getBytes(ref(storage, `projects/${PROJECT_ID}/disciplines/${DISCIPLINE}/model/model3d.json`)).then((b) => JSON.parse(new TextDecoder().decode(b)) as Model3);
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
  }, []);
  return { model, error };
}
