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
 CREATE TABLE IF NOT EXISTS trainings(id TEXT PRIMARY KEY, coach_id TEXT NOT NULL REFERENCES users(id), format TEXT NOT NULL, seats INTEGER NOT NULL, court_id TEXT NOT NULL, starts_at TEXT NOT NULL, duration INTEGER NOT NULL, avg_ntrp REAL, price INTEGER NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS training_participants(training_id TEXT NOT NULL REFERENCES trainings(id), user_id TEXT NOT NULL REFERENCES users(id), joined_at TEXT NOT NULL, PRIMARY KEY(training_id,user_id));
 CREATE INDEX IF NOT EXISTS games_start ON games(starts_at);
 CREATE INDEX IF NOT EXISTS trainings_start ON trainings(starts_at);
`);
if(!db.prepare('PRAGMA table_info(games)').all().some(column=>column.name==='court_id')) db.exec('ALTER TABLE games ADD COLUMN court_id TEXT');
const userColumns=new Set(db.prepare('PRAGMA table_info(users)').all().map(column=>column.name));
if(!userColumns.has('display_name'))db.exec('ALTER TABLE users ADD COLUMN display_name TEXT');
if(!userColumns.has('ntrp_level'))db.exec('ALTER TABLE users ADD COLUMN ntrp_level REAL');
if(!userColumns.has('photo_data'))db.exec('ALTER TABLE users ADD COLUMN photo_data TEXT');
for(const [column,type] of [['role','TEXT'],['gender','TEXT'],['playing_years','INTEGER'],['about','TEXT'],['coach_years','INTEGER'],['avatar_id','TEXT'],['registered_at','TEXT'],['registration_version','INTEGER NOT NULL DEFAULT 0'],['city','TEXT'],['phone','TEXT'],['telegram_contact','TEXT'],['coach_sports','TEXT']]){
  if(!userColumns.has(column))db.exec(`ALTER TABLE users ADD COLUMN ${column} ${type}`);
}
// Existing users already entered the app before registration was introduced.
if(!userColumns.has('registered_at'))db.exec('UPDATE users SET registered_at=created_at');
if(!db.prepare('PRAGMA table_info(games)').all().some(column=>column.name==='opponent_gender'))db.exec("ALTER TABLE games ADD COLUMN opponent_gender TEXT NOT NULL DEFAULT 'any'");
const trainingColumns=new Set(db.prepare('PRAGMA table_info(trainings)').all().map(column=>column.name));
if(!trainingColumns.has('sport'))db.exec("ALTER TABLE trainings ADD COLUMN sport TEXT NOT NULL DEFAULT 'tennis'");
if(!trainingColumns.has('ntrp_min'))db.exec('ALTER TABLE trainings ADD COLUMN ntrp_min REAL');
if(!trainingColumns.has('ntrp_max'))db.exec('ALTER TABLE trainings ADD COLUMN ntrp_max REAL');
if(!trainingColumns.has('ntrp_min')||!trainingColumns.has('ntrp_max'))db.exec('UPDATE trainings SET ntrp_min=avg_ntrp,ntrp_max=avg_ntrp WHERE avg_ntrp IS NOT NULL');
const now = () => new Date().toISOString();
const coaches = [{id:'anastasia',name:'Анастасия',sport:'Теннис',description:'Индивидуальная тренировка · любой уровень',price:2500,image:'/assets/coach.jpg'}];
const courts = JSON.parse(fs.readFileSync(path.join(publicDir,'courts.json'),'utf8'));
const cities=JSON.parse(fs.readFileSync(path.join(publicDir,'cities.json'),'utf8'));
if(!process.env.BOT_TOKEN && db.prepare('SELECT COUNT(*) AS n FROM games').get().n===0){
  const owner='demo-host-0001';db.prepare('INSERT OR IGNORE INTO users(id,name,username,created_at,role,gender,ntrp_level,registered_at,registration_version) VALUES(?,?,?,?,?,?,?,?,?)').run(owner,'Алексей','','2026-01-01T00:00:00.000Z','player','male',3,'2026-01-01T00:00:00.000Z',2);
  const date=new Date(Date.now()+86400000);date.setUTCHours(16,0,0,0);
  const samples=[['tennis','dinamo',2,'friendly',1200,18],['padel','padel360',4,'friendly',800,20]];
  for(const [sport,courtId,seats,kind,price,hour] of samples){const start=new Date(date);start.setUTCHours(hour-3);const id=crypto.randomUUID(),court=courts.find(c=>c.id===courtId);db.prepare('INSERT INTO games(id,sport,city,venue,court_id,starts_at,duration,level_min,level_max,seats,price,kind,note,creator_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,sport,'Краснодар',court.name,court.id,start.toISOString(),90,2.5,3.5,seats,price,kind,'Демо игра · проверьте свободные места',owner,new Date().toISOString());db.prepare('INSERT INTO participants VALUES(?,?,?)').run(id,owner,new Date().toISOString());}
}
const getUser = db.prepare("SELECT id,COALESCE(NULLIF(display_name,''),name) AS name,username,ntrp_level AS ntrpLevel,photo_data AS photoData,role,gender,playing_years AS playingYears,about,coach_years AS coachYears,avatar_id AS avatarId,COALESCE(NULLIF(city,''),'Краснодар') AS city,phone,telegram_contact AS telegramContact,coach_sports AS coachSportsRaw,registration_version>=2 AS registered FROM users WHERE id=?");
const addUser = db.prepare('INSERT INTO users(id,name,username,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,username=excluded.username');
const saveProfile=db.prepare('UPDATE users SET display_name=?,ntrp_level=?,photo_data=?,role=?,gender=?,playing_years=?,about=?,coach_years=?,avatar_id=?,city=?,phone=?,telegram_contact=?,coach_sports=?,registered_at=COALESCE(registered_at,?),registration_version=2 WHERE id=?');
function userDTO(id){const user=getUser.get(id);if(!user)return null;const {coachSportsRaw,...fields}=user;let coachSports=['tennis','padel'];if(coachSportsRaw){try{coachSports=JSON.parse(coachSportsRaw);}catch{}}return {...fields,coachSports:fields.role==='coach'?coachSports:[]};}
const getGame = db.prepare('SELECT * FROM games WHERE id=?');
const getMembers = db.prepare("SELECT u.id,COALESCE(NULLIF(u.display_name,''),u.name) AS name,u.avatar_id AS avatarId,u.photo_data AS photoData FROM participants p JOIN users u ON p.user_id=u.id WHERE p.game_id=? ORDER BY p.joined_at");
const getTraining=db.prepare('SELECT * FROM trainings WHERE id=?');
const getTrainingMembers=db.prepare("SELECT u.id,COALESCE(NULLIF(u.display_name,''),u.name) AS name,u.avatar_id AS avatarId,u.photo_data AS photoData FROM training_participants p JOIN users u ON u.id=p.user_id WHERE p.training_id=? ORDER BY p.joined_at");
const responses = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};
function fail(status,message){ const e=new Error(message);e.status=status;throw e; }
function send(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
function verifyInitData(raw){
  if(!raw || raw.length>8192) fail(401,'Откройте приложение через Telegram');
  const p=new URLSearchParams(raw);const hash=p.get('hash');const authDate=Number(p.get('auth_date'));
  if(!hash || !/^[a-f0-9]{64}$/i.test(hash) || !authDate || Math.abs(Date.now()/1000-authDate)>86400) fail(401,'Сессия Telegram истекла. Откройте приложение заново');
  // The bot-token HMAC covers every initData field except hash, including signature.
  p.delete('hash');
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
function gameDTO(game,viewer){const members=getMembers.all(game.id),court=courts.find(c=>c.id===game.court_id),creator=db.prepare('SELECT gender,ntrp_level,role FROM users WHERE id=?').get(game.creator_id);return {id:game.id,sport:game.sport,city:game.city,venue:game.venue,courtId:game.court_id,courtAddress:court?.address||'',startsAt:game.starts_at,duration:game.duration,levelMin:game.level_min,levelMax:game.level_max,seats:game.seats,price:game.price,kind:game.kind,note:game.note,creatorId:game.creator_id,creatorGender:creator?.gender||null,creatorNtrp:creator?.ntrp_level??null,creatorRole:creator?.role||null,opponentGender:game.opponent_gender,members,joined:members.some(m=>m.id===viewer),result:game.result,resultBy:game.result_by,resultConfirmed:!!game.result_confirmed};}
function trainingDTO(training,viewer){const coach=userDTO(training.coach_id),members=getTrainingMembers.all(training.id),court=courts.find(c=>c.id===training.court_id);return {id:training.id,sport:training.sport||'tennis',coachId:training.coach_id,coachName:coach?.name||'Тренер',coachGender:coach?.gender||null,coachYears:coach?.coachYears??null,coachAvatarId:coach?.avatarId||null,coachPhotoData:coach?.photoData||null,format:training.format,seats:training.seats,courtId:training.court_id,courtName:court?.name||'',courtAddress:court?.address||'',startsAt:training.starts_at,duration:training.duration,ntrpMin:training.ntrp_min,ntrpMax:training.ntrp_max,price:training.price,note:training.note,members,joined:members.some(m=>m.id===viewer)};}
async function body(req,maxLength=16384){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>maxLength)fail(413,'Слишком большой запрос');}try{return JSON.parse(raw||'{}');}catch{fail(400,'Неверный JSON');}}
function str(v,max=100){return typeof v==='string'?v.trim().slice(0,max):'';}
function date(v){const n=Date.parse(v);if(!Number.isFinite(n))fail(400,'Неверная дата');return new Date(n).toISOString();}
async function api(req,res,url){
  if(url.pathname==='/api/config')return send(res,200,{demo:!process.env.BOT_TOKEN,botUsername:process.env.BOT_USERNAME||'',cities});
  const identity=authenticate(req);addUser.run(identity.id,identity.name,identity.username,now());
  const me=userDTO(identity.id);
  if(req.method==='GET'&&url.pathname==='/api/me')return send(res,200,{user:me});
  if(req.method==='POST'&&url.pathname==='/api/profile'){
    const b=await body(req,450000),name=str(b.name,60),level=b.ntrpLevel===null?null:Number(b.ntrpLevel);
    if(!name)fail(400,'Укажите имя');
    if(!['player','coach'].includes(b.role))fail(400,'Выберите роль: игрок или тренер');
    if(!['male','female'].includes(b.gender))fail(400,'Укажите пол');
    const years=Number(b.playingYears),coachYears=b.role==='coach'?Number(b.coachYears):null;
    if(!Number.isInteger(years)||years<0||years>80)fail(400,'Укажите стаж игры в годах');
    if(coachYears!==null&&(!Number.isInteger(coachYears)||coachYears<0||coachYears>80))fail(400,'Укажите тренерский стаж в годах');
    if(b.role==='player'&&(level===null||!Number.isFinite(level)||level<1||level>7||level*2!==Math.round(level*2))||b.role==='coach'&&level!==null&&(!Number.isFinite(level)||level<1||level>7||level*2!==Math.round(level*2)))fail(400,'Выберите уровень NTRP от 1.0 до 7.0');
    const city=str(b.city||'Краснодар',80),phone=str(b.phone,30),telegramContact=str(b.telegramContact,40).replace(/^@/,'');
    if(!cities.includes(city))fail(400,'Выберите город из списка');
    if(phone&&(!/^[+\d()\-\s]+$/.test(phone)||phone.replace(/\D/g,'').length<10||phone.replace(/\D/g,'').length>15))fail(400,'Проверьте номер телефона');
    if(telegramContact&&!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(telegramContact))fail(400,'Укажите Telegram username без ссылки');
    const coachSports=b.role==='coach'?(b.coachSports===undefined?['tennis','padel']:b.coachSports):[];
    if(!Array.isArray(coachSports)||b.role==='coach'&&coachSports.length===0||coachSports.length>2||coachSports.some(s=>!['tennis','padel'].includes(s))||new Set(coachSports).size!==coachSports.length)fail(400,'Выберите теннис, падел или оба вида спорта');
    const about=str(b.about,500),avatarId=b.avatarId===null?null:String(b.avatarId||'');
    if(!['male-serve','male-cap','male-court','female-serve','female-cap','female-court',null].includes(avatarId))fail(400,'Выберите аватарку');
    let photo=b.photoData;
    if(photo!==null){
      if(typeof photo!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)||photo.length>350000)fail(400,'Загрузите фотографию JPEG размером до 250 КБ');
      const bytes=Buffer.from(photo.slice(23),'base64');
      if(bytes.length>250000||bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)fail(400,'Некорректная фотография JPEG');
    }
    if(!photo&&!avatarId)fail(400,'Загрузите фото или выберите аватарку');
    saveProfile.run(name,level,photo,b.role,b.gender,years,about,coachYears,avatarId,city,phone||null,telegramContact||null,JSON.stringify(coachSports),now(),me.id);
    return send(res,200,{user:userDTO(me.id)});
  }
  if(!me.registered)fail(403,'Завершите регистрацию');
  const userMatch=url.pathname.match(/^\/api\/users\/([a-zA-Z0-9-]{1,60})$/);
  if(req.method==='GET'&&userMatch){
    const user=userDTO(userMatch[1]);if(!user?.registered)fail(404,'Профиль не найден');
    const {id,name,role,gender,playingYears,ntrpLevel,coachYears,about,avatarId,photoData,city,phone,telegramContact,coachSports}=user;
    return send(res,200,{user:{id,name,role,gender,playingYears,ntrpLevel,coachYears,about,avatarId,photoData,city,phone,telegramContact,coachSports}});
  }
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
  const bookingMatch=url.pathname.match(/^\/api\/bookings\/([a-f0-9-]{36})$/i);
  if(req.method==='DELETE'&&bookingMatch){
    const result=db.prepare('DELETE FROM bookings WHERE id=? AND user_id=?').run(bookingMatch[1],me.id);
    if(!result.changes)fail(404,'Заявка не найдена');
    return send(res,200,{cancelled:true});
  }
  if(req.method==='GET'&&url.pathname==='/api/trainings'){
    const rows=db.prepare('SELECT * FROM trainings WHERE starts_at>? ORDER BY starts_at LIMIT 100').all(new Date(Date.now()-3600000).toISOString());
    return send(res,200,{trainings:rows.map(t=>trainingDTO(t,me.id))});
  }
  if(req.method==='POST'&&url.pathname==='/api/trainings'){
    if(me.role!=='coach')fail(403,'Создать тренировку может только тренер');
    const b=await body(req),sport=str(b.sport),format=str(b.format),seats=Number(b.seats),duration=Number(b.duration),price=Number(b.price);
    if(!['tennis','padel'].includes(sport))fail(400,'Выберите теннис или падел');
    if(!me.coachSports.includes(sport))fail(403,'Добавьте этот вид спорта в профиль тренера');
    if(!['individual','split','group'].includes(format)||format==='individual'&&seats!==1||format==='split'&&seats!==2||format==='group'&&(!Number.isInteger(seats)||seats<3||seats>6))fail(400,'Выберите формат и число участников');
    const court=courts.find(c=>c.id===b.courtId&&c.sport===sport);if(!court)fail(400,'Выберите корт для выбранного вида спорта');
    const startsAt=date(b.startsAt);if(Date.parse(startsAt)<Date.now()+1800000||Date.parse(startsAt)>Date.now()+90*86400000)fail(400,'Выберите дату в ближайшие 90 дней');
    if(![60,90,120].includes(duration)||!Number.isInteger(price)||price<0||price>100000)fail(400,'Проверьте длительность и цену');
    const minInput=b.ntrpMin===undefined?b.avgNtrp:b.ntrpMin,maxInput=b.ntrpMax===undefined?b.avgNtrp:b.ntrpMax;
    const min=minInput===null?null:Number(minInput),max=maxInput===null?null:Number(maxInput);
    if((min===null)!==(max===null)||min!==null&&(!Number.isFinite(min)||!Number.isFinite(max)||min<1||max>7||min>max||min*2!==Math.round(min*2)||max*2!==Math.round(max*2)))fail(400,'Укажите диапазон NTRP от 1.0 до 7.0 либо без ограничения');
    const avg=min===null?null:(min+max)/2;
    const id=crypto.randomUUID();db.prepare('INSERT INTO trainings(id,coach_id,sport,format,seats,court_id,starts_at,duration,avg_ntrp,price,note,created_at,ntrp_min,ntrp_max) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,me.id,sport,format,seats,court.id,startsAt,duration,avg,price,str(b.note,240),now(),min,max);
    return send(res,201,{training:trainingDTO(getTraining.get(id),me.id)});
  }
  const trainingMatch=url.pathname.match(/^\/api\/trainings\/([a-f0-9-]{36})\/(join|leave)$/i);
  if(req.method==='POST'&&trainingMatch){
    const training=getTraining.get(trainingMatch[1]);if(!training)fail(404,'Тренировка не найдена');
    const members=getTrainingMembers.all(training.id),joined=members.some(m=>m.id===me.id);
    if(trainingMatch[2]==='join'){
      if(training.coach_id===me.id)fail(409,'Это ваша тренировка');
      if(Date.parse(training.starts_at)<Date.now())fail(409,'Тренировка уже началась');
      if(joined)fail(409,'Вы уже записаны');if(members.length>=training.seats)fail(409,'Свободных мест нет');
      db.prepare('INSERT INTO training_participants VALUES(?,?,?)').run(training.id,me.id,now());
    }else{
      if(!joined)fail(409,'Вы не записаны');
      db.prepare('DELETE FROM training_participants WHERE training_id=? AND user_id=?').run(training.id,me.id);
    }
    return send(res,200,{training:trainingDTO(training,me.id)});
  }
  if(req.method==='GET'&&url.pathname==='/api/games'){
    const sport=url.searchParams.get('sport');const mine=url.searchParams.get('mine')==='1';
    let rows=db.prepare('SELECT * FROM games WHERE starts_at>? ORDER BY starts_at LIMIT 100').all(new Date(Date.now()-30*86400000).toISOString());
    if(sport&&sport!=='all')rows=rows.filter(g=>g.sport===sport);
    if(mine)rows=rows.filter(g=>getMembers.all(g.id).some(m=>m.id===me.id));
    return send(res,200,{games:rows.map(g=>gameDTO(g,me.id))});
  }
  if(req.method==='POST'&&url.pathname==='/api/games'){
    const b=await body(req);const sport=str(b.sport),kind=str(b.kind),opponentGender=b.opponentGender??'any';
    if(!['any','male','female'].includes(opponentGender))fail(400,'Выберите пол соперника');
    if(!['tennis','padel'].includes(sport)||!['friendly','rating'].includes(kind))fail(400,'Выберите вид игры');
    const seats=Number(b.seats);if(![2,4].includes(seats)||kind==='rating'&&seats!==2)fail(400,'Рейтинговая игра пока доступна только 1 на 1');
    const startsAt=date(b.startsAt);if(Date.parse(startsAt)<Date.now()+1800000||Date.parse(startsAt)>Date.now()+90*86400000)fail(400,'Выберите дату в ближайшие 90 дней');
    const min=Number(b.levelMin),max=Number(b.levelMax),duration=Number(b.duration),price=Number(b.price);
    if(!Number.isFinite(min)||!Number.isFinite(max)||min<1||max>7||max<min||![60,90,120].includes(duration)||!Number.isInteger(price)||price<0||price>100000)fail(400,'Проверьте параметры игры');
    const court=courts.find(c=>c.id===b.courtId&&c.sport===sport);if(!court)fail(400,'Выберите корт из списка для этого вида спорта');
    const venue=court.name,city='Краснодар';
    const id=crypto.randomUUID();db.exec('BEGIN');try{
      db.prepare('INSERT INTO games(id,sport,city,venue,court_id,starts_at,duration,level_min,level_max,seats,price,kind,note,creator_id,created_at,opponent_gender) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,sport,city,venue,court.id,startsAt,duration,min,max,seats,price,kind,str(b.note,240),me.id,now(),opponentGender);
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
      if(game.opponent_gender!=='any'&&me.gender!==game.opponent_gender)fail(403,'Создатель игры указал другой пол участников');
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
      db.prepare('UPDATE games SET result_confirmed=1 WHERE id=? AND result_confirmed=0').run(game.id);
    }else fail(404,'Неизвестное действие');
    return send(res,200,{game:gameDTO(getGame.get(game.id),me.id),user:userDTO(me.id)});
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
