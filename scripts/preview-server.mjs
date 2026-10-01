import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('.preview');
http.createServer(async(req,res)=>{const route=new URL(req.url,'http://localhost').pathname;const filename=path.join(root,route==='/'?'index.html':route);if(!filename.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{const data=await readFile(filename);const type=filename.endsWith('.js')?'text/javascript':filename.endsWith('.css')?'text/css':'text/html';res.writeHead(200,{'Content-Type':`${type}; charset=utf-8`});res.end(data);}catch{res.writeHead(404).end();}}).listen(4173,'127.0.0.1',()=>console.log('Browser UI harness http://127.0.0.1:4173 (synthetic demo, no native Obsidian host)'));
