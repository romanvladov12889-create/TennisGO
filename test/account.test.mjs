import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {deleteAccount} from '../account.mjs';
process.env.DB_PATH=path.join(mkdtempSync(path.join(tmpdir(),'tennis-account-')),'test.sqlite');delete process.env.BOT_TOKEN;
const {server,db}=await import('../server.mjs');await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
try{
await test('confirmation required; logout revokes web session; deletion frees email and revokes every session',async()=>{
 const req=async(route,method,body,headers={})=>{const r=await fetch(base+'/api'+route,{method,headers:{origin:base,'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.getSetCookie().find(x=>x.startsWith('tg_web='))?.split(';')[0]}};
 const signup=await req('/web-auth/register','POST',{email:'delete@example.com',password:'long-password-123'});assert.equal(signup.status,200);const h={cookie:signup.cookie,'x-web-csrf':signup.data.csrf};
 assert.equal((await req('/account','DELETE',{confirmation:'no'},h)).status,400);
 assert.equal((await req('/account','DELETE',{confirmation:'DELETE'},{cookie:signup.cookie})).status,403);
 assert.equal((await req('/account','DELETE',{confirmation:'DELETE'},h)).status,200);
 assert.equal(db.prepare('SELECT count(*) n FROM web_sessions').get().n,0);assert.equal(db.prepare('SELECT count(*) n FROM web_passwords').get().n,0);
 const again=await req('/web-auth/register','POST',{email:'delete@example.com',password:'long-password-123'});assert.equal(again.status,200);
 assert.equal((await req('/web-auth/logout','POST',{}, {cookie:again.cookie,'x-web-csrf':again.data.csrf})).status,200);assert.equal(db.prepare('SELECT count(*) n FROM web_sessions').get().n,0);
});
await test('club deletion anonymizes references, cancels reservations, preserves another player and removes media',()=>{
 const id='demo-delete-club',other='demo-other-player',stamp=new Date().toISOString();
 for(const uid of [id,other])db.prepare('INSERT INTO users(id,name,created_at,role,registration_version,phone) VALUES(?,?,?,\'player\',2,\'+79001112233\')').run(uid,'Test',stamp);
 db.prepare("INSERT INTO clubs(owner_id,name,address,city,phone,sports,status,created_at) VALUES(?,'Club','Address','Краснодар','+79001112233','[\"tennis\"]','approved',?)").run(id,stamp);
 db.prepare("INSERT INTO court_reservations(id,club_id,user_id,sport,starts_at,duration,created_at,status,guest_name,guest_phone) VALUES('booking',?,?,'tennis','2030-01-01T10:00:00Z',60,?,'confirmed','Client','+79001112233')").run(id,other,stamp);
 db.prepare("INSERT INTO profile_media VALUES('photo',?,'photo','image/jpeg',?)").run(id,stamp);const dir=path.join(path.dirname(process.env.DB_PATH),'profile-media');writeFileSync(path.join(dir,'photo'),'test');
 deleteAccount(db,id,dir);assert.equal(db.prepare('SELECT * FROM users WHERE id=?').get(id),undefined);assert.equal(db.prepare('SELECT registration_version FROM users WHERE id=?').get(other).registration_version,2);
 const b=db.prepare('SELECT * FROM court_reservations').get();assert.equal(b.status,'cancelled');assert.equal(b.guest_phone,'');assert.match(b.club_id,/^deleted-/);assert.equal(db.prepare('SELECT status FROM clubs').get().status,'rejected');assert.equal(existsSync(path.join(dir,'photo')),false);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
});
}finally{await new Promise(r=>server.close(r));db.close();}
