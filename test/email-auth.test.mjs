import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const temp=mkdtempSync(path.join(tmpdir(),'tennis-email-'));
process.env.DB_PATH=path.join(temp,'test.sqlite');process.env.BOT_TOKEN='123:test';process.env.RESEND_API_KEY='test-only';process.env.EMAIL_FROM='Tennis GO <test@example.com>';
const originalFetch=globalThis.fetch,mails=[];let mailError=false;
globalThis.fetch=async(url,options)=>{if(String(url)==='https://api.resend.com/emails'){mails.push(JSON.parse(options.body));return new Response('{}',{status:mailError?503:200});}return originalFetch(url,options);};
const {server,db}=await import('../server.mjs');await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
async function api(route,method='GET',body,headers={}){const r=await fetch(base+'/api'+route,{method,headers:{origin:base,'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookies:r.headers.getSetCookie()};}
const cookie=(r,name)=>r.cookies.find(x=>x.startsWith(name+'='))?.split(';')[0];
async function request(email,purpose='register'){const r=await api('/web-auth/email/request','POST',{email,purpose});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.code,undefined);return {cookie:cookie(r,'tg_email_pending'),code:mails.at(-1).text.match(/Ваш код: (\d{6})/)[1]};}
async function verify(c,password='long-password-123'){return api('/web-auth/email/verify','POST',{code:c.code,password},{cookie:c.cookie});}
let player,playerHeaders;
try{
 await test('email proof is required, browser bound, single use and does not expose code',async()=>{
  const c=await request('Player@Example.com');assert.equal(db.prepare('SELECT COUNT(*) n FROM web_emails').get().n,0);
  assert.equal((await api('/web-auth/email/verify','POST',{code:c.code,password:'long-password-123'})).status,400);
  assert.equal((await verify({...c,code:'000000'})).status,400);
  const r=await verify(c);assert.equal(r.status,200,JSON.stringify(r.data));playerHeaders={cookie:cookie(r,'tg_web'),'x-web-csrf':r.data.csrf};
  player=(await api('/me','GET',undefined,playerHeaders)).data.user;assert.match(player.id,/^web-/);assert.equal(player.email,'player@example.com');assert.equal(player.registered,0);
  assert.equal((await verify(c)).status,400);assert.equal((await api('/web-auth/login','POST',{login:'PLAYER@example.com',password:'long-password-123'})).status,200);
 });
 await test('all three website roles can register without Telegram and retain common permissions',async()=>{
  const payload={name:'Иван Петров',role:'player',gender:'male',playingYears:1,ntrpLevel:3,city:'Краснодар',phone:'+79990000000',telegramContact:'',photoData:null,avatarId:'male-cap'};
  assert.equal((await api('/profile','POST',payload,playerHeaders)).status,200);
  for(const role of ['coach','club']){
   const c=await request(role+'@example.com'),v=await verify(c),h={cookie:cookie(v,'tg_web'),'x-web-csrf':v.data.csrf};assert.equal(v.status,200);
   const p=role==='coach'?{...payload,role,coachYears:3,coachSports:['tennis'],coachCourts:[]}:{role,name:'Иван Петров',city:'Краснодар',clubName:'Тест клуб',clubAddress:'Улица 1',clubPhone:'+79990000000',clubSports:['tennis'],clubPhotoData:'data:image/jpeg;base64,/9j/2Q==',clubSurface:'hard',opensAt:'08:00',closesAt:'22:00',hourlyPrice:1000};
   const r=await api('/profile','POST',p,h);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.user.role,role);if(role==='club')assert.equal(r.data.user.club.status,'pending');
   assert.equal((await api('/me','GET',undefined,h)).data.user.email,role+'@example.com');
  }
  assert.equal(db.prepare("SELECT COUNT(*) n FROM bot_outbox WHERE user_id LIKE 'web-%'").get().n,0);
 });
 await test('recovery requires email proof and revokes old sessions; signup cannot overwrite an account',async()=>{
  db.prepare('UPDATE email_challenges SET created_at=created_at-61000').run();
  const duplicate=await request('player@example.com');assert.equal((await verify(duplicate,'attacker-password')).status,409);
  assert.equal((await api('/web-auth/login','POST',{login:'player@example.com',password:'long-password-123'})).status,200);
  db.prepare('UPDATE email_challenges SET created_at=created_at-61000').run();
  const c=await request('player@example.com','reset'),r=await verify(c,'new-long-password-456');assert.equal(r.status,200);
  assert.equal((await api('/me','GET',undefined,playerHeaders)).status,401);
  assert.equal((await api('/web-auth/login','POST',{login:'player@example.com',password:'long-password-123'})).status,401);
  const next=await api('/web-auth/login','POST',{login:'player@example.com',password:'new-long-password-456'});assert.equal(next.status,200);
  assert.equal((await api('/me','GET',undefined,{cookie:cookie(next,'tg_web')})).data.user.id,player.id);
 });
 await test('wrong code budget, expiry, resend cooldown and delivery errors fail closed',async()=>{
  const c=await request('limited@example.com');assert.equal((await api('/web-auth/email/request','POST',{email:'limited@example.com'})).status,429);
  for(let i=0;i<5;i++)assert.equal((await verify({...c,code:'000000'})).status,400);
  assert.equal((await verify(c)).status,400);
  // Isolate per-IP send budget to exercise independent failure modes.
  db.prepare('DELETE FROM web_auth_limits').run();
  const expired=await request('expired@example.com');db.prepare("UPDATE email_challenges SET expires_at=0 WHERE email='expired@example.com'").run();assert.equal((await verify(expired)).status,400);
  mailError=true;assert.equal((await api('/web-auth/email/request','POST',{email:'failed@example.com'})).status,503);assert.equal(db.prepare("SELECT COUNT(*) n FROM web_emails WHERE email='failed@example.com'").get().n,0);
  assert.equal((await api('/web-auth/email/request','POST',{email:'x@example.com'},{origin:'https://evil.example'})).status,403);
 });
}finally{await new Promise(r=>server.close(r));db.close();globalThis.fetch=originalFetch;rmSync(temp,{recursive:true,force:true});}
