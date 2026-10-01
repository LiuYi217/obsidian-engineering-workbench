import {mkdir,readFile,copyFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(await readFile('manifest.json','utf8'));
const pkg=JSON.parse(await readFile('package.json','utf8'));
const versions=JSON.parse(await readFile('versions.json','utf8'));
if(pkg.version!==manifest.version||versions[manifest.version]!==manifest.minAppVersion)throw new Error('Version metadata mismatch');
const dir=`release/${manifest.id}`;await mkdir(dir,{recursive:true});
for(const file of ['main.js','manifest.json','styles.css','LICENSE','README.md'])await copyFile(file,`${dir}/${file}`);
const zip=`engineering-lead-workbench-${manifest.version}.zip`;
execFileSync('python3',['-c',`import zipfile,pathlib\nroot=pathlib.Path('release')\nwith zipfile.ZipFile(root/'${zip}','w',zipfile.ZIP_DEFLATED) as z:\n for p in sorted((root/'${manifest.id}').iterdir()):\n  z.write(p,p.relative_to(root))`]);
const artifacts=['main.js','manifest.json','styles.css'];const checks=[];
for(const name of artifacts){const contents=await readFile(name);await copyFile(name,`release/${name}`);checks.push(`${createHash('sha256').update(contents).digest('hex')}  ${name}`);}
const archive=await readFile(`release/${zip}`);checks.push(`${createHash('sha256').update(archive).digest('hex')}  ${zip}`);await writeFile('release/SHA256SUMS.txt',`${checks.join('\n')}\n`);
console.log(`Packaged release/${zip} (${archive.length} bytes), plus standalone Obsidian assets and SHA256SUMS.txt`);
