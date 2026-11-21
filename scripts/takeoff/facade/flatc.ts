// Model uzayındaki tüm varlıkları, iç içe blokları açarak dünya koordinatında (mm) düz listeye çevirir.
import { num, nums, val, type RawDxf, type RawEnt } from '../lib/dxf';
import {
  apply, det, expandBulges, I, mul, rotate, sampleArc, sampleEllipse, sampleSpline, scale, translate, type M, type P,
} from '../lib/geom';

export interface Flat {
  t: string; // LINE, PLINE, ARC, CIRCLE, ELLIPSE, SPLINE, HATCH, TEXT, INSERT
  layer: string; // etkin katman (blok içindeki "0" üst eklemenin katmanını alır)
  path: string[]; // blok zinciri (en dıştan içe)
  pts?: P[]; // eğri noktaları (dünya)
  closed?: boolean;
  loops?: P[][]; // tarama halkaları
  pattern?: string; // tarama deseni
  text?: string;
  height?: number;
  name?: string; // INSERT blok adı
  at?: P; // INSERT/TEXT konumu
  attrs?: Record<string, string>;
  scaleDet?: number; // alan çarpanı (blok ölçeği)
  color?: number;
  tc?: number;
  ltype?: string;
  clips?: P[][]; // XCLIP polygons (world) from enclosing inserts
  handle?: string;
  inst?: number; // içinde bulunduğu en içteki blok eklemesinin kimliği (INSERT için kendi kimliği)
}

const MIRROR_X: M = [-1, 0, 0, 0, 1, 0];
const ocs = (e: RawEnt): M => (num(e, 230, 1) < 0 ? MIRROR_X : I);
const pt = (e: RawEnt, cx: number, cy: number): P => ({ x: num(e, cx), y: num(e, cy) });

/** Sıralı grup kodlarından LWPOLYLINE köşeleri (bulge dahil). */
function lwVertices(e: RawEnt): { x: number; y: number; bulge?: number }[] {
  const out: { x: number; y: number; bulge?: number }[] = [];
  for (const [c, v] of e.pairs) {
    if (c === 10) out.push({ x: parseFloat(v), y: 0 });
    else if (c === 20 && out.length) out[out.length - 1].y = parseFloat(v);
    else if (c === 42 && out.length) out[out.length - 1].bulge = parseFloat(v);
  }
  return out;
}

/** HATCH sınır halkaları (OCS). */
function hatchLoops(e: RawEnt): P[][] {
  const p = e.pairs;
  let k = p.findIndex(([c]) => c === 91);
  if (k < 0) return [];
  const nLoops = parseInt(p[k][1], 10);
  k++;
  const loops: P[][] = [];
  const next = () => p[k++];
  const want = (code: number) => {
    while (k < p.length && p[k][0] !== code) k++;
    return k < p.length ? parseFloat(next()[1]) : NaN;
  };
  for (let L = 0; L < nLoops && k < p.length; L++) {
    const flags = want(92);
    const loop: P[] = [];
    if ((flags & 2) !== 0) {
      const hasBulge = want(72);
      const closed = want(73);
      const n = want(93);
      const verts: { x: number; y: number; bulge?: number }[] = [];
      for (let j = 0; j < n; j++) {
        const x = want(10);
        const y = want(20);
        const v: { x: number; y: number; bulge?: number } = { x, y };
        if (hasBulge && p[k]?.[0] === 42) v.bulge = parseFloat(next()[1]);
        verts.push(v);
      }
      loop.push(...expandBulges(verts, closed !== 0 || true));
    } else {
      const nEdges = want(93);
      for (let j = 0; j < nEdges; j++) {
        const et = want(72);
        if (et === 1) {
          const a = { x: want(10), y: want(20) };
          const b = { x: want(11), y: want(21) };
          loop.push(a, b);
        } else if (et === 2) {
          const c = { x: want(10), y: want(20) };
          const r = want(40);
          const s = want(50);
          const en = want(51);
          const ccw = want(73);
          const rad = Math.PI / 180;
          if (ccw) loop.push(...sampleArc(c, r, s * rad, en * rad));
          else loop.push(...sampleArc(c, r, -en * rad, -s * rad).reverse());
        } else if (et === 3) {
          const c = { x: want(10), y: want(20) };
          const mj = { x: want(11), y: want(21) };
          const ratio = want(40);
          const s = want(50);
          const en = want(51);
          const ccw = want(73);
          const rad = Math.PI / 180;
          if (ccw) loop.push(...sampleEllipse(c, mj, ratio, s * rad, en * rad));
          else loop.push(...sampleEllipse(c, mj, ratio, -en * rad, -s * rad).reverse());
        } else if (et === 4) {
          const degree = want(94);
          want(73);
          want(74);
          const nk = want(95);
          const nc = want(96);
          const knots: number[] = [];
          for (let q = 0; q < nk; q++) knots.push(want(40));
          const ctrl: P[] = [];
          const weights: number[] = [];
          for (let q = 0; q < nc; q++) {
            ctrl.push({ x: want(10), y: want(20) });
            if (p[k]?.[0] === 42) weights.push(parseFloat(next()[1]));
          }
          loop.push(...sampleSpline(ctrl, knots, degree, weights.length ? weights : undefined));
        }
      }
    }
    // kaynak sınır nesneleri (97 + 330'lar) atlanır
    if (p[k]?.[0] === 97) {
      const ns = parseInt(next()[1], 10);
      for (let q = 0; q < ns && p[k]?.[0] === 330; q++) next();
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

export function flatten(dxf: RawDxf, opts: { maxDepth?: number; clipFor?: (e: RawEnt) => P[] | undefined } = {}): Flat[] {
  const out: Flat[] = [];
  const maxDepth = opts.maxDepth ?? 12;

  let nextInst = 1;
  const emit = (e: RawEnt, m: M, layer: string, path: string[], depth: number, inst = 0, pcol = 256, ptc?: number, clips: P[][] = []) => {
    const own = val(e, 8, '0');
    const eff = own === '0' && path.length ? layer : own;
    let col = num(e, 62, 256); let tc: number | undefined = e.pairs.some(([c]) => c === 420) ? num(e, 420) : undefined;
    if (col === 0) { col = pcol; tc = ptc; }
    const base = { layer: eff, path, inst, color: col, tc, ltype: val(e, 6, ''), clips: clips.length ? clips : undefined, handle: val(e, 5) };
    switch (e.type) {
      case 'LINE':
        out.push({ ...base, t: 'LINE', pts: [apply(m, pt(e, 10, 20)), apply(m, pt(e, 11, 21))] });
        return;
      case 'LWPOLYLINE': {
        const closed = (num(e, 70) & 1) === 1;
        const mm = mul(m, ocs(e));
        out.push({ ...base, t: 'PLINE', closed, pts: expandBulges(lwVertices(e), closed).map((q) => apply(mm, q)) });
        return;
      }
      case 'POLYLINE': {
        const flags = num(e, 70);
        if (flags & (16 | 64)) return; // mesh / polyface
        const closed = (flags & 1) === 1;
        const verts = e.children.filter((c) => c.type === 'VERTEX').map((v) => ({ x: num(v, 10), y: num(v, 20), bulge: num(v, 42) }));
        const mm = mul(m, ocs(e));
        out.push({ ...base, t: 'PLINE', closed, pts: expandBulges(verts, closed).map((q) => apply(mm, q)) });
        return;
      }
      case 'ARC': {
        const mm = mul(m, ocs(e));
        const r = num(e, 40);
        const rad = Math.PI / 180;
        out.push({ ...base, t: 'ARC', pts: sampleArc(pt(e, 10, 20), r, num(e, 50) * rad, num(e, 51) * rad).map((q) => apply(mm, q)) });
        return;
      }
      case 'CIRCLE': {
        const mm = mul(m, ocs(e));
        const pts = sampleArc(pt(e, 10, 20), num(e, 40), 0, 2 * Math.PI).map((q) => apply(mm, q));
        pts.pop();
        out.push({ ...base, t: 'CIRCLE', closed: true, pts });
        return;
      }
      case 'ELLIPSE': {
        const full = Math.abs(num(e, 42, 2 * Math.PI) - num(e, 41, 0) - 2 * Math.PI) < 1e-6;
        const pts = sampleEllipse(pt(e, 10, 20), pt(e, 11, 21), num(e, 40, 1), num(e, 41, 0), num(e, 42, 2 * Math.PI)).map((q) => apply(m, q));
        if (full) pts.pop();
        out.push({ ...base, t: 'ELLIPSE', closed: full, pts });
        return;
      }
      case 'SPLINE': {
        const xs = nums(e, 10);
        const ys = nums(e, 20);
        const fx = nums(e, 11);
        const fy = nums(e, 21);
        const ctrl = xs.map((x, k) => ({ x, y: ys[k] }));
        const fit = fx.map((x, k) => ({ x, y: fy[k] }));
        const pts = sampleSpline(ctrl, nums(e, 40), num(e, 71, 3), nums(e, 41), fit).map((q) => apply(m, q));
        out.push({ ...base, t: 'SPLINE', closed: (num(e, 70) & 1) === 1, pts });
        return;
      }
      case 'HATCH': {
        const mm = mul(m, ocs(e));
        const loops = hatchLoops(e).map((l) => l.map((q) => apply(mm, q)));
        out.push({ ...base, t: 'HATCH', loops, pattern: val(e, 2), scaleDet: Math.abs(det(m)) });
        return;
      }
      case 'TEXT':
      case 'MTEXT': {
        const raw = e.type === 'MTEXT' ? e.pairs.filter(([c]) => c === 3 || c === 1).map(([, v]) => v).join('') : val(e, 1);
        const mm = e.type === 'TEXT' ? mul(m, ocs(e)) : m;
        out.push({ ...base, t: 'TEXT', text: cleanText(raw), at: apply(mm, pt(e, 10, 20)), height: num(e, 40) * Math.sqrt(Math.abs(det(m))) });
        return;
      }
      case 'INSERT': {
        const name = val(e, 2);
        const blk = dxf.blocks.get(name);
        const attrs: Record<string, string> = {};
        for (const a of e.children.filter((c) => c.type === 'ATTRIB')) attrs[val(a, 2)] = cleanText(val(a, 1));
        const cols = Math.max(1, num(e, 70, 1));
        const rows = Math.max(1, num(e, 71, 1));
        for (let ci = 0; ci < cols; ci++) {
          for (let ri = 0; ri < rows; ri++) {
            const local = mul(
              translate(num(e, 10) + ci * num(e, 44), num(e, 20) + ri * num(e, 45)),
              mul(rotate(num(e, 50)), scale(num(e, 41, 1), num(e, 42, 1))),
            );
            const mm = mul(m, mul(ocs(e), mul(local, blk ? translate(-blk.base.x, -blk.base.y) : I)));
            const id = nextInst++;
            const cb = opts.clipFor?.(e);
            const childClips = cb ? [...clips, cb.map((q) => apply(mm, q))] : clips;
            out.push({ ...base, inst: id, t: 'INSERT', name, at: apply(mm, blk?.base ?? { x: 0, y: 0 }), attrs, scaleDet: Math.abs(det(mm)) });
            for (const a of e.children.filter((c) => c.type === 'ATTRIB')) {
              out.push({ ...base, inst: id, t: 'TEXT', text: cleanText(val(a, 1)), at: apply(mul(m, ocs(a)), pt(a, 10, 20)), height: num(a, 40) });
            }
            if (blk && depth < maxDepth) for (const child of blk.entities) emit(child, mm, eff, [...path, name], depth + 1, id, col, tc, childClips);
          }
        }
        return;
      }
      default:
        return;
    }
  };

  for (const e of dxf.entities) {
    if (num(e, 67) === 1) continue; // kâğıt uzayı
    emit(e, I, '0', [], 0);
  }
  return out;
}

export function cleanText(s: string): string {
  return s
    .replace(/\\[Pp]/g, ' ')
    .replace(/\\[A-Za-z][^;\\{}]*;/g, '')
    .replace(/[{}]/g, '')
    .replace(/%%[cC]/g, 'Ø')
    .replace(/%%[dD]/g, '°')
    .replace(/%%[pP]/g, '±')
    .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}
