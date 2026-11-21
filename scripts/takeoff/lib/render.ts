// Düzleştirilmiş çizimi PNG'ye basar: gri altlık + renkli vurgular (ölçülen bölgeler) + etiketler.
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import type { Flat } from './flatten';
import { bbox, type P } from './geom';

export interface Highlight {
  loops: P[][];
  fill?: string;
  stroke?: string;
  label?: string;
}
export interface RenderOpts {
  width?: number;
  window?: { minX: number; minY: number; maxX: number; maxY: number }; // mm
  base: Flat[]; // gri altlık
  highlights?: Highlight[];
  marks?: { at: P; text: string; color?: string }[];
  title?: string;
}

export function renderPng(file: string, o: RenderOpts) {
  const pts: P[] = [];
  if (o.window) pts.push({ x: o.window.minX, y: o.window.minY }, { x: o.window.maxX, y: o.window.maxY });
  else for (const f of o.base) if (f.pts) pts.push(...f.pts);
  const b = bbox(pts);
  const W = o.width ?? 2400;
  const pad = 30;
  const s = (W - 2 * pad) / Math.max(1, b.maxX - b.minX);
  const H = Math.ceil((b.maxY - b.minY) * s + 2 * pad + (o.title ? 40 : 0));
  const top = o.title ? 40 : 0;
  const c = createCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  const X = (x: number) => pad + (x - b.minX) * s;
  const Y = (y: number) => top + pad + (b.maxY - y) * s;
  const inWin = (p: P) => !o.window || (p.x >= b.minX - 1e4 && p.x <= b.maxX + 1e4 && p.y >= b.minY - 1e4 && p.y <= b.maxY + 1e4);
  const path = (ps: P[], close: boolean) => {
    g.beginPath();
    ps.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y))));
    if (close) g.closePath();
  };
  g.strokeStyle = '#b8bec4';
  g.lineWidth = 0.6;
  for (const f of o.base) {
    if (!f.pts || f.pts.length < 2 || !inWin(f.pts[0])) continue;
    path(f.pts, !!f.closed);
    g.stroke();
  }
  for (const h of o.highlights ?? []) {
    g.beginPath();
    for (const l of h.loops) {
      l.forEach((p, i) => (i ? g.lineTo(X(p.x), Y(p.y)) : g.moveTo(X(p.x), Y(p.y))));
      g.closePath();
    }
    if (h.fill) {
      g.fillStyle = h.fill;
      g.fill('evenodd');
    }
    g.strokeStyle = h.stroke ?? '#1d4e89';
    g.lineWidth = 1.4;
    g.stroke();
    if (h.label && h.loops[0]?.length) {
      const bb = bbox(h.loops[0]);
      g.fillStyle = '#1f2328';
      g.font = '13px sans-serif';
      g.fillText(h.label, X((bb.minX + bb.maxX) / 2) - 20, Y((bb.minY + bb.maxY) / 2));
    }
  }
  for (const m of o.marks ?? []) {
    g.fillStyle = m.color ?? '#b42318';
    g.beginPath();
    g.arc(X(m.at.x), Y(m.at.y), 4, 0, Math.PI * 2);
    g.fill();
    g.font = '12px sans-serif';
    g.fillText(m.text, X(m.at.x) + 6, Y(m.at.y) - 4);
  }
  if (o.title) {
    g.fillStyle = '#1f2328';
    g.font = 'bold 20px sans-serif';
    g.fillText(o.title, pad, 28);
  }
  writeFileSync(file, c.toBuffer('image/png'));
}
