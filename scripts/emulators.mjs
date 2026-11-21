// Firebase emülatörlerini JDK 21 ile başlatır (sistemdeki Java 8'in önüne geçer).
// Kullanım: node scripts/emulators.mjs start | exec "<komut>"
import { spawnSync, spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const PROJECT = 'demo-msk';

function findJavaHome() {
  const programs = join(process.env.LOCALAPPDATA ?? '', 'Programs');
  const candidates = [];
  if (existsSync(programs)) {
    for (const d of readdirSync(programs)) if (/^jdk-2\d/.test(d)) candidates.push(join(programs, d));
  }
  if (process.env.JAVA_HOME) candidates.push(process.env.JAVA_HOME);
  for (const home of candidates) {
    const java = join(home, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');
    if (!existsSync(java)) continue;
    const out = spawnSync(java, ['-version'], { encoding: 'utf8' });
    const m = /version "(\d+)/.exec(out.stderr ?? '');
    if (m && Number(m[1]) >= 21) return home;
  }
  throw new Error('JDK 21+ bulunamadı. README: JDK kurulumu (%LOCALAPPDATA%\Programs\jdk-21).');
}

const javaHome = findJavaHome();
const sep = process.platform === 'win32' ? ';' : ':';
const env = { ...process.env, JAVA_HOME: javaHome, PATH: join(javaHome, 'bin') + sep + process.env.PATH };

const b = spawnSync(process.execPath, [join(root, 'scripts', 'build-functions.mjs')], { stdio: 'inherit', env });
if (b.status !== 0) process.exit(b.status ?? 1);

const firebaseBin = join(root, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
const [mode, command] = process.argv.slice(2);
let args;
if (mode === 'start') {
  args = ['emulators:start', '--project', PROJECT, '--export-on-exit', 'emulator-data'];
  if (existsSync(join(root, 'emulator-data'))) args.push('--import', 'emulator-data');
} else if (mode === 'exec' && command) {
  args = ['emulators:exec', '--project', PROJECT, '--only', 'auth,firestore,storage', command];
} else {
  console.error('Kullanım: node scripts/emulators.mjs start | exec "<komut>"');
  process.exit(2);
}
const child = spawn(process.execPath, [firebaseBin, ...args], { stdio: 'inherit', env, cwd: root });
child.on('exit', (code) => process.exit(code ?? 1));
