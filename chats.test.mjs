import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const temp=mkdtempSync(path.join(tmpdir(),'tennis-chats-'));
process.env.DB_PATH=path.join(temp,'test.sqlite');delete process.env.BOT_TOKEN;
const {db,server}=await import('../server.mjs');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`,a='demo-chat-player-a',b='demo-chat-player-b',outsider='demo-chat-outsider';
function user(id,photo=null){db.prepare("INSERT INTO users(id,name,display_name,created_at,role,registration_version,photo_data) VALUES(?,?,?,?,'player',2,?)").run(id,'Игрок Имя',id,new Date().toISOString(),photo);}
user(a);user(b,'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l8sAAAAASUVORK5CYII=');user(outsider);
async function api(route,who=a,method='GET',body){const r=await fetch(base+'/api'+route,{method,headers:{'x-demo-user':who,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
function dm(from,to,text,date='2026-01-01T00:00:00.000Z'){db.prepare('INSERT INTO direct_messages(id,sender_id,recipient_id,body,created_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),from,to,text,date);}
try{
 await test('inbox returns last message and correct unread count without embedding avatar bytes',async()=>{
  dm(b,a,'Первое');dm(a,b,'Второе','2026-01-02T00:00:00.000Z');
  const {data,status}=await api('/inbox');assert.equal(status,200);assert.equal(data.threads.length,1);assert.equal(data.unread,1);assert.equal(data.threads[0].lastMessage,'Второе');assert.equal(data.threads[0].peerName,b);
  assert.equal(data.threads[0].peerPhotoData,'/avatars/'+b);assert.ok(!JSON.stringify(data).includes('base64'));
 });
 await test('deleting a direct dialog hides its history only for its owner and new messages reopen it',async()=>{
  assert.equal((await api('/dialogs',a,'DELETE',{kind:'direct',peerId:b})).status,200);
  assert.equal((await api('/inbox')).data.threads.length,0);assert.equal((await api('/inbox')).data.unread,0);
  assert.equal((await api('/direct/'+b)).data.messages.length,0);assert.equal((await api('/direct/'+a,b)).data.messages.length,2);
  assert.equal((await api('/dialogs',a,'DELETE',{kind:'direct',peerId:b})).status,200);
  const sent=await api('/direct/'+a,b,'POST',{message:'Новая встреча'});assert.equal(sent.status,200);
  const inbox=(await api('/inbox')).data;assert.equal(inbox.threads.length,1);assert.equal(inbox.unread,1);
  const history=(await api('/direct/'+b)).data.messages;assert.equal(history.length,1);assert.equal(history[0].body,'Новая встреча');
 });
 await test('listing dialog deletion preserves the other side and excludes hidden threads for the organiser',async()=>{
  const id=crypto.randomUUID(),when='2026-01-01T00:00:00.000Z';
  db.prepare("INSERT INTO games(id,sport,city,venue,court_id,starts_at,duration,level_min,level_max,seats,price,kind,note,creator_id,created_at) VALUES(?,'tennis','Краснодар','Динамо','dinamo',?,60,2,4,2,0,'friendly','',?,?)").run(id,when,a,when);
  db.prepare('INSERT INTO participants VALUES(?,?,?)').run(id,a,when);db.prepare('INSERT INTO participants VALUES(?,?,?)').run(id,b,when);
  db.prepare("INSERT INTO chat_messages(id,kind,listing_id,sender_id,peer_id,body,created_at) VALUES(?,'game',?,?,?,'Встречаемся',?)").run(crypto.randomUUID(),id,b,a,when);
  const route='/chats/game/'+id;
  assert.equal((await api(route+'/'+b)).data.messages.length,1);
  assert.equal((await api('/dialogs',a,'DELETE',{kind:'game',listingId:id,peerId:b})).status,200);
  assert.equal((await api(route+'/'+b)).data.messages.length,0);assert.equal((await api(route)).data.threads.length,0);
  assert.equal((await api(route+'/'+a,b)).data.messages.length,1);
  assert.equal((await api('/dialogs',outsider,'DELETE',{kind:'game',listingId:id,peerId:b})).status,200);assert.equal((await api(route+'/'+a,b)).data.messages.length,1);
  assert.equal((await api('/dialogs',a,'DELETE',{kind:'game',listingId:'bad',peerId:b})).status,400);
 });
 await test('avatar endpoint caches images with ETag and rejects blocked or missing profiles',async()=>{
  const r=await fetch(base+'/avatars/'+b);assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/png');assert.ok((await r.arrayBuffer()).byteLength>0);
  const cached=await fetch(base+'/avatars/'+b,{headers:{'If-None-Match':r.headers.get('etag')}});assert.equal(cached.status,304);
  db.prepare('UPDATE users SET blocked_at=? WHERE id=?').run(new Date().toISOString(),b);assert.equal((await fetch(base+'/avatars/'+b)).status,404);db.prepare('UPDATE users SET blocked_at=NULL WHERE id=?').run(b);
 });
 await test('large inbox has bounded response, pagination and full unread count',async()=>{
  const insert=db.prepare('INSERT INTO direct_messages(id,sender_id,recipient_id,body,created_at) VALUES(?,?,?,?,?)');
  db.exec('BEGIN');for(let i=0;i<65;i++){const peer='demo-chat-many-'+i;user(peer);for(let j=0;j<150;j++)insert.run(crypto.randomUUID(),peer,a,'Текст '.repeat(70),new Date(Date.UTC(2026,8,1,0,i,j)).toISOString());}db.exec('COMMIT');
  const start=performance.now(),r=await api('/inbox'),elapsed=performance.now()-start;
  assert.equal(r.status,200);assert.equal(r.data.threads.length,50);assert.equal(r.data.hasMore,true);assert.equal(r.data.unread,65*150);assert.ok(JSON.stringify(r.data).length<100000);
  const next=await api('/inbox?offset=50');assert.equal(next.data.hasMore,false);assert.ok(next.data.threads.length>0);assert.ok(!next.data.threads.some(t=>r.data.threads.some(x=>x.key===t.key)));
  console.log(`Inbox with 9,750 messages: ${Math.round(elapsed)} ms; ${JSON.stringify(r.data).length} characters`);
 });
}finally{await new Promise(resolve=>server.close(resolve));db.close();rmSync(temp,{recursive:true,force:true});}
