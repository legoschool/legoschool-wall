import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {scryptSync,randomBytes} from 'node:crypto';
import worker from '../dist/server/index.js';
test('cloud storage, authorization and atomic room updates',async()=>{
const sqlite=new DatabaseSync(':memory:');for(const f of readdirSync('drizzle').filter(x=>x.endsWith('.sql')))sqlite.exec(readFileSync('drizzle/'+f,'utf8'));
const DB={prepare(sql){let args=[];return {bind(...v){args=v;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}}},async batch(q){return Promise.all(q.map(x=>x.run()))}};
const salt=randomBytes(24).toString('hex');const env={DB,ADMIN_CREDENTIAL:JSON.stringify({salt,hash:scryptSync('0427',salt,64).toString('hex')})},ctx={waitUntil(p){p.catch(()=>{})}};
async function request(p,method='GET',data,cookie=''){const r=await worker.fetch(new Request('https://wall.test/api'+p,{method,headers:{cookie,'Content-Type':'application/json',Origin:'https://wall.test'},...(data?{body:JSON.stringify(data)}:{})}),env,ctx);return {status:r.status,data:await r.json(),cookie:r.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ')}}
assert.equal((await request('/rooms','POST',{topic:'denied'})).status,403);
const login=await request('/admin/login','POST',{password:'0427'});assert.equal(login.status,200);
const created=await request('/rooms','POST',{topic:'cloud board'},login.cookie);assert.equal(created.status,200);const c=created.data.code;
const guest=await request('/rooms/'+c);assert.equal(guest.data.isAdmin,false);assert.equal(guest.data.pollInterval,2000);
assert.equal((await request('/rooms/'+c+'/posts','POST',{text:'persisted',nick:'user'},guest.cookie)).status,200);
const room=await request('/rooms/'+c);const id=room.data.posts[0].id;
await request('/rooms/'+c+'/like','POST',{id},login.cookie);assert.equal((await request('/rooms/'+c)).data.posts[0].likes,1);
assert.equal((await request('/rooms/'+c+'/manage','PATCH',{closed:true},guest.cookie)).status,403);
await request('/rooms/'+c+'/manage','PATCH',{closed:true},login.cookie);
assert.equal((await request('/rooms/'+c+'/posts','POST',{text:'closed'},guest.cookie)).status,409);
assert.equal((await request('/admin/rooms','GET',null,login.cookie)).data.length,1);
assert.equal((await request('/admin/import','POST',[],login.cookie)).status,403);
await request('/admin/logout','POST',{},login.cookie);assert.equal((await request('/rooms/'+c,'DELETE',{},login.cookie)).status,403);
const login2=await request('/admin/login','POST',{password:'0427'});await request('/rooms/'+c,'DELETE',{},login2.cookie);assert.equal((await request('/rooms/'+c)).status,404);
sqlite.close();
});
