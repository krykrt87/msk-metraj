// Cetvel satırı adları ve hesap kuralları (uygulama ve Excel raporu ortak kullanır).
import type { CalcRow } from './types';

const isTri = (r: CalcRow) => r.kind === 'yamuk' && (r.a === 0 || r.b === 0);

export function partName(r: CalcRow): string {
  switch (r.kind) {
    case 'dikdörtgen':
      return 'Dikdörtgen';
    case 'yamuk':
      return isTri(r) ? 'Üçgen' : 'Yamuk';
    case 'daire parçası':
      return 'Daire parçası';
    case 'doğru':
      return 'Doğru parça';
    case 'yay':
      return 'Yay';
    case 'duvar':
      return 'Duvar parçası';
    case 'kalem':
      return 'Kalem';
    case 'sayım':
      return 'Sayım';
    case 'değer':
      return 'Yazılı değer';
  }
}

export function partRule(r: CalcRow): string {
  switch (r.kind) {
    case 'dikdörtgen':
      return 'adet × en × boy';
    case 'yamuk':
      return isTri(r) ? 'adet × taban × yükseklik / 2' : 'adet × (a + b) / 2 × boy';
    case 'daire parçası':
      return 'r²/2 × (θ − sin θ)';
    case 'doğru':
      return 'adet × boy';
    case 'yay':
      return 'adet × r × θ (radyan)';
    case 'duvar':
      return r.unit === 'm' ? 'adet × boy (boy = taban alanı / kalınlık)' : 'adet × kalınlık × boy';
    case 'kalem':
      return r.adet === 1 ? 'kalemin miktarı' : 'adet × kalemin miktarı';
    case 'sayım':
      return 'çizimde sayılan nesne';
    case 'değer':
      return 'çizimde / detayda yazılı değer';
  }
}

/** Parça adı + ait olduğu eleman. */
export const partTitle = (r: CalcRow) => (r.name ? `${partName(r)} – ${r.name}` : partName(r));

export const unitOf = (r: CalcRow) => r.unit ?? 'm²';
