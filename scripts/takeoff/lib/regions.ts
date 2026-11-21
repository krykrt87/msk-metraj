// Duvar/cam/taşıyıcı çizgilerinden ızgara doldurmayla kapalı bölge ölçümü.
import type { Flat } from './flatten';
import { area, length, type P } from './geom';
import { Grid, type Win } from './raster';

export const GF_BLOCKS = /^(4199_AMH_Walls_GF|4199_AMG_Glass new2|STRUCTURE_GF_NN|salon_giris_kutlesi|vestibule|ruzgarlık_celik_kons)$/;
export const BARRIER_LAYERS = /^(A_Wall|A_Mat_Glas|A_Mat_Mtal|A_Stuc_Conc|A_Door_Wood|A_Mat_Othr|A_Mat_Gpsm|A_Patt_Wall)/;

export type Measurer = (seed: P, half?: number, res?: number) => { area: number; leaked: boolean; outline: P[] };

export function makeMeasurer(flat: Flat[], blocks = GF_BLOCKS, layers = BARRIER_LAYERS): Measurer {
  const barriers = flat.filter((f) => f.path.length > 0 && blocks.test(f.path[0]) && layers.test(f.layer) && (f.pts || f.loops));
  return (seed, half = 35000, res = 15) => {
    const win: Win = { minX: seed.x - half, minY: seed.y - half, maxX: seed.x + half, maxY: seed.y + half };
    const g = new Grid(win, res);
    for (const f of barriers) {
      const probe = f.pts ?? f.loops?.[0] ?? [];
      if (!probe.some((p) => p.x > win.minX && p.x < win.maxX && p.y > win.minY && p.y < win.maxY)) continue;
      if (f.loops) f.loops.forEach((l) => g.polyline(l, true));
      else if (f.pts) g.polyline(f.pts, !!f.closed);
    }
    const r = g.fill(seed);
    if (r.leaked || r.cells === 0) return { area: 0, leaked: r.leaked, outline: [] };
    const outline = g.outline();
    // sınır hücre kenarından geçer: çizgi ekseninden yarım hücre içeride → çevre × res/2 eklenir
    return { area: (area(outline) + (length(outline, true) * res) / 2) / 1e6, leaked: false, outline };
  };
}
