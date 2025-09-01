// scripts/bundle.mjs
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';

await build({
  entryPoints: [path.join(root, 'src/extension.ts')],
  outfile: path.join(root, 'dist/extension.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'], // 必須: VSCode ランタイム提供
  sourcemap: false,
  logLevel: 'info',
});

await build({
  entryPoints: [path.join(root, 'server/src/server.ts')],
  outfile: path.join(root, 'server/dist/server.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: [], // ここは全部取り込む（依存を含める）
  sourcemap: false,
  logLevel: 'info',
});

console.log('Bundled client -> dist/extension.js, server -> server/dist/server.js');
