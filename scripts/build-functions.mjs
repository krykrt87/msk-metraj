// functions/src → functions/lib/index.js (shared/ içeri gömülür; firebase paketleri dışarıda kalır)
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
await build({
  absWorkingDir: root,
  entryPoints: ['functions/src/index.ts'],
  outfile: 'functions/lib/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  external: ['firebase-admin', 'firebase-admin/*', 'firebase-functions', 'firebase-functions/*'],
  alias: { '@shared': './shared' },
  logLevel: 'warning',
});
console.log('functions paketlendi: functions/lib/index.js');
