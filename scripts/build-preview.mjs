import { mkdir,copyFile } from 'node:fs/promises';
import { build } from 'esbuild';
await mkdir('.preview',{recursive:true});
await build({entryPoints:['scripts/preview.ts'],bundle:true,format:'iife',outfile:'.preview/preview.js'});
await copyFile('scripts/preview.html','.preview/index.html');
await copyFile('styles.css','.preview/styles.css');
