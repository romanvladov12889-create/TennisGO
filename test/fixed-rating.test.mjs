import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {initialRating,updateRating} from '../rating.mjs';
const temp=mkdtempSync(path.join(tmpdir(),'tennis-fixed-rating-'));
process.env.DB_PATH=path.join(temp,'test.sqlite');delete process.env.BOT_TOKEN;
const {db,server,recordMatchVote,processMatchPrompts}=await import('../server.mjs');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}/api`;
const users=['a','b','c','d','legacy'].map(x=>'demo-fixed-rating-'+x),[a,b,c,d,legacy]=users;
for(const id of users)db.prepare("INSERT INTO users(id,name,created_at,role,registration_version) VALUES(?,?,?,'player',2)").run(id,id,new Date().toISOString());
function game(members,sport='tennis'){
 const id=crypto.randomUUID(),date=new Date(Date.now()-10800000).toISOString();
 db.prepare("INSERT INTO games(id,sport,city,venue,court_id,starts_at,duration,level_min,level_max,seats,price,kind,note,creator_id,created_at) VALUES(?,?, 'Краснодар','Динамо','dinamo',?,60,2,4,?,0,'rating','',?,?)").run(id,sport,date,members.length,members[0],date);
 for(const member of members)db.prepare('INSERT INTO participants VALUES(?,?,?)').run(id,member,date);
 processMatchPrompts();return id;
}
const rating=id=>db.prepare("SELECT rating,matches,wins,losses FROM player_ratings WHERE user_id=? AND sport='tennis'").get(id);
async function vote(id,user,choice){const r=await fetch(base+'/games/'+id+'/vote',{method:'POST',headers:{'x-demo-user':user,'content-type':'application/json'},body:JSON.stringify({choice})});return {status:r.status,data:await r.json()};}
try{
 await test('every new user starts at 1000 in both sports; each result is exactly 50 regardless of opponent',async()=>{
  const r=await fetch(base+'/me',{headers:{'x-demo-user':a}}),u=(await r.json()).user;
  assert.equal(u.ratings.tennis.rating,1000);assert.equal(u.ratings.padel.rating,1000);
  assert.equal(updateRating(initialRating(),{rating:9000},1).rating,1050);
  assert.equal(updateRating(initialRating(),{rating:1},0).rating,950);
  assert.equal(updateRating({...initialRating(),rating:0},{rating:9000},0).rating,-50);
 });
 await test('app and bot result votes share one confirmed singles update and reject duplicate answers',async()=>{
  const id=game([a,b]);assert.equal((await vote(id,a,'win')).status,200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rating_events WHERE game_id=?').get(id).n,0);
  recordMatchVote(id,b,'loss');assert.deepEqual({...rating(a)},{rating:1050,matches:1,wins:1,losses:0});assert.equal(rating(b).rating,950);
  assert.equal((await vote(id,a,'win')).status,409);assert.equal(rating(a).rating,1050);
  const e=db.prepare('SELECT previous,current FROM rating_events WHERE game_id=? AND user_id=?').get(id,a);assert.deepEqual({...e},{previous:1000,current:1050});
 });
 await test('doubles gives each winner +50 and each loser −50 only after all four agree',()=>{
  const id=game([a,b,c,d]);for(const [user,choice] of [[a,'win'],[b,'loss'],[c,'win']])recordMatchVote(id,user,choice);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rating_events WHERE game_id=?').get(id).n,0);
  recordMatchVote(id,d,'loss');assert.equal(rating(a).rating,1100);assert.equal(rating(b).rating,900);assert.equal(rating(c).rating,1050);assert.equal(rating(d).rating,950);
 });
 await test('mismatched results and games without score do not affect ratings',()=>{
  for(const choices of [['win','win'],['no_score','no_score']]){const id=game([a,b]);recordMatchVote(id,a,choices[0]);recordMatchVote(id,b,choices[1]);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM rating_events WHERE game_id=?').get(id).n,0);}
  assert.equal(rating(a).rating,1100);assert.equal(rating(b).rating,900);
 });
 await test('legacy ratings and historical events rebase once without losing wins or losses',()=>{
  const first=game([legacy,c]),second=game([legacy,c]);
  db.prepare("INSERT INTO player_ratings VALUES(?,'tennis',1525,150,0.06,2,1,1)").run(legacy);
  db.prepare('INSERT INTO rating_events VALUES(?,?,?,?,?,?)').run(first,legacy,'tennis',1500,1600,'2026-01-01T00:00:00.000Z');
  db.prepare('INSERT INTO rating_events VALUES(?,?,?,?,?,?)').run(second,legacy,'tennis',1600,1525,'2026-01-02T00:00:00.000Z');
  db.prepare("DELETE FROM bot_state WHERE key='rating-fixed-1000-50-v1'").run();
  const restart=()=>{const r=spawnSync(process.execPath,['--input-type=module','-e',`const {db}=await import(${JSON.stringify(new URL('../server.mjs',import.meta.url).href)});db.close();`],{env:{...process.env},encoding:'utf8'});assert.equal(r.status,0,r.stderr);};
  restart();assert.deepEqual({...rating(legacy)},{rating:1000,matches:2,wins:1,losses:1});
  assert.deepEqual(db.prepare('SELECT previous,current FROM rating_events WHERE user_id=? ORDER BY created_at').all(legacy).map(r=>({...r})),[{previous:1000,current:1050},{previous:1050,current:1000}]);
  assert.equal(rating(a).rating,1100);assert.equal(db.prepare("SELECT rating FROM player_ratings WHERE user_id=? AND sport='padel'").get(legacy).rating,1000);
  restart();assert.equal(rating(a).rating,1100);assert.equal(rating(legacy).matches,2);
 });
}finally{await new Promise(resolve=>server.close(resolve));db.close();rmSync(temp,{recursive:true,force:true});}
