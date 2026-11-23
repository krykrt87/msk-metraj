import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { takeoffToImport } from './scripts/import-takeoff';

const work = (f: string) => fileURLToPath(new URL(`./work/${f}`, import.meta.url));

/** Yerel mod (emülatörsüz): uygulama verisini her istekte work/ çıktılarından verir; metraj yeniden üretilince sayfayı yenilemek yeter. */
function localData(): Plugin {
  return {
    name: 'local-data',
    configureServer(server) {
      server.middlewares.use('/local', (req, res) => {
        const name = (req.url ?? '').split('?')[0].replace(/^\//, '');
        try {
          let body: string;
          if (name === 'data.json') body = JSON.stringify(takeoffToImport(JSON.parse(readFileSync(work('metraj.json'), 'utf8'))));
          else if (name === 'model3d.json' || name === 'underlay.json') body = readFileSync(work(name), 'utf8');
          else {
            res.statusCode = 404;
            return res.end('Bulunamadı');
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(body);
        } catch (e) {
          res.statusCode = existsSync(work(name === 'data.json' ? 'metraj.json' : name)) ? 500 : 404;
          res.end(`work/${name === 'data.json' ? 'metraj.json' : name} okunamadı: ${(e as Error).message}`);
        }
      });
    },
  };
}

export default defineConfig({
  root: 'web',
  plugins: [react(), localData()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  server: { port: 5173, strictPort: true },
  build: { outDir: '../dist', emptyOutDir: true },
});
