// Hızlı inceleme görüntüsü: npx tsx scripts/takeoff/view.ts <dxf> <out.png> [--base katmanRegex] [--hl katmanRegex] [--block blokRegex] [--win x0,y0,x1,y1 (m)]
import { readDxf } from './lib/dxf';
import { flatten } from './lib/flatten';
import { renderPng } from './lib/render';

const [file, out] = process.argv.slice(2);
const arg = (n: string) => {
  const i = process.argv.indexOf(n);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const flat = flatten(readDxf(file));
const baseRe = new RegExp(arg('--base') ?? 'A_Wall|A_Stuc|A_Mat_Glas|A_Nplt_Area');
const hlRe = arg('--hl') ? new RegExp(arg('--hl')!) : null;
const blockRe = arg('--block') ? new RegExp(arg('--block')!) : null;
const okBlock = (p: string[]) => !blockRe || p.some((x) => blockRe.test(x));
const win = arg('--win')?.split(',').map((v) => parseFloat(v) * 1000);
const base = flat.filter((f) => baseRe.test(f.layer) && okBlock(f.path) && f.t !== 'TEXT');
const hl = hlRe ? flat.filter((f) => hlRe.test(f.layer) && okBlock(f.path)) : [];
renderPng(out, {
  base,
  window: win ? { minX: win[0], minY: win[1], maxX: win[2], maxY: win[3] } : undefined,
  highlights: hl.map((f) => ({ loops: f.loops ?? (f.pts ? [f.pts] : []), fill: f.closed || f.loops ? 'rgba(29,78,137,0.18)' : undefined, stroke: '#b42318' })),
  title: `${file.split('/').pop()}  base=${baseRe.source}${hlRe ? '  hl=' + hlRe.source : ''}`,
});
console.log('yazıldı', out, 'altlık', base.length, 'vurgu', hl.length);
