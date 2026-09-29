import {readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
mkdirSync('dist/server',{recursive:true});
const assets={};
for(const [route,file,type] of [['/','index.html','text/html'],['/app.js','app.js','text/javascript'],['/qrcode.js','qrcode.js','text/javascript'],['/style.css','style.css','text/css'],['/favicon.svg','favicon.svg','image/svg+xml']])assets[route]={body:readFileSync('public/'+file,'utf8'),type:type+'; charset=utf-8'};
writeFileSync('dist/server/assets.mjs','export const assets='+JSON.stringify(assets)+';');
cpSync('cloud/worker.mjs','dist/server/index.js');
cpSync('attachments.mjs','dist/server/attachments.mjs');
console.log('Built cloud worker and embedded assets');
