import {test} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'tennis-web-'));
process.env.DB_PATH=path.join(dir,'test.sqlite');process.env.BOT_TOKEN='123456:test-token';process.env.BOT_USERNAME='TennisGOgo_bot';
const {server,db,webAuth}=await import('../server.mjs');
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,uid='123456789';
db.prepare('INSERT INTO users(id,name,username,created_at,role,registration_version,ntrp_level) VALUES(?,?,?,?,?,2,3)').run(uid,'Игрок','player',new Date().toISOString(),'player');
function tma(){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(uid),first_name:'Игрок',username:'player'})});const secret=crypto.createHmac('sha256','WebAppData').update(process.env.BOT_TOKEN).digest();p.set('hash',crypto.createHmac('sha256',secret).update([...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n')).digest('hex'));return 'tma '+p;}
async function api(route,method='GET',payload,headers={}){const res=await fetch(base+'/api'+route,{method,headers:{origin:base,'content-type':'application/json',...headers},body:payload===undefined?undefined:JSON.stringify(payload)});return {status:res.status,data:await res.json(),cookies:res.headers.getSetCookie()};}
function cookie(result,name){return result.cookies.find(x=>x.startsWith(name+'='))?.split(';')[0];}
let browser,csrf;
try{
 await test('website Telegram approval binds browser to existing account and resists replay',async()=>{
  assert.equal((await api('/me','GET',undefined,{'x-demo-user':uid})).status,401);
  const challenge=await api('/web-auth/challenge','POST',{});assert.equal(challenge.status,200);assert.match(challenge.data.code,/^\d{6}$/);
  const pending=cookie(challenge,'tg_web_pending'),id=new URL(challenge.data.url).searchParams.get('start').slice(4);
  assert.equal((await api('/web-auth/poll','POST',{id})).status,401);
  assert.equal((await api('/web-auth/poll','POST',{}, {cookie:pending})).data.authenticated,false);
  const calls=[],send=async(method,data)=>{calls.push({method,data});return {};};
  await webAuth.bot({message:{text:'/start web_'+id,chat:{id:Number(uid),type:'private'},from:{id:Number(uid),first_name:'Игрок',username:'player'}}},send);
  assert.ok(calls.some(x=>x.data.text?.includes(challenge.data.code)));
  const callback=id2=>({callback_query:{id:'cb',data:'webok:'+id,from:{id:id2,first_name:'Игрок',username:'player'},message:{message_id:1,chat:{id:id2,type:'private'}}}});
  await webAuth.bot(callback(99999),send);assert.equal(db.prepare('SELECT status FROM web_challenges WHERE id=?').get(id).status,'pending');
  await webAuth.bot(callback(Number(uid)),send);
  const auth=await api('/web-auth/poll','POST',{}, {cookie:pending});assert.equal(auth.data.authenticated,true);browser=cookie(auth,'tg_web');csrf=auth.data.csrf;
  assert.match(auth.cookies.join(' '),/HttpOnly; SameSite=Lax/);assert.match(auth.cookies.join(' '),/Secure/);
  assert.equal((await api('/web-auth/poll','POST',{}, {cookie:pending})).status,401);
  assert.equal((await api('/me','GET',undefined,{cookie:browser})).data.user.id,uid);
  assert.equal((await api('/me','GET',undefined,{authorization:tma()})).data.user.id,uid);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM users WHERE id=?').get(uid).n,1);
 });
 await test('website and mini app share changes, sync revision and CSRF protections',async()=>{
  const h={cookie:browser,'x-web-csrf':csrf};
  assert.equal((await api('/preferences/sports','PATCH',{sports:['tennis']},{cookie:browser})).status,403);
  assert.equal((await api('/preferences/sports','PATCH',{sports:['tennis']},{...h,origin:'https://evil.example'})).status,403);
  const before=(await api('/sync','GET',undefined,h)).data.revision;
  assert.equal((await api('/preferences/sports','PATCH',{sports:['tennis']},h)).status,200);
  assert.deepEqual((await api('/me','GET',undefined,{authorization:tma()})).data.user.preferredSports,['tennis']);
  const after=(await api('/sync','GET',undefined,h)).data.revision;assert.ok(after>before);
  assert.equal((await api('/sync','GET',undefined,h)).data.revision,after);
  assert.ok(db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='sync_reward_ledger_INSERT'").get());
 });
 await test('password login, reset and logout revoke sessions without duplicating profiles',async()=>{
  const saved=await api('/web-auth/password','POST',{login:'tennisplayer',password:'a-long-password-123'},{cookie:browser,'x-web-csrf':csrf});assert.equal(saved.status,200);
  assert.equal((await api('/me','GET',undefined,{cookie:browser})).status,401);
  browser=cookie(saved,'tg_web');csrf=saved.data.csrf;
  assert.equal((await api('/web-auth/login','POST',{login:'tennisplayer',password:'wrong'})).status,401);
  const login=await api('/web-auth/login','POST',{login:'tennisplayer',password:'a-long-password-123'});assert.equal(login.status,200);
  assert.equal((await api('/me','GET',undefined,{cookie:cookie(login,'tg_web')})).data.user.id,uid);
  assert.equal((await api('/web-auth/password','POST',{login:'tennisplayer',password:'another-password-123'},{cookie:browser,'x-web-csrf':csrf})).status,403);
  assert.equal((await api('/web-auth/password','POST',{login:'tennisplayer',password:'another-password-123'},{authorization:tma()})).status,200);
  assert.equal((await api('/me','GET',undefined,{cookie:browser})).status,401);
  const fresh=await api('/web-auth/login','POST',{login:'tennisplayer',password:'another-password-123'});browser=cookie(fresh,'tg_web');csrf=fresh.data.csrf;
  assert.equal((await api('/web-auth/logout','POST',{}, {cookie:browser,'x-web-csrf':csrf})).status,200);
  assert.equal((await api('/me','GET',undefined,{cookie:browser})).status,401);
 });
 await test('expired challenges and blocked accounts cannot sign in',async()=>{
  const challenge=await api('/web-auth/challenge','POST',{});db.prepare('UPDATE web_challenges SET expires_at=0').run();
  assert.equal((await api('/web-auth/poll','POST',{}, {cookie:cookie(challenge,'tg_web_pending')})).status,401);
  db.prepare('UPDATE users SET blocked_at=? WHERE id=?').run(new Date().toISOString(),uid);
  assert.equal((await api('/web-auth/login','POST',{login:'tennisplayer',password:'another-password-123'})).status,403);
 });
}finally{await new Promise(r=>server.close(r));db.close();rmSync(dir,{recursive:true,force:true});}
