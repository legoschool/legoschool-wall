import {attachment} from './attachments.mjs';
import {scryptSync,timingSafeEqual,randomBytes,createHash} from 'node:crypto';
import {assets} from './assets.mjs';
const token=()=>randomBytes(32).toString('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const hash=t=>createHash('sha256').update(t).digest('hex');
const ck=(req,name)=>(req.headers.get('cookie')||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
const clean=(v,n,label)=>{if(typeof v!=='string'||!v.trim()||v.trim().length>n)fail(400,label+': 1~'+n+'자로 입력하세요.');return v.trim()};
function query(env,sql,...args){return env.DB.prepare(sql).bind(...args)}
async function authenticated(req,env){const t=ck(req,'wall_admin');if(!t)return false;return !!await query(env,'SELECT id FROM sessions WHERE id=? AND expires>?',hash(t),Date.now()).first()}
async function requireAdmin(req,env){if(!await authenticated(req,env))fail(403,'관리자 로그인이 필요합니다.')}
async function rate(env,key,max,ms){const now=Date.now();const row=await query(env,'INSERT INTO rates (id,count,reset) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=CASE WHEN reset<=? THEN 1 ELSE count+1 END, reset=CASE WHEN reset<=? THEN excluded.reset ELSE reset END RETURNING count',key,now+ms,now,now).first();if(row.count>max)fail(429,'잠시 후 다시 시도하세요.')}
async function readBody(req){if(Number(req.headers.get('content-length'))>410000)fail(413,'내용이 너무 깁니다.');const raw=await req.text();if(raw.length>410000)fail(413,'내용이 너무 깁니다.');try{const d=JSON.parse(raw);if(!d||typeof d!=='object')fail(400,'잘못된 요청입니다.');return d}catch{fail(400,'잘못된 요청입니다.')}}
async function getRoom(env,code){const row=await query(env,'SELECT data,version FROM rooms WHERE code=?',code).first();if(!row)fail(404,'삭제되었거나 없는 보드입니다.');return {room:JSON.parse(row.data),version:row.version}}
async function change(env,code,fn){for(let i=0;i<6;i++){const {room,version}=await getRoom(env,code);await fn(room);const r=await query(env,'UPDATE rooms SET data=?,version=version+1 WHERE code=? AND version=?',JSON.stringify(room),code,version).run();if(r.meta.changes)return}fail(409,'다시 시도하세요.')}
function view(r,uid,admin){return {code:r.code,topic:r.topic,closed:r.closed,isAdmin:admin,pollInterval:2000,posts:r.posts.map(p=>({id:p.id,pinned:!!p.pinned,link:p.link||'',image:p.image?'/api/images/'+r.code+'/'+p.id:'',text:p.text,nick:p.nick,color:p.color,created:p.created,likes:p.likes.length,liked:p.likes.includes(uid),mine:p.uid===uid}))}}
export default {async fetch(req,env,ctx){
const url=new URL(req.url),headers=new Headers({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});
const cookie=(name,value,age)=>headers.append('Set-Cookie',name+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+age);
const json=(value,status=200)=>{headers.set('Content-Type','application/json; charset=utf-8');return new Response(JSON.stringify(value),{status,headers})};
try{
if(!url.pathname.startsWith('/api/')){const a=assets[url.pathname];if(!a)return new Response('Not found',{status:404});headers.set('Content-Type',a.type);headers.set('Content-Security-Policy',"default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");return new Response(a.body,{headers})}
if(!env.DB)fail(503,'저장소 연결을 확인하세요.');
const photo=url.pathname.match(/^\/api\/images\/(\d{6})\/([a-f0-9]{16})$/);
if(photo&&req.method==='GET'){const {room}=await getRoom(env,photo[1]);if(!room.posts.some(p=>p.id===photo[2]&&p.image))fail(404,'사진이 없습니다.');const row=await query(env,'SELECT data FROM images WHERE id=? AND code=?',photo[2],photo[1]).first();if(!row)fail(404,'사진이 없습니다.');headers.set('Content-Type','image/jpeg');return new Response(Buffer.from(row.data.split(',')[1],'base64'),{headers})}
let uid=ck(req,'brick_uid');if(!/^[a-f0-9]{48,64}$/.test(uid||'')){uid=token();cookie('brick_uid',uid,31536000)}
if(req.method!=='GET'){if(req.headers.get('origin')&&req.headers.get('origin')!==url.origin)fail(403,'허용되지 않은 요청입니다.');await rate(env,'write:'+hash(req.headers.get('cf-connecting-ip')||'unknown'),300,60000)}
const admin=()=>authenticated(req,env);
if(url.pathname==='/api/share-addresses')return json({origins:[url.origin]});
if(url.pathname==='/api/admin/status')return json({authenticated:await admin(),needsSetup:!env.ADMIN_CREDENTIAL,setupAllowed:false});
if(url.pathname==='/api/admin/setup')fail(403,'배포 관리자 설정이 필요합니다.');
if(url.pathname==='/api/admin/login'&&req.method==='POST'){
if(!env.ADMIN_CREDENTIAL)fail(503,'관리자 설정이 없습니다.');
const b=await readBody(req);const account=JSON.parse(env.ADMIN_CREDENTIAL);
await rate(env,'login:'+hash(req.headers.get('cf-connecting-ip')||'unknown'),5,900000);
await rate(env,'login:global',20,900000);
const pw=typeof b.password==='string'&&/^\d{4}$/.test(b.password)?b.password:'';
if(!timingSafeEqual(scryptSync(pw,account.salt,64),Buffer.from(account.hash,'hex')))fail(401,'비밀번호가 일치하지 않습니다.');
const t=token();await query(env,'INSERT INTO sessions(id,expires) VALUES (?,?)',hash(t),Date.now()+28800000).run();cookie('wall_admin',t,28800);
await query(env,'DELETE FROM rates WHERE id=? OR id=?','login:'+hash(req.headers.get('cf-connecting-ip')||'unknown'),'login:global').run();
ctx.waitUntil(env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires<'+Date.now()),env.DB.prepare('DELETE FROM rates WHERE reset<'+Date.now())]));
return json({ok:true});
}
if(url.pathname==='/api/admin/logout'&&req.method==='POST'){await query(env,'DELETE FROM sessions WHERE id=?',hash(ck(req,'wall_admin')||'')).run();cookie('wall_admin','',0);return json({ok:true})}
if(url.pathname==='/api/admin/rooms'&&req.method==='GET'){await requireAdmin(req,env);const rows=await query(env,'SELECT data FROM rooms ORDER BY created DESC').all();return json(rows.results.map(x=>{const r=JSON.parse(x.data);return {code:r.code,topic:r.topic,closed:r.closed,count:r.posts.length,created:r.created}}))}
if(url.pathname==='/api/admin/import'&&req.method==='POST'){
// A short-lived deployment secret enables an explicit one-time data transfer; never shipped with a default.
const supplied=req.headers.get('x-import-token')||'';
if(!env.IMPORT_TOKEN||supplied.length!==env.IMPORT_TOKEN.length||!timingSafeEqual(Buffer.from(supplied),Buffer.from(env.IMPORT_TOKEN)))fail(403,'허용되지 않은 요청입니다.');
const raw=await req.text();if(raw.length>2000000)fail(413,'데이터가 너무 큽니다.');const list=JSON.parse(raw);if(!Array.isArray(list)||list.length>1000)fail(400,'잘못된 데이터입니다.');
for(const r of list){if(!/^\d{6}$/.test(r.code)||!Array.isArray(r.posts)||typeof r.topic!=='string')fail(400,'잘못된 보드입니다.');delete r.key;await query(env,'INSERT INTO rooms(code,data,version,created) VALUES (?,?,0,?) ON CONFLICT(code) DO NOTHING',r.code,JSON.stringify(r),r.created||Date.now()).run()}
return json({imported:list.length});
}
if(url.pathname==='/api/rooms'&&req.method==='POST'){await requireAdmin(req,env);const b=await readBody(req),topic=clean(b.topic,80,'보드 제목');const count=await query(env,'SELECT COUNT(*) AS n FROM rooms').first();if(count.n>=1000)fail(409,'보드가 가득 찼습니다.');for(let i=0;i<10;i++){const code=String(100000+crypto.getRandomValues(new Uint32Array(1))[0]%900000),r={code,topic,closed:false,created:Date.now(),posts:[]};const inserted=await query(env,'INSERT INTO rooms(code,data,version,created) VALUES (?,?,0,?) ON CONFLICT(code) DO NOTHING',code,JSON.stringify(r),r.created).run();if(inserted.meta.changes)return json({code})}fail(503,'다시 시도하세요.')}
const m=url.pathname.match(/^\/api\/rooms\/(\d{6})(?:\/(posts|like|manage|pin))?$/);if(!m)fail(404,'페이지가 없습니다.');
const [,code,action]=m;
if(!action&&req.method==='GET'){const {room}=await getRoom(env,code);return json(view(room,uid,await admin()))}
if(!action&&req.method==='DELETE'){await requireAdmin(req,env);await query(env,'DELETE FROM rooms WHERE code=?',code).run();await query(env,'DELETE FROM images WHERE code=?',code).run();return json({ok:true})}
const b=await readBody(req);
if(action==='manage'&&req.method==='PATCH'){await requireAdmin(req,env);await change(env,code,r=>{if(typeof b.closed==='boolean')r.closed=b.closed;if(b.topic!==undefined)r.topic=clean(b.topic,80,'보드 제목')})}
else if(action==='pin'&&req.method==='PATCH'){await requireAdmin(req,env);if(typeof b.pinned!=='boolean')fail(400,'고정 설정을 확인하세요.');await change(env,code,r=>{const p=r.posts.find(p=>p.id===b.id);if(!p)fail(404,'삭제된 글입니다.');p.pinned=b.pinned})}
else if(action==='posts'&&req.method==='POST'){const {text,link,image}=attachment(b),nick=typeof b.nick==='string'?b.nick.trim().slice(0,12):'',id=token().slice(0,16);
const validate=r=>{if(r.closed)fail(409,'작성이 마감되었습니다.');if(r.posts.length>=500)fail(409,'글은 최대 500개까지 등록할 수 있습니다.');const last=r.posts.findLast(p=>p.uid===uid);if(last&&Date.now()-last.created<2000)fail(429,'2초 후에 등록하세요.')};validate((await getRoom(env,code)).room);
try{if(image)await query(env,'INSERT INTO images(id,code,data) VALUES (?,?,?)',id,code,image).run();await change(env,code,r=>{validate(r);r.posts.push({id,uid,text,link,image:!!image,pinned:false,nick:nick||'익명',color:Number.isInteger(b.color)&&b.color>=0&&b.color<5?b.color:0,created:Date.now(),likes:[]})})}catch(e){if(image)await query(env,'DELETE FROM images WHERE id=?',id).run();throw e}}
else if(action==='like'&&req.method==='POST'){await change(env,code,r=>{const p=r.posts.find(p=>p.id===b.id);if(!p)fail(404,'삭제된 글입니다.');p.likes=p.likes.includes(uid)?p.likes.filter(x=>x!==uid):[...p.likes,uid]})}
else if(action==='posts'&&req.method==='DELETE'){const isAdmin=await admin();await change(env,code,r=>{const p=r.posts.find(p=>p.id===b.id);if(!p)fail(404,'삭제된 글입니다.');if(p.uid!==uid&&!isAdmin)fail(403,'관리자 로그인이 필요합니다.');r.posts=r.posts.filter(x=>x.id!==p.id)});await query(env,'DELETE FROM images WHERE id=? AND code=?',b.id,code).run()}
else fail(405,'지원하지 않는 요청입니다.');
return json({ok:true});
}catch(e){return json({error:e.status?e.message:'처리하지 못했습니다. 다시 시도하세요.'},e.status||500)}
}};
