import {attachment} from './attachments.mjs';
import http from 'node:http';
import {networkInterfaces} from 'node:os';
import {randomBytes,randomInt,timingSafeEqual,scryptSync} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,renameSync,existsSync,unlinkSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url)),dir=process.env.DATA_DIR||path.join(root,'data');
mkdirSync(dir,{recursive:true});
const imageDir=path.join(dir,'images');mkdirSync(imageDir,{recursive:true});
const db=path.join(dir,'boards.json'),adminFile=path.join(dir,'admin.json');
let rooms=existsSync(db)?JSON.parse(readFileSync(db,'utf8')):{};
let account=existsSync(adminFile)?JSON.parse(readFileSync(adminFile,'utf8')):null;
const streams=new Set(),rates=new Map(),attempts=new Map(),sessions=new Map(),token=()=>randomBytes(32).toString('hex');
const save=()=>{writeFileSync(db+'.tmp',JSON.stringify(rooms));renameSync(db+'.tmp',db)};
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
function cookie(req,name){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)}
function isAdmin(req){const key=cookie(req,'wall_admin'),expires=sessions.get(key);if(expires&&expires>Date.now())return true;if(key)sessions.delete(key);return false}
function auth(req){if(!isAdmin(req))fail(403,'관리자 로그인이 필요합니다.')}
function local(req){return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&['localhost','127.0.0.1','[::1]'].includes(new URL('http://'+req.headers.host).hostname)}
function setCookie(res,req,name,value,maxAge){const old=res.getHeader('Set-Cookie')||[];res.setHeader('Set-Cookie',[...old,name+'='+value+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+maxAge+(req.socket.encrypted?'; Secure':'')])}
function signIn(req,res){const key=token();sessions.set(key,Date.now()+8*3600000);setCookie(res,req,'wall_admin',key,8*3600)}
const view=(r,u,admin=false)=>({code:r.code,topic:r.topic,closed:r.closed,isAdmin:admin,posts:r.posts.map(p=>({id:p.id,pinned:!!p.pinned,link:p.link||'',image:p.image?'/api/images/'+r.code+'/'+p.id:'',text:p.text,nick:p.nick,color:p.color,created:p.created,likes:p.likes.length,liked:p.likes.includes(u),mine:p.uid===u}))});
const broadcast=c=>{for(const s of streams)if(s.code===c){if(rooms[c])s.res.write('data: '+JSON.stringify(view(rooms[c],s.uid,isAdmin(s.req)))+'\n\n');else{s.res.write('event: deleted\ndata: {}\n\n');s.res.end()}}};
async function body(req){let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>410000)fail(413,'내용이 너무 깁니다.')}try{const d=JSON.parse(raw||'{}');if(!d||typeof d!=='object'||Array.isArray(d))fail(400,'잘못된 요청입니다.');return d}catch{fail(400,'잘못된 요청입니다.')}}
function clean(v,n,label){if(typeof v!=='string'||!v.trim()||v.trim().length>n)fail(400,label+': 1~'+n+'자로 입력하세요.');return v.trim()}
function password(v){if(typeof v!=='string'||!/^\d{4}$/.test(v))fail(400,'비밀번호는 숫자 4자리로 입력하세요.');return v}
export const server=http.createServer(async(req,res)=>{
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
try{
const url=new URL(req.url,'http://localhost');
if(!url.pathname.startsWith('/api/')){
const f=({'/':'index.html','/app.js':'app.js','/qrcode.js':'qrcode.js','/style.css':'style.css','/favicon.svg':'favicon.svg'})[url.pathname];if(!f)fail(404,'페이지가 없습니다.');
res.setHeader('Content-Type',f.endsWith('.html')?'text/html; charset=utf-8':f.endsWith('.css')?'text/css; charset=utf-8':f.endsWith('.svg')?'image/svg+xml':'text/javascript; charset=utf-8');
res.setHeader('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
res.end(readFileSync(path.join(root,'public',f)));return;
}
const photo=url.pathname.match(/^\/api\/images\/(\d{6})\/([a-f0-9]{16})$/);
if(photo&&req.method==='GET'){if(!rooms[photo[1]]?.posts.some(p=>p.id===photo[2]&&p.image))fail(404,'사진이 없습니다.');const file=path.join(imageDir,photo[2]+'.jpg');if(!existsSync(file))fail(404,'사진이 없습니다.');res.setHeader('Content-Type','image/jpeg');res.end(readFileSync(file));return}
let uid=cookie(req,'brick_uid');if(!/^[a-f0-9]{48,64}$/.test(uid||'')){uid=token();setCookie(res,req,'brick_uid',uid,31536000)}
if(req.method!=='GET'){
if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)fail(403,'허용되지 않은 요청입니다.');
const ip=req.socket.remoteAddress,now=Date.now();let r=rates.get(ip);if(!r||now-r.t>60000){r={t:now,n:0};rates.set(ip,r)}if(++r.n>300)fail(429,'잠시 후 다시 시도하세요.');
}
let result={ok:true};
if(url.pathname==='/api/share-addresses'&&req.method==='GET'){
const port=new URL('http://'+req.headers.host).port;
const addresses=local(req)?Object.entries(networkInterfaces()).filter(([name])=>!/vethernet|wsl|docker|vmware|virtualbox/i.test(name)).flatMap(([,items])=>items.filter(x=>x.family==='IPv4'&&!x.internal&&/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(x.address)).map(x=>'http://'+x.address+(port?':'+port:''))):[];
result={origins:[...new Set(addresses)]};
}else if(url.pathname==='/api/admin/status'&&req.method==='GET')result={authenticated:isAdmin(req),needsSetup:!account,setupAllowed:!account&&local(req)};
else if(url.pathname==='/api/admin/setup'&&req.method==='POST'){
if(account)fail(409,'관리자가 이미 설정되어 있습니다.');
if(!local(req))fail(403,'서버 PC의 localhost에서 최초 설정하세요.');
const b=await body(req),pw=password(b.password);if(account)fail(409,'관리자가 이미 설정되어 있습니다.');
const salt=token();account={salt,hash:scryptSync(pw,salt,64).toString('hex')};
writeFileSync(adminFile,JSON.stringify(account),{mode:0o600});signIn(req,res);
}else if(url.pathname==='/api/admin/login'&&req.method==='POST'){
if(!account)fail(409,'관리자 최초 설정이 필요합니다.');
const ip=req.socket.remoteAddress,now=Date.now();let a=attempts.get(ip);if(!a||now-a.t>900000){a={t:now,n:0};attempts.set(ip,a)}if(a.n>=5)fail(429,'로그인 시도가 많습니다. 15분 후 다시 시도하세요.');
const b=await body(req);a.n++;
const pw=typeof b.password==='string'&&/^\d{4}$/.test(b.password)?b.password:'';
if(!timingSafeEqual(scryptSync(pw,account.salt,64),Buffer.from(account.hash,'hex')))fail(401,'비밀번호가 일치하지 않습니다.');
attempts.delete(ip);signIn(req,res);
}else if(url.pathname==='/api/admin/logout'&&req.method==='POST'){
sessions.delete(cookie(req,'wall_admin'));setCookie(res,req,'wall_admin','',0);for(const c of Object.keys(rooms))broadcast(c);
}else if(url.pathname==='/api/admin/rooms'&&req.method==='GET'){
auth(req);result=Object.values(rooms).map(r=>({code:r.code,topic:r.topic,closed:r.closed,count:r.posts.length,created:r.created||0})).sort((a,b)=>b.created-a.created);
}else if(url.pathname==='/api/rooms'&&req.method==='POST'){
auth(req);const b=await body(req),topic=clean(b.topic,80,'보드 제목');
if(Object.keys(rooms).length>=1000)fail(503,'보드가 가득 찼습니다.');
let code;do{code=String(randomInt(100000,1000000))}while(rooms[code]);
rooms[code]={code,topic,closed:false,created:Date.now(),posts:[]};save();result={code};
}else{
const m=url.pathname.match(/^\/api\/rooms\/(\d{6})(?:\/(events|posts|like|manage|pin))?$/);if(!m)fail(404,'보드가 없습니다.');
const [,code,action]=m,r=rooms[code];if(!r)fail(404,'참여 코드를 확인하세요.');
if(action==='events'&&req.method==='GET'){
if(streams.size>=500)fail(503,'접속자가 많습니다. 잠시 후 다시 시도하세요.');
res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('data: '+JSON.stringify(view(r,uid,isAdmin(req)))+'\n\n');
const s={res,code,uid,req};streams.add(s);const timer=setInterval(()=>res.write(': keepalive\n\n'),20000);res.on('close',()=>{clearInterval(timer);streams.delete(s)});return;
}
if(!action&&req.method==='GET')result=view(r,uid,isAdmin(req));
else if(!action&&req.method==='DELETE'){auth(req);const photos=r.posts.filter(p=>p.image);delete rooms[code];save();for(const p of photos){const f=path.join(imageDir,p.id+'.jpg');if(existsSync(f))unlinkSync(f)}broadcast(code)}
else if(action==='posts'&&req.method==='POST'){
if(r.closed)fail(409,'작성이 마감되었습니다.');if(r.posts.length>=500)fail(409,'글은 최대 500개까지 등록할 수 있습니다.');
const b=await body(req),{text,link,image}=attachment(b),nick=typeof b.nick==='string'?b.nick.trim().slice(0,12):'';
const last=r.posts.findLast(p=>p.uid===uid);if(last&&Date.now()-last.created<2000)fail(429,'2초 후에 등록하세요.');
const id=token().slice(0,16);if(image)writeFileSync(path.join(imageDir,id+'.jpg'),Buffer.from(image.split(',')[1],'base64'));
r.posts.push({id,uid,text,link,image:!!image,pinned:false,nick:nick||'익명',color:Number.isInteger(b.color)&&b.color>=0&&b.color<5?b.color:0,created:Date.now(),likes:[]});save();broadcast(code);
}else if(action==='pin'&&req.method==='PATCH'){
auth(req);const b=await body(req),p=r.posts.find(p=>p.id===b.id);if(!p)fail(404,'삭제된 글입니다.');if(typeof b.pinned!=='boolean')fail(400,'고정 설정을 확인하세요.');p.pinned=b.pinned;save();broadcast(code);
}else if(action==='like'&&req.method==='POST'){
const b=await body(req),p=r.posts.find(p=>p.id===b.id);if(!p)fail(404,'삭제된 글입니다.');
p.likes=p.likes.includes(uid)?p.likes.filter(x=>x!==uid):[...p.likes,uid];save();broadcast(code);
}else if(action==='posts'&&req.method==='DELETE'){
const b=await body(req),p=r.posts.find(p=>p.id===b.id);if(!p)fail(404,'삭제된 글입니다.');if(p.uid!==uid)auth(req);
r.posts=r.posts.filter(x=>x.id!==p.id);save();if(p.image){const f=path.join(imageDir,p.id+'.jpg');if(existsSync(f))unlinkSync(f)}broadcast(code);
}else if(action==='manage'&&req.method==='PATCH'){
auth(req);const b=await body(req);if(typeof b.closed==='boolean')r.closed=b.closed;if(b.topic!==undefined)r.topic=clean(b.topic,80,'보드 제목');save();broadcast(code);
}else fail(405,'지원하지 않는 요청입니다.');
}
res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(result));
}catch(e){res.statusCode=e.status||500;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({error:e.status?e.message:'처리하지 못했습니다. 다시 시도하세요.'}));if(!e.status)console.error(e)}
});
server.requestTimeout=15000;server.headersTimeout=10000;
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT)||4317;server.listen(port,'0.0.0.0',()=>console.log('레고학교 담벼락 http://localhost:'+port))}
