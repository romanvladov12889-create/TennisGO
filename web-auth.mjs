import crypto from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(crypto.scrypt),hash=v=>crypto.createHash('sha256').update(v).digest('hex'),random=()=>crypto.randomBytes(24).toString('hex');
function fail(status,message){throw Object.assign(new Error(message),{status});}
function equal(a,b){const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
export function emailConfigured(){return !!(process.env.RESEND_API_KEY&&process.env.EMAIL_FROM);}
async function sendVerificationEmail(email,code,purpose){
 if(!emailConfigured())fail(503,'Регистрация по email пока не настроена. Попробуйте позже');
 const title=purpose==='reset'?'Восстановление пароля':'Подтверждение email';
 try{const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000),body:JSON.stringify({from:process.env.EMAIL_FROM,to:[email],subject:`${title} — Tennis GO`,text:`${title} Tennis GO\n\nВаш код: ${code}\n\nКод действует 10 минут. Никому не сообщайте его. Если вы не запрашивали это письмо, просто проигнорируйте его.`})});if(!response.ok)throw Error('mail provider');}catch{fail(503,'Не удалось отправить письмо. Попробуйте позже');}
}
function cookies(req){return Object.fromEntries(String(req.headers.cookie||'').split(';').map(x=>x.trim().split(/=(.*)/s).slice(0,2)).filter(x=>x.length===2));}
export function createWebAuth(db,{sendEmail=sendVerificationEmail}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS web_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),csrf TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS web_sessions_user ON web_sessions(user_id);
 CREATE TABLE IF NOT EXISTS web_challenges(id TEXT PRIMARY KEY,browser_hash TEXT NOT NULL,code TEXT NOT NULL,user_id TEXT,status TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS web_passwords(user_id TEXT PRIMARY KEY REFERENCES users(id),login TEXT UNIQUE NOT NULL,salt TEXT NOT NULL,password_hash TEXT NOT NULL,updated_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS web_emails(email TEXT PRIMARY KEY,user_id TEXT UNIQUE NOT NULL REFERENCES users(id),verified_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS email_challenges(token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,code_hash TEXT NOT NULL,purpose TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,consumed INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX IF NOT EXISTS email_challenges_email ON email_challenges(email,created_at);
 CREATE TABLE IF NOT EXISTS web_auth_limits(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL);`);
 function cookie(req,res,name,value,age){const old=res.getHeader('Set-Cookie')||[],secure=!!process.env.BOT_TOKEN||req.socket?.encrypted||req.headers['x-forwarded-proto']==='https';res.setHeader('Set-Cookie',[...(Array.isArray(old)?old:[old]),`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`]);}
 function origin(req){const raw=req.headers.origin;if(!raw)fail(403,'Обновите страницу сайта и повторите действие');let parsed;try{parsed=new URL(raw);}catch{fail(403,'Неверный источник запроса');}if(!['https:','http:'].includes(parsed.protocol)||parsed.host!==req.headers.host)fail(403,'Запрос должен быть отправлен с сайта Tennis GO');}
 function limit(req,key,max){const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').split(',').at(-1).trim(),now=Date.now();db.prepare('DELETE FROM web_auth_limits WHERE expires_at<?').run(now);const id=hash(key+':'+ip);db.prepare('INSERT INTO web_auth_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1').run(id,now+15*60000);if(db.prepare('SELECT attempts FROM web_auth_limits WHERE key=?').get(id).attempts>max)fail(429,'Слишком много попыток. Повторите через 15 минут');}
 function clean(){const t=Date.now();db.prepare('DELETE FROM web_sessions WHERE expires_at<?').run(t);db.prepare('DELETE FROM web_challenges WHERE expires_at<?').run(t);db.prepare('DELETE FROM email_challenges WHERE expires_at<?').run(t);}
 function session(req,write=false){const token=cookies(req).tg_web;if(!/^[a-f0-9]{48}$/.test(token||''))return null;const row=db.prepare('SELECT s.*,u.name,u.username,u.blocked_at FROM web_sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>?').get(hash(token),Date.now());if(!row||row.blocked_at)return null;if(write){origin(req);if(!equal(req.headers['x-web-csrf'],row.csrf))fail(403,'Защита сессии: обновите страницу сайта');}return {...row,identity:{id:row.user_id,name:row.name,username:row.username||''}};}
 function issue(req,res,id){const user=db.prepare('SELECT blocked_at FROM users WHERE id=?').get(id);if(!user||user.blocked_at)fail(403,'Профиль недоступен');clean();const token=random(),csrf=random(),t=Date.now();db.prepare('INSERT INTO web_sessions VALUES(?,?,?,?,?)').run(hash(token),id,csrf,t,t+30*86400000);cookie(req,res,'tg_web',token,30*86400);return {authenticated:true,csrf};}
 async function route(req,res,url,body){
  const endpoint=url.pathname,method=req.method;
  if(endpoint==='/api/web-auth/register'&&method==='POST'){
   origin(req);limit(req,'signup',8);const b=await body(req),email=String(b.email||'').trim().toLowerCase(),pass=String(b.password||'');
   if(email.length>254||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(email))fail(400,'Укажите корректный email');
   if(pass.length<10||pass.length>128)fail(400,'Пароль: от 10 до 128 символов');
   if(db.prepare('SELECT 1 FROM web_emails WHERE email=?').get(email))fail(409,'Email уже зарегистрирован. Войдите или восстановите пароль');
   const salt=crypto.randomBytes(16).toString('hex'),derived=await scrypt(pass,salt,64),id='web-'+crypto.randomUUID();
   db.exec('BEGIN IMMEDIATE');try{
    if(db.prepare('SELECT 1 FROM web_emails WHERE email=?').get(email))fail(409,'Email уже зарегистрирован. Войдите или восстановите пароль');
    db.prepare('INSERT INTO users(id,name,username,created_at) VALUES(?,?,?,?)').run(id,'Новый игрок','',new Date().toISOString());
    db.prepare('INSERT INTO web_emails VALUES(?,?,0)').run(email,id);
    db.prepare('INSERT INTO web_passwords VALUES(?,?,?,?,?)').run(id,id,salt,derived.toString('hex'),Date.now());
    const result=issue(req,res,id);db.exec('COMMIT');return result;
   }catch(error){db.exec('ROLLBACK');throw error;}
  }
  if(endpoint==='/api/web-auth/email/request'&&method==='POST'){
   origin(req);limit(req,'email-send',8);if(sendEmail===sendVerificationEmail&&!emailConfigured())fail(503,'Регистрация по email пока не настроена. Попробуйте позже');
   const b=await body(req),email=String(b.email||'').trim().toLowerCase(),purpose=b.purpose==='reset'?'reset':'register';
   if(email.length>254||! /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/i.test(email))fail(400,'Укажите корректный email');
   clean();const t=Date.now(),recent=db.prepare('SELECT created_at FROM email_challenges WHERE email=? ORDER BY created_at DESC LIMIT 1').get(email);
   if(recent&&t-recent.created_at<60000)fail(429,'Повторное письмо можно запросить через минуту');
   if(db.prepare('SELECT COUNT(*) n FROM email_challenges WHERE email=? AND created_at>?').get(email,t-10*60000).n>=5)fail(429,'Слишком много писем. Повторите позже');
   const token=random(),code=String(crypto.randomInt(100000,1000000)),tokenHash=hash(token);
   db.prepare('INSERT INTO email_challenges(token_hash,email,code_hash,purpose,created_at,expires_at) VALUES(?,?,?,?,?,?)').run(tokenHash,email,hash(token+':'+code),purpose,t,t+10*60000);
   try{await sendEmail(email,code,purpose);}catch(e){db.prepare('DELETE FROM email_challenges WHERE token_hash=?').run(tokenHash);throw e;}
   cookie(req,res,'tg_email_pending',token,600);return {ok:true,expiresAt:t+10*60000};
  }
  if(endpoint==='/api/web-auth/email/verify'&&method==='POST'){
   origin(req);limit(req,'email-verify',30);const b=await body(req),token=cookies(req).tg_email_pending||'',pass=String(b.password||''),code=String(b.code||'');
   if(pass.length<10||pass.length>128)fail(400,'Пароль: от 10 до 128 символов');
   const row=db.prepare('SELECT * FROM email_challenges WHERE token_hash=? AND expires_at>? AND consumed=0 AND attempts<5').get(hash(token),Date.now());
   if(!row)fail(400,'Код истёк или исчерпаны попытки. Запросите новое письмо');
   db.prepare('UPDATE email_challenges SET attempts=attempts+1 WHERE token_hash=?').run(row.token_hash);
   if(!equal(hash(token+':'+code),row.code_hash))fail(400,'Неверный код');
   const salt=crypto.randomBytes(16).toString('hex'),derived=await scrypt(pass,salt,64);
   db.exec('BEGIN IMMEDIATE');try{
    const live=db.prepare('SELECT * FROM email_challenges WHERE token_hash=? AND expires_at>? AND consumed=0 AND attempts<=5').get(row.token_hash,Date.now());if(!live)fail(400,'Код уже использован или истёк');
    let account=db.prepare('SELECT user_id FROM web_emails WHERE email=?').get(row.email),id=account?.user_id;
    if(row.purpose==='register'&&id)fail(409,'Email уже зарегистрирован. Войдите или восстановите пароль');
    if(row.purpose==='reset'&&!id)fail(400,'Аккаунт не найден. Выберите регистрацию');
    if(!id){id='web-'+crypto.randomUUID();db.prepare('INSERT INTO users(id,name,username,created_at) VALUES(?,?,?,?)').run(id,'Новый игрок','',new Date().toISOString());db.prepare('INSERT INTO web_emails VALUES(?,?,?)').run(row.email,id,Date.now());}
    db.prepare('INSERT INTO web_passwords VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET salt=excluded.salt,password_hash=excluded.password_hash,updated_at=excluded.updated_at').run(id,id,salt,derived.toString('hex'),Date.now());
    db.prepare('UPDATE web_emails SET verified_at=? WHERE user_id=?').run(Date.now(),id);
    db.prepare('UPDATE email_challenges SET consumed=1 WHERE email=?').run(row.email);
    db.prepare('DELETE FROM web_sessions WHERE user_id=?').run(id);
    const result=issue(req,res,id);db.exec('COMMIT');cookie(req,res,'tg_email_pending','',0);return result;
   }catch(e){db.exec('ROLLBACK');throw e;}
  }
  if(endpoint==='/api/web-auth/session'&&method==='GET'){const s=session(req);return {authenticated:!!s,csrf:s?.csrf||null,hasPassword:s?!!db.prepare('SELECT 1 FROM web_passwords WHERE user_id=?').get(s.user_id):false};}
  if(endpoint==='/api/web-auth/challenge'&&method==='POST'){
   origin(req);limit(req,'challenge',15);if(!process.env.BOT_TOKEN||!process.env.BOT_USERNAME)fail(503,'Вход через Telegram пока не настроен администратором');clean();
   const id=random(),browser=random(),code=String(crypto.randomInt(100000,1000000)),t=Date.now();const previous=cookies(req).tg_web_pending;if(previous)db.prepare("UPDATE web_challenges SET status='cancelled' WHERE browser_hash=? AND status IN ('pending','approved')").run(hash(previous));
   db.prepare("INSERT INTO web_challenges VALUES(?,?,?,NULL,'pending',?,?)").run(id,hash(browser),code,t,t+5*60000);cookie(req,res,'tg_web_pending',browser,300);return {code,expiresAt:t+5*60000,url:`https://t.me/${process.env.BOT_USERNAME.replace(/^@/,'')}?start=web_${id}`};
  }
  if(endpoint==='/api/web-auth/poll'&&method==='POST'){
   origin(req);const browser=cookies(req).tg_web_pending;if(!browser)fail(401,'Запрос входа истёк. Начните заново');const r=db.prepare('SELECT * FROM web_challenges WHERE browser_hash=? AND expires_at>?').get(hash(browser),Date.now());if(!r||['cancelled','consumed'].includes(r.status))fail(401,'Запрос входа истёк. Начните заново');if(r.status!=='approved')return {authenticated:false};
   db.exec('BEGIN IMMEDIATE');try{const changed=db.prepare("UPDATE web_challenges SET status='consumed' WHERE id=? AND status='approved'").run(r.id);if(!changed.changes)fail(409,'Вход уже завершён');const result=issue(req,res,r.user_id);db.exec('COMMIT');cookie(req,res,'tg_web_pending','',0);return result;}catch(e){db.exec('ROLLBACK');throw e;}
  }
  if(endpoint==='/api/web-auth/login'&&method==='POST'){
   origin(req);limit(req,'password',20);const b=await body(req),login=String(b.login||'').trim().toLowerCase(),password=String(b.password||'');if(password.length>128)fail(400,'Пароль слишком длинный');
   const row=db.prepare('SELECT p.* FROM web_passwords p LEFT JOIN web_emails e ON e.user_id=p.user_id WHERE p.login=? OR e.email=?').get(login,login),salt=row?.salt||'00000000000000000000000000000000';const derived=await scrypt(password,salt,64);if(!row||!equal(derived.toString('hex'),row.password_hash))fail(401,'Неверный логин или пароль');return issue(req,res,row.user_id);
  }
  if(endpoint==='/api/web-auth/logout'&&method==='POST'){const s=session(req,true);if(s)db.prepare('DELETE FROM web_sessions WHERE token_hash=?').run(s.token_hash);else origin(req);cookie(req,res,'tg_web','',0);cookie(req,res,'tg_web_pending','',0);return {ok:true};}
  return null;
 }
 async function password(req,res,id,b,tma=false){
  limit(req,'set-password',10);const login=String(b.login||'').trim().toLowerCase(),pass=String(b.password||'');if(!/^[a-z0-9_.-]{3,40}$/.test(login)||pass.length<10||pass.length>128)fail(400,'Логин: 3–40 латинских букв, цифр или ._-; пароль: 10–128 символов');
  const current=db.prepare('SELECT * FROM web_passwords WHERE user_id=?').get(id),s=tma?null:session(req,true);
  if(!tma){if(!s||s.user_id!==id)fail(401,'Войдите заново');if(current){const old=await scrypt(String(b.currentPassword||'').slice(0,128),current.salt,64);if(!equal(old.toString('hex'),current.password_hash))fail(403,'Укажите текущий пароль или смените пароль в мини-приложении Telegram');}else if(Date.now()-s.created_at>10*60000)fail(403,'Перед созданием пароля подтвердите новый вход через Telegram');}
  const taken=db.prepare('SELECT user_id FROM web_passwords WHERE login=?').get(login);if(taken&&taken.user_id!==id)fail(409,'Этот логин занят');const salt=crypto.randomBytes(16).toString('hex'),derived=await scrypt(pass,salt,64);
  db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO web_passwords VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET login=excluded.login,salt=excluded.salt,password_hash=excluded.password_hash,updated_at=excluded.updated_at').run(id,login,salt,derived.toString('hex'),Date.now());db.prepare('DELETE FROM web_sessions WHERE user_id=?').run(id);const result=tma?{ok:true}:issue(req,res,id);db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}
 }
 async function bot(update,send){
  const msg=update.message,q=update.callback_query,start=/^\/start(?:@\w+)? web_([a-f0-9]{48})$/.exec(msg?.text||''),ok=/^webok:([a-f0-9]{48})$/.exec(q?.data||'');if(!start&&!ok)return false;
  const from=start?msg.from:q.from,chat=start?msg.chat:q.message?.chat;if(chat?.type!=='private'||String(chat.id)!==String(from?.id))return true;
  const id=(start||ok)[1],r=db.prepare("SELECT * FROM web_challenges WHERE id=? AND status='pending' AND expires_at>?").get(id,Date.now());
  if(!r){if(q)await send('answerCallbackQuery',{callback_query_id:q.id,text:'Запрос входа истёк. Начните заново на сайте.'});else await send('sendMessage',{chat_id:chat.id,text:'Запрос входа истёк. Начните заново на сайте.'});return true;}
  const uid=String(from.id);if(r.user_id&&r.user_id!==uid){if(q)await send('answerCallbackQuery',{callback_query_id:q.id,text:'Этот запрос уже связан с другим аккаунтом.'});return true;}
  if(db.prepare('SELECT blocked_at FROM users WHERE id=?').get(uid)?.blocked_at){await send('sendMessage',{chat_id:chat.id,text:'Доступ к профилю ограничен.'});return true;}
  if(start){db.prepare('UPDATE web_challenges SET user_id=? WHERE id=? AND user_id IS NULL').run(uid,id);await send('sendMessage',{chat_id:chat.id,text:`Вход на сайт Tennis GO\n\nКод на экране браузера: ${r.code}\n\nПодтвердите только если вы сами начали вход и код совпадает. После подтверждения вернитесь в браузер.`,reply_markup:{inline_keyboard:[[{text:'Подтвердить вход на сайт',callback_data:'webok:'+id}]]}});return true;}
  if(r.user_id!==uid)return true;
  db.prepare('INSERT INTO users(id,name,username,created_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,username=excluded.username').run(uid,[from.first_name,from.last_name].filter(Boolean).join(' ').slice(0,60)||'Игрок',String(from.username||'').slice(0,40),new Date().toISOString());
  db.prepare("UPDATE web_challenges SET status='approved' WHERE id=? AND status='pending'").run(id);
  await send('answerCallbackQuery',{callback_query_id:q.id,text:'Вход подтверждён. Вернитесь на сайт.'});await send('editMessageReplyMarkup',{chat_id:chat.id,message_id:q.message.message_id,reply_markup:{inline_keyboard:[]}}).catch(()=>{});return true;
 }
 return {route,session,password,bot};
}
