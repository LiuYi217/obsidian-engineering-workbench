import esbuild from 'esbuild';
import {readFileSync} from 'node:fs';
const dependencyLicense=readFileSync('node_modules/fflate/LICENSE','utf8');
const production = process.argv.includes('production');
const context = await esbuild.context({entryPoints:['src/main.ts'],bundle:true,external:['obsidian','electron','@codemirror/*','@lezer/*'],format:'cjs',target:'es2020',platform:'browser',outfile:'main.js',sourcemap:production?false:'inline',minify:production,banner:{js:'/* Engineering Lead Workbench v0.1.0 | MIT | Local-first. */\n/* Bundled fflate:\n'+dependencyLicense+'\n*/'},logLevel:'info'});
if(production){await context.rebuild();await context.dispose();}else{await context.watch();}
