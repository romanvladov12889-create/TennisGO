import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tennis-go-'));
process.env.DB_PATH=path.join(dir,'test.sqlite');
const {server,db,verifyInitData}=await import('../server.mjs');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
async function request(route,user,method='GET',body){const res=await fetch(base+'/api'+route,{method,headers:{'x-demo-user':user,'x-demo-name':encodeURIComponent(user==='demo-player-0001'?'Роман':'Вика'),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:res.status,data:await res.json()};}
test('game lifecycle and mutual confirmation update ratings once',async()=>{
 const start=new Date(Date.now()+4*3600000).toISOString();
 const create=await request('/games','demo-player-0001','POST',{sport:'tennis',kind:'rating',seats:2,city:'Краснодар',courtId:'dinamo',startsAt:start,duration:60,levelMin:2.5,levelMax:3.5,price:1200,note:'Тест'});
 assert.equal(create.status,201);assert.equal(create.data.game.courtAddress,'ул. Красная, 190');const id=create.data.game.id;
 const invalid=await request('/games','demo-player-0001','POST',{sport:'padel',kind:'friendly',seats:4,courtId:'dinamo',startsAt:start,duration:60,levelMin:2.5,levelMax:3.5,price:800});assert.equal(invalid.status,400);
 const join=await request(`/games/${id}/join`,'demo-player-0002','POST');assert.equal(join.status,200);assert.equal(join.data.game.members.length,2);
 assert.equal((await request(`/games/${id}/join`,'demo-player-0002','POST')).status,409);
 assert.equal((await request(`/games/${id}/result`,'demo-player-0001','POST',{score:'6:4, 6:3'})).status,409);
 db.prepare('UPDATE games SET starts_at=? WHERE id=?').run(new Date(Date.now()-3*3600000).toISOString(),id);
 const reported=await request(`/games/${id}/result`,'demo-player-0001','POST',{score:'6:4, 6:3'});assert.equal(reported.status,200);assert.equal(reported.data.game.resultConfirmed,false);
 assert.equal((await request(`/games/${id}/confirm`,'demo-player-0001','POST')).status,409);
 const confirmed=await request(`/games/${id}/confirm`,'demo-player-0002','POST');assert.equal(confirmed.status,200);assert.equal(confirmed.data.game.resultConfirmed,true);
 const winner=(await request('/me','demo-player-0001')).data.user;const loser=(await request('/me','demo-player-0002')).data.user;assert.equal(winner.tennis_rating,1212);assert.equal(loser.tennis_rating,1188);assert.equal(winner.padel_rating,1200);
 assert.equal((await request(`/games/${id}/confirm`,'demo-player-0002','POST')).status,409);
});
test('Telegram initData signature and expiry',()=>{
 process.env.BOT_TOKEN='test-secret';const auth_date=String(Math.floor(Date.now()/1000));const user=JSON.stringify({id:123,first_name:'Test'});
 const check=`auth_date=${auth_date}\nuser=${user}`;const secret=crypto.createHmac('sha256','WebAppData').update(process.env.BOT_TOKEN).digest();const hash=crypto.createHmac('sha256',secret).update(check).digest('hex');const raw=new URLSearchParams({user,auth_date,hash}).toString();
 assert.equal(verifyInitData(raw).id,'123');assert.throws(()=>verifyInitData(raw.replace('Test','Evil')),/подпись/);
 delete process.env.BOT_TOKEN;
});
test.after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();fs.rmSync(dir,{recursive:true,force:true});});
