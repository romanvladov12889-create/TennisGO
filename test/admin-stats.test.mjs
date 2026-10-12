import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
process.env.DB_PATH=path.join(mkdtempSync(path.join(tmpdir(),'tennis-stats-')),'test.sqlite');process.env.ADMIN_DEMO_USER_ID='demo-stats-admin';delete process.env.BOT_TOKEN;
const {server,db}=await import('../server.mjs');
try{await test('daily admin statistics use Moscow registration dates and unique registered users, excluding unfinished registrations',async()=>{
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());const yesterday=new Date(Date.parse(today+'T12:00:00Z')-86400000).toISOString().slice(0,10);const old=new Date(Date.parse(today+'T12:00:00Z')-40*86400000).toISOString();
 const add=(id,registered,at)=>db.prepare('INSERT INTO users(id,name,created_at,registered_at,registration_version,role,ntrp_level,city,gender,avatar_id) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,id,at,registered?at:null,registered?2:0,'player',3,'Краснодар','male','male-cap');add('demo-stats-admin',true,old);add('demo-stats-user-a',true,yesterday+'T21:30:00.000Z');add('demo-stats-user-b',true,today+'T00:15:00.000Z');add('demo-stats-unregistered',false,old);db.prepare('INSERT INTO activity_days VALUES(?,?)').run('demo-stats-unregistered',yesterday);
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;for(const id of ['demo-stats-user-a','demo-stats-user-a','demo-stats-user-b','demo-stats-unregistered'])assert.equal((await fetch(base+'/api/me',{headers:{'x-demo-user':id}})).status,200);
 const result=await fetch(base+'/api/admin/stats',{headers:{'x-demo-user':'demo-stats-admin'}}),stats=await result.json();assert.equal(result.status,200);const row=stats.daily.find(x=>x.day===today);assert.equal(row.new,2);assert.equal(row.active,3);assert.equal(stats.activeToday,3);assert.equal(stats.timeZone,'Europe/Moscow');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM activity_days WHERE user_id=? AND day=?').get('demo-stats-user-a',today).n,1);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM activity_days WHERE user_id=? AND day=?').get('demo-stats-unregistered',today).n,0);assert.equal(stats.daily.find(x=>x.day===yesterday).active,null);assert.equal((await fetch(base+'/api/admin/stats',{headers:{'x-demo-user':'demo-stats-user-a'}})).status,403);

});}finally{await new Promise(r=>server.close(r));db.close();}
