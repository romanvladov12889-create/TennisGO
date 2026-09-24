import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const dbPath = process.env.DB_PATH || path.join(root, 'data', 'tennis-go.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT, tennis_rating INTEGER NOT NULL DEFAULT 1200, padel_rating INTEGER NOT NULL DEFAULT 1200, created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, sport TEXT NOT NULL, city TEXT NOT NULL, venue TEXT NOT NULL, court_id TEXT, starts_at TEXT NOT NULL, duration INTEGER NOT NULL, level_min REAL NOT NULL, level_max REAL NOT NULL, seats INTEGER NOT NULL, price INTEGER NOT NULL, kind TEXT NOT NULL, note TEXT NOT NULL, creator_id TEXT NOT NULL REFERENCES users(id), result TEXT, result_by TEXT, result_confirmed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS participants(game_id TEXT NOT NULL REFERENCES games(id), user_id TEXT NOT NULL REFERENCES users(id), joined_at TEXT NOT NULL, PRIMARY KEY(game_id,user_id));
 CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), coach_id TEXT NOT NULL, court_id TEXT NOT NULL, starts_at TEXT NOT NULL, created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS games_start ON games(starts_at);
`);
if(!db.prepare('PRAGMA table_info(games)').all().some(column=>column.name==='court_id')) db.exec('ALTER TABLE games ADD COLUMN court_id TEXT');
const now = () => new Date().toISOString();
const coaches = [{id:'anastasia',name:'Анастасия',sport:'Теннис',description:'Индивидуальная тренировка · любой уровень',price:2500,image:'/assets/coach.jpg'}];
const courts = JSON.parse(fs.readFileSync(path.join(publicDir,'courts.json'),'utf8'));
if(!process.env.BOT_TOKEN && db.prepare('SELECT COUNT(*) AS n FROM games').get().n===0){
  const owner='demo-host-0001';db.prepare('INSERT OR IGNORE INTO users(id,name,username,created_at) VALUES(?,?,?,?)').run(owner,'Алексей','','2026-01-01T00:00:00.000Z');
  const date=new Date(Date.now()+86400000);date.setUTCHours(16,0,0,0);
  const samples=[['tennis','dinamo',2,'friendly',1200,18],['padel','padel360',4,'friendly',800,20]];
  for(const [sport,courtId,seats,kind,price,hour] of samples){const start=new Date(date);start.setUTCHours(hour-3);const id=crypto.randomUUID(),court=courts.find(c=>c.id===courtId);db.prepare('INSERT INTO games(id,sport,city,venue,court_id,starts_at,duration,level_min,level_max,seats,price,kind,note,creator_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,sport,'Краснодар',court.name,court.id,start.toISOString(),90,2.5,3.5,seats,price,kind,'Демо игра · проверьте свободные места',owner,new Date().toISOString());db.prepare('INSERT INTO participants VALUES(?,?,?)').run(id,owner,new Date().toISOString());}
}
const getUser = db.prepare('SELECT id,name,username,tennis_rating,padel_rating FROM users WHERE id=?');
const addUser = db.prepare('INSERT INTO users(id,name,username,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,username=excluded.username');
const getGame = db.prepare('SELECT * FROM games WHERE id=?');
const getMembers = db.prepare('SELECT u.id,u.name,u.username FROM participants p JOIN users u ON p.user_id=u.id WHERE p.game_id=? ORDER BY p.joined_at');
const responses = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};
function fail(status,message){ const e=new Error(message);e.status=status;throw e; }
function send(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
function verifyInitData(raw){
  if(!raw || raw.length>8192) fail(401,'Откройте приложение через Telegram');
  const p=new URLSearchParams(raw);const hash=p.get('hash');const authDate=Number(p.get('auth_date'));
  if(!hash || !/^[a-f0-9]{64}$/i.test(hash) || !authDate || Math.abs(Date.now()/1000-authDate)>86400) fail(401,'Сессия Telegram истекла. Откройте приложение заново');
  p.delete('hash');p.delete('signature');
  const check=Array.from(p.entries()).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n');
  const secret=crypto.createHmac('sha256','WebAppData').update(process.env.BOT_TOKEN).digest();
  const expected=crypto.createHmac('sha256',secret).update(check).digest();
  if(!crypto.timingSafeEqual(Buffer.from(hash,'hex'),expected)) fail(401,'Неверная подпись Telegram');
  let user;try{user=JSON.parse(p.get('user')||'');}catch{fail(401,'Нет данных пользователя Telegram');}
  if(!Number.isSafeInteger(user?.id)) fail(401,'Нет пользователя Telegram');
  return {id:String(user.id),name:([user.first_name,user.last_name].filter(Boolean).join(' ')||'Игрок').slice(0,60),username:String(user.username||'').slice(0,40)};
}
function authenticate(req){
  if(process.env.BOT_TOKEN){const token=req.headers.authorization||'';if(!token.startsWith('tma '))fail(401,'Откройте приложение через Telegram');return verifyInitData(token.slice(4));}
  const id=String(req.headers['x-demo-user']||'').slice(0,60);
  if(!/^demo-[a-z0-9-]{8,50}$/i.test(id)) fail(401,'Нет тестового пользователя');
  let name='Игрок';try{name=decodeURIComponent(String(req.headers['x-demo-name']||'Игрок')).slice(0,60).trim()||'Игрок';}catch{}
  return {id,name,username:''};
}
function gameDTO(game,viewer){const members=getMembers.all(game.id),court=courts.find(c=>c.id===game.court_id);return {id:game.id,sport:game.sport,city:game.city,venue:game.venue,courtId:game.court_id,courtAddress:court?.address||'',startsAt:game.starts_at,duration:game.duration,levelMin:game.level_min,levelMax:game.level_max,seats:game.seats,price:game.price,kind:game.kind,note:game.note,creatorId:game.creator_id,members,joined:members.some(m=>m.id===viewer),result:game.result,resultBy:game.result_by,resultConfirmed:!!game.result_confirmed};}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16384)fail(413,'Слишком большой запрос');}try{return JSON.parse(raw||'{}');}catch{fail(400,'Неверный JSON');}}
function str(v,max=100){return typeof v==='string'?v.trim().slice(0,max):'';}
function date(v){const n=Date.parse(v);if(!Number.isFinite(n))fail(400,'Неверная дата');return new Date(n).toISOString();}
function ratingUpdate(game){
  const members=getMembers.all(game.id);if(members.length!==2)return;
  const sets=game.result.split(',').map(s=>s.trim().split(':').map(Number));
  let a=0,b=0;for(const [x,y] of sets){if(x>y)a++;else b++;}
  const aId=game.creator_id,bId=members.find(m=>m.id!==aId)?.id;if(!bId)return;
  const field=game.sport==='padel'?'padel_rating':'tennis_rating';
  const ra=db.prepare(`SELECT ${field} AS r FROM users WHERE id=?`).get(aId).r;
  const rb=db.prepare(`SELECT ${field} AS r FROM users WHERE id=?`).get(bId).r;
  const expected=1/(1+Math.pow(10,(rb-ra)/400));
  const delta=Math.round(24*((a>b?1:0)-expected));
  db.prepare(`UPDATE users SET ${field}=${field}+? WHERE id=?`).run(delta,aId);
  db.prepare(`UPDATE users SET ${field}=${field}-? WHERE id=?`).run(delta,bId);
}
async function api(req,res,url){
  if(url.pathname==='/api/config')return send(res,200,{demo:!process.env.BOT_TOKEN,botUsername:process.env.BOT_USERNAME||''});
  const identity=authenticate(req);addUser.run(identity.id,identity.name,identity.username,now());
  const me=getUser.get(identity.id);
  if(req.method==='GET'&&url.pathname==='/api/me')return send(res,200,{user:me});
  if(req.method==='GET'&&url.pathname==='/api/catalog')return send(res,200,{coaches,courts});
  if(req.method==='GET'&&url.pathname==='/api/bookings'){
    const rows=db.prepare('SELECT * FROM bookings WHERE user_id=? ORDER BY starts_at DESC').all(me.id);
    return send(res,200,{bookings:rows.map(x=>({id:x.id,coach:coaches.find(c=>c.id===x.coach_id),court:courts.find(c=>c.id===x.court_id),startsAt:x.starts_at}))});
  }
  if(req.method==='POST'&&url.pathname==='/api/bookings'){
    const b=await body(req);if(!coaches.some(c=>c.id===b.coachId)||!courts.some(c=>c.id===b.courtId&&c.sport==='tennis'))fail(400,'Выберите тренера и теннисный корт');
    const start=date(b.startsAt);if(Date.parse(start)<Date.now()+1800000)fail(400,'Выберите время минимум через 30 минут');
    const id=crypto.randomUUID();db.prepare('INSERT INTO bookings VALUES(?,?,?,?,?,?)').run(id,me.id,b.coachId,b.courtId,start,now());
    return send(res,201,{bookingId:id});
  }
  if(req.method==='GET'&&url.pathname==='/api/games'){
    const sport=url.searchParams.get('sport');const mine=url.searchParams.get('mine')==='1';
    let rows=db.prepare('SELECT * FROM games WHERE starts_at>? ORDER BY starts_at LIMIT 100').all(new Date(Date.now()-30*86400000).toISOString());
    if(sport&&sport!=='all')rows=rows.filter(g=>g.sport===sport);
    if(mine)rows=rows.filter(g=>getMembers.all(g.id).some(m=>m.id===me.id));
    return send(res,200,{games:rows.map(g=>gameDTO(g,me.id))});
  }
  if(req.method==='POST'&&url.pathname==='/api/games'){
    const b=await body(req);const sport=str(b.sport),kind=str(b.kind);
    if(!['tennis','padel'].includes(sport)||!['friendly','rating'].includes(kind))fail(400,'Выберите вид игры');
    const seats=Number(b.seats);if(![2,4].includes(seats)||kind==='rating'&&seats!==2)fail(400,'Рейтинговая игра пока доступна только 1 на 1');
    const startsAt=date(b.startsAt);if(Date.parse(startsAt)<Date.now()+1800000||Date.parse(startsAt)>Date.now()+90*86400000)fail(400,'Выберите дату в ближайшие 90 дней');
    const min=Number(b.levelMin),max=Number(b.levelMax),duration=Number(b.duration),price=Number(b.price);
    if(!Number.isFinite(min)||!Number.isFinite(max)||min<1||max>7||max<min||![60,90,120].includes(duration)||!Number.isInteger(price)||price<0||price>100000)fail(400,'Проверьте параметры игры');
    const court=courts.find(c=>c.id===b.courtId&&c.sport===sport);if(!court)fail(400,'Выберите корт из списка для этого вида спорта');
    const venue=court.name,city='Краснодар';
    const id=crypto.randomUUID();db.exec('BEGIN');try{
      db.prepare('INSERT INTO games(id,sport,city,venue,court_id,starts_at,duration,level_min,level_max,seats,price,kind,note,creator_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,sport,city,venue,court.id,startsAt,duration,min,max,seats,price,kind,str(b.note,240),me.id,now());
      db.prepare('INSERT INTO participants VALUES(?,?,?)').run(id,me.id,now());db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    return send(res,201,{game:gameDTO(getGame.get(id),me.id)});
  }
  const match=url.pathname.match(/^\/api\/games\/([a-f0-9-]{36})(?:\/(join|leave|result|confirm))?$/i);
  if(match){const game=getGame.get(match[1]);if(!game)fail(404,'Игра не найдена');const action=match[2];
    if(req.method==='GET'&&!action)return send(res,200,{game:gameDTO(game,me.id)});
    if(req.method!=='POST')fail(405,'Метод не поддерживается');
    const members=getMembers.all(game.id),joined=members.some(m=>m.id===me.id);
    if(action==='join'){
      if(Date.parse(game.starts_at)<Date.now())fail(409,'Игра уже началась');if(joined)fail(409,'Вы уже в игре');if(members.length>=game.seats)fail(409,'Мест больше нет');
      db.prepare('INSERT INTO participants VALUES(?,?,?)').run(game.id,me.id,now());
    }else if(action==='leave'){
      if(!joined)fail(409,'Вы не участвуете');if(game.creator_id===me.id)fail(409,'Создатель пока не может удалить игру');
      if(game.result)fail(409,'Результат уже внесён');db.prepare('DELETE FROM participants WHERE game_id=? AND user_id=?').run(game.id,me.id);
    }else if(action==='result'){
      if(!joined||members.length!==2||game.kind!=='rating')fail(403,'Результат доступен для рейтинговой игры 1 на 1');
      if(Date.parse(game.starts_at)+game.duration*60000>Date.now())fail(409,'Дождитесь окончания игры');
      if(game.result_confirmed)fail(409,'Результат уже подтверждён');
      const b=await body(req);const score=str(b.score,60).replace(/\s+/g,'');const sets=score.split(',');
      if(sets.length<2||sets.length>3||!sets.every(s=>/^\d{1,2}:\d{1,2}$/.test(s)&&s.split(':').every(n=>Number(n)<=20)))fail(400,'Формат счёта: 6:4, 6:3');
      let a=0,z=0;for(const s of sets){const [x,y]=s.split(':').map(Number);if(x===y)fail(400,'Счёт сета не может быть равным');x>y?a++:z++;}
      if(a===z)fail(400,'Укажите решающий сет');
      db.prepare('UPDATE games SET result=?, result_by=?, result_confirmed=0 WHERE id=?').run(score,me.id,game.id);
    }else if(action==='confirm'){
      if(!joined||!game.result||game.result_by===me.id||game.result_confirmed)fail(409,'Подтверждение недоступно');
      db.exec('BEGIN');try{db.prepare('UPDATE games SET result_confirmed=1 WHERE id=? AND result_confirmed=0').run(game.id);ratingUpdate(game);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
    }else fail(404,'Неизвестное действие');
    return send(res,200,{game:gameDTO(getGame.get(game.id),me.id),user:getUser.get(me.id)});
  }
  fail(404,'Не найдено');
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname.startsWith('/api/'))return await api(req,res,url);
    if(req.method!=='GET')fail(405,'Метод не поддерживается');
    const name=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);
    const file=path.resolve(publicDir,'.'+name);if(!file.startsWith(publicDir+path.sep))fail(403,'Недоступно');
    const stat=fs.statSync(file,{throwIfNoEntry:false});if(!stat?.isFile())fail(404,'Не найдено');
    res.writeHead(200,{'Content-Type':responses[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org"});fs.createReadStream(file).pipe(res);
  }catch(e){if(!res.headersSent)send(res,e.status||500,{error:e.status?e.message:'Ошибка сервера'});else res.end();}
});
if(import.meta.url===`file://${process.argv[1]}`)server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log(`Tennis GO Mini App: http://localhost:${process.env.PORT||3000} (${process.env.BOT_TOKEN?'Telegram':'demo'})`));
export {server,db,verifyInitData};
