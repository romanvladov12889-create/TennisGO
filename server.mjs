import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import {initialRating,updateRating} from './rating.mjs';

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
 CREATE TABLE IF NOT EXISTS chat_messages(id TEXT PRIMARY KEY,kind TEXT NOT NULL,listing_id TEXT NOT NULL,sender_id TEXT NOT NULL REFERENCES users(id),peer_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS chat_listing ON chat_messages(kind,listing_id,created_at);
 CREATE TABLE IF NOT EXISTS direct_messages(id TEXT PRIMARY KEY,sender_id TEXT NOT NULL REFERENCES users(id),recipient_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT);
 CREATE TABLE IF NOT EXISTS player_ratings(user_id TEXT NOT NULL REFERENCES users(id),sport TEXT NOT NULL,rating REAL NOT NULL DEFAULT 1500,rd REAL NOT NULL DEFAULT 350,volatility REAL NOT NULL DEFAULT 0.06,matches INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,sport));
 CREATE TABLE IF NOT EXISTS rating_events(game_id TEXT NOT NULL REFERENCES games(id),user_id TEXT NOT NULL REFERENCES users(id),sport TEXT NOT NULL,previous REAL NOT NULL,current REAL NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(game_id,user_id));
 CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,link TEXT,created_at TEXT NOT NULL,read_at TEXT);
 CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id,created_at);
 CREATE TABLE IF NOT EXISTS training_reviews(training_id TEXT NOT NULL REFERENCES trainings(id),user_id TEXT NOT NULL REFERENCES users(id),coach_id TEXT NOT NULL REFERENCES users(id),score INTEGER NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(training_id,user_id));
 CREATE TABLE IF NOT EXISTS completed_trainings(training_id TEXT PRIMARY KEY REFERENCES trainings(id),completed_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS join_requests(kind TEXT NOT NULL CHECK(kind IN ('game','training')),listing_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),created_at TEXT NOT NULL,resolved_at TEXT,PRIMARY KEY(kind,listing_id,user_id));
 CREATE TABLE IF NOT EXISTS match_confirmations(game_id TEXT NOT NULL REFERENCES games(id),user_id TEXT NOT NULL REFERENCES users(id),phase TEXT NOT NULL CHECK(phase IN ('attendance','result')),created_at TEXT NOT NULL,PRIMARY KEY(game_id,user_id,phase));
 CREATE TABLE IF NOT EXISTS clubs(owner_id TEXT PRIMARY KEY REFERENCES users(id),name TEXT NOT NULL,address TEXT NOT NULL,city TEXT NOT NULL,phone TEXT NOT NULL,sports TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),created_at TEXT NOT NULL,reviewed_at TEXT,reviewed_by TEXT);
 CREATE TABLE IF NOT EXISTS court_reservations(id TEXT PRIMARY KEY,club_id TEXT NOT NULL REFERENCES clubs(owner_id),user_id TEXT NOT NULL REFERENCES users(id),sport TEXT NOT NULL,starts_at TEXT NOT NULL,duration INTEGER NOT NULL,created_at TEXT NOT NULL,cancelled_at TEXT);
 CREATE INDEX IF NOT EXISTS court_reservations_club ON court_reservations(club_id,starts_at);
 CREATE INDEX IF NOT EXISTS join_requests_listing ON join_requests(kind,listing_id,status);
 CREATE INDEX IF NOT EXISTS direct_inbox ON direct_messages(recipient_id,created_at);
 CREATE INDEX IF NOT EXISTS games_start ON games(starts_at);
 CREATE INDEX IF NOT EXISTS trainings_start ON trainings(starts_at);
`);
const clubColumns=new Set(db.prepare('PRAGMA table_info(clubs)').all().map(column=>column.name));
for(const [column,type] of [['photo_data','TEXT'],['surface','TEXT'],['opens_at','TEXT'],['closes_at','TEXT'],['hourly_price','INTEGER']])if(!clubColumns.has(column))db.exec(`ALTER TABLE clubs ADD COLUMN ${column} ${type}`);
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
if(!db.prepare('PRAGMA table_info(games)').all().some(column=>column.name==='cancelled_at'))db.exec('ALTER TABLE games ADD COLUMN cancelled_at TEXT');
if(!db.prepare('PRAGMA table_info(games)').all().some(column=>column.name==='requires_approval'))db.exec('ALTER TABLE games ADD COLUMN requires_approval INTEGER NOT NULL DEFAULT 0');
const gameColumns=new Set(db.prepare('PRAGMA table_info(games)').all().map(x=>x.name));
for(const [column,type] of [['result_disputed_at','TEXT'],['result_dispute_reason','TEXT'],['attendance_at','TEXT'],['attendance_by','TEXT'],['attendance_confirmed_at','TEXT'],['absence_by','TEXT'],['absence_reason','TEXT'],['absence_disputed_at','TEXT']])if(!gameColumns.has(column))db.exec(`ALTER TABLE games ADD COLUMN ${column} ${type}`);
const trainingColumns=new Set(db.prepare('PRAGMA table_info(trainings)').all().map(column=>column.name));
if(!trainingColumns.has('sport'))db.exec("ALTER TABLE trainings ADD COLUMN sport TEXT NOT NULL DEFAULT 'tennis'");
if(!trainingColumns.has('ntrp_min'))db.exec('ALTER TABLE trainings ADD COLUMN ntrp_min REAL');
if(!trainingColumns.has('ntrp_max'))db.exec('ALTER TABLE trainings ADD COLUMN ntrp_max REAL');
if(!trainingColumns.has('cancelled_at'))db.exec('ALTER TABLE trainings ADD COLUMN cancelled_at TEXT');
if(!trainingColumns.has('requires_approval'))db.exec('ALTER TABLE trainings ADD COLUMN requires_approval INTEGER NOT NULL DEFAULT 0');
if(!trainingColumns.has('ntrp_min')||!trainingColumns.has('ntrp_max'))db.exec('UPDATE trainings SET ntrp_min=avg_ntrp,ntrp_max=avg_ntrp WHERE avg_ntrp IS NOT NULL');
if(!db.prepare('PRAGMA table_info(chat_messages)').all().some(column=>column.name==='read_at'))db.exec('ALTER TABLE chat_messages ADD COLUMN read_at TEXT');
const now = () => new Date().toISOString();
function notifyUser(userId,message,link=''){
  db.prepare('INSERT INTO notifications VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),userId,message,link,now(),null);
  if(process.env.BOT_TOKEN&&/^\d+$/.test(userId)){
    fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:userId,text:`Tennis GO · ${message}`}),signal:AbortSignal.timeout(5000)})
      .then(async r=>{if(!r.ok)console.warn('Telegram notification rejected:',r.status);})
      .catch(e=>console.warn('Telegram notification unavailable:',e.message));
  }
}
function closePendingRequests(kind,id,message){const waiting=pendingRequests.all(kind,id);db.prepare("UPDATE join_requests SET status='rejected',resolved_at=? WHERE kind=? AND listing_id=? AND status='pending'").run(now(),kind,id);for(const user of waiting)notifyUser(user.id,message);}
function ratingOf(id,sport){return db.prepare('SELECT rating,rd,volatility,matches,wins,losses FROM player_ratings WHERE user_id=? AND sport=?').get(id,sport)||initialRating();}
function ratingSummary(id){return Object.fromEntries(['tennis','padel'].map(sport=>[sport,ratingOf(id,sport)]));}
function applyMatchRating(game,members){
  if(db.prepare('SELECT 1 FROM rating_events WHERE game_id=? LIMIT 1').get(game.id))return;
  const firstTeamWon=game.result.split(',').reduce((n,set)=>{const [a,b]=set.split(':').map(Number);return n+(a>b?1:-1);},0)>0;
  const old=members.map(x=>ratingOf(x.id,game.sport));
  members.forEach((m,i)=>{const rivals=old.filter((_,j)=>j%2!==i%2),opponent={...initialRating(),rating:rivals.reduce((sum,r)=>sum+r.rating,0)/rivals.length,rd:rivals.reduce((sum,r)=>sum+r.rd,0)/rivals.length};const r=updateRating(old[i],opponent,(i%2===0)===firstTeamWon?1:0);db.prepare('INSERT INTO player_ratings(user_id,sport,rating,rd,volatility,matches,wins,losses) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,sport) DO UPDATE SET rating=excluded.rating,rd=excluded.rd,volatility=excluded.volatility,matches=excluded.matches,wins=excluded.wins,losses=excluded.losses').run(m.id,game.sport,r.rating,r.rd,r.volatility,r.matches,r.wins,r.losses);db.prepare('INSERT INTO rating_events VALUES(?,?,?,?,?,?)').run(game.id,m.id,game.sport,old[i].rating,r.rating,now());});
}
const coaches = [{id:'anastasia',name:'Анастасия',sport:'Теннис',description:'Индивидуальная тренировка · любой уровень',price:2500,image:'/assets/coach.jpg'}];
const courts = JSON.parse(fs.readFileSync(path.join(publicDir,'courts.json'),'utf8'));
function allCourts(){const approved=db.prepare("SELECT owner_id,name,address,city,phone,sports,photo_data,surface,opens_at,hourly_price,closes_at FROM clubs WHERE status='approved'").all();return [...courts,...approved.flatMap(club=>JSON.parse(club.sports).map(sport=>({id:`club-${club.owner_id}-${sport}`,name:club.name,address:club.address,city:club.city,phone:club.phone,sport,clubId:club.owner_id,surface:club.surface||null,opensAt:club.opens_at||null,closesAt:club.closes_at||null,hourlyPrice:club.hourly_price??null,image:club.photo_data||'/assets/court_generic.svg'})))];}
const cities=JSON.parse(fs.readFileSync(path.join(publicDir,'cities.json'),'utf8'));
if(!process.env.BOT_TOKEN && db.prepare('SELECT COUNT(*) AS n FROM games').get().n===0){
  const owner='demo-host-0001';db.prepare('INSERT OR IGNORE INTO users(id,name,username,created_at,role,gender,ntrp_level,registered_at,registration_version) VALUES(?,?,?,?,?,?,?,?,?)').run(owner,'Алексей','','2026-01-01T00:00:00.000Z','player','male',3,'2026-01-01T00:00:00.000Z',2);
  const date=new Date(Date.now()+86400000);date.setUTCHours(16,0,0,0);
  const samples=[['tennis','dinamo',2,'friendly',1200,18],['padel','padel360',4,'friendly',800,20]];
  for(const [sport,courtId,seats,kind,price,hour] of samples){const start=new Date(date);start.setUTCHours(hour-3);const id=crypto.randomUUID(),court=allCourts().find(c=>c.id===courtId);db.prepare('INSERT INTO games(id,sport,city,venue,court_id,starts_at,duration,level_min,level_max,seats,price,kind,note,creator_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,sport,'Краснодар',court.name,court.id,start.toISOString(),90,2.5,3.5,seats,price,kind,'Демо игра · проверьте свободные места',owner,new Date().toISOString());db.prepare('INSERT INTO participants VALUES(?,?,?)').run(id,owner,new Date().toISOString());}
}
const getUser = db.prepare("SELECT id,COALESCE(NULLIF(display_name,''),name) AS name,username,ntrp_level AS ntrpLevel,photo_data AS photoData,role,gender,playing_years AS playingYears,about,coach_years AS coachYears,avatar_id AS avatarId,COALESCE(NULLIF(city,''),'Краснодар') AS city,phone,telegram_contact AS telegramContact,coach_sports AS coachSportsRaw,registration_version>=2 AS registered FROM users WHERE id=?");
const addUser = db.prepare('INSERT INTO users(id,name,username,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,username=excluded.username');
const saveProfile=db.prepare('UPDATE users SET display_name=?,ntrp_level=?,photo_data=?,role=?,gender=?,playing_years=?,about=?,coach_years=?,avatar_id=?,city=?,phone=?,telegram_contact=?,coach_sports=?,registered_at=COALESCE(registered_at,?),registration_version=2 WHERE id=?');
function userDTO(id){const user=getUser.get(id);if(!user)return null;const {coachSportsRaw,...fields}=user;let coachSports=['tennis','padel'];if(coachSportsRaw){try{coachSports=JSON.parse(coachSportsRaw);}catch{}}const club=fields.role==='club'?db.prepare('SELECT name,address,city,phone,sports,status,photo_data AS photoData,surface,opens_at AS opensAt,closes_at AS closesAt,hourly_price AS hourlyPrice FROM clubs WHERE owner_id=?').get(id):null;return {...fields,coachSports:fields.role==='coach'?coachSports:[],club:club?{...club,sports:JSON.parse(club.sports)}:null,isAdmin:isAdmin(id),ratings:ratingSummary(id)};}
function isAdmin(id){return !!process.env.ADMIN_TELEGRAM_ID&&id===process.env.ADMIN_TELEGRAM_ID||!process.env.BOT_TOKEN&&!!process.env.ADMIN_DEMO_USER_ID&&id===process.env.ADMIN_DEMO_USER_ID;}
const getRequest=db.prepare('SELECT status FROM join_requests WHERE kind=? AND listing_id=? AND user_id=?');
const pendingRequests=db.prepare("SELECT r.user_id AS id,COALESCE(NULLIF(u.display_name,''),u.name) AS name,u.avatar_id AS avatarId,u.photo_data AS photoData FROM join_requests r JOIN users u ON u.id=r.user_id WHERE r.kind=? AND r.listing_id=? AND r.status='pending' ORDER BY r.created_at");
function requestState(kind,id,viewer,owner){return {requiresApproval:!!owner.requires_approval,requestStatus:getRequest.get(kind,id,viewer)?.status||null,requests:owner.creator_id===viewer||owner.coach_id===viewer?pendingRequests.all(kind,id):[]};}
const getGame = db.prepare('SELECT * FROM games WHERE id=?');
const getMembers = db.prepare("SELECT u.id,COALESCE(NULLIF(u.display_name,''),u.name) AS name,u.avatar_id AS avatarId,u.photo_data AS photoData FROM participants p JOIN users u ON p.user_id=u.id WHERE p.game_id=? ORDER BY p.joined_at,p.rowid");
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
function gameDTO(game,viewer){const members=getMembers.all(game.id).map((m,i)=>({...m,team:i%2===0?'A':'B'})),court=allCourts().find(c=>c.id===game.court_id),creator=userDTO(game.creator_id),doubles=game.seats===4;const confirmations=doubles?db.prepare('SELECT user_id AS userId,phase FROM match_confirmations WHERE game_id=?').all(game.id):[];return {id:game.id,sport:game.sport,city:game.city,venue:game.venue,courtId:game.court_id,courtAddress:court?.address||'',startsAt:game.starts_at,duration:game.duration,levelMin:game.level_min,levelMax:game.level_max,seats:game.seats,price:game.price,kind:game.kind,note:game.note,creatorId:game.creator_id,creatorName:creator?.name||'Организатор',creatorAvatarId:creator?.avatarId||null,creatorPhotoData:creator?.photoData||null,creatorGender:creator?.gender||null,creatorNtrp:creator?.ntrpLevel??null,creatorRole:creator?.role||null,opponentGender:game.opponent_gender,cancelled:!!game.cancelled_at,members,joined:members.some(m=>m.id===viewer),result:game.result,resultBy:game.result_by,resultConfirmed:!!game.result_confirmed,resultDisputed:!!game.result_disputed_at,resultDisputeReason:game.result_dispute_reason||null,attendanceBy:game.attendance_by,attendanceDone:doubles?confirmations.some(c=>c.userId===viewer&&c.phase==='attendance'):game.attendance_by===viewer||!!game.attendance_confirmed_at&&members.some(m=>m.id===viewer),attendanceCount:doubles?confirmations.filter(c=>c.phase==='attendance').length:(game.attendance_confirmed_at?2:game.attendance_at?1:0),attendanceConfirmed:doubles?confirmations.filter(c=>c.phase==='attendance').length===4:!!game.attendance_confirmed_at,resultAcknowledged:doubles?confirmations.some(c=>c.userId===viewer&&c.phase==='result'):false,resultConfirmationCount:doubles?confirmations.filter(c=>c.phase==='result').length:(game.result_confirmed?2:game.result?1:0),absenceBy:game.absence_by,absenceReason:game.absence_reason,absenceDisputed:!!game.absence_disputed_at,...requestState('game',game.id,viewer,game)};}
function trainingDTO(training,viewer){const coach=userDTO(training.coach_id),members=getTrainingMembers.all(training.id),court=allCourts().find(c=>c.id===training.court_id);return {id:training.id,sport:training.sport||'tennis',city:court?.city||'Краснодар',coachId:training.coach_id,coachName:coach?.name||'Тренер',coachGender:coach?.gender||null,coachYears:coach?.coachYears??null,coachAvatarId:coach?.avatarId||null,coachPhotoData:coach?.photoData||null,format:training.format,seats:training.seats,courtId:training.court_id,courtName:court?.name||'',courtAddress:court?.address||'',startsAt:training.starts_at,duration:training.duration,ntrpMin:training.ntrp_min,ntrpMax:training.ntrp_max,price:training.price,note:training.note,cancelled:!!training.cancelled_at,completed:!!db.prepare('SELECT 1 FROM completed_trainings WHERE training_id=?').get(training.id),reviewed:!!db.prepare('SELECT 1 FROM training_reviews WHERE training_id=? AND user_id=?').get(training.id,viewer),members,joined:members.some(m=>m.id===viewer),...requestState('training',training.id,viewer,training)};}
async function body(req,maxLength=16384){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>maxLength)fail(413,'Слишком большой запрос');}try{return JSON.parse(raw||'{}');}catch{fail(400,'Неверный JSON');}}
function str(v,max=100){return typeof v==='string'?v.trim().slice(0,max):'';}
function date(v){const n=Date.parse(v);if(!Number.isFinite(n))fail(400,'Неверная дата');return new Date(n).toISOString();}
const weatherCaches=new Map(),weatherPending=new Map(),coordinates=new Map([['Краснодар',{latitude:45.04,longitude:38.98}]]);
async function weatherHours(city='Краснодар'){
 let weatherCache=weatherCaches.get(city)||{expires:0,hours:[],status:'loading'};
 if(Date.now()<weatherCache.expires)return weatherCache.hours;
 if(weatherPending.has(city))return weatherPending.get(city);
 const pending=(async()=>{try{
   let point=coordinates.get(city);
   if(!point){const geo=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=ru&format=json`,{signal:AbortSignal.timeout(7000)});if(!geo.ok)throw Error('Weather geocoding unavailable');const data=await geo.json();point=data.results?.find(x=>x.country_code==='RU');if(!point)throw Error('Weather city not found');coordinates.set(city,point);}
   const key=process.env.WEATHER_API_KEY,url=new URL((key?'https://customer-api.open-meteo.com':'https://api.open-meteo.com')+'/v1/forecast');
   for(const [k,v] of Object.entries({latitude:String(point.latitude),longitude:String(point.longitude),hourly:'temperature_2m,weather_code',timezone:'UTC',forecast_days:'16'}))url.searchParams.set(k,v);
   if(key)url.searchParams.set('apikey',key);
   const response=await fetch(url,{signal:AbortSignal.timeout(7000)});if(!response.ok)throw Error('Weather unavailable');
   const data=await response.json();const h=data.hourly;if(!Array.isArray(h?.time)||!Array.isArray(h.temperature_2m)||!Array.isArray(h.weather_code))throw Error('Weather format');
   weatherCache={expires:Date.now()+30*60000,status:'ok',hours:h.time.map((t,i)=>({time:t.endsWith('Z')?t:t+'Z',temperature:h.temperature_2m[i],code:h.weather_code[i]}))};
 }catch(error){console.warn('Weather forecast unavailable:',city,error.message);weatherCache={expires:Date.now()+5*60000,hours:[],status:'unavailable'};}weatherCaches.set(city,weatherCache);return weatherCache.hours;})();
 weatherPending.set(city,pending);try{return await pending;}finally{weatherPending.delete(city);}
}
async function api(req,res,url){
  if(url.pathname==='/api/config')return send(res,200,{demo:!process.env.BOT_TOKEN,botUsername:process.env.BOT_USERNAME||'',cities,version:'0.20.1'});
  if(req.method==='GET'&&url.pathname==='/api/weather'){const city=url.searchParams.get('city')||'Краснодар';if(!cities.includes(city))fail(400,'Выберите город из списка');const hours=await weatherHours(city);return send(res,200,{hours,status:weatherCaches.get(city).status,city,source:'Open-Meteo'});}
  const identity=authenticate(req);addUser.run(identity.id,identity.name,identity.username,now());
  const me=userDTO(identity.id);
  if(req.method==='GET'&&url.pathname==='/api/me')return send(res,200,{user:me});
  if(req.method==='POST'&&url.pathname==='/api/profile'){
    const b=await body(req,450000),name=str(b.name,60),level=b.ntrpLevel===null?null:Number(b.ntrpLevel);
    if(!name)fail(400,'Укажите имя');
    if(me.role==='club'&&b.role!=='club')fail(403,'Роль представителя клуба нельзя изменить');
    if(b.role==='club'){
      const clubName=str(b.clubName,100),address=str(b.clubAddress,180),city=str(b.city,80),phone=str(b.clubPhone,30),sports=b.clubSports;
      if(!clubName||!address||!cities.includes(city))fail(400,'Укажите название клуба, адрес и город');
      if(!/^[+\d()\-\s]+$/.test(phone)||phone.replace(/\D/g,'').length<10||phone.replace(/\D/g,'').length>15)fail(400,'Укажите телефон клуба');
      if(!Array.isArray(sports)||!sports.length||sports.length>2||sports.some(x=>!['tennis','padel'].includes(x))||new Set(sports).size!==sports.length)fail(400,'Выберите вид спорта клуба');
      const previous=db.prepare('SELECT photo_data FROM clubs WHERE owner_id=?').get(me.id);
      const clubPhoto=b.clubPhotoData??previous?.photo_data;
      if(!clubPhoto)fail(400,'Добавьте фото клуба или корта');
      if(typeof clubPhoto!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(clubPhoto)||clubPhoto.length>350000)fail(400,'Загрузите фото клуба JPEG размером до 250 КБ');
      const bytes=Buffer.from(clubPhoto.slice(23),'base64');
      if(bytes.length>250000||bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)fail(400,'Некорректное фото клуба JPEG');
      const surface=str(b.clubSurface,40),opensAt=str(b.opensAt,5),closesAt=str(b.closesAt,5),hourlyPrice=Number(b.hourlyPrice);
      if(!['hard','clay','grass','artificial_grass','carpet','other'].includes(surface))fail(400,'Выберите покрытие корта');
      if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(opensAt)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(closesAt)||closesAt<=opensAt)fail(400,'Укажите время работы в пределах одного дня');
      if(!Number.isInteger(hourlyPrice)||hourlyPrice<0||hourlyPrice>100000)fail(400,'Укажите стоимость за час');
      db.exec('BEGIN');try{
        saveProfile.run(name,null,null,'club',null,null,'',null,null,city,phone,null,'[]',now(),me.id);
        db.prepare("INSERT INTO clubs(owner_id,name,address,city,phone,sports,status,created_at,photo_data,surface,opens_at,closes_at,hourly_price) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET name=excluded.name,address=excluded.address,city=excluded.city,phone=excluded.phone,sports=excluded.sports,photo_data=excluded.photo_data,surface=excluded.surface,opens_at=excluded.opens_at,closes_at=excluded.closes_at,hourly_price=excluded.hourly_price,status='pending',reviewed_at=NULL,reviewed_by=NULL").run(me.id,clubName,address,city,phone,JSON.stringify(sports),now(),clubPhoto,surface,opensAt,closesAt,hourlyPrice);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      const admin=process.env.ADMIN_TELEGRAM_ID||(!process.env.BOT_TOKEN&&process.env.ADMIN_DEMO_USER_ID);
      if(admin&&getUser.get(admin))notifyUser(admin,`Новая заявка клуба «${clubName}» ожидает проверки`);
      return send(res,200,{user:userDTO(me.id)});
    }
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
  if(url.pathname==='/api/club/calendar'&&req.method==='GET'){
    if(me.role!=='club')fail(403,'Календарь доступен представителю клуба');
    const day=url.searchParams.get('date')||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day)))fail(400,'Укажите дату');
    const start=new Date(day+'T00:00:00+03:00').toISOString(),end=new Date(Date.parse(start)+86400000).toISOString();
    const reservations=db.prepare("SELECT r.id,r.sport,r.starts_at AS startsAt,r.duration,COALESCE(NULLIF(u.display_name,''),u.name) AS guestName,u.id AS guestId,u.phone AS guestPhone FROM court_reservations r JOIN users u ON u.id=r.user_id WHERE r.club_id=? AND r.cancelled_at IS NULL AND r.starts_at>=? AND r.starts_at<? ORDER BY r.starts_at").all(me.id,start,end);
    return send(res,200,{date:day,reservations,status:me.club?.status||'pending'});
  }
  if(url.pathname==='/api/admin/clubs'&&req.method==='GET'){
    if(!isAdmin(me.id))fail(403,'Доступно только администратору');
    const clubs=db.prepare("SELECT c.owner_id AS ownerId,c.name,c.address,c.city,c.phone,c.sports,c.status,c.photo_data AS photoData,c.surface,c.opens_at AS opensAt,c.closes_at AS closesAt,c.hourly_price AS hourlyPrice,c.created_at AS createdAt,COALESCE(NULLIF(u.display_name,''),u.name) AS contactName FROM clubs c JOIN users u ON u.id=c.owner_id WHERE c.status='pending' ORDER BY c.created_at").all();
    return send(res,200,{clubs:clubs.map(c=>({...c,sports:JSON.parse(c.sports)}))});
  }
  const clubDecision=url.pathname.match(/^\/api\/admin\/clubs\/([a-zA-Z0-9-]{1,60})\/(approve|reject)$/);
  if(req.method==='POST'&&clubDecision){
    if(!isAdmin(me.id))fail(403,'Доступно только администратору');
    const [ ,ownerId,decision]=clubDecision;
    if(decision==='approve'){
      const club=db.prepare('SELECT photo_data,surface,opens_at,closes_at,hourly_price FROM clubs WHERE owner_id=?').get(ownerId);
      if(!club?.photo_data||!club.surface||!club.opens_at||!club.closes_at||club.hourly_price===null)fail(409,'Клуб должен дополнить фото, покрытие, расписание и цену');
    }
    const changed=db.prepare("UPDATE clubs SET status=?,reviewed_at=?,reviewed_by=? WHERE owner_id=? AND status='pending'").run(decision==='approve'?'approved':'rejected',now(),me.id,ownerId);
    if(!changed.changes)fail(409,'Заявка уже рассмотрена или не найдена');
    notifyUser(ownerId,decision==='approve'?'Клуб подтверждён. Календарь открыт.':'Заявка клуба отклонена. Исправьте данные в профиле и отправьте снова.');
    return send(res,200,{ok:true});
  }
  if(me.role==='club'&&!url.pathname.startsWith('/api/club/'))fail(403,'Представителю клуба доступен календарь записей');
  if(req.method==='GET'&&url.pathname==='/api/events/marathon'){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit'}).formatToParts(new Date());
    const year=Number(parts.find(p=>p.type==='year').value),month=Number(parts.find(p=>p.type==='month').value);
    const start=new Date(`${year}-${String(month).padStart(2,'0')}-01T00:00:00+03:00`),nextYear=month===12?year+1:year,nextMonth=month===12?1:month+1;
    const end=new Date(`${nextYear}-${String(nextMonth).padStart(2,'0')}-01T00:00:00+03:00`);
    const rows=db.prepare("SELECT u.id,COALESCE(NULLIF(u.display_name,''),u.name) AS name,u.avatar_id AS avatarId,u.photo_data AS photoData,COUNT(*) AS games FROM participants p JOIN games g ON g.id=p.game_id JOIN users u ON u.id=p.user_id WHERE g.kind='rating' AND g.result_confirmed=1 AND g.cancelled_at IS NULL AND g.starts_at>=? AND g.starts_at<? AND u.registration_version>=2 GROUP BY p.user_id ORDER BY games DESC,MIN(g.starts_at),u.id LIMIT 3").all(start.toISOString(),end.toISOString());
    const mine=db.prepare("SELECT COUNT(*) AS games FROM participants p JOIN games g ON g.id=p.game_id WHERE p.user_id=? AND g.kind='rating' AND g.result_confirmed=1 AND g.cancelled_at IS NULL AND g.starts_at>=? AND g.starts_at<?").get(me.id,start.toISOString(),end.toISOString()).games;
    return send(res,200,{title:`Игровой марафон · ${new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'Europe/Moscow'}).format(start)}`,month:`${year}-${String(month).padStart(2,'0')}`,goal:20,games:mine,leaders:rows,earned:mine>=20});
  }
  if(req.method==='GET'&&url.pathname==='/api/court-bookings'){
    const rows=db.prepare("SELECT r.id,r.sport,r.starts_at AS startsAt,r.duration,c.name AS clubName,c.address,c.city FROM court_reservations r JOIN clubs c ON c.owner_id=r.club_id WHERE r.user_id=? AND r.cancelled_at IS NULL ORDER BY r.starts_at").all(me.id);
    return send(res,200,{bookings:rows});
  }
  if(req.method==='POST'&&url.pathname==='/api/court-bookings'){
    const b=await body(req),club=db.prepare("SELECT * FROM clubs WHERE owner_id=? AND status='approved'").get(b.clubId),sport=str(b.sport),startsAt=date(b.startsAt),duration=Number(b.duration);
    if(!club||!JSON.parse(club.sports).includes(sport))fail(400,'Выберите подтверждённый корт');
    if(![60,90,120].includes(duration)||Date.parse(startsAt)<Date.now()+1800000||Date.parse(startsAt)>Date.now()+90*86400000)fail(400,'Проверьте время и длительность');
    const end=new Date(Date.parse(startsAt)+duration*60000).toISOString();
    if(club.opens_at&&club.closes_at){const localTime=value=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value));const from=localTime(startsAt),to=localTime(end);if(from<club.opens_at||to>club.closes_at||to<=from)fail(409,`Корт работает с ${club.opens_at} до ${club.closes_at} по Москве`);}
    db.exec('BEGIN IMMEDIATE');try{
      const occupied=db.prepare("SELECT 1 FROM court_reservations WHERE club_id=? AND sport=? AND cancelled_at IS NULL AND starts_at<? AND datetime(starts_at,'+'||duration||' minutes')>datetime(?) LIMIT 1").get(club.owner_id,sport,end,startsAt);
      if(occupied)fail(409,'Это время уже занято');
      db.prepare('INSERT INTO court_reservations VALUES(?,?,?,?,?,?,?,NULL)').run(crypto.randomUUID(),club.owner_id,me.id,sport,startsAt,duration,now());
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    notifyUser(club.owner_id,`Новая запись на корт · ${me.name} · ${startsAt.slice(0,16)}`);
    return send(res,201,{ok:true});
  }
  const courtBooking=url.pathname.match(/^\/api\/court-bookings\/([a-f0-9-]{36})$/i);
  if(req.method==='DELETE'&&courtBooking){
    const booking=db.prepare('SELECT club_id FROM court_reservations WHERE id=? AND user_id=? AND cancelled_at IS NULL').get(courtBooking[1],me.id);
    if(!booking)fail(404,'Бронирование не найдено');
    db.prepare('UPDATE court_reservations SET cancelled_at=? WHERE id=?').run(now(),courtBooking[1]);notifyUser(booking.club_id,`Бронирование отменено · ${me.name}`);
    return send(res,200,{cancelled:true});
  }
  if(req.method==='GET'&&url.pathname==='/api/progress'){
    const monthKey=value=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit'}).formatToParts(new Date(value));return `${parts.find(p=>p.type==='year').value}-${parts.find(p=>p.type==='month').value}`;};
    const currentKey=monthKey(Date.now()),[year,month]=currentKey.split('-').map(Number);
    const months=Array.from({length:5},(_,i)=>{const d=new Date(Date.UTC(year,month-1-4+i,1));return {key:d.toISOString().slice(0,7),label:new Intl.DateTimeFormat('ru-RU',{month:'short',timeZone:'UTC'}).format(d),games:0,trainings:0,rating:1500};});
    const byMonth=new Map(months.map(item=>[item.key,item]));
    const games=db.prepare("SELECT g.starts_at AS startsAt,g.duration FROM games g JOIN participants p ON p.game_id=g.id WHERE p.user_id=? AND g.sport='tennis' AND g.cancelled_at IS NULL AND g.starts_at<?").all(me.id,now()).filter(g=>Date.parse(g.startsAt)+g.duration*60000<=Date.now());
    const trainings=db.prepare("SELECT t.starts_at AS startsAt FROM trainings t JOIN training_participants p ON p.training_id=t.id JOIN completed_trainings c ON c.training_id=t.id WHERE p.user_id=? AND t.sport='tennis' AND t.cancelled_at IS NULL").all(me.id);
    for(const game of games){const item=byMonth.get(monthKey(game.startsAt));if(item)item.games++;}
    for(const training of trainings){const item=byMonth.get(monthKey(training.startsAt));if(item)item.trainings++;}
    const events=db.prepare("SELECT previous,current,created_at AS createdAt FROM rating_events WHERE user_id=? AND sport='tennis' ORDER BY created_at").all(me.id);
    let score=1500,index=0;
    for(const item of months){while(index<events.length&&monthKey(events[index].createdAt)<=item.key){score=events[index].current;index++;}item.rating=Math.round(score);}
    const firstInPeriod=events.find(event=>monthKey(event.createdAt)>=months[0].key);
    const ratingDelta=firstInPeriod?Math.round(ratingOf(me.id,'tennis').rating-firstInPeriod.previous):null;
    return send(res,200,{months,totalGames:games.length,totalTrainings:trainings.length,ratingDelta});
  }
  if(req.method==='GET'&&url.pathname==='/api/notifications'){
    const items=db.prepare('SELECT id,body,link,created_at AS createdAt,read_at AS readAt FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 60').all(me.id);
    return send(res,200,{items,unread:items.filter(x=>!x.readAt).length});
  }
  if(req.method==='POST'&&url.pathname==='/api/notifications/read'){
    db.prepare('UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL').run(now(),me.id);return send(res,200,{ok:true});
  }
  if(req.method==='GET'&&url.pathname==='/api/ratings/history')return send(res,200,{events:db.prepare('SELECT game_id AS gameId,sport,previous,current,created_at AS createdAt FROM rating_events WHERE user_id=? ORDER BY created_at DESC LIMIT 30').all(me.id)});
  if(req.method==='GET'&&url.pathname==='/api/leaderboard'){
    const sport=url.searchParams.get('sport')||'tennis';if(!['tennis','padel'].includes(sport))fail(400,'Выберите вид спорта');
    const players=db.prepare("SELECT u.id,COALESCE(NULLIF(u.display_name,''),u.name) AS name,COALESCE(NULLIF(u.city,''),'Краснодар') AS city,u.avatar_id AS avatarId,u.photo_data AS photoData,r.rating,r.matches,r.wins,r.losses FROM player_ratings r JOIN users u ON u.id=r.user_id WHERE r.sport=? AND r.matches>0 AND u.registration_version>=2 AND u.role='player' ORDER BY r.rating DESC,r.matches DESC LIMIT 100").all(sport);
    return send(res,200,{sport,players});
  }
  if(req.method==='GET'&&url.pathname==='/api/users'){
    const search=str(url.searchParams.get('q'),80),offset=Math.min(10000,Math.max(0,Number(url.searchParams.get('offset'))||0)),role=url.searchParams.get('role');
    if(role!==null&&role!=='coach')fail(400,'Неизвестный фильтр пользователей');
    const ids=db.prepare("SELECT id,COALESCE(NULLIF(display_name,''),name) AS name FROM users WHERE registration_version>=2 AND id<>? AND (? IS NULL OR role=?) ORDER BY COALESCE(NULLIF(display_name,''),name),id").all(me.id,role,role).filter(row=>row.name.toLocaleLowerCase('ru-RU').includes(search.toLocaleLowerCase('ru-RU'))).slice(offset,offset+31);
    return send(res,200,{users:ids.slice(0,30).map(({id})=>{const {name,role,city,avatarId,photoData,ntrpLevel,coachSports}=userDTO(id);return {id,name,role,city,avatarId,photoData,ntrpLevel,coachSports};}),hasMore:ids.length>30});
  }
  const joinDecision=url.pathname.match(/^\/api\/(games|trainings)\/([a-f0-9-]{36})\/requests\/([a-zA-Z0-9-]{1,60})\/(approve|reject)$/i);
  if(req.method==='POST'&&joinDecision){
    const [,group,id,userId,decision]=joinDecision,kind=group==='games'?'game':'training',listing=kind==='game'?getGame.get(id):getTraining.get(id);
    if(!listing)fail(404,'Объявление не найдено');
    if((kind==='game'?listing.creator_id:listing.coach_id)!==me.id)fail(403,'Только организатор может решать по заявкам');
    if(!listing.requires_approval||listing.cancelled_at||Date.parse(listing.starts_at)<=Date.now())fail(409,'Приём заявок закрыт');
    if(getRequest.get(kind,id,userId)?.status!=='pending')fail(409,'Заявка уже обработана или отменена');
    if(decision==='approve'){
      db.exec('BEGIN IMMEDIATE');try{
        if(getRequest.get(kind,id,userId)?.status!=='pending')fail(409,'Заявка уже обработана');
        const members=kind==='game'?getMembers.all(id):getTrainingMembers.all(id);
        if(members.length>=listing.seats)fail(409,'Свободных мест больше нет');
        if(kind==='game'&&listing.opponent_gender!=='any'&&userDTO(userId)?.gender!==listing.opponent_gender)fail(409,'Пол участника больше не соответствует условиям игры');
        db.prepare(kind==='game'?'INSERT INTO participants VALUES(?,?,?)':'INSERT INTO training_participants VALUES(?,?,?)').run(id,userId,now());
        db.prepare("UPDATE join_requests SET status='approved',resolved_at=? WHERE kind=? AND listing_id=? AND user_id=?").run(now(),kind,id,userId);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
    }else db.prepare("UPDATE join_requests SET status='rejected',resolved_at=? WHERE kind=? AND listing_id=? AND user_id=? AND status='pending'").run(now(),kind,id,userId);
    notifyUser(userId,decision==='approve'?'Ваша заявка подтверждена организатором':'Организатор отклонил вашу заявку');
    return send(res,200,kind==='game'?{game:gameDTO(getGame.get(id),me.id)}:{training:trainingDTO(getTraining.get(id),me.id)});
  }
  if(req.method==='GET'&&url.pathname==='/api/inbox'){
    const conversations=new Map();
    function add(key,kind,listingId,otherId,message){const prev=conversations.get(key);if(!prev||message.createdAt>prev.lastAt)conversations.set(key,{key,kind,listingId,peerId:otherId,lastMessage:message.body,lastAt:message.createdAt,unread:prev?.unread||0});const thread=conversations.get(key);if(message.senderId!==me.id&&!message.readAt)thread.unread++;}
    const listingMessages=db.prepare('SELECT kind,listing_id AS listingId,sender_id AS senderId,peer_id AS peerId,body,created_at AS createdAt,read_at AS readAt FROM chat_messages WHERE sender_id=? OR peer_id=? ORDER BY created_at').all(me.id,me.id);
    for(const m of listingMessages){const other=m.senderId===me.id?m.peerId:m.senderId;add(`${m.kind}:${m.listingId}:${other}`,m.kind,m.listingId,other,m);}
    const directMessages=db.prepare('SELECT sender_id AS senderId,recipient_id AS peerId,body,created_at AS createdAt,read_at AS readAt FROM direct_messages WHERE sender_id=? OR recipient_id=? ORDER BY created_at').all(me.id,me.id);
    for(const m of directMessages){const other=m.senderId===me.id?m.peerId:m.senderId;add(`direct:${other}`,'direct',null,other,m);}
    const threads=[...conversations.values()].map(t=>{const u=userDTO(t.peerId),listing=t.kind==='game'?getGame.get(t.listingId):t.kind==='training'?getTraining.get(t.listingId):null;return {...t,peerName:u?.name||'Пользователь',peerAvatarId:u?.avatarId||null,peerPhotoData:u?.photoData||null,title:t.kind==='game'?`Игра · ${listing?.venue||''}`:t.kind==='training'?`Тренировка · ${allCourts().find(c=>c.id===listing?.court_id)?.name||''}`:'Личный чат'};}).sort((a,b)=>b.lastAt.localeCompare(a.lastAt));
    return send(res,200,{threads,unread:threads.reduce((n,t)=>n+t.unread,0)});
  }
  const directMatch=url.pathname.match(/^\/api\/direct\/([a-zA-Z0-9-]{1,60})$/);
  if(directMatch&&['GET','POST'].includes(req.method)){
    const peerId=directMatch[1],peer=userDTO(peerId);if(!peer?.registered||peerId===me.id)fail(404,'Пользователь не найден');
    if(req.method==='POST'){
      const b=await body(req,2000),message=str(b.message,500);if(!message)fail(400,'Напишите сообщение');
      const recent=db.prepare('SELECT COUNT(*) AS n FROM direct_messages WHERE sender_id=? AND created_at>?').get(me.id,new Date(Date.now()-60000).toISOString()).n;
      if(recent>=10)fail(429,'Слишком много сообщений. Подождите минуту');
      db.prepare('INSERT INTO direct_messages VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),me.id,peerId,message,now(),null);
      notifyUser(peerId,`${me.name}: новое личное сообщение`);
    }
    db.prepare('UPDATE direct_messages SET read_at=? WHERE recipient_id=? AND sender_id=? AND read_at IS NULL').run(now(),me.id,peerId);
    const messages=db.prepare('SELECT * FROM (SELECT id,sender_id AS senderId,body,created_at AS createdAt FROM direct_messages WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?) ORDER BY created_at DESC LIMIT 100) ORDER BY createdAt').all(me.id,peerId,peerId,me.id);
    return send(res,200,{messages,peer:{id:peer.id,name:peer.name}});
  }
  const userMatch=url.pathname.match(/^\/api\/users\/([a-zA-Z0-9-]{1,60})$/);
  if(req.method==='GET'&&userMatch){
    const user=userDTO(userMatch[1]);if(!user?.registered)fail(404,'Профиль не найден');
    const {id,name,role,gender,playingYears,ntrpLevel,coachYears,about,avatarId,photoData,city,phone,telegramContact,coachSports,ratings}=user;
    const reviews=role==='coach'?db.prepare('SELECT score,body,created_at AS createdAt FROM training_reviews WHERE coach_id=? ORDER BY created_at DESC LIMIT 30').all(id):[];
    return send(res,200,{user:{id,name,role,gender,playingYears,ntrpLevel,coachYears,about,avatarId,photoData,city,phone,telegramContact,coachSports,ratings,reviews}});
  }
  if(req.method==='GET'&&url.pathname==='/api/catalog')return send(res,200,{coaches,courts:allCourts()});
  const chatPath=url.pathname.match(/^\/api\/chats\/(game|training)\/([a-f0-9-]{36})(?:\/([a-zA-Z0-9-]{1,60}))?$/i);
  if(chatPath&&['GET','POST'].includes(req.method)){
    const [,kind,id,peerId]=chatPath,listing=kind==='game'?getGame.get(id):getTraining.get(id);
    if(!listing)fail(404,'Объявление не найдено');
    const authorId=kind==='game'?listing.creator_id:listing.coach_id;
    if(!peerId){
      if(req.method!=='GET'||me.id!==authorId)fail(403,'Список диалогов доступен автору');
      const ids=db.prepare('SELECT DISTINCT CASE WHEN sender_id=? THEN peer_id ELSE sender_id END AS id FROM chat_messages WHERE kind=? AND listing_id=? AND (sender_id=? OR peer_id=?)').all(me.id,kind,id,me.id,me.id);
      return send(res,200,{threads:ids.map(row=>{const u=userDTO(row.id);return {id:row.id,name:u?.name||'Участник',avatarId:u?.avatarId||null,photoData:u?.photoData||null};})});
    }
    if(me.id===peerId||!userDTO(peerId)?.registered)fail(404,'Собеседник не найден');
    if(me.id!==authorId&&peerId!==authorId)fail(403,'Написать можно автору объявления');
    if(me.id===authorId){
      const known=db.prepare('SELECT 1 FROM chat_messages WHERE kind=? AND listing_id=? AND (sender_id=? OR peer_id=?) LIMIT 1').get(kind,id,peerId,peerId);
      const participant=kind==='game'?getMembers.all(id).some(x=>x.id===peerId):getTrainingMembers.all(id).some(x=>x.id===peerId);
      if(!known&&!participant)fail(403,'Диалог недоступен');
    }
    if(req.method==='POST'){
      const b=await body(req,2000),message=str(b.message,500);
      if(!message)fail(400,'Напишите сообщение');
      const recent=db.prepare('SELECT COUNT(*) AS n FROM chat_messages WHERE sender_id=? AND created_at>?').get(me.id,new Date(Date.now()-60000).toISOString()).n;
      if(recent>=10)fail(429,'Слишком много сообщений. Подождите минуту');
      db.prepare('INSERT INTO chat_messages(id,kind,listing_id,sender_id,peer_id,body,created_at) VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),kind,id,me.id,peerId,message,now());
      notifyUser(peerId,`${me.name}: сообщение по объявлению`);
    }
    db.prepare('UPDATE chat_messages SET read_at=? WHERE kind=? AND listing_id=? AND sender_id=? AND peer_id=? AND read_at IS NULL').run(now(),kind,id,peerId,me.id);
    const messages=db.prepare('SELECT * FROM (SELECT id,sender_id AS senderId,body,created_at AS createdAt FROM chat_messages WHERE kind=? AND listing_id=? AND sender_id IN (?,?) AND peer_id IN (?,?) ORDER BY created_at DESC LIMIT 100) ORDER BY createdAt').all(kind,id,me.id,peerId,me.id,peerId);
    return send(res,200,{messages});
  }
  if(req.method==='GET'&&url.pathname==='/api/bookings'){
    const rows=db.prepare('SELECT * FROM bookings WHERE user_id=? ORDER BY starts_at DESC').all(me.id);
    return send(res,200,{bookings:rows.map(x=>({id:x.id,coach:coaches.find(c=>c.id===x.coach_id),court:allCourts().find(c=>c.id===x.court_id),startsAt:x.starts_at}))});
  }
  if(req.method==='POST'&&url.pathname==='/api/bookings'){
    const b=await body(req);if(!coaches.some(c=>c.id===b.coachId)||!allCourts().some(c=>c.id===b.courtId&&c.sport==='tennis'))fail(400,'Выберите тренера и теннисный корт');
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
    if(b.requiresApproval!==undefined&&typeof b.requiresApproval!=='boolean')fail(400,'Проверьте подтверждение заявок');
    if(!['tennis','padel'].includes(sport))fail(400,'Выберите теннис или падел');
    if(!me.coachSports.includes(sport))fail(403,'Добавьте этот вид спорта в профиль тренера');
    if(!['individual','split','group'].includes(format)||format==='individual'&&seats!==1||format==='split'&&seats!==2||format==='group'&&(!Number.isInteger(seats)||seats<3||seats>6))fail(400,'Выберите формат и число участников');
    const court=allCourts().find(c=>c.id===b.courtId&&c.sport===sport);if(!court)fail(400,'Выберите корт для выбранного вида спорта');
    const startsAt=date(b.startsAt);if(Date.parse(startsAt)<Date.now()+1800000||Date.parse(startsAt)>Date.now()+90*86400000)fail(400,'Выберите дату в ближайшие 90 дней');
    if(![60,90,120].includes(duration)||!Number.isInteger(price)||price<0||price>100000)fail(400,'Проверьте длительность и цену');
    const minInput=b.ntrpMin===undefined?b.avgNtrp:b.ntrpMin,maxInput=b.ntrpMax===undefined?b.avgNtrp:b.ntrpMax;
    const min=minInput===null?null:Number(minInput),max=maxInput===null?null:Number(maxInput);
    if((min===null)!==(max===null)||min!==null&&(!Number.isFinite(min)||!Number.isFinite(max)||min<1||max>7||min>max||min*2!==Math.round(min*2)||max*2!==Math.round(max*2)))fail(400,'Укажите диапазон NTRP от 1.0 до 7.0 либо без ограничения');
    const avg=min===null?null:(min+max)/2;
    const id=crypto.randomUUID();db.prepare('INSERT INTO trainings(id,coach_id,sport,format,seats,court_id,starts_at,duration,avg_ntrp,price,note,created_at,ntrp_min,ntrp_max,requires_approval) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,me.id,sport,format,seats,court.id,startsAt,duration,avg,price,str(b.note,240),now(),min,max,b.requiresApproval?1:0);
    return send(res,201,{training:trainingDTO(getTraining.get(id),me.id)});
  }
  const trainingEditor=url.pathname.match(/^\/api\/trainings\/([a-f0-9-]{36})$/i);
  if(trainingEditor&&['PATCH','DELETE'].includes(req.method)){
    const old=getTraining.get(trainingEditor[1]);if(!old)fail(404,'Тренировка не найдена');
    if(old.coach_id!==me.id)fail(403,'Изменить тренировку может только её тренер');
    if(old.cancelled_at)fail(409,'Тренировка отменена');
    if(Date.parse(old.starts_at)<Date.now())fail(409,'Тренировка уже началась');
    if(req.method==='DELETE'){db.prepare('UPDATE trainings SET cancelled_at=? WHERE id=?').run(now(),old.id);closePendingRequests('training',old.id,'Тренировка отменена, заявка закрыта');for(const member of getTrainingMembers.all(old.id))notifyUser(member.id,`Тренировка ${old.starts_at.slice(0,10)} отменена`);return send(res,200,{training:trainingDTO(getTraining.get(old.id),me.id)});}
    const b=await body(req),sport=str(b.sport),format=str(b.format),seats=Number(b.seats),duration=Number(b.duration),price=Number(b.price);
    if(b.requiresApproval!==undefined&&typeof b.requiresApproval!=='boolean')fail(400,'Проверьте подтверждение заявок');
    if(!me.coachSports.includes(sport))fail(403,'Добавьте этот вид спорта в профиль тренера');
    if(!['individual','split','group'].includes(format)||format==='individual'&&seats!==1||format==='split'&&seats!==2||format==='group'&&(!Number.isInteger(seats)||seats<3||seats>6))fail(400,'Проверьте формат тренировки');
    if(seats<getTrainingMembers.all(old.id).length)fail(409,'Мест меньше числа записавшихся');
    const court=allCourts().find(c=>c.id===b.courtId&&c.sport===sport);if(!court)fail(400,'Выберите корт для выбранного вида спорта');
    const startsAt=date(b.startsAt);if(Date.parse(startsAt)<Date.now()+1800000||Date.parse(startsAt)>Date.now()+90*86400000)fail(400,'Выберите дату в ближайшие 90 дней');
    if(![60,90,120].includes(duration)||!Number.isInteger(price)||price<0||price>100000)fail(400,'Проверьте длительность и цену');
    const min=b.ntrpMin===null?null:Number(b.ntrpMin),max=b.ntrpMax===null?null:Number(b.ntrpMax);
    if((min===null)!==(max===null)||min!==null&&(!Number.isFinite(min)||!Number.isFinite(max)||min<1||max>7||min>max||min*2!==Math.round(min*2)||max*2!==Math.round(max*2)))fail(400,'Проверьте диапазон NTRP');
    const requiresApproval=b.requiresApproval===undefined?!!old.requires_approval:b.requiresApproval;
    db.prepare('UPDATE trainings SET sport=?,format=?,seats=?,court_id=?,starts_at=?,duration=?,avg_ntrp=?,ntrp_min=?,ntrp_max=?,price=?,note=?,requires_approval=? WHERE id=?').run(sport,format,seats,court.id,startsAt,duration,min===null?null:(min+max)/2,min,max,price,str(b.note,240),requiresApproval?1:0,old.id);
    if(!requiresApproval&&old.requires_approval)closePendingRequests('training',old.id,'Тренер изменил условия записи. Отправьте заявку снова.');
    return send(res,200,{training:trainingDTO(getTraining.get(old.id),me.id)});
  }
  const reviewMatch=url.pathname.match(/^\/api\/trainings\/([a-f0-9-]{36})\/review$/i);
  if(req.method==='POST'&&reviewMatch){
    const training=getTraining.get(reviewMatch[1]);if(!training)fail(404,'Тренировка не найдена');
    if(training.cancelled_at||!db.prepare('SELECT 1 FROM completed_trainings WHERE training_id=?').get(training.id)||training.coach_id===me.id||!getTrainingMembers.all(training.id).some(m=>m.id===me.id))fail(403,'Отзыв доступен только участнику после подтверждения тренировки');
    const b=await body(req),score=Number(b.score),comment=str(b.comment,500);if(!Number.isInteger(score)||score<1||score>5||comment.length<10)fail(400,'Выберите 1–5 звёзд и напишите от 10 символов');
    if(db.prepare('SELECT 1 FROM training_reviews WHERE training_id=? AND user_id=?').get(training.id,me.id))fail(409,'Вы уже оставили отзыв об этой тренировке');
    db.prepare('INSERT INTO training_reviews VALUES(?,?,?,?,?,?)').run(training.id,me.id,training.coach_id,score,comment,now());
    notifyUser(training.coach_id,`Новый отзыв о тренировке · ${score}/5`);return send(res,200,{ok:true});
  }
  const completeTraining=url.pathname.match(/^\/api\/trainings\/([a-f0-9-]{36})\/complete$/i);
  if(req.method==='POST'&&completeTraining){const training=getTraining.get(completeTraining[1]);if(!training||training.coach_id!==me.id)fail(403,'Подтвердить тренировку может только тренер');if(training.cancelled_at||Date.parse(training.starts_at)+training.duration*60000>Date.now())fail(409,'Тренировка ещё не завершилась');if(db.prepare('SELECT 1 FROM completed_trainings WHERE training_id=?').get(training.id))fail(409,'Тренировка уже подтверждена');db.prepare('INSERT INTO completed_trainings VALUES(?,?)').run(training.id,now());for(const m of getTrainingMembers.all(training.id))notifyUser(m.id,'Тренер подтвердил проведённую тренировку. Можно оставить отзыв.');return send(res,200,{training:trainingDTO(training,me.id)});}
  const trainingMatch=url.pathname.match(/^\/api\/trainings\/([a-f0-9-]{36})\/(join|leave)$/i);
  if(req.method==='POST'&&trainingMatch){
    const training=getTraining.get(trainingMatch[1]);if(!training)fail(404,'Тренировка не найдена');
    if(training.cancelled_at)fail(409,'Тренировка отменена');
    const members=getTrainingMembers.all(training.id),joined=members.some(m=>m.id===me.id);
    if(trainingMatch[2]==='join'){
      if(training.coach_id===me.id)fail(409,'Это ваша тренировка');
      if(Date.parse(training.starts_at)<Date.now())fail(409,'Тренировка уже началась');
      if(joined)fail(409,'Вы уже записаны');if(members.length>=training.seats)fail(409,'Свободных мест нет');
      if(training.requires_approval){
        if(getRequest.get('training',training.id,me.id)?.status==='pending')fail(409,'Заявка уже ждёт подтверждения');
        db.prepare("INSERT INTO join_requests(kind,listing_id,user_id,status,created_at,resolved_at) VALUES('training',?,?,'pending',?,NULL) ON CONFLICT(kind,listing_id,user_id) DO UPDATE SET status='pending',created_at=excluded.created_at,resolved_at=NULL").run(training.id,me.id,now());
        notifyUser(training.coach_id,`${me.name} просит записать его на тренировку`);
      }else{db.prepare('INSERT INTO training_participants VALUES(?,?,?)').run(training.id,me.id,now());db.prepare("DELETE FROM join_requests WHERE kind='training' AND listing_id=? AND user_id=?").run(training.id,me.id);notifyUser(training.coach_id,`${me.name} записался на тренировку`);}
    }else{
      const pending=getRequest.get('training',training.id,me.id)?.status==='pending';
      if(!joined&&!pending)fail(409,'Вы не записаны');
      if(Date.parse(training.starts_at)<Date.now())fail(409,'Тренировка уже началась');
      if(joined)db.prepare('DELETE FROM training_participants WHERE training_id=? AND user_id=?').run(training.id,me.id);
      db.prepare("DELETE FROM join_requests WHERE kind='training' AND listing_id=? AND user_id=?").run(training.id,me.id);
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
    if(b.requiresApproval!==undefined&&typeof b.requiresApproval!=='boolean')fail(400,'Проверьте подтверждение заявок');
    if(!['any','male','female'].includes(opponentGender))fail(400,'Выберите пол соперника');
    if(!['tennis','padel'].includes(sport)||!['friendly','rating'].includes(kind))fail(400,'Выберите вид игры');
    const seats=Number(b.seats);if(![2,4].includes(seats))fail(400,'Рейтинговая игра пока доступна только 1 на 1');
    const startsAt=date(b.startsAt);if(Date.parse(startsAt)<Date.now()+1800000||Date.parse(startsAt)>Date.now()+90*86400000)fail(400,'Выберите дату в ближайшие 90 дней');
    const min=Number(b.levelMin),max=Number(b.levelMax),duration=Number(b.duration),price=Number(b.price);
    if(!Number.isFinite(min)||!Number.isFinite(max)||min<1||max>7||max<min||![60,90,120].includes(duration)||!Number.isInteger(price)||price<0||price>100000)fail(400,'Проверьте параметры игры');
    const court=allCourts().find(c=>c.id===b.courtId&&c.sport===sport);if(!court)fail(400,'Выберите корт из списка для этого вида спорта');
    const venue=court.name,city=court.city||'Краснодар';
    const id=crypto.randomUUID();db.exec('BEGIN');try{
      db.prepare('INSERT INTO games(id,sport,city,venue,court_id,starts_at,duration,level_min,level_max,seats,price,kind,note,creator_id,created_at,opponent_gender,requires_approval) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,sport,city,venue,court.id,startsAt,duration,min,max,seats,price,kind,str(b.note,240),me.id,now(),opponentGender,b.requiresApproval?1:0);
      db.prepare('INSERT INTO participants VALUES(?,?,?)').run(id,me.id,now());db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    return send(res,201,{game:gameDTO(getGame.get(id),me.id)});
  }
  const gameEditor=url.pathname.match(/^\/api\/games\/([a-f0-9-]{36})$/i);
  if(gameEditor&&['PATCH','DELETE'].includes(req.method)){
    const old=getGame.get(gameEditor[1]);if(!old)fail(404,'Игра не найдена');
    if(old.creator_id!==me.id)fail(403,'Изменить игру может только создатель');
    if(old.cancelled_at)fail(409,'Игра отменена');
    if(Date.parse(old.starts_at)<Date.now()||old.result)fail(409,'Эту игру уже нельзя изменить');
    if(req.method==='DELETE'){db.prepare('UPDATE games SET cancelled_at=? WHERE id=?').run(now(),old.id);closePendingRequests('game',old.id,'Игра отменена, заявка закрыта');for(const member of getMembers.all(old.id))if(member.id!==me.id)notifyUser(member.id,`Игра ${old.starts_at.slice(0,10)} отменена`);return send(res,200,{game:gameDTO(getGame.get(old.id),me.id)});}
    const b=await body(req),sport=str(b.sport),kind=str(b.kind),seats=Number(b.seats),duration=Number(b.duration),price=Number(b.price),opponentGender=b.opponentGender;
    if(b.requiresApproval!==undefined&&typeof b.requiresApproval!=='boolean')fail(400,'Проверьте подтверждение заявок');
    if(!['tennis','padel'].includes(sport)||!['friendly','rating'].includes(kind)||![2,4].includes(seats)||!['any','male','female'].includes(opponentGender))fail(400,'Проверьте формат игры');
    if(seats<getMembers.all(old.id).length)fail(409,'Мест меньше числа участников');
    const court=allCourts().find(c=>c.id===b.courtId&&c.sport===sport);if(!court)fail(400,'Выберите корт для выбранного вида спорта');
    const startsAt=date(b.startsAt);if(Date.parse(startsAt)<Date.now()+1800000||Date.parse(startsAt)>Date.now()+90*86400000)fail(400,'Выберите дату в ближайшие 90 дней');
    const min=Number(b.levelMin),max=Number(b.levelMax);
    if(!Number.isFinite(min)||!Number.isFinite(max)||min<1||max>7||max<min||min*2!==Math.round(min*2)||max*2!==Math.round(max*2)||![60,90,120].includes(duration)||!Number.isInteger(price)||price<0||price>100000)fail(400,'Проверьте параметры игры');
    const requiresApproval=b.requiresApproval===undefined?!!old.requires_approval:b.requiresApproval;
    db.prepare('UPDATE games SET sport=?,kind=?,seats=?,court_id=?,venue=?,city=?,starts_at=?,duration=?,level_min=?,level_max=?,price=?,opponent_gender=?,note=?,requires_approval=? WHERE id=?').run(sport,kind,seats,court.id,court.name,court.city||'Краснодар',startsAt,duration,min,max,price,opponentGender,str(b.note,240),requiresApproval?1:0,old.id);
    if(!requiresApproval&&old.requires_approval)closePendingRequests('game',old.id,'Организатор изменил условия записи. Отправьте заявку снова.');
    return send(res,200,{game:gameDTO(getGame.get(old.id),me.id)});
  }
  const match=url.pathname.match(/^\/api\/games\/([a-f0-9-]{36})(?:\/(join|leave|attend|confirm-attendance|report-absence|contest-absence|result|confirm|dispute))?$/i);
  if(match){const game=getGame.get(match[1]);if(!game)fail(404,'Игра не найдена');const action=match[2];
    if(req.method==='GET'&&!action)return send(res,200,{game:gameDTO(game,me.id)});
    if(req.method!=='POST')fail(405,'Метод не поддерживается');
    if(game.cancelled_at)fail(409,'Игра отменена');
    const members=getMembers.all(game.id),joined=members.some(m=>m.id===me.id);
    if(action==='join'){
      if(Date.parse(game.starts_at)<Date.now())fail(409,'Игра уже началась');if(joined)fail(409,'Вы уже в игре');if(members.length>=game.seats)fail(409,'Мест больше нет');
      if(game.opponent_gender!=='any'&&me.gender!==game.opponent_gender)fail(403,'Создатель игры указал другой пол участников');
      if(game.requires_approval){
        if(getRequest.get('game',game.id,me.id)?.status==='pending')fail(409,'Заявка уже ждёт подтверждения');
        db.prepare("INSERT INTO join_requests(kind,listing_id,user_id,status,created_at,resolved_at) VALUES('game',?,?,'pending',?,NULL) ON CONFLICT(kind,listing_id,user_id) DO UPDATE SET status='pending',created_at=excluded.created_at,resolved_at=NULL").run(game.id,me.id,now());
        notifyUser(game.creator_id,`${me.name} просит присоединиться к игре`);
      }else{db.prepare('INSERT INTO participants VALUES(?,?,?)').run(game.id,me.id,now());db.prepare("DELETE FROM join_requests WHERE kind='game' AND listing_id=? AND user_id=?").run(game.id,me.id);notifyUser(game.creator_id,`${me.name} присоединился к игре`);}
    }else if(action==='leave'){
      const pending=getRequest.get('game',game.id,me.id)?.status==='pending';
      if(!joined&&!pending)fail(409,'Вы не участвуете');if(game.creator_id===me.id)fail(409,'Создатель пока не может удалить игру');
      if(game.seats===4&&db.prepare('SELECT 1 FROM match_confirmations WHERE game_id=? LIMIT 1').get(game.id))fail(409,'Участники уже начали подтверждать матч');
      if(game.result)fail(409,'Результат уже внесён');if(joined)db.prepare('DELETE FROM participants WHERE game_id=? AND user_id=?').run(game.id,me.id);
      db.prepare("DELETE FROM join_requests WHERE kind='game' AND listing_id=? AND user_id=?").run(game.id,me.id);
    }else if(action==='attend'){
      if(!joined||members.length!==game.seats||game.kind!=='rating'||Date.parse(game.starts_at)>Date.now())fail(403,'Подтверждение матча недоступно');
      if(game.absence_by)fail(409,'По игре заявлена неявка. Результат не учитывается');
      if(game.seats===4){
        const changed=db.prepare("INSERT OR IGNORE INTO match_confirmations(game_id,user_id,phase,created_at) VALUES(?,?,'attendance',?)").run(game.id,me.id,now());
        if(!changed.changes)fail(409,'Вы уже подтвердили встречу');
        const count=db.prepare("SELECT COUNT(*) AS n FROM match_confirmations WHERE game_id=? AND phase='attendance'").get(game.id).n;
        if(count===4)for(const member of members)notifyUser(member.id,'Все участники подтвердили встречу. Можно внести счёт.');
        else if(me.id!==game.creator_id)notifyUser(game.creator_id,`${me.name} подтвердил встречу · ${count} из 4`);
        return send(res,200,{game:gameDTO(getGame.get(game.id),me.id),user:userDTO(me.id)});
      }
      if(game.attendance_at)fail(409,'Подтверждение уже отправлено');
      db.prepare('UPDATE games SET attendance_at=?,attendance_by=? WHERE id=?').run(now(),me.id,game.id);
      notifyUser(members.find(x=>x.id!==me.id).id,'Соперник подтвердил, что игра состоялась. Подтвердите встречу.');
    }else if(action==='confirm-attendance'){
      if(game.seats===4)fail(409,'Подтвердите встречу кнопкой «Да, мы играли»');
      if(!joined||game.absence_by||!game.attendance_at||game.attendance_by===me.id||game.attendance_confirmed_at)fail(409,'Подтверждение недоступно');
      db.prepare('UPDATE games SET attendance_confirmed_at=? WHERE id=?').run(now(),game.id);
      notifyUser(game.attendance_by,'Соперник подтвердил встречу. Можно внести результат.');
    }else if(action==='report-absence'){
      if(!joined||members.length!==2||game.kind!=='rating'||Date.parse(game.starts_at)+game.duration*60000>Date.now()||game.attendance_confirmed_at||game.absence_by)fail(409,'Заявить неявку сейчас нельзя');
      const reason=str((await body(req)).reason,240);if(reason.length<5)fail(400,'Опишите ситуацию');
      db.prepare('UPDATE games SET absence_by=?,absence_reason=? WHERE id=?').run(me.id,reason,game.id);
      notifyUser(members.find(x=>x.id!==me.id).id,'Соперник сообщил о неявке. Если это ошибка, откройте игру и оспорьте заявление.');
    }else if(action==='contest-absence'){
      if(!joined||!game.absence_by||game.absence_by===me.id||game.absence_disputed_at)fail(409,'Оспорить неявку нельзя');
      db.prepare('UPDATE games SET absence_disputed_at=? WHERE id=?').run(now(),game.id);
      notifyUser(game.absence_by,'Соперник оспорил заявление о неявке. Рейтинг не меняется.');
    }else if(action==='result'){
      if(!joined||members.length!==game.seats||game.kind!=='rating')fail(403,'Сначала соберите всех участников рейтинговой игры');
      if(game.seats===4&&game.creator_id!==me.id)fail(403,'Счёт парной игры вносит организатор');
      if(Date.parse(game.starts_at)+game.duration*60000>Date.now())fail(409,'Дождитесь окончания игры');
      if(game.seats===4?db.prepare("SELECT COUNT(*) AS n FROM match_confirmations WHERE game_id=? AND phase='attendance'").get(game.id).n!==4:!game.attendance_confirmed_at)fail(409,'Сначала все участники должны подтвердить встречу');
      if(game.result_confirmed)fail(409,'Результат уже подтверждён');
      if(game.result&&game.result_by!==me.id)fail(403,'Исправить счёт может только отправивший его игрок');
      const b=await body(req);const score=str(b.score,60).replace(/\s+/g,'');const sets=score.split(',');
      if(sets.length<2||sets.length>3||!sets.every(s=>{if(!/^\d{1,2}:\d{1,2}$/.test(s))return false;const [x,y]=s.split(':').map(Number),hi=Math.max(x,y),lo=Math.min(x,y);return hi===6&&lo<=4||hi===7&&(lo===5||lo===6);}))fail(400,'Укажите счёт сетов, например 6:4, 6:3');
      let a=0,z=0;for(const s of sets){const [x,y]=s.split(':').map(Number);if(x===y)fail(400,'Счёт сета не может быть равным');x>y?a++:z++;}
      if(Math.max(a,z)!==2||sets.length===3&&((sets[0].split(':').map(Number)[0]>sets[0].split(':').map(Number)[1])===(sets[1].split(':').map(Number)[0]>sets[1].split(':').map(Number)[1])))fail(400,'Для победы нужны два выигранных сета');
      db.prepare('UPDATE games SET result=?, result_by=?, result_confirmed=0,result_disputed_at=NULL,result_dispute_reason=NULL WHERE id=?').run(score,me.id,game.id);
      if(game.seats===4)db.prepare("DELETE FROM match_confirmations WHERE game_id=? AND phase='result'").run(game.id);
      for(const member of members)if(member.id!==me.id)notifyUser(member.id,'Организатор внёс результат. Подтвердите счёт или откройте спор.');
    }else if(action==='dispute'){
      if(!joined||!game.result||game.result_by===me.id||game.result_confirmed)fail(409,'Спор по счёту недоступен');
      const b=await body(req),reason=str(b.reason,240);if(reason.length<5)fail(400,'Опишите ошибку в счёте');
      db.prepare('UPDATE games SET result_disputed_at=?,result_dispute_reason=? WHERE id=?').run(now(),reason,game.id);
      notifyUser(game.result_by,'Соперник оспорил результат. Проверьте счёт и отправьте его повторно.');
    }else if(action==='confirm'){
      if(!joined||!game.result||game.result_by===me.id||game.result_confirmed||game.result_disputed_at)fail(409,'Подтверждение недоступно');
      if(game.seats===4){
        const changed=db.prepare("INSERT OR IGNORE INTO match_confirmations(game_id,user_id,phase,created_at) VALUES(?,?,'result',?)").run(game.id,me.id,now());
        if(!changed.changes)fail(409,'Вы уже подтвердили счёт');
        const count=db.prepare("SELECT COUNT(*) AS n FROM match_confirmations WHERE game_id=? AND phase='result'").get(game.id).n;
        if(count<3){notifyUser(game.creator_id,`${me.name} подтвердил счёт · ${count} из 3`);return send(res,200,{game:gameDTO(getGame.get(game.id),me.id),user:userDTO(me.id)});}
      }
      db.exec('BEGIN');try{db.prepare('UPDATE games SET result_confirmed=1 WHERE id=? AND result_confirmed=0').run(game.id);applyMatchRating(game,members);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
      for(const member of members)notifyUser(member.id,'Результат подтверждён. Рейтинг Tennis GO обновлён.');
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
    res.writeHead(200,{'Content-Type':responses[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org"});fs.createReadStream(file).pipe(res);
  }catch(e){if(!res.headersSent)send(res,e.status||500,{error:e.status?e.message:'Ошибка сервера'});else res.end();}
});
if(import.meta.url===`file://${process.argv[1]}`)server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log(`Tennis GO Mini App: http://localhost:${process.env.PORT||3000} (${process.env.BOT_TOKEN?'Telegram':'demo'})`));
export {server,db,verifyInitData};
