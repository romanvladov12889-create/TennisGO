import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {rangeFor,bookingStats,dateKey} from '../public/club-time.js';
import {createClubs} from '../clubs.mjs';
const temp=mkdtempSync(path.join(tmpdir(),'tennis-clubs-'));
process.env.DB_PATH=path.join(temp,'test.sqlite');delete process.env.BOT_TOKEN;process.env.ADMIN_DEMO_USER_ID='demo-club-platform';
const {db,server,handleBotUpdate,sendNextBotMessage}=await import('../server.mjs');
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const owner='demo-club-owner',player='demo-club-player',other='demo-club-other',admin=process.env.ADMIN_DEMO_USER_ID;
for(const [id,role] of [[owner,'club'],[player,'player'],[other,'player'],[admin,'player']])db.prepare('INSERT INTO users(id,name,display_name,created_at,role,registration_version,phone) VALUES(?,?,?,?,?,2,?)').run(id,'Клиент Тест',id,new Date().toISOString(),role,'+79000000000');
const photo='data:image/jpeg;base64,'+readFileSync(new URL('../public/assets/court-hard-outdoor.jpg',import.meta.url)).toString('base64');
// This stock asset can be >250 KB; use valid tiny JPEG markers for protocol validation tests.
const tiny='data:image/jpeg;base64,/9j/2Q==';
const profile={role:'club',name:'Администратор',clubName:'Тестовый клуб',clubAddress:'Адрес клуба',city:'Краснодар',clubPhone:'+79000000000',clubSports:['tennis','padel'],clubSurface:'hard',courtType:'outdoor',opensAt:'08:00',closesAt:'23:00',hourlyPrice:1500,clubPhotos:[tiny,tiny]};
const day=dateKey(Date.now()+2*86400000),start=day+'T10:00:00+03:00';
const payload={clubId:owner,startsAt:start,duration:60,sport:'tennis',guestName:'Иван Иванов',guestPhone:'+79000000000'};
async function api(route,who=owner,method='GET',body){const r=await fetch(base+'/api'+route,{method,headers:{'x-demo-user':who,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
try{
 await test('calendar boundaries and clipped duration analytics use Moscow and confirmed bookings only',()=>{
  assert.equal(rangeFor('2027-01-01','week').first,'2026-12-28');assert.equal(rangeFor('2028-02-15','month').days.length,29);assert.throws(()=>rangeFor('2026-02-31'));assert.throws(()=>rangeFor('2026-10-07','year'));
  const rows=[{startsAt:'2026-10-06T23:30:00+03:00',duration:90,status:'confirmed',source:'app'},{startsAt:'2026-10-07T12:00:00+03:00',duration:90,status:'confirmed',source:'admin'},{startsAt:'2026-10-07T14:00:00+03:00',duration:60,status:'pending',source:'app'},{startsAt:'2026-10-07T16:00:00+03:00',duration:60,status:'cancelled',source:'admin'}];
  const stats=bookingStats(rows,rangeFor('2026-10-07'));assert.equal(stats.app,1);assert.equal(stats.admin,1.5);assert.equal(stats.total,2.5);
 });
 await test('legacy clubs and confirmed/cancelled reservations migrate idempotently',()=>{
  const old=new DatabaseSync(':memory:');old.exec(`CREATE TABLE clubs(owner_id TEXT,photo_data TEXT);CREATE TABLE court_reservations(id TEXT,club_id TEXT,starts_at TEXT,cancelled_at TEXT);INSERT INTO clubs VALUES('a','oldphoto');INSERT INTO court_reservations VALUES('b','a','2026-01-01',NULL),('c','a','2026-01-02','2026-01-02');`);const create=()=>createClubs({db:old,fail:(s,m)=>{throw Error(m)},notifyUser(){},audit(){},now:()=>new Date().toISOString(),isAdmin:()=>false});create();create();assert.equal(old.prepare('SELECT photos_json FROM clubs').get().photos_json,'["oldphoto"]');assert.deepEqual(old.prepare('SELECT status FROM court_reservations ORDER BY id').all().map(r=>r.status),['confirmed','cancelled']);old.close();
 });
 await test('club registration persists court type and photos; invalid types/photos/time rejected',async()=>{
  for(const override of [{courtType:'roof'},{clubPhotos:[]},{clubPhotos:Array(7).fill(tiny)},{clubPhotos:['bad']},{opensAt:'08:00 AM'},{closesAt:'07:00'}])assert.equal((await api('/profile',owner,'POST',{...profile,...override})).status,400);
  const r=await api('/profile',owner,'POST',profile);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.user.club.courtType,'outdoor');assert.equal(r.data.user.club.photos.length,2);
  assert.equal((await api('/court-bookings',player,'POST',payload)).status,409);
  assert.equal((await api('/admin/clubs/'+owner+'/approve',admin,'POST')).status,200);
  const club=(await api('/catalog',player)).data.courts.find(c=>c.clubId===owner);assert.equal(club.photos.length,2);assert.equal(club.courtType,'Открытый');
 });
 let first,overlap;
 await test('requests stay pending, notify owner, and public availability hides personal data',async()=>{
  const r=await api('/court-bookings',player,'POST',payload);assert.equal(r.status,201,JSON.stringify(r.data));first=r.data.booking.id;assert.equal(r.data.booking.status,'pending');assert.equal((await api('/court-bookings',player,'POST',payload)).status,409);
  overlap=(await api('/court-bookings',other,'POST',payload)).data.booking.id;
  const available=(await api('/clubs/'+owner+'/availability?date='+day,player)).data;assert.deepEqual(available.busy,[]);assert.ok(!JSON.stringify(available).includes('Иван Иванов'));
  const n=await api('/notifications',owner);assert.equal(n.status,200);assert.ok(n.data.items.some(n=>n.link==='clubbooking_'+first));
  assert.equal((await api('/notifications/read',owner,'POST')).status,200);
 });
 await test('only owner/platform admin can confirm; overlap prevention is atomic and idempotent',async()=>{
  assert.equal((await api('/club/calendar?clubId='+owner,other)).status,403);
  assert.equal((await api('/club/bookings/'+first+'/confirm',other,'POST',{clubId:owner})).status,403);
  const result=await api('/club/bookings/'+first+'/confirm',owner,'POST');assert.equal(result.status,200,JSON.stringify(result.data));assert.equal((await api('/club/bookings/'+first+'/confirm',owner,'POST')).status,200);
  assert.equal(db.prepare('SELECT status FROM court_reservations WHERE id=?').get(overlap).status,'rejected');
  assert.equal((await api('/club/bookings',owner,'POST',payload)).status,409);
  assert.equal((await api('/court-bookings',other,'POST',{...payload,startsAt:day+'T10:30:00+03:00'})).status,409);
  assert.equal((await api('/clubs/'+owner+'/availability?date='+day,player)).data.busy.length,1);
 });
 let manual;
 await test('manual client booking, administrator access, all calendar periods and source analytics',async()=>{
  const r=await api('/club/bookings',admin,'POST',{...payload,startsAt:day+'T11:00:00+03:00',duration:90});assert.equal(r.status,201,JSON.stringify(r.data));manual=r.data.booking.id;assert.equal(r.data.booking.source,'admin');assert.equal(r.data.booking.status,'confirmed');
  for(const view of ['day','week','month']){const cal=await api('/club/calendar?clubId='+owner+'&date='+day+'&view='+view,admin);assert.equal(cal.status,200);assert.equal(cal.data.reservations.length,3);const stats=bookingStats(cal.data.reservations,rangeFor(day,view));assert.equal(stats.total,2.5);assert.equal(stats.app,1);assert.equal(stats.admin,1.5);}
  assert.equal((await api('/club/bookings',player,'POST',{...payload,startsAt:day+'T15:00:00+03:00'})).status,403);
  for(const b of [{duration:45},{startsAt:day+'T07:30:00+03:00'},{startsAt:day+'T22:30:00+03:00'},{startsAt:'2020-01-01T10:00:00Z'},{guestPhone:'bad'}])assert.equal((await api('/club/bookings',owner,'POST',{...payload,...b})).status,400);
 });
 await test('cancellation frees slots and excludes cancelled hours; non-owner cannot cancel',async()=>{
  assert.equal((await api('/court-bookings/'+first,other,'DELETE')).status,404);
  assert.equal((await api('/court-bookings/'+first,player,'DELETE')).status,200);
  assert.equal((await api('/club/bookings/'+manual+'/cancel',owner,'POST')).status,200);
  const cal=(await api('/club/calendar?date='+day)).data;assert.equal(bookingStats(cal.reservations,rangeFor(day)).total,0);assert.equal((await api('/clubs/'+owner+'/availability?date='+day,player)).data.busy.length,0);
 });
 await test('concurrent overlapping requests can never produce two confirmed bookings',async()=>{
  const made=await Promise.all([player,other].map(w=>api('/court-bookings',w,'POST',{...payload,startsAt:day+'T16:00:00+03:00'})));assert.ok(made.every(r=>r.status===201));await Promise.all(made.map(r=>api('/club/bookings/'+r.data.booking.id+'/confirm',owner,'POST')));assert.equal(db.prepare("SELECT COUNT(*) AS n FROM court_reservations WHERE club_id=? AND status='confirmed' AND starts_at=?").get(owner,new Date(day+'T16:00:00+03:00').toISOString()).n,1);
 });
 await test('Telegram link is single-use and enqueues notifications with no live Telegram traffic',async()=>{
  process.env.BOT_TOKEN='test-token';process.env.BOT_USERNAME='test_bot';process.env.APP_URL='https://example.invalid';
  const fakeToken='a'.repeat(48),hash=crypto.createHash('sha256').update(fakeToken).digest('hex');db.prepare('INSERT INTO club_bot_tokens VALUES(?,?,?)').run(hash,owner,new Date(Date.now()+60000).toISOString());
  const realFetch=globalThis.fetch,calls=[];globalThis.fetch=async(url,opts)=>{if(String(url).startsWith('https://api.telegram.org/')){calls.push(JSON.parse(opts.body));return {ok:true,status:200,json:async()=>({ok:true,result:{message_id:1}})};}return realFetch(url,opts);};
  try{await handleBotUpdate({message:{text:'/start clubnotify_'+fakeToken,chat:{id:987654,type:'private'},from:{id:987654}}});assert.equal(db.prepare('SELECT chat_id FROM club_bot_links WHERE user_id=?').get(owner).chat_id,'987654');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM club_bot_tokens WHERE token_hash=?').get(hash).n,0);await handleBotUpdate({message:{text:'/start clubnotify_'+fakeToken,chat:{id:111111,type:'private'},from:{id:111111}}});assert.equal(db.prepare('SELECT chat_id FROM club_bot_links WHERE user_id=?').get(owner).chat_id,'987654');
  // Signed Telegram user creates a request; owner is a web/demo account linked to Telegram.
  const id='777777';db.prepare("INSERT INTO users(id,name,created_at,role,registration_version,phone) VALUES(?,'Тест',?,'player',2,'+79000000000')").run(id,new Date().toISOString());const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(id),first_name:'Тест'})});const check=[...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');const secret=crypto.createHmac('sha256','WebAppData').update(process.env.BOT_TOKEN).digest();p.set('hash',crypto.createHmac('sha256',secret).update(check).digest('hex'));
  const r=await realFetch(base+'/api/court-bookings',{method:'POST',headers:{authorization:'tma '+p.toString(),'content-type':'application/json'},body:JSON.stringify({...payload,startsAt:day+'T19:00:00+03:00'})});assert.equal(r.status,201);assert.ok(db.prepare('SELECT 1 FROM bot_outbox WHERE user_id=?').get('987654'));await sendNextBotMessage();assert.ok(calls.length>=3);
  }finally{globalThis.fetch=realFetch;delete process.env.BOT_TOKEN;}
 });
}finally{await new Promise(r=>server.close(r));db.close();rmSync(temp,{recursive:true,force:true});}
