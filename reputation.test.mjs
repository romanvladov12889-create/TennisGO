import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';

const temporary=mkdtempSync(path.join(tmpdir(),'tennis-reputation-'));
process.env.DB_PATH=path.join(temporary,'test.sqlite');delete process.env.BOT_TOKEN;
const {server,db,processReputationPrompts,handleBotUpdate,sendNextBotMessage}=await import('../server.mjs');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/api`;
const [a,b,c,d,outsider,coach]=['a','b','c','d','outsider','coach'].map(x=>'demo-reputation-'+x);
for(const id of [a,b,c,d,outsider,coach])db.prepare('INSERT INTO users(id,name,created_at,role,registration_version,ntrp_level) VALUES(?,?,?,?,2,3)').run(id,id,new Date().toISOString(),id===coach?'coach':'player');
async function api(route,user=a,method='GET',payload){const response=await fetch(base+route,{method,headers:{'x-demo-user':user,'content-type':'application/json'},body:payload?JSON.stringify(payload):undefined});return {status:response.status,data:await response.json()};}
function game(members,{future=false,cancelled=false}={}){const id=crypto.randomUUID(),date=new Date(Date.now()+(future?86400000:-10800000)).toISOString();db.prepare('INSERT INTO games(id,sport,city,venue,court_id,starts_at,duration,level_min,level_max,seats,price,kind,note,creator_id,created_at,cancelled_at) VALUES(?,?,?,?,?,?,60,2.5,3.5,?,0,?,?,?,?,?)').run(id,'tennis','Краснодар','Динамо','dinamo',date,members.length===4?4:2,'friendly','',members[0],date,cancelled?date:null);for(const member of members)db.prepare('INSERT INTO participants VALUES(?,?,?)').run(id,member,date);return id;}
function reputation(id){return db.prepare('SELECT reputation_score AS score,reputation_count AS count FROM users WHERE id=?').get(id);}
const single=game([a,b]),doubles=game([a,b,c,d]),future=game([a,b],{future:true}),cancelled=game([a,b],{cancelled:true}),alone=game([a]);

try{
 await test('reputation is 5.00 before received feedback and appears in DTOs',async()=>{
  assert.equal((await api('/me')).data.user.reputation,5);assert.equal((await api('/me')).data.user.reputationCount,0);
  const dto=(await api('/games/'+single)).data.game;assert.equal(dto.reputation,5);assert.equal(dto.members[0].reputation,5);
  assert.equal((await api('/users/'+b)).data.user.reputation,5);assert.equal((await api('/users')).data.users.find(u=>u.id===b).reputation,5);
 });
 await test('only participants can review an ended, uncancelled game with opponents',async()=>{
  for(const id of [future,cancelled,alone])assert.equal((await api('/games/'+id+'/feedback',a,'POST',{score:5})).status,403);
  assert.equal((await api('/games/'+single+'/feedback',outsider,'POST',{score:5})).status,403);
  for(const score of [0,6,2.5,'invalid'])assert.equal((await api('/games/'+single+'/feedback',a,'POST',{score})).status,400);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM game_feedback').get().n,0);
 });
 await test('no-show score applies only to the opponent; duplicate reviews do not count',async()=>{
  assert.equal((await api('/games/'+single+'/feedback',b,'POST',{score:1,comment:'Не пришёл'})).status,200);
  assert.deepEqual({...reputation(a)},{score:1,count:1});assert.deepEqual({...reputation(b)},{score:5,count:0});
  assert.equal((await api('/games/'+single+'/feedback',a,'POST',{score:5})).status,200);
  assert.equal((await api('/games/'+single+'/feedback',a,'POST',{score:1})).status,409);
  assert.deepEqual({...reputation(b)},{score:5,count:1});
  const dto=(await api('/games/'+single)).data.game;assert.equal(dto.reputation,3);assert.equal(dto.feedbackSubmitted,true);
  assert.equal((await api('/games/'+single+'/leave',b,'POST')).status,409);
 });
 await test('doubles reviews reach all other players and game reputation averages players',async()=>{
  await api('/games/'+doubles+'/feedback',a,'POST',{score:4});await api('/games/'+doubles+'/feedback',c,'POST',{score:5});
  assert.deepEqual({...reputation(a)},{score:3,count:2});assert.equal(reputation(b).score,14/3);assert.equal(reputation(b).count,3);
  assert.deepEqual({...reputation(c)},{score:4,count:1});assert.deepEqual({...reputation(d)},{score:4.5,count:2});
  assert.equal((await api('/games/'+doubles)).data.game.reputation,(3+14/3+4+4.5)/4);
 });
 await test('pending feedback and reminder notifications are isolated and deduplicated',async()=>{
  const pending=await api('/feedback/pending',b);assert.equal(pending.status,200);assert.ok(pending.data.games.some(g=>g.id===doubles));
  assert.ok(!pending.data.games.some(g=>[single,future,cancelled,alone].includes(g.id)));
  const count=db.prepare('SELECT COUNT(*) AS n FROM reputation_prompts').get().n;processReputationPrompts();assert.equal(db.prepare('SELECT COUNT(*) AS n FROM reputation_prompts').get().n,count);
  assert.ok(db.prepare('SELECT body FROM notifications WHERE user_id=?').all(b).some(n=>n.body.includes('Поставьте 1')));
 });
 await test('bot sends 1–5 buttons, upgrades old prompts once, saves scores and optional replies',async()=>{
  const numeric='100200300',other='100200301';
  for(const id of [numeric,other])db.prepare('INSERT INTO users(id,name,created_at,role,registration_version) VALUES(?,?,?,\'player\',2)').run(id,id,new Date().toISOString());
  const id=game([numeric,other]);
  db.prepare('INSERT INTO reputation_prompts(game_id,user_id,prompted_at) VALUES(?,?,?)').run(id,numeric,new Date().toISOString());
  const realFetch=globalThis.fetch,calls=[];
  process.env.BOT_TOKEN='test-only-token';process.env.APP_URL='https://tennis.example';
  globalThis.fetch=async(url,options)=>{
    if(!String(url).startsWith('https://api.telegram.org/'))return realFetch(url,options);
    calls.push({method:String(url).split('/').at(-1),payload:JSON.parse(options.body)});
    return {json:async()=>({ok:true,result:{message_id:777}})};
  };
  const callback=(from=numeric,chat=numeric,score=4)=>({callback_query:{id:'callback-test',from:{id:from},message:{message_id:42,chat:{id:chat,type:'private'}},data:`gf:${id}:${score}`}});
  try{
    processReputationPrompts();processReputationPrompts();
    const queued=db.prepare('SELECT * FROM bot_outbox WHERE user_id=?').all(numeric);assert.equal(queued.length,1);
    const keyboard=JSON.parse(queued[0].reply_markup).inline_keyboard;
    assert.deepEqual(keyboard[0].map(b=>b.text),['1','2','3','4','5']);assert.equal(keyboard[0][3].callback_data,`gf:${id}:4`);
    assert.equal(new URL(keyboard[1][0].web_app.url).searchParams.get('start'),`feedback_${id}`);
    await sendNextBotMessage();assert.ok(calls.find(c=>c.method==='sendMessage'&&c.payload.reply_markup?.inline_keyboard));
    await handleBotUpdate(callback(numeric,'-123'));assert.equal(reputation(other).count,0);
    await handleBotUpdate(callback());assert.deepEqual({...reputation(other)},{score:4,count:1});assert.equal(reputation(numeric).count,0);
    assert.ok(calls.some(c=>c.method==='editMessageReplyMarkup'&&c.payload.reply_markup.inline_keyboard.length===0));
    await handleBotUpdate(callback());assert.equal(reputation(other).count,1);assert.match(calls.at(-1).payload.text,/уже оценили/);
    // The same score cannot be submitted a second time through the authenticated app API.
    const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(numeric),first_name:'Игрок'})});
    const check=[...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
    const secret=crypto.createHmac('sha256','WebAppData').update(process.env.BOT_TOKEN).digest();
    params.set('hash',crypto.createHmac('sha256',secret).update(check).digest('hex'));
    const duplicate=await realFetch(base+'/games/'+id+'/feedback',{method:'POST',headers:{Authorization:'tma '+params,'content-type':'application/json'},body:JSON.stringify({score:1})});assert.equal(duplicate.status,409);
    const reply={message:{chat:{id:Number(numeric),type:'private'},from:{id:Number(numeric)},reply_to_message:{message_id:777},text:'Отличная игра'}};
    await handleBotUpdate({...reply,message:{...reply.message,from:{id:Number(other)}}});
    assert.equal(db.prepare('SELECT body FROM game_feedback WHERE game_id=? AND user_id=?').get(id,numeric).body,'');
    await handleBotUpdate(reply);await handleBotUpdate({...reply,message:{...reply.message,text:'Повтор'}});
    assert.equal(db.prepare('SELECT body FROM game_feedback WHERE game_id=? AND user_id=?').get(id,numeric).body,'Отличная игра');assert.equal(reputation(other).count,1);
  }finally{globalThis.fetch=realFetch;delete process.env.BOT_TOKEN;delete process.env.APP_URL;}
 });
 const training=crypto.randomUUID(),when=new Date(Date.now()-10800000).toISOString();
 db.prepare('INSERT INTO trainings(id,coach_id,format,seats,court_id,starts_at,duration,price,note,created_at,sport) VALUES(?,?,?,4,?,?,60,1500,?,?,?)').run(training,coach,'group','dinamo',when,'',when,'tennis');
 for(const id of [b,c])db.prepare('INSERT INTO training_participants VALUES(?,?,?)').run(training,id,when);
 db.prepare('INSERT INTO completed_trainings VALUES(?,?)').run(training,when);
 await test('training reviews update coach reputation and show participant reputation separately',async()=>{
  assert.equal((await api('/trainings/'+training+'/review',b,'POST',{score:5,comment:'Хорошая тренировка'})).status,200);
  assert.equal((await api('/trainings/'+training+'/review',c,'POST',{score:4,comment:'Полезная тренировка'})).status,200);
  assert.equal((await api('/trainings/'+training+'/review',b,'POST',{score:1,comment:'Повторная оценка'})).status,409);
  assert.equal((await api('/trainings/'+training+'/review',coach,'POST',{score:5,comment:'Самооценка тренера'})).status,403);
  assert.deepEqual({...reputation(coach)},{score:4.5,count:2});
  const dto=(await api('/trainings/'+training)).data.training;assert.equal(dto.coachReputation,4.5);assert.equal(dto.coachReputationCount,2);assert.equal(dto.reputation,(14/3+4)/2);assert.ok(dto.members.every(m=>typeof m.reputation==='number'));
 });
 const historical=crypto.randomUUID();
 db.prepare('INSERT INTO trainings(id,coach_id,format,seats,court_id,starts_at,duration,price,note,created_at) VALUES(?,?,?,1,?,?,60,1500,?,?)').run(historical,coach,'individual','dinamo',when,'',when);
 db.prepare('INSERT INTO training_reviews VALUES(?,?,?,?,?,?)').run(historical,d,coach,2,'Старый отзыв',when);
 await test('earlier coach reviews are migrated once and real reputation survives restarts',async()=>{
  const run=()=>{const child=spawnSync(process.execPath,['--input-type=module','-e',`const {db}=await import(${JSON.stringify(new URL('../server.mjs',import.meta.url).href)});db.close();`],{env:{...process.env},encoding:'utf8'});assert.equal(child.status,0,child.stderr);};
  run();assert.deepEqual({...reputation(coach)},{score:11/3,count:3});run();assert.deepEqual({...reputation(coach)},{score:11/3,count:3});
 });
}finally{await new Promise(resolve=>server.close(resolve));db.close();rmSync(temporary,{recursive:true,force:true});}
