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
const mediaDir=path.join(path.dirname(dbPath),'profile-media');
fs.mkdirSync(mediaDir,{recursive:true});
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT, tennis_rating INTEGER NOT NULL DEFAULT 1200, padel_rating INTEGER NOT NULL DEFAULT 1200, created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS games(id TEXT PRIMARY KEY, sport TEXT NOT NULL, city TEXT NOT NULL, venue TEXT NOT NULL, court_id TEXT, starts_at TEXT NOT NULL, duration INTEGER NOT NULL, level_min REAL NOT NULL, level_max REAL NOT NULL, seats INTEGER NOT NULL, price INTEGER NOT NULL, kind TEXT NOT NULL, note TEXT NOT NULL, creator_id TEXT NOT NULL REFERENCES users(id), result TEXT, result_by TEXT, result_confirmed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS participants(game_id TEXT NOT NULL REFERENCES games(id), user_id TEXT NOT NULL REFERENCES users(id), joined_at TEXT NOT NULL, PRIMARY KEY(game_id,user_id));
 CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), coach_id TEXT NOT NULL, court_id TEXT NOT NULL, starts_at TEXT NOT NULL, created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS trainings(id TEXT PRIMARY KEY, coach_id TEXT NOT NULL REFERENCES users(id), format TEXT NOT NULL, seats INTEGER NOT NULL, court_id TEXT NOT NULL, starts_at TEXT NOT NULL, duration INTEGER NOT NULL, avg_ntrp REAL, price INTEGER NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS training_participants(training_id TEXT NOT NULL REFERENCES trainings(id), user_id TEXT NOT NULL REFERENCES users(id), joined_at TEXT NOT NULL, PRIMARY KEY(training_id,user_id));
 CREATE TABLE IF NOT EXISTS training_requests(id TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES users(id),sport TEXT NOT NULL CHECK(sport IN ('tennis','padel')),city TEXT NOT NULL,format TEXT NOT NULL CHECK(format IN ('individual','split','group')),starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,court_ids TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL,cancelled_at TEXT);
 CREATE INDEX IF NOT EXISTS training_requests_start ON training_requests(starts_at);
 CREATE TABLE IF NOT EXISTS chat_messages(id TEXT PRIMARY KEY,kind TEXT NOT NULL,listing_id TEXT NOT NULL,sender_id TEXT NOT NULL REFERENCES users(id),peer_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS chat_listing ON chat_messages(kind,listing_id,created_at);
 CREATE TABLE IF NOT EXISTS direct_messages(id TEXT PRIMARY KEY,sender_id TEXT NOT NULL REFERENCES users(id),recipient_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,created_at TEXT NOT NULL,read_at TEXT);
 CREATE TABLE IF NOT EXISTS player_ratings(user_id TEXT NOT NULL REFERENCES users(id),sport TEXT NOT NULL,rating REAL NOT NULL DEFAULT 1500,rd REAL NOT NULL DEFAULT 350,volatility REAL NOT NULL DEFAULT 0.06,matches INTEGER NOT NULL DEFAULT 0,wins INTEGER NOT NULL DEFAULT 0,losses INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,sport));
 CREATE TABLE IF NOT EXISTS rating_events(game_id TEXT NOT NULL REFERENCES games(id),user_id TEXT NOT NULL REFERENCES users(id),sport TEXT NOT NULL,previous REAL NOT NULL,current REAL NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(game_id,user_id));
 CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL,link TEXT,created_at TEXT NOT NULL,read_at TEXT);
 CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id,created_at);
 CREATE TABLE IF NOT EXISTS bot_outbox(notification_id TEXT PRIMARY KEY REFERENCES notifications(id),user_id TEXT NOT NULL,body TEXT NOT NULL,link TEXT,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS bot_outbox_due ON bot_outbox(next_attempt_at);
 CREATE TABLE IF NOT EXISTS news(id TEXT PRIMARY KEY,author_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,body TEXT NOT NULL,published_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS court_geocodes(address_key TEXT PRIMARY KEY,latitude REAL,longitude REAL,checked_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS event_reminders(kind TEXT NOT NULL CHECK(kind IN ('game','training')),listing_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),hours_before INTEGER NOT NULL CHECK(hours_before IN (12,3)),sent_at TEXT NOT NULL,PRIMARY KEY(kind,listing_id,user_id,hours_before));
 CREATE TABLE IF NOT EXISTS moderation_actions(id TEXT PRIMARY KEY,admin_id TEXT NOT NULL REFERENCES users(id),action TEXT NOT NULL,target_kind TEXT NOT NULL,target_id TEXT NOT NULL,detail TEXT,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS activity_days(user_id TEXT NOT NULL REFERENCES users(id),day TEXT NOT NULL,PRIMARY KEY(user_id,day));
 CREATE TABLE IF NOT EXISTS training_reviews(training_id TEXT NOT NULL REFERENCES trainings(id),user_id TEXT NOT NULL REFERENCES users(id),coach_id TEXT NOT NULL REFERENCES users(id),score INTEGER NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(training_id,user_id));
 CREATE TABLE IF NOT EXISTS completed_trainings(training_id TEXT PRIMARY KEY REFERENCES trainings(id),completed_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS join_requests(kind TEXT NOT NULL CHECK(kind IN ('game','training')),listing_id TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),created_at TEXT NOT NULL,resolved_at TEXT,PRIMARY KEY(kind,listing_id,user_id));
 CREATE TABLE IF NOT EXISTS match_confirmations(game_id TEXT NOT NULL REFERENCES games(id),user_id TEXT NOT NULL REFERENCES users(id),phase TEXT NOT NULL CHECK(phase IN ('attendance','result')),created_at TEXT NOT NULL,PRIMARY KEY(game_id,user_id,phase));
 CREATE TABLE IF NOT EXISTS match_polls(game_id TEXT PRIMARY KEY REFERENCES games(id),status TEXT NOT NULL CHECK(status IN ('pending','confirmed','not_counted')),prompted_at TEXT NOT NULL,resolved_at TEXT,reason TEXT);
 CREATE TABLE IF NOT EXISTS match_votes(game_id TEXT NOT NULL REFERENCES games(id),user_id TEXT NOT NULL REFERENCES users(id),choice TEXT NOT NULL CHECK(choice IN ('win','loss','no_score')),created_at TEXT NOT NULL,PRIMARY KEY(game_id,user_id));
 CREATE TABLE IF NOT EXISTS bot_state(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS clubs(owner_id TEXT PRIMARY KEY REFERENCES users(id),name TEXT NOT NULL,address TEXT NOT NULL,city TEXT NOT NULL,phone TEXT NOT NULL,sports TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),created_at TEXT NOT NULL,reviewed_at TEXT,reviewed_by TEXT);
 CREATE TABLE IF NOT EXISTS court_reservations(id TEXT PRIMARY KEY,club_id TEXT NOT NULL REFERENCES clubs(owner_id),user_id TEXT NOT NULL REFERENCES users(id),sport TEXT NOT NULL,starts_at TEXT NOT NULL,duration INTEGER NOT NULL,created_at TEXT NOT NULL,cancelled_at TEXT);
 CREATE TABLE IF NOT EXISTS profile_media(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL CHECK(kind IN ('photo','video')),mime TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS profile_media_owner ON profile_media(owner_id,created_at);
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
for(const [column,type] of [['role','TEXT'],['gender','TEXT'],['playing_years','INTEGER'],['about','TEXT'],['coach_years','INTEGER'],['coach_courts',"TEXT NOT NULL DEFAULT '[]'"],['coach_achievements','TEXT'],['avatar_id','TEXT'],['registered_at','TEXT'],['registration_version','INTEGER NOT NULL DEFAULT 0'],['city','TEXT'],['phone','TEXT'],['telegram_contact','TEXT'],['coach_sports','TEXT'],['preferred_sports',"TEXT NOT NULL DEFAULT '[]'"]]){
  if(!userColumns.has(column))db.exec(`ALTER TABLE users ADD COLUMN ${column} ${type}`);
}
// Existing users already entered the app before registration was introduced.
if(!userColumns.has('registered_at'))db.exec('UPDATE users SET registered_at=created_at');
if(!db.prepare('PRAGMA table_info(games)').all().some(column=>column.name==='opponent_gender'))db.exec("ALTER TABLE games ADD COLUMN opponent_gender TEXT NOT NULL DEFAULT 'any'");
if(!db.prepare('PRAGMA table_info(games)').all().some(column=>column.name==='cancelled_at'))db.exec('ALTER TABLE games ADD COLUMN cancelled_at TEXT');
if(!db.prepare('PRAGMA table_info(games)').all().some(column=>column.name==='requires_approval'))db.exec('ALTER TABLE games ADD COLUMN requires_approval INTEGER NOT NULL DEFAULT 0');
if(!db.prepare('PRAGMA table_info(games)').all().some(column=>column.name==='court_reserved'))db.exec('ALTER TABLE games ADD COLUMN court_reserved INTEGER NOT NULL DEFAULT 0');
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
for(const table of ['chat_messages','direct_messages'])if(!db.prepare(`PRAGMA table_info(${table})`).all().some(column=>column.name==='deleted_at'))db.exec(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT`);
if(!userColumns.has('blocked_at'))db.exec('ALTER TABLE users ADD COLUMN blocked_at TEXT');
if(!userColumns.has('blocked_reason'))db.exec('ALTER TABLE users ADD COLUMN blocked_reason TEXT');
if(!userColumns.has('last_seen_at'))db.exec('ALTER TABLE users ADD COLUMN last_seen_at TEXT');
const newsColumns=new Set(db.prepare('PRAGMA table_info(news)').all().map(column=>column.name));
if(!newsColumns.has('sport'))db.exec("ALTER TABLE news ADD COLUMN sport TEXT NOT NULL DEFAULT 'all'");
if(!newsColumns.has('image_path'))db.exec('ALTER TABLE news ADD COLUMN image_path TEXT');
const now = () => new Date().toISOString();
const insertNotification=db.prepare('INSERT INTO notifications VALUES(?,?,?,?,?,?)');
const enqueueBot=db.prepare('INSERT INTO bot_outbox(notification_id,user_id,body,link,next_attempt_at) VALUES(?,?,?,?,?)');
if(!db.prepare('PRAGMA table_info(bot_outbox)').all().some(x=>x.name==='reply_markup'))db.exec('ALTER TABLE bot_outbox ADD COLUMN reply_markup TEXT');
function notifyUser(userId,message,link='',replyMarkup=null){
  const id=crypto.randomUUID();insertNotification.run(id,userId,message,link,now(),null);
  if(process.env.BOT_TOKEN&&/^\d+$/.test(userId)){
    enqueueBot.run(id,userId,message,link,now());
    if(replyMarkup)db.prepare('UPDATE bot_outbox SET reply_markup=? WHERE notification_id=?').run(JSON.stringify(replyMarkup),id);
  }
}
function broadcast(message,link='',sport='all'){
  const users=db.prepare("SELECT id,preferred_sports AS preferredSportsRaw FROM users WHERE registration_version>=2 AND role IN ('player','coach') AND blocked_at IS NULL").all().filter(user=>{try{const preferred=JSON.parse(user.preferredSportsRaw||'[]');return sport==='all'||preferred.length!==1||preferred[0]===sport;}catch{return true;}});
  db.exec('BEGIN');try{for(const user of users)notifyUser(user.id,message,link);db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
}
const tournamentId='tennis-go-tournament-2026-10-04';
db.exec('CREATE TABLE IF NOT EXISTS content_seeds(key TEXT PRIMARY KEY, created_at TEXT NOT NULL)');
const tournamentBody=`Приглашаем всех провести воскресенье вместе на корте: поиграть, поболеть друг за друга и просто классно провести время!

📍 Академия «Вопреки»
🗓 Воскресенье, 4 октября, с 18:00 до 20:00

Раздельные рейтинговые игры для мужчин и женщин.
Мужчины: уровень NTRP 3–3.5, 8 мест.
Женщины: уровень NTRP 2.5–3, 8 мест.

Вас ждут кубки для победителей, пицца, безалкогольное пиво Corona, закуски и напитки, фотограф.

✨ Лотерея среди всех участниц: разыгрываем два сертификата среди категорий. Победитель сам выберет приз из трёх вариантов: консультация по хоумстейджингу от топ-дизайнера, урок бизнес-английского и релокации с репетитором или тренировка по теннису с тренером международного класса. Победителей выберем случайно независимо от результатов турнира.

Будем очень рады вас видеть! ❤️
Запись: @aiidamar`;
const firstTournamentSeed=db.prepare('INSERT OR IGNORE INTO content_seeds(key,created_at) VALUES(?,?)').run(tournamentId,now()).changes;
if(firstTournamentSeed){
  db.prepare('INSERT OR IGNORE INTO users(id,name,username,created_at) VALUES(?,?,?,?)').run('tennis-go-system','Tennis GO','',now());
  const inserted=db.prepare('INSERT OR IGNORE INTO news(id,author_id,title,body,published_at,sport,image_path) VALUES(?,?,?,?,?,?,?)').run(tournamentId,'tennis-go-system','Турнир по теннису среди мужчин и женщин 🎾',tournamentBody,now(),'tennis','/assets/tennis-tournament-2026-10-04.jpg');
  if(inserted.changes)broadcast('Турнир по теннису 4 октября в Академии «Вопреки» — запись @aiidamar','news','tennis');
}
let botSending=false,botPausedUntil=0;
function notificationButton(link){
  const raw=process.env.APP_URL||process.env.RAILWAY_PUBLIC_DOMAIN&&`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  if(raw){
    try{const url=new URL(raw);if(url.protocol==='https:'){
      url.pathname='/';url.search='';url.hash='';
      if(link&&/^[a-zA-Z0-9_-]{1,64}$/.test(link))url.searchParams.set('start',link);
      return {text:'Открыть в Tennis GO',web_app:{url:url.toString()}};
    }}catch{}
  }
  if(process.env.BOT_USERNAME)return {text:'Открыть в Tennis GO',url:`https://t.me/${process.env.BOT_USERNAME.replace(/^@/,'')}?startapp=${encodeURIComponent(link||'home')}`};
  return null;
}
async function sendNextBotMessage(){
  if(botSending||!process.env.BOT_TOKEN||Date.now()<botPausedUntil)return;
  const item=db.prepare('SELECT * FROM bot_outbox WHERE next_attempt_at<=? ORDER BY next_attempt_at,notification_id LIMIT 1').get(now());if(!item)return;
  botSending=true;
  try{
    const payload={chat_id:item.user_id,text:`Tennis GO · ${item.body}`};
    const button=notificationButton(item.link);if(item.reply_markup)payload.reply_markup=JSON.parse(item.reply_markup);else if(button)payload.reply_markup={inline_keyboard:[[button]]};
    const response=await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(8000)});
    const result=await response.json();
    if(result.ok){db.prepare('DELETE FROM bot_outbox WHERE notification_id=?').run(item.notification_id);return;}
    if(response.status===403||response.status===400){db.prepare('DELETE FROM bot_outbox WHERE notification_id=?').run(item.notification_id);console.warn('Telegram message unavailable for user:',item.user_id,response.status);return;}
    const delay=response.status===429?Math.max(1,Number(result.parameters?.retry_after)||5):Math.min(3600,2**Math.min(item.attempts+1,10));
    if(response.status===429)botPausedUntil=Date.now()+delay*1000;
    db.prepare('UPDATE bot_outbox SET attempts=attempts+1,next_attempt_at=? WHERE notification_id=?').run(new Date(Date.now()+delay*1000).toISOString(),item.notification_id);
  }catch(error){const delay=Math.min(3600,2**Math.min(item.attempts+1,10));db.prepare('UPDATE bot_outbox SET attempts=attempts+1,next_attempt_at=? WHERE notification_id=?').run(new Date(Date.now()+delay*1000).toISOString(),item.notification_id);console.warn('Telegram delivery retry:',error.message);}
  finally{botSending=false;}
}
if(process.env.BOT_TOKEN)setInterval(sendNextBotMessage,70).unref();
function processEventReminders(reference=new Date()){
  const time=reference.getTime();
  for(const hours of [12,3]){
    const cutoff=new Date(time+hours*3600000).toISOString(),earliest=new Date(time+(hours-.5)*3600000).toISOString();
    const games=db.prepare("SELECT g.id,g.sport,g.venue,g.starts_at AS startsAt,p.user_id AS userId,p.joined_at AS joinedAt FROM games g JOIN participants p ON p.game_id=g.id WHERE g.cancelled_at IS NULL AND g.starts_at>? AND g.starts_at<=?").all(earliest,cutoff);
    const trainings=db.prepare("SELECT t.id,t.sport,t.court_id AS courtId,t.starts_at AS startsAt,t.coach_id AS coachId,t.created_at AS createdAt,p.user_id AS userId,p.joined_at AS joinedAt FROM trainings t LEFT JOIN training_participants p ON p.training_id=t.id WHERE t.cancelled_at IS NULL AND t.starts_at>? AND t.starts_at<=?").all(earliest,cutoff);
    const remind=(kind,id,userId,startsAt,sport,place)=>{
      const date=new Date(startsAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      db.exec('BEGIN');try{
        const result=db.prepare('INSERT OR IGNORE INTO event_reminders VALUES(?,?,?,?,?)').run(kind,id,userId,hours,now());
        if(result.changes)notifyUser(userId,`Напоминание: ${kind==='game'?'игра':'тренировка'} (${sport==='padel'?'падел':'теннис'}) через ${hours} ч · ${date} · ${place}`,`${kind}_${id}`);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
    };
    for(const g of games)if(g.joinedAt<=new Date(Date.parse(g.startsAt)-hours*3600000).toISOString())remind('game',g.id,g.userId,g.startsAt,g.sport,g.venue);
    const courts=allCourts();
    for(const t of trainings){const before=new Date(Date.parse(t.startsAt)-hours*3600000).toISOString(),place=courts.find(c=>c.id===t.courtId)?.name||'корт';if(t.userId&&t.joinedAt<=before)remind('training',t.id,t.userId,t.startsAt,t.sport,place);if(t.createdAt<=before)remind('training',t.id,t.coachId,t.startsAt,t.sport,place);}
  }
}
if(import.meta.url===`file://${process.argv[1]}`){const tick=()=>{try{processEventReminders();processMatchPrompts();}catch(error){console.warn('Reminders unavailable:',error.message);}};setTimeout(tick,2000).unref();setInterval(tick,60000).unref();}
function closePendingRequests(kind,id,message){const waiting=pendingRequests.all(kind,id);db.prepare("UPDATE join_requests SET status='rejected',resolved_at=? WHERE kind=? AND listing_id=? AND status='pending'").run(now(),kind,id);for(const user of waiting)notifyUser(user.id,message);}
function ratingOf(id,sport){return db.prepare('SELECT rating,rd,volatility,matches,wins,losses FROM player_ratings WHERE user_id=? AND sport=?').get(id,sport)||initialRating();}
function ratingSummary(id){return Object.fromEntries(['tennis','padel'].map(sport=>[sport,ratingOf(id,sport)]));}
function applyMatchRating(game,members){
  if(db.prepare('SELECT 1 FROM rating_events WHERE game_id=? LIMIT 1').get(game.id))return;
  const firstTeamWon=game.result==='votes:A'||game.result!=='votes:B'&&game.result.split(',').reduce((n,set)=>{const [a,b]=set.split(':').map(Number);return n+(a>b?1:-1);},0)>0;
  const old=members.map(x=>ratingOf(x.id,game.sport));
  members.forEach((m,i)=>{const rivals=old.filter((_,j)=>j%2!==i%2),opponent={...initialRating(),rating:rivals.reduce((sum,r)=>sum+r.rating,0)/rivals.length,rd:rivals.reduce((sum,r)=>sum+r.rd,0)/rivals.length};const r=updateRating(old[i],opponent,(i%2===0)===firstTeamWon?1:0);db.prepare('INSERT INTO player_ratings(user_id,sport,rating,rd,volatility,matches,wins,losses) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,sport) DO UPDATE SET rating=excluded.rating,rd=excluded.rd,volatility=excluded.volatility,matches=excluded.matches,wins=excluded.wins,losses=excluded.losses').run(m.id,game.sport,r.rating,r.rd,r.volatility,r.matches,r.wins,r.losses);db.prepare('INSERT INTO rating_events VALUES(?,?,?,?,?,?)').run(game.id,m.id,game.sport,old[i].rating,r.rating,now());});
}
const voteLabels={win:'Победа',loss:'Поражение',no_score:'Мы не играли на счёт'};
function voteKeyboard(gameId){
  const rows=Object.entries(voteLabels).map(([choice,label])=>[{text:label,callback_data:`rv:${gameId}:${choice}`}]);
  const open=notificationButton(`game_${gameId}`);if(open)rows.push([open]);
  return {inline_keyboard:rows};
}
function processMatchPrompts(reference=new Date()){
  const games=db.prepare("SELECT g.* FROM games g LEFT JOIN match_polls p ON p.game_id=g.id WHERE g.kind='rating' AND g.cancelled_at IS NULL AND g.absence_by IS NULL AND g.result IS NULL AND p.game_id IS NULL AND g.starts_at<=? AND (SELECT COUNT(*) FROM participants m WHERE m.game_id=g.id)=g.seats ORDER BY g.starts_at LIMIT 200").all(reference.toISOString());
  for(const game of games){
    if(Date.parse(game.starts_at)+game.duration*60000>reference.getTime())continue;
    const members=getMembers.all(game.id);if(members.length!==game.seats)continue;
    const when=new Date(game.starts_at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});
    const address=allCourts().find(c=>c.id===game.court_id)?.address||game.venue;
    db.exec('BEGIN');try{
      const inserted=db.prepare("INSERT OR IGNORE INTO match_polls(game_id,status,prompted_at) VALUES(?,'pending',?)").run(game.id,now());
      if(inserted.changes)for(const [index,member] of members.entries()){
        const opponents=members.filter((_,j)=>j%2!==index%2).map(x=>x.name).join(', ');
        notifyUser(member.id,`Укажите результат игры с ${opponents} · ${when} · ${game.venue}, ${address}. Выберите: победа, поражение или не играли на счёт.`, `game_${game.id}`,voteKeyboard(game.id));
      }
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
}
function recordMatchVote(gameId,userId,choice){
  if(!Object.hasOwn(voteLabels,choice))fail(400,'Неверный вариант ответа');
  const game=getGame.get(gameId),poll=db.prepare('SELECT status FROM match_polls WHERE game_id=?').get(gameId);
  if(!game||game.cancelled_at||game.kind!=='rating'||!poll||poll.status!=='pending')fail(409,'Голосование недоступно');
  const members=getMembers.all(gameId),index=members.findIndex(x=>x.id===userId);
  if(index<0||members.length!==game.seats||Date.parse(game.starts_at)+game.duration*60000>Date.now())fail(403,'Вы не участвуете в завершённой игре');
  let outcome=null;
  db.exec('BEGIN');try{
    const inserted=db.prepare('INSERT OR IGNORE INTO match_votes VALUES(?,?,?,?)').run(gameId,userId,choice,now());
    if(!inserted.changes)fail(409,'Вы уже ответили на этот опрос');
    const votes=db.prepare('SELECT user_id AS userId,choice FROM match_votes WHERE game_id=?').all(gameId);
    if(votes.length===members.length){
      const a=members.filter((_,i)=>i%2===0).map(m=>votes.find(v=>v.userId===m.id).choice);
      const b=members.filter((_,i)=>i%2===1).map(m=>votes.find(v=>v.userId===m.id).choice);
      const agreed=a.every(x=>x===a[0])&&b.every(x=>x===b[0])&&((a[0]==='win'&&b[0]==='loss')||(a[0]==='loss'&&b[0]==='win'));
      if(agreed){
        db.prepare('UPDATE games SET result=?,result_confirmed=1,result_by=NULL WHERE id=? AND result_confirmed=0').run(a[0]==='win'?'votes:A':'votes:B',gameId);
        applyMatchRating(getGame.get(gameId),members);
        db.prepare("UPDATE match_polls SET status='confirmed',resolved_at=?,reason=NULL WHERE game_id=?").run(now(),gameId);
        outcome='Результаты совпали. Рейтинг Tennis GO обновлён.';
      }else{
        const reason=votes.every(v=>v.choice==='no_score')?'Обе стороны указали игру без счёта':'Ответы участников не совпали';
        db.prepare("UPDATE match_polls SET status='not_counted',resolved_at=?,reason=? WHERE game_id=?").run(now(),reason,gameId);
        outcome=`${reason}. Игра не засчитана в рейтинг.`;
      }
    }
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
  if(outcome)for(const member of members)notifyUser(member.id,outcome,`game_${gameId}`);
  return {choice,status:outcome?'resolved':'pending',message:outcome||'Ваш ответ записан. Ожидаем остальных участников.'};
}
const coaches = [{id:'anastasia',name:'Анастасия',sport:'Теннис',description:'Индивидуальная тренировка · любой уровень',price:2500,image:'/assets/coach.jpg'}];
const courts = JSON.parse(fs.readFileSync(path.join(publicDir,'courts.json'),'utf8'));
const courtPriority=['alfa-tennis','sport-park','dinamo','tennis-park-arena','zhk-luchshiy','trud','setbol','damani','vopreki-tennis','sport-city','indoor-skobeleva','kubgau','zhk-dostoyanie','cska-tennis'];
const courtRank=c=>c.sport==='tennis'?(courtPriority.indexOf(c.id)<0?courtPriority.length:courtPriority.indexOf(c.id)):100;
const courtAddressKey=c=>`${c.city||'Краснодар'}, ${c.address}`.toLocaleLowerCase('ru-RU');
function courtTemplateImage(sport,surface){
  if(sport==='padel')return '/assets/court-padel-outdoor.jpg';
  const type=String(surface||'').toLocaleLowerCase('ru-RU');
  if(type.includes('grass')||type.includes('трава'))return '/assets/court-grass.jpg';
  if(type.includes('clay')||type.includes('грунт'))return '/assets/court-clay.jpg';
  return '/assets/court-hard-outdoor.jpg';
}
function allCourts(){const approved=db.prepare("SELECT owner_id,name,address,city,phone,sports,photo_data,surface,opens_at,hourly_price,closes_at FROM clubs WHERE status='approved'").all();return [...courts,...approved.flatMap(club=>JSON.parse(club.sports).map(sport=>({id:`club-${club.owner_id}-${sport}`,name:club.name,address:club.address,city:club.city,phone:club.phone,sport,clubId:club.owner_id,surface:club.surface||null,opensAt:club.opens_at||null,closesAt:club.closes_at||null,hourlyPrice:club.hourly_price??null,image:club.photo_data||courtTemplateImage(sport,club.surface)})))].sort((a,b)=>courtRank(a)-courtRank(b)).map(c=>{const point=db.prepare('SELECT latitude,longitude FROM court_geocodes WHERE address_key=?').get(courtAddressKey(c));return {...c,latitude:point?.latitude??null,longitude:point?.longitude??null};});}
let geocoding=false,geocodeRetryAfter=0;
async function geocodeNextCourt(){
  if(geocoding||Date.now()<geocodeRetryAfter)return;
  const target=allCourts().find(c=>{const row=db.prepare('SELECT latitude,checked_at FROM court_geocodes WHERE address_key=?').get(courtAddressKey(c));return !row||row.latitude===null&&Date.now()-Date.parse(row.checked_at)>86400000;});
  if(!target)return;geocoding=true;
  try{
    const query=new URL('https://nominatim.openstreetmap.org/search');query.searchParams.set('q',`${target.address}, ${target.city}, Россия`);query.searchParams.set('format','jsonv2');query.searchParams.set('addressdetails','1');query.searchParams.set('countrycodes','ru');query.searchParams.set('limit','3');
    const response=await fetch(query,{headers:{'User-Agent':'TennisGO/0.20.6 (https://tennisgo-production.up.railway.app; Telegram @RVL233)','Accept-Language':'ru'},signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    const results=await response.json();const match=results.find(p=>p.display_name?.toLocaleLowerCase('ru-RU').includes(target.city.toLocaleLowerCase('ru-RU'))&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lon)));
    db.prepare('INSERT INTO court_geocodes(address_key,latitude,longitude,checked_at) VALUES(?,?,?,?) ON CONFLICT(address_key) DO UPDATE SET latitude=excluded.latitude,longitude=excluded.longitude,checked_at=excluded.checked_at').run(courtAddressKey(target),match?Number(match.lat):null,match?Number(match.lon):null,now());
  }catch(error){geocodeRetryAfter=Date.now()+(String(error.message).includes('429')?3600000:300000);console.warn('Court geocoding unavailable:',target.id,error.message);}
  finally{geocoding=false;}
}
if(import.meta.url===`file://${process.argv[1]}`)setInterval(()=>geocodeNextCourt().catch(e=>console.warn('Court geocoding failed:',e.message)),1500).unref();
const cities=JSON.parse(fs.readFileSync(path.join(publicDir,'cities.json'),'utf8'));
if(!process.env.BOT_TOKEN && db.prepare('SELECT COUNT(*) AS n FROM games').get().n===0){
  const owner='demo-host-0001';db.prepare('INSERT OR IGNORE INTO users(id,name,username,created_at,role,gender,ntrp_level,registered_at,registration_version) VALUES(?,?,?,?,?,?,?,?,?)').run(owner,'Алексей','','2026-01-01T00:00:00.000Z','player','male',3,'2026-01-01T00:00:00.000Z',2);
  const date=new Date(Date.now()+86400000);date.setUTCHours(16,0,0,0);
  const samples=[['tennis','dinamo',2,'friendly',1200,18],['padel','padel360',4,'friendly',800,20]];
  for(const [sport,courtId,seats,kind,price,hour] of samples){const start=new Date(date);start.setUTCHours(hour-3);const id=crypto.randomUUID(),court=allCourts().find(c=>c.id===courtId);db.prepare('INSERT INTO games(id,sport,city,venue,court_id,starts_at,duration,level_min,level_max,seats,price,kind,note,creator_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,sport,'Краснодар',court.name,court.id,start.toISOString(),90,2.5,3.5,seats,price,kind,'Демо игра · проверьте свободные места',owner,new Date().toISOString());db.prepare('INSERT INTO participants VALUES(?,?,?)').run(id,owner,new Date().toISOString());}
}
const getUser = db.prepare("SELECT id,COALESCE(NULLIF(display_name,''),name) AS name,username,ntrp_level AS ntrpLevel,photo_data AS photoData,role,gender,playing_years AS playingYears,about,coach_years AS coachYears,coach_courts AS coachCourtsRaw,coach_achievements AS coachAchievements,avatar_id AS avatarId,COALESCE(NULLIF(city,''),'Краснодар') AS city,phone,telegram_contact AS telegramContact,coach_sports AS coachSportsRaw,preferred_sports AS preferredSportsRaw,registration_version>=2 AS registered,blocked_at AS blockedAt FROM users WHERE id=?");
const addUser = db.prepare('INSERT INTO users(id,name,username,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,username=excluded.username');
const saveProfile=db.prepare('UPDATE users SET display_name=?,ntrp_level=?,photo_data=?,role=?,gender=?,playing_years=?,about=?,coach_years=?,coach_courts=?,coach_achievements=?,avatar_id=?,city=?,phone=?,telegram_contact=?,coach_sports=?,registered_at=COALESCE(registered_at,?),registration_version=2 WHERE id=?');
function userDTO(id){const user=getUser.get(id);if(!user)return null;const {coachSportsRaw,coachCourtsRaw,preferredSportsRaw,...fields}=user;let coachSports=['tennis','padel'],coachCourts=[],preferredSports=[];try{if(coachSportsRaw)coachSports=JSON.parse(coachSportsRaw);if(coachCourtsRaw)coachCourts=JSON.parse(coachCourtsRaw);if(preferredSportsRaw)preferredSports=JSON.parse(preferredSportsRaw);}catch{}const admin=isAdmin(id),club=fields.role==='club'||admin?db.prepare('SELECT name,address,city,phone,sports,status,photo_data AS photoData,surface,opens_at AS opensAt,closes_at AS closesAt,hourly_price AS hourlyPrice FROM clubs WHERE owner_id=?').get(id):null;return {...fields,preferredSports:Array.isArray(preferredSports)?preferredSports:[],coachSports:fields.role==='coach'||admin?(coachSports.length?coachSports:['tennis','padel']):[],coachCourts:(fields.role==='coach'||admin&&fields.role!=='club')&&Array.isArray(coachCourts)?coachCourts:[],coachAchievements:fields.role==='coach'||admin&&fields.role!=='club'?fields.coachAchievements||'':'',club:club?{...club,sports:JSON.parse(club.sports)}:null,isAdmin:admin,ratings:ratingSummary(id)};}
function isAdmin(id){return !!process.env.ADMIN_TELEGRAM_ID&&id===process.env.ADMIN_TELEGRAM_ID||!process.env.BOT_TOKEN&&!!process.env.ADMIN_DEMO_USER_ID&&id===process.env.ADMIN_DEMO_USER_ID;}
function audit(adminId,action,targetKind,targetId,detail=''){db.prepare('INSERT INTO moderation_actions VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),adminId,action,targetKind,targetId,detail,now());}
function clubDetails(b,oldPhoto=null){
  const name=str(b.clubName,100),address=str(b.clubAddress,180),city=str(b.city,80),phone=str(b.clubPhone,30),sports=b.clubSports,photo=b.clubPhotoData??oldPhoto,surface=str(b.clubSurface,40),opensAt=str(b.opensAt,5),closesAt=str(b.closesAt,5),hourlyPrice=Number(b.hourlyPrice);
  if(!name||!address||!cities.includes(city))fail(400,'Укажите название клуба, адрес и город');
  if(!/^[+\d()\-\s]+$/.test(phone)||phone.replace(/\D/g,'').length<10||phone.replace(/\D/g,'').length>15)fail(400,'Укажите телефон клуба');
  if(!Array.isArray(sports)||!sports.length||sports.length>2||sports.some(x=>!['tennis','padel'].includes(x))||new Set(sports).size!==sports.length)fail(400,'Выберите вид спорта клуба');
  if(typeof photo!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)||photo.length>350000)fail(400,'Загрузите фото клуба JPEG размером до 250 КБ');
  const bytes=Buffer.from(photo.slice(23),'base64');if(bytes.length>250000||bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)fail(400,'Некорректное фото клуба JPEG');
  if(!['hard','clay','grass','artificial_grass','carpet','other'].includes(surface)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(opensAt)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(closesAt)||closesAt<=opensAt||!Number.isInteger(hourlyPrice)||hourlyPrice<0||hourlyPrice>100000)fail(400,'Проверьте покрытие, часы работы и цену');
  return {name,address,city,phone,sports,photo,surface,opensAt,closesAt,hourlyPrice};
}
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
function gameDTO(game,viewer){const members=getMembers.all(game.id).map((m,i)=>({...m,team:i%2===0?'A':'B'})),court=allCourts().find(c=>c.id===game.court_id),creator=userDTO(game.creator_id),doubles=game.seats===4;const confirmations=doubles?db.prepare('SELECT user_id AS userId,phase FROM match_confirmations WHERE game_id=?').all(game.id):[];return {id:game.id,sport:game.sport,city:game.city,venue:game.venue,courtId:game.court_id,courtAddress:court?.address||'',startsAt:game.starts_at,duration:game.duration,levelMin:game.level_min,levelMax:game.level_max,seats:game.seats,price:game.price,kind:game.kind,note:game.note,courtReserved:!!game.court_reserved,creatorId:game.creator_id,creatorName:creator?.name||'Организатор',creatorAvatarId:creator?.avatarId||null,creatorPhotoData:creator?.photoData||null,creatorGender:creator?.gender||null,creatorNtrp:creator?.ntrpLevel??null,creatorRole:creator?.role||null,opponentGender:game.opponent_gender,cancelled:!!game.cancelled_at,members,joined:members.some(m=>m.id===viewer),result:game.result,resultBy:game.result_by,resultConfirmed:!!game.result_confirmed,resultDisputed:!!game.result_disputed_at,resultDisputeReason:game.result_dispute_reason||null,attendanceBy:game.attendance_by,attendanceDone:doubles?confirmations.some(c=>c.userId===viewer&&c.phase==='attendance'):game.attendance_by===viewer||!!game.attendance_confirmed_at&&members.some(m=>m.id===viewer),attendanceCount:doubles?confirmations.filter(c=>c.phase==='attendance').length:(game.attendance_confirmed_at?2:game.attendance_at?1:0),attendanceConfirmed:doubles?confirmations.filter(c=>c.phase==='attendance').length===4:!!game.attendance_confirmed_at,resultAcknowledged:doubles?confirmations.some(c=>c.userId===viewer&&c.phase==='result'):false,resultConfirmationCount:doubles?confirmations.filter(c=>c.phase==='result').length:(game.result_confirmed?2:game.result?1:0),absenceBy:game.absence_by,absenceReason:game.absence_reason,absenceDisputed:!!game.absence_disputed_at,courtType:court?.courtType||null,voteStatus:db.prepare('SELECT status FROM match_polls WHERE game_id=?').get(game.id)?.status||null,myVote:db.prepare('SELECT choice FROM match_votes WHERE game_id=? AND user_id=?').get(game.id,viewer)?.choice||null,voteCount:db.prepare('SELECT COUNT(*) AS n FROM match_votes WHERE game_id=?').get(game.id).n,...requestState('game',game.id,viewer,game)};}
function trainingDTO(training,viewer){const coach=userDTO(training.coach_id),members=getTrainingMembers.all(training.id),court=allCourts().find(c=>c.id===training.court_id);return {id:training.id,sport:training.sport||'tennis',city:court?.city||'Краснодар',coachId:training.coach_id,coachName:coach?.name||'Тренер',coachGender:coach?.gender||null,coachYears:coach?.coachYears??null,coachAvatarId:coach?.avatarId||null,coachPhotoData:coach?.photoData||null,format:training.format,seats:training.seats,courtId:training.court_id,courtName:court?.name||'',courtAddress:court?.address||'',courtType:court?.courtType||null,startsAt:training.starts_at,duration:training.duration,ntrpMin:training.ntrp_min,ntrpMax:training.ntrp_max,price:training.price,note:training.note,cancelled:!!training.cancelled_at,completed:!!db.prepare('SELECT 1 FROM completed_trainings WHERE training_id=?').get(training.id),reviewed:!!db.prepare('SELECT 1 FROM training_reviews WHERE training_id=? AND user_id=?').get(training.id,viewer),members,joined:members.some(m=>m.id===viewer),...requestState('training',training.id,viewer,training)};}
function trainingRequestDTO(request){const owner=userDTO(request.player_id),courtIds=JSON.parse(request.court_ids),all=allCourts();return {id:request.id,playerId:request.player_id,playerName:owner?.name||'Игрок',playerAvatarId:owner?.avatarId||null,playerPhotoData:owner?.photoData||null,playerNtrp:owner?.ntrpLevel??null,sport:request.sport,city:request.city,format:request.format,startsAt:request.starts_at,endsAt:request.ends_at,courts:courtIds.map(id=>all.find(c=>c.id===id)).filter(Boolean).map(c=>({id:c.id,name:c.name,address:c.address})),note:request.note,createdAt:request.created_at};}
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
  if(url.pathname==='/api/config')return send(res,200,{demo:!process.env.BOT_TOKEN,botUsername:process.env.BOT_USERNAME||'',cities,version:'0.22.1'});
  if(req.method==='GET'&&url.pathname==='/api/weather'){const city=url.searchParams.get('city')||'Краснодар';if(!cities.includes(city))fail(400,'Выберите город из списка');const hours=await weatherHours(city);return send(res,200,{hours,status:weatherCaches.get(city).status,city,source:'Open-Meteo'});}
  const identity=authenticate(req);addUser.run(identity.id,identity.name,identity.username,now());
  const me=userDTO(identity.id);
  db.prepare("UPDATE users SET last_seen_at=? WHERE id=? AND (last_seen_at IS NULL OR last_seen_at<?)").run(now(),me.id,new Date(Date.now()-60000).toISOString());
  if(!me.blockedAt)db.prepare('INSERT OR IGNORE INTO activity_days VALUES(?,?)').run(me.id,new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
  if(req.method==='GET'&&url.pathname==='/api/me')return send(res,200,{user:me});
  if(me.blockedAt&&!isAdmin(me.id))fail(403,'Ваш аккаунт заблокирован администратором');
  const mediaList=url.pathname.match(/^\/api\/users\/([a-zA-Z0-9-]{1,60})\/media$/);
  if(req.method==='GET'&&mediaList){
    const owner=userDTO(mediaList[1]);if(!owner?.registered||owner.blockedAt)fail(404,'Профиль не найден');
    const items=db.prepare('SELECT id,kind,mime,created_at AS createdAt FROM profile_media WHERE owner_id=? ORDER BY created_at DESC,rowid DESC').all(owner.id);
    return send(res,200,{items:items.map(item=>({...item,url:'/media/'+item.id}))});
  }
  if(req.method==='POST'&&url.pathname==='/api/profile/media'){
    if(!me.registered||me.role==='club'&&!me.isAdmin)fail(403,'Сначала заполните профиль');
    const b=await body(req,17_000_000),kind=b.kind;
    if(!['photo','video'].includes(kind)||typeof b.data!=='string')fail(400,'Выберите фото или видео');
    const match=/^data:(image\/jpeg|video\/mp4|video\/webm);base64,([A-Za-z0-9+/]+={0,2})$/.exec(b.data);
    if(!match||kind==='photo'&&match[1]!=='image/jpeg'||kind==='video'&&match[1]==='image/jpeg')fail(400,'Для фото используйте JPEG, для видео MP4 или WebM');
    const bytes=Buffer.from(match[2],'base64'),mime=match[1],max=kind==='photo'?300_000:12_000_000;
    if(bytes.length<16||bytes.length>max)fail(400,kind==='photo'?'Фото должно быть до 300 КБ':'Видео должно быть до 12 МБ');
    const valid=mime==='image/jpeg'?bytes[0]===0xff&&bytes[1]===0xd8&&bytes.at(-2)===0xff&&bytes.at(-1)===0xd9:mime==='video/mp4'?bytes.toString('ascii',4,8)==='ftyp':bytes.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
    if(!valid)fail(400,'Файл повреждён или его формат не совпадает с расширением');
    const count=db.prepare('SELECT COUNT(*) AS n FROM profile_media WHERE owner_id=? AND kind=?').get(me.id,kind).n;
    if(count>=(kind==='photo'?8:3))fail(409,kind==='photo'?'Можно добавить до 8 фотографий':'Можно добавить до 3 видео');
    const id=crypto.randomUUID();fs.writeFileSync(path.join(mediaDir,id),bytes,{flag:'wx',mode:0o600});
    try{db.prepare('INSERT INTO profile_media(id,owner_id,kind,mime,created_at) VALUES(?,?,?,?,?)').run(id,me.id,kind,mime,now());}catch(error){fs.unlinkSync(path.join(mediaDir,id));throw error;}
    return send(res,201,{item:{id,kind,mime,url:'/media/'+id}});
  }
  const ownMedia=url.pathname.match(/^\/api\/profile\/media\/([a-f0-9-]{36})$/i);
  if(req.method==='DELETE'&&ownMedia){
    const item=db.prepare('SELECT owner_id FROM profile_media WHERE id=?').get(ownMedia[1]);if(!item)fail(404,'Медиа не найдено');if(item.owner_id!==me.id)fail(403,'Удалить материал может только его автор');
    db.prepare('DELETE FROM profile_media WHERE id=?').run(ownMedia[1]);fs.rmSync(path.join(mediaDir,ownMedia[1]),{force:true});return send(res,200,{ok:true});
  }
  if(req.method==='PATCH'&&url.pathname==='/api/profile/city'){
    if(!me.registered||me.role==='club'&&!isAdmin(me.id))fail(403,'Город клуба меняется в анкете клуба');
    const b=await body(req,300),city=str(b.city,80);
    if(!cities.includes(city))fail(400,'Выберите город из списка');
    if(city!==me.city)db.prepare("UPDATE users SET city=?,coach_courts='[]' WHERE id=?").run(city,me.id);
    return send(res,200,{user:userDTO(me.id)});
  }
  if(req.method==='POST'&&url.pathname==='/api/profile'){
    const b=await body(req,450000),name=str(b.name,60),level=b.ntrpLevel===null?null:Number(b.ntrpLevel);
    if(!name)fail(400,'Укажите имя');
    if(me.role==='club'&&b.role!=='club'&&!isAdmin(me.id))fail(403,'Роль представителя клуба нельзя изменить');
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
        saveProfile.run(name,null,null,'club',null,null,'',null,'[]','',null,city,phone,null,'[]',now(),me.id);
        db.prepare("INSERT INTO clubs(owner_id,name,address,city,phone,sports,status,created_at,photo_data,surface,opens_at,closes_at,hourly_price) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET name=excluded.name,address=excluded.address,city=excluded.city,phone=excluded.phone,sports=excluded.sports,photo_data=excluded.photo_data,surface=excluded.surface,opens_at=excluded.opens_at,closes_at=excluded.closes_at,hourly_price=excluded.hourly_price,status='pending',reviewed_at=NULL,reviewed_by=NULL").run(me.id,clubName,address,city,phone,JSON.stringify(sports),now(),clubPhoto,surface,opensAt,closesAt,hourlyPrice);
        db.exec('COMMIT');
      }catch(error){db.exec('ROLLBACK');throw error;}
      const admin=process.env.ADMIN_TELEGRAM_ID||(!process.env.BOT_TOKEN&&process.env.ADMIN_DEMO_USER_ID);
      if(admin&&getUser.get(admin))notifyUser(admin,`Новая заявка клуба «${clubName}» ожидает проверки`);
      return send(res,200,{user:userDTO(me.id)});
    }
    if(!['player','coach'].includes(b.role))fail(400,'Выберите роль: игрок или тренер');
    if(!['male','female'].includes(b.gender))fail(400,'Укажите пол');
    const years=Number(b.playingYears),coachYears=b.role==='coach'||isAdmin(me.id)?b.coachYears==null?null:Number(b.coachYears):null;
    if(!Number.isInteger(years)||years<0||years>80)fail(400,'Укажите стаж игры в годах');
    if(b.role==='coach'&&coachYears===null)fail(400,'Укажите тренерский стаж в годах');
    if(coachYears!==null&&(!Number.isInteger(coachYears)||coachYears<0||coachYears>80))fail(400,'Укажите тренерский стаж в годах');
    if(b.role==='player'&&(level===null||!Number.isFinite(level)||level<1||level>7||level*2!==Math.round(level*2))||b.role==='coach'&&level!==null&&(!Number.isFinite(level)||level<1||level>7||level*2!==Math.round(level*2)))fail(400,'Выберите уровень NTRP от 1.0 до 7.0');
    const city=str(b.city||'Краснодар',80),phone=str(b.phone,30),telegramContact=str(b.telegramContact,40).replace(/^@/,'');
    if(!cities.includes(city))fail(400,'Выберите город из списка');
    if(phone&&(!/^[+\d()\-\s]+$/.test(phone)||phone.replace(/\D/g,'').length<10||phone.replace(/\D/g,'').length>15))fail(400,'Проверьте номер телефона');
    if(telegramContact&&!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(telegramContact))fail(400,'Укажите Telegram username без ссылки');
    const coachSports=b.role==='coach'||isAdmin(me.id)?(b.coachSports===undefined?['tennis','padel']:b.coachSports):[];
    if(!Array.isArray(coachSports)||b.role==='coach'&&coachSports.length===0||coachSports.length>2||coachSports.some(s=>!['tennis','padel'].includes(s))||new Set(coachSports).size!==coachSports.length)fail(400,'Выберите теннис, падел или оба вида спорта');
    const coachCourts=b.role==='coach'||isAdmin(me.id)?b.coachCourts??[]:[];
    if(!Array.isArray(coachCourts)||coachCourts.length>30||coachCourts.some(id=>typeof id!=='string')||new Set(coachCourts).size!==coachCourts.length)fail(400,'Проверьте выбранные корты');
    const availableCourts=allCourts();
    if(coachCourts.some(id=>!availableCourts.some(c=>c.id===id&&(c.city||'Краснодар')===city&&coachSports.includes(c.sport))))fail(400,'Выберите корты вашего города и вида спорта');
    const coachAchievements=b.role==='coach'||isAdmin(me.id)?str(b.coachAchievements,600):'';
    const about=str(b.about,500),avatarId=b.avatarId===null?null:String(b.avatarId||'');
    if(!['male-serve','male-cap','male-court','female-serve','female-cap','female-court',null].includes(avatarId))fail(400,'Выберите аватарку');
    let photo=b.photoData;
    if(photo!==null){
      if(typeof photo!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)||photo.length>350000)fail(400,'Загрузите фотографию JPEG размером до 250 КБ');
      const bytes=Buffer.from(photo.slice(23),'base64');
      if(bytes.length>250000||bytes.length<4||bytes[0]!==0xff||bytes[1]!==0xd8||bytes.at(-2)!==0xff||bytes.at(-1)!==0xd9)fail(400,'Некорректная фотография JPEG');
    }
    if(!photo&&!avatarId)fail(400,'Загрузите фото или выберите аватарку');
    saveProfile.run(name,level,photo,b.role,b.gender,years,about,coachYears,JSON.stringify(coachCourts),coachAchievements,avatarId,city,phone||null,telegramContact||null,JSON.stringify(coachSports),now(),me.id);
    return send(res,200,{user:userDTO(me.id)});
  }
  if(req.method==='GET'&&url.pathname==='/api/registration-courts')return send(res,200,{courts:allCourts().map(({id,name,address,city,sport})=>({id,name,address,city,sport}))});
  if(!me.registered)fail(403,'Завершите регистрацию');
  if(url.pathname==='/api/preferences/sports'&&req.method==='PATCH'){
    const selected=(await body(req)).sports;
    if(!Array.isArray(selected)||selected.length>2||new Set(selected).size!==selected.length||selected.some(x=>!['tennis','padel'].includes(x)))fail(400,'Выберите Tennis, Padel или оба вида спорта');
    db.prepare('UPDATE users SET preferred_sports=? WHERE id=?').run(JSON.stringify(selected),me.id);
    return send(res,200,{user:userDTO(me.id)});
  }
  if(url.pathname==='/api/news'&&req.method==='GET'){
    if(me.role==='club'&&!isAdmin(me.id))fail(403,'Новости доступны участникам');
    const items=db.prepare("SELECT id,title,body,published_at AS publishedAt,sport,image_path AS imagePath FROM news ORDER BY published_at DESC LIMIT 100").all();
    return send(res,200,{items});
  }
  if(url.pathname==='/api/news'&&req.method==='POST'){
    if(!isAdmin(me.id))fail(403,'Публикация доступна только администратору');
    const b=await body(req),title=str(b.title,120),content=str(b.body,2000),sport=b.sport||'all';
    if(title.length<5||content.length<10)fail(400,'Введите заголовок от 5 и текст от 10 символов');
    if(!['all','tennis','padel'].includes(sport))fail(400,'Неверный вид спорта новости');
    const item={id:crypto.randomUUID(),title,body:content,publishedAt:now(),sport,imagePath:null};
    db.prepare('INSERT INTO news(id,author_id,title,body,published_at,sport,image_path) VALUES(?,?,?,?,?,?,?)').run(item.id,me.id,title,content,item.publishedAt,sport,null);
    broadcast(`Новость: ${title}`,'news',sport);
    return send(res,201,{item});
  }
  if(url.pathname==='/api/club/calendar'&&req.method==='GET'){
    if(me.role!=='club'&&!isAdmin(me.id)||!me.club)fail(403,'Календарь доступен представителю клуба');
    const day=url.searchParams.get('date')||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day)))fail(400,'Укажите дату');
    const start=new Date(day+'T00:00:00+03:00').toISOString(),end=new Date(Date.parse(start)+86400000).toISOString();
    const reservations=db.prepare("SELECT r.id,r.sport,r.starts_at AS startsAt,r.duration,COALESCE(NULLIF(u.display_name,''),u.name) AS guestName,u.id AS guestId,u.phone AS guestPhone FROM court_reservations r JOIN users u ON u.id=r.user_id WHERE r.club_id=? AND r.cancelled_at IS NULL AND r.starts_at>=? AND r.starts_at<? ORDER BY r.starts_at").all(me.id,start,end);
    return send(res,200,{date:day,reservations,status:me.club?.status||'pending'});
  }
  if(url.pathname==='/api/admin/clubs'&&req.method==='GET'){
    if(!isAdmin(me.id))fail(403,'Доступно только администратору');
    const clubs=db.prepare("SELECT c.owner_id AS ownerId,c.name,c.address,c.city,c.phone,c.sports,c.status,c.photo_data AS photoData,c.surface,c.opens_at AS opensAt,c.closes_at AS closesAt,c.hourly_price AS hourlyPrice,c.created_at AS createdAt,COALESCE(NULLIF(u.display_name,''),u.name) AS contactName FROM clubs c JOIN users u ON u.id=c.owner_id ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,c.created_at DESC").all();
    return send(res,200,{clubs:clubs.map(c=>({...c,sports:JSON.parse(c.sports)}))});
  }
  if(url.pathname==='/api/admin/clubs'&&req.method==='POST'){
    if(!isAdmin(me.id))fail(403,'Доступно только администратору');
    if(db.prepare('SELECT 1 FROM clubs WHERE owner_id=?').get(me.id))fail(409,'Ваш клуб уже добавлен. Измените его в списке клубов.');
    const c=clubDetails(await body(req,450000));
    db.prepare("INSERT INTO clubs(owner_id,name,address,city,phone,sports,status,created_at,photo_data,surface,opens_at,closes_at,hourly_price,reviewed_at,reviewed_by) VALUES(?,?,?,?,?,?,'approved',?,?,?,?,?,?,?,?)").run(me.id,c.name,c.address,c.city,c.phone,JSON.stringify(c.sports),now(),c.photo,c.surface,c.opensAt,c.closesAt,c.hourlyPrice,now(),me.id);
    audit(me.id,'create','club',me.id);return send(res,201,{ok:true});
  }
  const adminClub=url.pathname.match(/^\/api\/admin\/clubs\/([a-zA-Z0-9-]{1,60})$/);
  if(adminClub&&req.method==='PATCH'){
    if(!isAdmin(me.id))fail(403,'Доступно только администратору');
    const old=db.prepare('SELECT photo_data FROM clubs WHERE owner_id=?').get(adminClub[1]);if(!old)fail(404,'Клуб не найден');
    const c=clubDetails(await body(req,450000),old.photo_data);
    db.prepare('UPDATE clubs SET name=?,address=?,city=?,phone=?,sports=?,photo_data=?,surface=?,opens_at=?,closes_at=?,hourly_price=? WHERE owner_id=?').run(c.name,c.address,c.city,c.phone,JSON.stringify(c.sports),c.photo,c.surface,c.opensAt,c.closesAt,c.hourlyPrice,adminClub[1]);
    audit(me.id,'edit','club',adminClub[1]);return send(res,200,{ok:true});
  }
  const adminCalendar=url.pathname.match(/^\/api\/admin\/clubs\/([a-zA-Z0-9-]{1,60})\/calendar$/);
  if(adminCalendar&&req.method==='GET'){
    if(!isAdmin(me.id))fail(403,'Доступно только администратору');
    const club=db.prepare('SELECT name,status FROM clubs WHERE owner_id=?').get(adminCalendar[1]);if(!club)fail(404,'Клуб не найден');
    const day=url.searchParams.get('date')||new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(Date.parse(day)))fail(400,'Укажите дату');
    const start=new Date(day+'T00:00:00+03:00').toISOString(),end=new Date(Date.parse(start)+86400000).toISOString();
    const reservations=db.prepare("SELECT r.id,r.sport,r.starts_at AS startsAt,r.duration,COALESCE(NULLIF(u.display_name,''),u.name) AS guestName,u.id AS guestId,u.phone AS guestPhone FROM court_reservations r JOIN users u ON u.id=r.user_id WHERE r.club_id=? AND r.cancelled_at IS NULL AND r.starts_at>=? AND r.starts_at<? ORDER BY r.starts_at").all(adminCalendar[1],start,end);
    return send(res,200,{date:day,clubName:club.name,status:club.status,reservations});
  }
  if(url.pathname==='/api/admin/users'&&req.method==='GET'){
    if(!isAdmin(me.id))fail(403,'Доступно только администратору');
    const search=str(url.searchParams.get('q'),80).toLocaleLowerCase('ru-RU');
    const rows=db.prepare("SELECT id,COALESCE(NULLIF(display_name,''),name) AS name,role,COALESCE(NULLIF(city,''),'Краснодар') AS city,blocked_at AS blockedAt FROM users WHERE registration_version>=2 ORDER BY registered_at DESC LIMIT 1000").all().filter(u=>u.name.toLocaleLowerCase('ru-RU').includes(search)||u.id.includes(search)).slice(0,100);
    return send(res,200,{users:rows});
  }
  if(url.pathname==='/api/admin/stats'&&req.method==='GET'){
    if(!isAdmin(me.id))fail(403,'Доступно только администратору');
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const start=new Date(today+'T00:00:00+03:00'),cut7=new Date(start.getTime()-6*86400000).toISOString(),cut30=new Date(start.getTime()-29*86400000).toISOString(),dayShift=n=>new Date(Date.parse(today+'T12:00:00Z')+n*86400000).toISOString().slice(0,10);
    const count=(sql,...args)=>db.prepare(sql).get(...args).n;
    const total=count('SELECT COUNT(*) AS n FROM users WHERE registration_version>=2');
    const newToday=count('SELECT COUNT(*) AS n FROM users WHERE registration_version>=2 AND registered_at>=?',start.toISOString()),new7=count('SELECT COUNT(*) AS n FROM users WHERE registration_version>=2 AND registered_at>=?',cut7),new30=count('SELECT COUNT(*) AS n FROM users WHERE registration_version>=2 AND registered_at>=?',cut30);
    const activeToday=count('SELECT COUNT(*) AS n FROM activity_days WHERE day=?',today),active7=count('SELECT COUNT(DISTINCT user_id) AS n FROM activity_days WHERE day>=?',dayShift(-6)),active30=count('SELECT COUNT(DISTINCT user_id) AS n FROM activity_days WHERE day>=?',dayShift(-29));
    const events=db.prepare("SELECT type,substr(datetime(at,'+3 hours'),1,10) AS day,COUNT(*) AS n FROM (SELECT 'games' AS type,created_at AS at FROM games UNION ALL SELECT 'trainings',created_at FROM trainings UNION ALL SELECT 'joins',joined_at FROM participants UNION ALL SELECT 'joins',joined_at FROM training_participants UNION ALL SELECT 'messages',created_at FROM direct_messages UNION ALL SELECT 'messages',created_at FROM chat_messages UNION ALL SELECT 'bookings',created_at FROM court_reservations UNION ALL SELECT 'news',published_at FROM news) WHERE at>=? GROUP BY type,day").all(cut30);
    const activity=db.prepare('SELECT day,COUNT(*) AS n FROM activity_days WHERE day>=? GROUP BY day').all(dayShift(-29));
    const registrations=db.prepare("SELECT substr(datetime(registered_at,'+3 hours'),1,10) AS day,COUNT(*) AS n FROM users WHERE registration_version>=2 AND registered_at>=? GROUP BY day").all(cut30);
    const daily=Array.from({length:30},(_,i)=>{const day=dayShift(i-29),counts=Object.fromEntries(events.filter(e=>e.day===day).map(e=>[e.type,e.n]));return {day,new:registrations.find(a=>a.day===day)?.n||0,active:activity.find(a=>a.day===day)?.n||0,games:counts.games||0,trainings:counts.trainings||0,joins:counts.joins||0,messages:counts.messages||0,bookings:counts.bookings||0,news:counts.news||0};});
    const sum=key=>daily.slice(-7).reduce((n,d)=>n+d[key],0);
    return send(res,200,{total,newToday,new7,new30,activeToday,active7,active30,last7:{games:sum('games'),trainings:sum('trainings'),joins:sum('joins'),messages:sum('messages'),bookings:sum('bookings'),news:sum('news')},daily});
  }
  if(url.pathname==='/api/admin/listings'&&req.method==='GET'){
    if(!isAdmin(me.id))fail(403,'Доступно только администратору');
    const games=db.prepare("SELECT g.id,g.venue,g.sport,g.starts_at AS startsAt,g.cancelled_at AS cancelledAt,g.creator_id AS ownerId,COALESCE(NULLIF(u.display_name,''),u.name) AS ownerName FROM games g JOIN users u ON u.id=g.creator_id WHERE g.starts_at>? ORDER BY g.starts_at LIMIT 200").all(now());
    const courts=allCourts(),trainings=db.prepare("SELECT t.id,t.sport,t.format,t.court_id AS courtId,t.starts_at AS startsAt,t.cancelled_at AS cancelledAt,t.coach_id AS ownerId,COALESCE(NULLIF(u.display_name,''),u.name) AS ownerName FROM trainings t JOIN users u ON u.id=t.coach_id WHERE t.starts_at>? ORDER BY t.starts_at LIMIT 200").all(now()).map(t=>({...t,venue:courts.find(c=>c.id===t.courtId)?.name||'Корт'}));
    return send(res,200,{games,trainings});
  }
  const adminUser=url.pathname.match(/^\/api\/admin\/users\/([a-zA-Z0-9-]{1,60})\/(block|unblock)$/);
  if(adminUser&&req.method==='POST'){
    if(!isAdmin(me.id))fail(403,'Доступно только администратору');
    const [,id,action]=adminUser,target=userDTO(id);if(!target?.registered)fail(404,'Пользователь не найден');
    if(isAdmin(id))fail(403,'Администратора нельзя заблокировать');
    if(action==='unblock'){if(!target.blockedAt)fail(409,'Пользователь не заблокирован');db.prepare('UPDATE users SET blocked_at=NULL,blocked_reason=NULL WHERE id=?').run(id);audit(me.id,'unblock','user',id);return send(res,200,{ok:true});}
    if(target.blockedAt)fail(409,'Пользователь уже заблокирован');
    const reason=str((await body(req)).reason,240);if(reason.length<5)fail(400,'Укажите причину блокировки (от 5 символов)');
    const affectedGames=db.prepare('SELECT id,starts_at FROM games WHERE creator_id=? AND cancelled_at IS NULL AND starts_at>?').all(id,now());
    const affectedTrainings=db.prepare('SELECT id,starts_at FROM trainings WHERE coach_id=? AND cancelled_at IS NULL AND starts_at>?').all(id,now());
    db.exec('BEGIN');try{
      db.prepare('UPDATE users SET blocked_at=?,blocked_reason=? WHERE id=?').run(now(),reason,id);
      db.prepare('UPDATE games SET cancelled_at=? WHERE creator_id=? AND cancelled_at IS NULL AND starts_at>?').run(now(),id,now());
      db.prepare('UPDATE trainings SET cancelled_at=? WHERE coach_id=? AND cancelled_at IS NULL AND starts_at>?').run(now(),id,now());
      db.prepare("DELETE FROM participants WHERE user_id=? AND game_id IN (SELECT id FROM games WHERE starts_at>? AND creator_id<>?)").run(id,now(),id);
      db.prepare("DELETE FROM training_participants WHERE user_id=? AND training_id IN (SELECT id FROM trainings WHERE starts_at>? AND coach_id<>?)").run(id,now(),id);
      db.prepare("UPDATE join_requests SET status='rejected',resolved_at=? WHERE user_id=? AND status='pending'").run(now(),id);
      audit(me.id,'block','user',id,reason);db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    for(const g of affectedGames){closePendingRequests('game',g.id,'Игра отменена администратором');for(const member of getMembers.all(g.id))if(member.id!==id)notifyUser(member.id,'Игра отменена администратором');}
    for(const t of affectedTrainings){closePendingRequests('training',t.id,'Тренировка отменена администратором');for(const member of getTrainingMembers.all(t.id))notifyUser(member.id,'Тренировка отменена администратором');}
    return send(res,200,{ok:true});
  }
  if(url.pathname==='/api/admin/messages'&&req.method==='GET'){
    if(!isAdmin(me.id))fail(403,'Доступно только администратору');
    const rows=db.prepare("SELECT kind,id,sender_id AS senderId,recipient_id AS recipientId,body,created_at AS createdAt FROM (SELECT 'direct' AS kind,id,sender_id,recipient_id,body,created_at FROM direct_messages WHERE deleted_at IS NULL UNION ALL SELECT 'listing' AS kind,id,sender_id,peer_id AS recipient_id,body,created_at FROM chat_messages WHERE deleted_at IS NULL) ORDER BY created_at DESC LIMIT 100").all();
    return send(res,200,{messages:rows.map(row=>({...row,senderName:userDTO(row.senderId)?.name||'Участник',recipientName:userDTO(row.recipientId)?.name||'Участник'}))});
  }
  const adminMessage=url.pathname.match(/^\/api\/admin\/messages\/(direct|listing)\/([a-f0-9-]{36})$/i);
  if(adminMessage&&req.method==='DELETE'){
    if(!isAdmin(me.id))fail(403,'Доступно только администратору');
    const [,kind,id]=adminMessage,table=kind==='direct'?'direct_messages':'chat_messages';
    const change=db.prepare(`UPDATE ${table} SET deleted_at=? WHERE id=? AND deleted_at IS NULL`).run(now(),id);
    if(!change.changes)fail(404,'Сообщение не найдено');audit(me.id,'delete',kind==='direct'?'direct_message':'listing_message',id);return send(res,200,{ok:true});
  }
  const adminNews=url.pathname.match(/^\/api\/admin\/news\/([a-f0-9-]{36})$/i);
  if(adminNews&&req.method==='DELETE'){
    if(!isAdmin(me.id))fail(403,'Доступно только администратору');
    const deleted=db.prepare('DELETE FROM news WHERE id=?').run(adminNews[1]);if(!deleted.changes)fail(404,'Новость не найдена');audit(me.id,'delete','news',adminNews[1]);return send(res,200,{ok:true});
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
    audit(me.id,decision,'club',ownerId);
    return send(res,200,{ok:true});
  }
  if(me.role==='club'&&!isAdmin(me.id)&&!url.pathname.startsWith('/api/club/'))fail(403,'Представителю клуба доступен календарь записей');
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
  if(req.method==='POST'&&url.pathname==='/api/court-bookings')fail(409,'Онлайн запись пока недоступна. Свяжитесь с клубом напрямую');
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
    const ids=db.prepare("SELECT id,COALESCE(NULLIF(display_name,''),name) AS name FROM users WHERE registration_version>=2 AND blocked_at IS NULL AND id<>? AND (? IS NULL OR role=?) ORDER BY COALESCE(NULLIF(display_name,''),name),id").all(me.id,role,role).filter(row=>row.name.toLocaleLowerCase('ru-RU').includes(search.toLocaleLowerCase('ru-RU'))).slice(offset,offset+31);
    return send(res,200,{users:ids.slice(0,30).map(({id})=>{const {name,role,city,avatarId,photoData,ntrpLevel,coachSports,coachYears,coachCourts,coachAchievements}=userDTO(id);return {id,name,role,city,avatarId,photoData,ntrpLevel,coachSports,coachYears,coachCourts,coachAchievements};}),hasMore:ids.length>30});
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
    const listingMessages=db.prepare('SELECT kind,listing_id AS listingId,sender_id AS senderId,peer_id AS peerId,body,created_at AS createdAt,read_at AS readAt FROM chat_messages WHERE deleted_at IS NULL AND (sender_id=? OR peer_id=?) ORDER BY created_at').all(me.id,me.id);
    for(const m of listingMessages){const other=m.senderId===me.id?m.peerId:m.senderId;add(`${m.kind}:${m.listingId}:${other}`,m.kind,m.listingId,other,m);}
    const directMessages=db.prepare('SELECT sender_id AS senderId,recipient_id AS peerId,body,created_at AS createdAt,read_at AS readAt FROM direct_messages WHERE deleted_at IS NULL AND (sender_id=? OR recipient_id=?) ORDER BY created_at').all(me.id,me.id);
    for(const m of directMessages){const other=m.senderId===me.id?m.peerId:m.senderId;add(`direct:${other}`,'direct',null,other,m);}
    const threads=[...conversations.values()].map(t=>{const u=userDTO(t.peerId),listing=t.kind==='game'?getGame.get(t.listingId):t.kind==='training'?getTraining.get(t.listingId):null;return {...t,peerName:u?.name||'Пользователь',peerAvatarId:u?.avatarId||null,peerPhotoData:u?.photoData||null,title:t.kind==='game'?`Игра · ${listing?.venue||''}`:t.kind==='training'?`Тренировка · ${allCourts().find(c=>c.id===listing?.court_id)?.name||''}`:'Личный чат'};}).sort((a,b)=>b.lastAt.localeCompare(a.lastAt));
    return send(res,200,{threads,unread:threads.reduce((n,t)=>n+t.unread,0)});
  }
  const directMatch=url.pathname.match(/^\/api\/direct\/([a-zA-Z0-9-]{1,60})$/);
  if(directMatch&&['GET','POST'].includes(req.method)){
    const peerId=directMatch[1],peer=userDTO(peerId);if(!peer?.registered||peer.blockedAt||peerId===me.id)fail(404,'Пользователь не найден');
    if(req.method==='POST'){
      const b=await body(req,2000),message=str(b.message,500);if(!message)fail(400,'Напишите сообщение');
      const recent=db.prepare('SELECT COUNT(*) AS n FROM direct_messages WHERE sender_id=? AND created_at>?').get(me.id,new Date(Date.now()-60000).toISOString()).n;
      if(recent>=10)fail(429,'Слишком много сообщений. Подождите минуту');
      db.prepare('INSERT INTO direct_messages(id,sender_id,recipient_id,body,created_at,read_at) VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),me.id,peerId,message,now(),null);
      notifyUser(peerId,`${me.name}: новое личное сообщение`);
    }
    db.prepare('UPDATE direct_messages SET read_at=? WHERE recipient_id=? AND sender_id=? AND read_at IS NULL AND deleted_at IS NULL').run(now(),me.id,peerId);
    const messages=db.prepare('SELECT * FROM (SELECT id,sender_id AS senderId,body,created_at AS createdAt FROM direct_messages WHERE deleted_at IS NULL AND ((sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)) ORDER BY created_at DESC LIMIT 100) ORDER BY createdAt').all(me.id,peerId,peerId,me.id);
    return send(res,200,{messages,peer:{id:peer.id,name:peer.name}});
  }
  const userMatch=url.pathname.match(/^\/api\/users\/([a-zA-Z0-9-]{1,60})$/);
  if(req.method==='GET'&&userMatch){
    const user=userDTO(userMatch[1]);if(!user?.registered)fail(404,'Профиль не найден');
    const {id,name,role,gender,playingYears,ntrpLevel,coachYears,coachCourts,coachAchievements,about,avatarId,photoData,city,phone,telegramContact,coachSports,ratings}=user;
    const reviews=role==='coach'?db.prepare('SELECT score,body,created_at AS createdAt FROM training_reviews WHERE coach_id=? ORDER BY created_at DESC LIMIT 30').all(id):[];
    return send(res,200,{user:{id,name,role,gender,playingYears,ntrpLevel,coachYears,coachCourts,coachAchievements,about,avatarId,photoData,city,phone,telegramContact,coachSports,ratings,reviews}});
  }
  if(req.method==='GET'&&url.pathname==='/api/catalog')return send(res,200,{coaches,courts:allCourts()});
  const chatPath=url.pathname.match(/^\/api\/chats\/(game|training)\/([a-f0-9-]{36})(?:\/([a-zA-Z0-9-]{1,60}))?$/i);
  if(chatPath&&['GET','POST'].includes(req.method)){
    const [,kind,id,peerId]=chatPath,listing=kind==='game'?getGame.get(id):getTraining.get(id);
    if(!listing)fail(404,'Объявление не найдено');
    const authorId=kind==='game'?listing.creator_id:listing.coach_id;
    if(!peerId){
      if(req.method!=='GET'||me.id!==authorId)fail(403,'Список диалогов доступен автору');
      const ids=db.prepare('SELECT DISTINCT CASE WHEN sender_id=? THEN peer_id ELSE sender_id END AS id FROM chat_messages WHERE deleted_at IS NULL AND kind=? AND listing_id=? AND (sender_id=? OR peer_id=?)').all(me.id,kind,id,me.id,me.id);
      return send(res,200,{threads:ids.map(row=>{const u=userDTO(row.id);return {id:row.id,name:u?.name||'Участник',avatarId:u?.avatarId||null,photoData:u?.photoData||null};})});
    }
    if(me.id===peerId||!userDTO(peerId)?.registered||userDTO(peerId)?.blockedAt)fail(404,'Собеседник не найден');
    if(me.id!==authorId&&peerId!==authorId)fail(403,'Написать можно автору объявления');
    if(me.id===authorId){
      const known=db.prepare('SELECT 1 FROM chat_messages WHERE deleted_at IS NULL AND kind=? AND listing_id=? AND (sender_id=? OR peer_id=?) LIMIT 1').get(kind,id,peerId,peerId);
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
    db.prepare('UPDATE chat_messages SET read_at=? WHERE kind=? AND listing_id=? AND sender_id=? AND peer_id=? AND read_at IS NULL AND deleted_at IS NULL').run(now(),kind,id,peerId,me.id);
    const messages=db.prepare('SELECT * FROM (SELECT id,sender_id AS senderId,body,created_at AS createdAt FROM chat_messages WHERE deleted_at IS NULL AND kind=? AND listing_id=? AND sender_id IN (?,?) AND peer_id IN (?,?) ORDER BY created_at DESC LIMIT 100) ORDER BY createdAt').all(kind,id,me.id,peerId,me.id,peerId);
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
  if(req.method==='GET'&&url.pathname==='/api/training-requests'){
    const rows=db.prepare('SELECT * FROM training_requests WHERE cancelled_at IS NULL AND ends_at>? ORDER BY starts_at LIMIT 100').all(now());
    return send(res,200,{requests:rows.map(trainingRequestDTO)});
  }
  if(req.method==='POST'&&url.pathname==='/api/training-requests'){
    if(me.role!=='player'&&!isAdmin(me.id))fail(403,'Заявку на тренировку создаёт игрок');
    const b=await body(req,4000),sport=str(b.sport),format=str(b.format),ids=b.courtIds;
    if(!['tennis','padel'].includes(sport)||!['individual','split','group'].includes(format))fail(400,'Выберите вид спорта и формат');
    if(!Array.isArray(ids)||ids.length<1||ids.length>10||ids.some(id=>typeof id!=='string'||id.length>100)||new Set(ids).size!==ids.length)fail(400,'Выберите от одного до десяти кортов');
    const all=allCourts(),selected=ids.map(id=>all.find(c=>c.id===id&&c.sport===sport));
    if(selected.some(c=>!c)||new Set(selected.map(c=>c.city||'Краснодар')).size!==1)fail(400,'Выберите корты одного города для этого вида спорта');
    const startsAt=date(b.startsAt),endsAt=date(b.endsAt),start=Date.parse(startsAt),end=Date.parse(endsAt);
    const dayInMoscow=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
    if(start<Date.now()+1800000||start>Date.now()+90*86400000||end-start<3600000||end-start>6*3600000||dayInMoscow(start)!==dayInMoscow(end))fail(400,'Укажите один день и интервал от 1 до 6 часов в ближайшие 90 дней');
    if(db.prepare('SELECT COUNT(*) AS n FROM training_requests WHERE player_id=? AND cancelled_at IS NULL AND ends_at>?').get(me.id,now()).n>=5)fail(409,'Можно опубликовать до пяти действующих заявок');
    if(db.prepare('SELECT COUNT(*) AS n FROM training_requests WHERE player_id=? AND created_at>?').get(me.id,new Date(Date.now()-86400000).toISOString()).n>=5)fail(429,'За сутки можно опубликовать до пяти заявок');
    const city=selected[0].city||'Краснодар',note=str(b.note,240),id=crypto.randomUUID();
    const people=db.prepare("SELECT id,role,preferred_sports AS preferredSportsRaw,coach_sports AS coachSportsRaw FROM users WHERE registration_version>=2 AND blocked_at IS NULL AND COALESCE(NULLIF(city,''),'Краснодар')=? AND role IN ('player','coach') AND id<>?").all(city,me.id);
    const recipients=people.filter(person=>{
      try{
        if(person.role==='coach'||isAdmin(person.id))return userDTO(person.id).coachSports.includes(sport);
        const preference=JSON.parse(person.preferredSportsRaw||'[]');return format!=='individual'&&(!preference.length||preference.includes(sport));
      }catch{return false;}
    });
    const dateLabel=new Date(startsAt).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short'}),from=new Date(startsAt).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'}),to=new Date(endsAt).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'});
    const message=`Игрок ${me.name} ищет ${format==='individual'?'индивидуальную тренировку':format==='split'?'сплит':'групповую тренировку'} · ${sport==='tennis'?'теннис':'падел'} · ${city} · ${dateLabel}, ${from}–${to} · ${selected.map(c=>c.name).join(', ')}`;
    db.exec('BEGIN');try{
      db.prepare('INSERT INTO training_requests(id,player_id,sport,city,format,starts_at,ends_at,court_ids,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,me.id,sport,city,format,startsAt,endsAt,JSON.stringify(ids),note,now());
      for(const person of recipients)notifyUser(person.id,message,`training_request_${id}`);
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
    return send(res,201,{request:trainingRequestDTO(db.prepare('SELECT * FROM training_requests WHERE id=?').get(id))});
  }
  const playerTrainingRequest=url.pathname.match(/^\/api\/training-requests\/([a-f0-9-]{36})$/i);
  if(playerTrainingRequest&&req.method==='GET'){
    const found=db.prepare('SELECT * FROM training_requests WHERE id=? AND cancelled_at IS NULL AND ends_at>?').get(playerTrainingRequest[1],now());
    if(!found)fail(404,'Заявка уже закрыта');return send(res,200,{request:trainingRequestDTO(found)});
  }
  if(playerTrainingRequest&&req.method==='DELETE'){
    const found=db.prepare('SELECT * FROM training_requests WHERE id=?').get(playerTrainingRequest[1]);
    if(!found)fail(404,'Заявка не найдена');if(found.player_id!==me.id&&!isAdmin(me.id))fail(403,'Отменить заявку может только автор');
    if(found.cancelled_at)fail(409,'Заявка уже отменена');
    db.prepare('UPDATE training_requests SET cancelled_at=? WHERE id=?').run(now(),found.id);return send(res,200,{cancelled:true});
  }
  if(req.method==='GET'&&url.pathname==='/api/trainings'){
    const rows=db.prepare('SELECT * FROM trainings WHERE starts_at>? ORDER BY starts_at LIMIT 1000').all(new Date(Date.now()-3600000).toISOString());
    return send(res,200,{trainings:rows.map(t=>trainingDTO(t,me.id))});
  }
  if(req.method==='POST'&&url.pathname==='/api/trainings'){
    if(me.role!=='coach'&&!isAdmin(me.id))fail(403,'Создать тренировку может только тренер');
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
    broadcast(`Новая тренировка: ${sport==='tennis'?'теннис':'падел'} · ${me.name} · ${court.name} · ${new Date(startsAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`,`training_${id}`);
    return send(res,201,{training:trainingDTO(getTraining.get(id),me.id)});
  }
  const trainingEditor=url.pathname.match(/^\/api\/trainings\/([a-f0-9-]{36})$/i);
  if(trainingEditor&&['PATCH','DELETE'].includes(req.method)){
    const old=getTraining.get(trainingEditor[1]);if(!old)fail(404,'Тренировка не найдена');
    if(old.coach_id!==me.id&&!isAdmin(me.id))fail(403,'Изменить тренировку может только её тренер или администратор');
    if(old.cancelled_at)fail(409,'Тренировка отменена');
    if(Date.parse(old.starts_at)<Date.now())fail(409,'Тренировка уже началась');
    if(req.method==='DELETE'){db.prepare('UPDATE trainings SET cancelled_at=? WHERE id=?').run(now(),old.id);if(isAdmin(me.id)&&old.coach_id!==me.id)audit(me.id,'cancel','training',old.id);closePendingRequests('training',old.id,'Тренировка отменена, заявка закрыта');for(const member of getTrainingMembers.all(old.id))notifyUser(member.id,`Тренировка ${old.starts_at.slice(0,10)} отменена`);return send(res,200,{training:trainingDTO(getTraining.get(old.id),me.id)});}
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
    if(startsAt!==old.starts_at)db.prepare("DELETE FROM event_reminders WHERE kind='training' AND listing_id=?").run(old.id);
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
  if(req.method==='GET'&&url.pathname==='/api/match-polls'){
    processMatchPrompts();
    const rows=db.prepare("SELECT g.* FROM match_polls p JOIN games g ON g.id=p.game_id JOIN participants m ON m.game_id=g.id LEFT JOIN match_votes v ON v.game_id=g.id AND v.user_id=m.user_id WHERE m.user_id=? AND p.status='pending' AND v.user_id IS NULL AND g.cancelled_at IS NULL ORDER BY g.starts_at DESC LIMIT 10").all(me.id);
    return send(res,200,{games:rows.map(g=>gameDTO(g,me.id))});
  }
  if(req.method==='POST'&&url.pathname==='/api/games'){
    const b=await body(req);const sport=str(b.sport),kind=str(b.kind),opponentGender=b.opponentGender??'any';
    if(b.courtReserved!==undefined&&typeof b.courtReserved!=='boolean')fail(400,'Проверьте статус бронирования корта');
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
      db.prepare('INSERT INTO games(id,sport,city,venue,court_id,starts_at,duration,level_min,level_max,seats,price,kind,note,creator_id,created_at,opponent_gender,requires_approval,court_reserved) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,sport,city,venue,court.id,startsAt,duration,min,max,seats,price,kind,str(b.note,240),me.id,now(),opponentGender,b.requiresApproval?1:0,b.courtReserved?1:0);
      db.prepare('INSERT INTO participants VALUES(?,?,?)').run(id,me.id,now());db.exec('COMMIT');
    }catch(e){db.exec('ROLLBACK');throw e;}
    broadcast(`Новая игра: ${sport==='tennis'?'теннис':'падел'} · ${court.name} · ${new Date(startsAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`,`game_${id}`);
    return send(res,201,{game:gameDTO(getGame.get(id),me.id)});
  }
  const gameEditor=url.pathname.match(/^\/api\/games\/([a-f0-9-]{36})$/i);
  if(gameEditor&&['PATCH','DELETE'].includes(req.method)){
    const old=getGame.get(gameEditor[1]);if(!old)fail(404,'Игра не найдена');
    if(old.creator_id!==me.id&&!isAdmin(me.id))fail(403,'Изменить игру может только создатель или администратор');
    if(old.cancelled_at)fail(409,'Игра отменена');
    if(Date.parse(old.starts_at)<Date.now()||old.result)fail(409,'Эту игру уже нельзя изменить');
    if(req.method==='DELETE'){db.prepare('UPDATE games SET cancelled_at=? WHERE id=?').run(now(),old.id);if(isAdmin(me.id)&&old.creator_id!==me.id)audit(me.id,'cancel','game',old.id);closePendingRequests('game',old.id,'Игра отменена, заявка закрыта');for(const member of getMembers.all(old.id))if(member.id!==me.id)notifyUser(member.id,`Игра ${old.starts_at.slice(0,10)} отменена`);return send(res,200,{game:gameDTO(getGame.get(old.id),me.id)});}
    const b=await body(req),sport=str(b.sport),kind=str(b.kind),seats=Number(b.seats),duration=Number(b.duration),price=Number(b.price),opponentGender=b.opponentGender;
    if(b.courtReserved!==undefined&&typeof b.courtReserved!=='boolean')fail(400,'Проверьте статус бронирования корта');
    if(b.requiresApproval!==undefined&&typeof b.requiresApproval!=='boolean')fail(400,'Проверьте подтверждение заявок');
    if(!['tennis','padel'].includes(sport)||!['friendly','rating'].includes(kind)||![2,4].includes(seats)||!['any','male','female'].includes(opponentGender))fail(400,'Проверьте формат игры');
    if(seats<getMembers.all(old.id).length)fail(409,'Мест меньше числа участников');
    const court=allCourts().find(c=>c.id===b.courtId&&c.sport===sport);if(!court)fail(400,'Выберите корт для выбранного вида спорта');
    const startsAt=date(b.startsAt);if(Date.parse(startsAt)<Date.now()+1800000||Date.parse(startsAt)>Date.now()+90*86400000)fail(400,'Выберите дату в ближайшие 90 дней');
    const min=Number(b.levelMin),max=Number(b.levelMax);
    if(!Number.isFinite(min)||!Number.isFinite(max)||min<1||max>7||max<min||min*2!==Math.round(min*2)||max*2!==Math.round(max*2)||![60,90,120].includes(duration)||!Number.isInteger(price)||price<0||price>100000)fail(400,'Проверьте параметры игры');
    const requiresApproval=b.requiresApproval===undefined?!!old.requires_approval:b.requiresApproval;
    const courtReserved=b.courtReserved===undefined?!!old.court_reserved:b.courtReserved;
    if(courtReserved&&(court.id!==old.court_id||startsAt!==old.starts_at)&&b.courtReserved===undefined)fail(400,'Подтвердите бронь нового корта или времени');
    db.prepare('UPDATE games SET sport=?,kind=?,seats=?,court_id=?,venue=?,city=?,starts_at=?,duration=?,level_min=?,level_max=?,price=?,opponent_gender=?,note=?,requires_approval=?,court_reserved=? WHERE id=?').run(sport,kind,seats,court.id,court.name,court.city||'Краснодар',startsAt,duration,min,max,price,opponentGender,str(b.note,240),requiresApproval?1:0,courtReserved?1:0,old.id);
    if(startsAt!==old.starts_at)db.prepare("DELETE FROM event_reminders WHERE kind='game' AND listing_id=?").run(old.id);
    if(!requiresApproval&&old.requires_approval)closePendingRequests('game',old.id,'Организатор изменил условия записи. Отправьте заявку снова.');
    return send(res,200,{game:gameDTO(getGame.get(old.id),me.id)});
  }
  const match=url.pathname.match(/^\/api\/games\/([a-f0-9-]{36})(?:\/(join|leave|attend|confirm-attendance|report-absence|contest-absence|result|confirm|dispute|vote))?$/i);
  if(match){const game=getGame.get(match[1]);if(!game)fail(404,'Игра не найдена');const action=match[2];
    if(req.method==='GET'&&!action)return send(res,200,{game:gameDTO(game,me.id)});
    if(req.method!=='POST')fail(405,'Метод не поддерживается');
    if(game.cancelled_at)fail(409,'Игра отменена');
    const members=getMembers.all(game.id),joined=members.some(m=>m.id===me.id);
    if(action==='vote')return send(res,200,{vote:recordMatchVote(game.id,me.id,str((await body(req)).choice,20)),game:gameDTO(getGame.get(game.id),me.id)});
    if(['attend','confirm-attendance','result','confirm','dispute','report-absence','contest-absence'].includes(action)&&db.prepare('SELECT 1 FROM match_polls WHERE game_id=?').get(game.id))fail(409,'По игре уже идёт голосование');
    if(action==='join'){
      if(Date.parse(game.starts_at)<Date.now())fail(409,'Игра уже началась');if(joined)fail(409,'Вы уже в игре');if(members.length>=game.seats)fail(409,'Мест больше нет');
      if(game.opponent_gender!=='any'&&me.gender!==game.opponent_gender)fail(403,'Создатель игры указал другой пол участников');
      if(game.requires_approval){
        if(getRequest.get('game',game.id,me.id)?.status==='pending')fail(409,'Заявка уже ждёт подтверждения');
        db.prepare("INSERT INTO join_requests(kind,listing_id,user_id,status,created_at,resolved_at) VALUES('game',?,?,'pending',?,NULL) ON CONFLICT(kind,listing_id,user_id) DO UPDATE SET status='pending',created_at=excluded.created_at,resolved_at=NULL").run(game.id,me.id,now());
        notifyUser(game.creator_id,`${me.name} просит присоединиться к игре`);
      }else{db.prepare('INSERT INTO participants VALUES(?,?,?)').run(game.id,me.id,now());db.prepare("DELETE FROM join_requests WHERE kind='game' AND listing_id=? AND user_id=?").run(game.id,me.id);notifyUser(game.creator_id,`${me.name} присоединился к игре`);}
    }else if(action==='leave'){
      if(game.kind==='rating'&&Date.parse(game.starts_at)+game.duration*60000<=Date.now())fail(409,'Рейтинговая игра завершена');
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
    const media=url.pathname.match(/^\/media\/([a-f0-9-]{36})$/i);
    if(media){
      if(req.method!=='GET'&&req.method!=='HEAD')fail(405,'Метод не поддерживается');
      const item=db.prepare('SELECT m.mime FROM profile_media m JOIN users u ON u.id=m.owner_id WHERE m.id=? AND u.blocked_at IS NULL AND u.registration_version>=2').get(media[1]);
      if(!item)fail(404,'Медиа не найдено');
      const file=path.join(mediaDir,media[1]),stat=fs.statSync(file,{throwIfNoEntry:false});if(!stat?.isFile())fail(404,'Файл не найден');
      const range=req.headers.range?.match(/^bytes=(\d*)-(\d*)$/),start=range?(range[1]?Number(range[1]):Math.max(0,stat.size-Number(range[2]))):0,end=range&&range[1]&&range[2]?Number(range[2]):stat.size-1;
      if(range&&(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||end>=stat.size)){res.writeHead(416,{'Content-Range':`bytes */${stat.size}`});return res.end();}
      res.writeHead(range?206:200,{'Content-Type':item.mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes',...(range?{'Content-Range':`bytes ${start}-${end}/${stat.size}`}:{ }),'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'});
      if(req.method==='HEAD')return res.end();fs.createReadStream(file,{start,end}).pipe(res);return;
    }
    if(req.method!=='GET')fail(405,'Метод не поддерживается');
    const name=url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname);
    const file=path.resolve(publicDir,'.'+name);if(!file.startsWith(publicDir+path.sep))fail(403,'Недоступно');
    const stat=fs.statSync(file,{throwIfNoEntry:false});if(!stat?.isFile())fail(404,'Не найдено');
    res.writeHead(200,{'Content-Type':responses[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self' https://telegram.org; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors https://web.telegram.org https://*.telegram.org"});fs.createReadStream(file).pipe(res);
  }catch(e){if(!res.headersSent)send(res,e.status||500,{error:e.status?e.message:'Ошибка сервера'});else res.end();}
});
async function botMethod(method,payload,timeout=8000){
  const response=await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(timeout)});
  const result=await response.json();if(!result.ok)throw Error(`${method}: ${result.description||response.status}`);return result.result;
}
async function handleBotUpdate(update){
  const query=update.callback_query;if(!query)return;
  const match=/^rv:([a-f0-9-]{36}):(win|loss|no_score)$/i.exec(query.data||'');if(!match)return;
  let message='Не удалось записать ответ';
  try{
    if(String(query.message?.chat?.id)!==String(query.from?.id))fail(403,'Ответ доступен только в личном чате');
    const user=getUser.get(String(query.from.id));if(!user||!user.registered||user.blockedAt)fail(403,'Профиль недоступен');
    message=recordMatchVote(match[1],String(query.from.id),match[2]).message;
    if(query.message?.message_id)botMethod('editMessageReplyMarkup',{chat_id:query.message.chat.id,message_id:query.message.message_id,reply_markup:{inline_keyboard:[]}}).catch(()=>{});
  }catch(error){message=error.message;}
  await botMethod('answerCallbackQuery',{callback_query_id:query.id,text:message.slice(0,190),show_alert:false});
}
async function botPollLoop(){
  if(!process.env.BOT_TOKEN)return;
  try{
    const offset=Number(db.prepare("SELECT value FROM bot_state WHERE key='offset'").get()?.value||0);
    const updates=await botMethod('getUpdates',{offset,timeout:20,allowed_updates:['callback_query']},26000);
    for(const update of updates){
      try{await handleBotUpdate(update);}catch(error){console.warn('Telegram callback unavailable:',error.message);}
      db.prepare("INSERT INTO bot_state(key,value) VALUES('offset',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(update.update_id+1));
    }
  }catch(error){console.warn('Telegram polling unavailable:',error.message);}
  finally{setTimeout(botPollLoop,1500).unref();}
}
if(import.meta.url===`file://${process.argv[1]}`){server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log(`Tennis GO Mini App: http://localhost:${process.env.PORT||3000} (${process.env.BOT_TOKEN?'Telegram':'demo'})`));if(process.env.BOT_TOKEN)setTimeout(botPollLoop,1500).unref();}
export {server,db,verifyInitData,sendNextBotMessage,processEventReminders,processMatchPrompts,recordMatchVote,handleBotUpdate,notificationButton};
