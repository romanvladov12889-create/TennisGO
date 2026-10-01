import crypto from 'node:crypto';
export const campaignId='tennis-go-rewards-v1';
export const prizes=[{id:'balls',title:'Туба мячей',cost:200,total:5,icon:'🎾',time:'около 1 месяца'},{id:'merch',title:'Футболка или кепка Tennis GO',cost:500,total:3,icon:'👕',time:'около 2 месяцев'},{id:'hoodie',title:'Худи или спортивная сумка',cost:1000,total:3,icon:'🎒',time:'около 4 месяцев'},{id:'racket',title:'Профессиональная ракетка',cost:10000,total:1,icon:'🏸',time:'около года'}];
export const tasks=[['game','Подтверждённый матч',15,8],['opponent','Новый соперник',10,3],['training','Тренировка или открытое занятие',20,2],['court','Посещение партнёрского корта',5,4],['streak','Четыре недели подряд',20,1],['referral','Приглашённый новичок сыграл два матча',20,1]];
const stamp=()=>new Date().toISOString();
const month=t=>new Date(Date.parse(t)+10800000).toISOString().slice(0,7);
const week=t=>Math.floor((Date.parse(t)+10800000+3*86400000)/(7*86400000));
function error(code,text){throw Object.assign(new Error(text),{status:code});}
export function createRewards(db,{notify=()=>{},admin=()=>false}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS reward_campaign(id TEXT PRIMARY KEY,starts_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS reward_ledger(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),task TEXT NOT NULL,source TEXT NOT NULL,amount INTEGER NOT NULL,period TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(user_id,task,source));
 CREATE INDEX IF NOT EXISTS reward_user ON reward_ledger(user_id,period,task);
 CREATE TABLE IF NOT EXISTS reward_checks(user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,source TEXT NOT NULL,status TEXT NOT NULL,reason TEXT NOT NULL,starts_at TEXT NOT NULL,duration INTEGER NOT NULL,peers TEXT NOT NULL DEFAULT '[]',PRIMARY KEY(user_id,kind,source));
 CREATE INDEX IF NOT EXISTS reward_check_status ON reward_checks(status,kind);
 CREATE TABLE IF NOT EXISTS reward_proofs(kind TEXT NOT NULL,source TEXT NOT NULL,user_id TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,PRIMARY KEY(kind,source,user_id));
 CREATE TABLE IF NOT EXISTS reward_partners(user_id TEXT PRIMARY KEY REFERENCES users(id),approved_by TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS reward_referrals(invitee TEXT PRIMARY KEY REFERENCES users(id),inviter TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL,CHECK(invitee<>inviter));
 CREATE TABLE IF NOT EXISTS reward_claims(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),prize TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,resolved_at TEXT,reason TEXT);
 CREATE UNIQUE INDEX IF NOT EXISTS reward_one_prize ON reward_claims(user_id,prize) WHERE status IN ('pending','issued');
 CREATE TABLE IF NOT EXISTS reward_opponents(user_id TEXT NOT NULL,peer_id TEXT NOT NULL,source TEXT NOT NULL,PRIMARY KEY(user_id,peer_id));
 CREATE TABLE IF NOT EXISTS reward_audit(id TEXT PRIMARY KEY,admin_id TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL);`);
 db.prepare('INSERT OR IGNORE INTO reward_campaign VALUES(?,?)').run(campaignId,stamp());
 const start=db.prepare('SELECT starts_at FROM reward_campaign WHERE id=?').get(campaignId).starts_at;
 const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const value=fn();db.exec('COMMIT');return value;}catch(e){db.exec('ROLLBACK');throw e;}};
 const balance=id=>{const r=db.prepare("SELECT COALESCE(SUM(amount),0) AS balance,COALESCE(SUM(CASE WHEN task NOT IN ('spend','refund') THEN amount ELSE 0 END),0) AS earned FROM reward_ledger WHERE user_id=?").get(id);return {...r,earned:Math.max(0,r.earned)};};
 function credit(id,task,source,amount,at){
  if(db.prepare('SELECT 1 FROM reward_ledger WHERE user_id=? AND task=? AND source=?').get(id,task,source))return 0;
  const period=month(at),rule=tasks.find(x=>x[0]===task);
  if(rule){const n=db.prepare('SELECT COUNT(*) AS n FROM reward_ledger WHERE user_id=? AND task=? AND period=? AND amount>0').get(id,task,period).n;if(n>=rule[3])return 0;const used=db.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM reward_ledger WHERE user_id=? AND period=? AND task NOT IN ('annual','spend','refund')").get(id,period).n;amount=Math.min(amount,Math.max(0,250-used));}
  if(amount<=0)return 0;
  db.prepare('INSERT INTO reward_ledger VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),id,task,source,amount,period,stamp());return amount;
 }
 function check(id,kind,source,at,duration,peers,status,reason){db.prepare('INSERT OR IGNORE INTO reward_checks(user_id,kind,source,status,reason,starts_at,duration,peers) VALUES(?,?,?,?,?,?,?,?)').run(id,kind,source,status,reason,at,duration,JSON.stringify(peers));}
 function restrictions(id,kind,source,at,duration,peers){
  const rows=db.prepare("SELECT * FROM reward_checks WHERE user_id=? AND status='accepted' AND NOT(kind=? AND source=?)").all(id,kind,source);
  if(rows.some(r=>Date.parse(r.starts_at)<Date.parse(at)+duration*60000&&Date.parse(at)<Date.parse(r.starts_at)+r.duration*60000))return 'Время пересекается с другой засчитанной встречей';
  if(kind==='game'&&peers.some(p=>rows.filter(r=>r.kind==='game'&&month(r.starts_at)===month(at)&&JSON.parse(r.peers).includes(p)).length>=2))return 'Лимит: два матча с одним соперником в месяц';
  return '';
 }
 function awardGame(row){
  const peers=JSON.parse(row.peers);credit(row.user_id,'game',row.source,15,row.starts_at);
  const earlier=db.prepare("SELECT peers FROM reward_checks WHERE user_id=? AND kind='game' AND status='accepted' AND source<>? AND starts_at<=?").all(row.user_id,row.source,row.starts_at).flatMap(r=>JSON.parse(r.peers));
  const newPeer=peers.find(p=>!earlier.includes(p)&&!db.prepare('SELECT 1 FROM reward_opponents WHERE user_id=? AND peer_id=?').get(row.user_id,p));
  if(newPeer&&credit(row.user_id,'opponent',row.source,10,row.starts_at))db.prepare('INSERT OR IGNORE INTO reward_opponents VALUES(?,?,?)').run(row.user_id,newPeer,row.source);
  const weeks=new Set(db.prepare("SELECT starts_at FROM reward_checks WHERE user_id=? AND kind='game' AND status='accepted'").all(row.user_id).map(r=>week(r.starts_at))),w=week(row.starts_at);
  if([0,1,2,3].every(n=>weeks.has(w-n)))credit(row.user_id,'streak',month(row.starts_at),20,row.starts_at);
 }
 function gameValid(g){
  if(!g||g.cancelled_at||g.absence_by||g.result_disputed_at||g.absence_disputed_at||g.starts_at<start||g.created_at>=g.starts_at||g.duration<45||Date.parse(g.starts_at)+g.duration*60000>Date.now())return false;
  const members=db.prepare('SELECT p.user_id,p.joined_at,u.blocked_at,u.registration_version,u.role FROM participants p JOIN users u ON u.id=p.user_id WHERE game_id=?').all(g.id);
  if(members.length!==g.seats||members.some(p=>p.joined_at>=g.starts_at||p.blocked_at||p.registration_version<2))return false;
  const confirmed=g.result_confirmed||members.every(p=>db.prepare("SELECT 1 FROM reward_proofs WHERE kind='game' AND source=? AND user_id=?").get(g.id,p.user_id));return confirmed?members:false;
 }
 function revoke(kind,source,id,reason){
  const row=db.prepare('SELECT * FROM reward_checks WHERE user_id=? AND kind=? AND source=?').get(id,kind,source);if(!row||!['accepted','pending'].includes(row.status))return;
  const entries=db.prepare("SELECT * FROM reward_ledger WHERE user_id=? AND source=? AND task IN ('game','opponent','training','court') AND amount>0").all(id,source);
  for(const e of entries){db.prepare('INSERT OR IGNORE INTO reward_ledger VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),id,'reversal',e.id,-e.amount,e.period,stamp());}
  if(kind==='game')db.prepare('DELETE FROM reward_opponents WHERE user_id=? AND source=?').run(id,source);
  db.prepare("UPDATE reward_checks SET status='rejected',reason=? WHERE user_id=? AND kind=? AND source=?").run(reason,id,kind,source);
 }
 let lastSync=0;
 function reconcile(force=false){if(!force&&Date.now()-lastSync<5000)return;transaction(()=>{
  for(const row of db.prepare("SELECT * FROM reward_checks WHERE kind='game' AND status IN ('accepted','pending')").all())if(!gameValid(db.prepare('SELECT * FROM games WHERE id=?').get(row.source)))revoke('game',row.source,row.user_id,'Подтверждение отозвано: отмена, спор или изменение состава');
  for(const row of db.prepare("SELECT * FROM reward_checks WHERE kind IN ('training','court') AND status='accepted'").all()){const valid=row.kind==='training'?db.prepare("SELECT 1 FROM trainings t JOIN training_participants p ON p.training_id=t.id JOIN completed_trainings c ON c.training_id=t.id WHERE t.id=? AND p.user_id=? AND t.cancelled_at IS NULL").get(row.source,row.user_id):db.prepare("SELECT 1 FROM reward_checks WHERE kind='game' AND source=? AND user_id=? AND status='accepted'").get(row.source,row.user_id);if(!valid)revoke(row.kind,row.source,row.user_id,'Встреча отменена или подтверждение отозвано');}
  const games=db.prepare("SELECT * FROM games g WHERE starts_at>=? AND starts_at<=? AND (result_confirmed=1 OR EXISTS(SELECT 1 FROM reward_proofs WHERE kind='game' AND source=g.id)) AND EXISTS(SELECT 1 FROM participants p JOIN users u ON u.id=p.user_id WHERE p.game_id=g.id AND u.role='player' AND NOT EXISTS(SELECT 1 FROM reward_checks c WHERE c.user_id=p.user_id AND c.kind='game' AND c.source=g.id)) ORDER BY starts_at,id").all(start,stamp());
  for(const g of games){const members=gameValid(g);if(!members)continue;for(const p of members){if(p.role!=='player'||db.prepare("SELECT 1 FROM reward_checks WHERE user_id=? AND kind='game' AND source=?").get(p.user_id,g.id))continue;
    const peers=members.filter(x=>x.user_id!==p.user_id).map(x=>x.user_id),reason=restrictions(p.user_id,'game',g.id,g.starts_at,g.duration,peers),fresh=members.some(x=>Date.parse(g.starts_at)-Date.parse(db.prepare('SELECT created_at FROM users WHERE id=?').get(x.user_id).created_at)<7*86400000);
    const status=reason?'rejected':fresh?'pending':'accepted';check(p.user_id,'game',g.id,g.starts_at,g.duration,peers,status,reason||(fresh?'Новый аккаунт среди участников: проверка администратора':''));
    if(status==='accepted')awardGame(db.prepare("SELECT * FROM reward_checks WHERE user_id=? AND kind='game' AND source=?").get(p.user_id,g.id));
  }}
  for(const r of db.prepare('SELECT * FROM reward_referrals').all()){
    const games=db.prepare("SELECT source,starts_at,peers FROM reward_checks WHERE user_id=? AND kind='game' AND status='accepted' AND starts_at>=? ORDER BY starts_at").all(r.invitee,r.created_at).filter(g=>JSON.parse(g.peers).some(id=>id!==r.inviter));
    if(games.length>=2&&new Set(games.flatMap(g=>JSON.parse(g.peers).filter(id=>id!==r.inviter))).size>=2)credit(r.inviter,'referral',r.invitee,20,games[1].starts_at);
  }
  for(const e of db.prepare("SELECT * FROM reward_ledger WHERE task IN ('streak','referral','annual') AND amount>0 AND NOT EXISTS(SELECT 1 FROM reward_ledger x WHERE x.task='reversal' AND x.source=reward_ledger.id)").all()){let valid=true;if(e.task==='streak'){const dates=db.prepare("SELECT starts_at FROM reward_checks WHERE user_id=? AND kind='game' AND status='accepted'").all(e.user_id),weeks=new Set(dates.map(r=>week(r.starts_at)));valid=dates.some(r=>month(r.starts_at)===e.period&&[0,1,2,3].every(n=>weeks.has(week(r.starts_at)-n)));}else if(e.task==='referral'){const r=db.prepare('SELECT * FROM reward_referrals WHERE invitee=?').get(e.source),games=r?db.prepare("SELECT peers FROM reward_checks WHERE user_id=? AND kind='game' AND status='accepted' AND starts_at>=?").all(r.invitee,r.created_at).filter(g=>JSON.parse(g.peers).some(id=>id!==r.inviter)):[];valid=games.length>=2&&new Set(games.flatMap(g=>JSON.parse(g.peers).filter(id=>id!==r.inviter))).size>=2;}else valid=annual(e.user_id).eligible;if(!valid)db.prepare('INSERT OR IGNORE INTO reward_ledger VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),e.user_id,'reversal',e.id,-e.amount,e.period,stamp());}
  reserveRacket();
 });lastSync=Date.now();}
 function leaders(limit=100){return db.prepare("SELECT u.id,COALESCE(NULLIF(u.display_name,''),u.name) AS name,u.city,u.avatar_id AS avatarId,CASE WHEN u.photo_data IS NOT NULL THEN '/avatars/'||u.id END AS photoData,MAX(0,SUM(CASE WHEN l.task NOT IN ('spend','refund') THEN l.amount ELSE 0 END)) AS points,COALESCE(SUM(l.amount),0) AS balance FROM users u JOIN reward_ledger l ON l.user_id=u.id WHERE u.role='player' AND u.registration_version>=2 AND u.blocked_at IS NULL GROUP BY u.id HAVING points>0 ORDER BY points DESC,MAX(CASE WHEN l.task NOT IN ('spend','refund') THEN l.created_at END),u.id LIMIT ?").all(limit);}
 function annual(id){const rows=db.prepare("SELECT * FROM reward_checks WHERE user_id=? AND kind='game' AND status='accepted' ORDER BY starts_at").all(id),counts=new Map();for(const r of rows)counts.set(month(r.starts_at),(counts.get(month(r.starts_at))||0)+1);
  const activeMonths=[...counts.values()].filter(n=>n>=4).length,opponents=new Set(rows.flatMap(r=>JSON.parse(r.peers))).size,visits=db.prepare("SELECT COUNT(DISTINCT source) AS n FROM reward_ledger WHERE user_id=? AND task IN ('court','training') AND amount>0").get(id).n;
  const since=rows[0]?.starts_at,anniversary=since?new Date(since):null;if(anniversary)anniversary.setUTCFullYear(anniversary.getUTCFullYear()+1);
  return {games:rows.length,activeMonths,opponents,visits,eligible:!!db.prepare("SELECT 1 FROM users WHERE id=? AND role='player' AND registration_version>=2 AND blocked_at IS NULL").get(id)&&!!anniversary&&Date.now()>=anniversary.getTime()&&rows.length>=80&&activeMonths>=12&&opponents>=12&&visits>=12,awarded:!!db.prepare("SELECT 1 FROM reward_ledger WHERE user_id=? AND task='annual'").get(id)};
 }
 function claim(id,prize,automatic=false){
  const p=prizes.find(p=>p.id===prize);if(!p)error(400,'Приз не найден');if(prize==='racket'&&!automatic)error(409,'Ракетка резервируется автоматически за первым проверенным участником с 10 000 баллов');
  if(balance(id).balance<p.cost)error(409,'Недостаточно доступных баллов');
  if(db.prepare("SELECT 1 FROM reward_claims WHERE user_id=? AND prize=? AND status IN ('pending','issued')").get(id,prize))error(409,'Этот приз уже зарезервирован или получен');
  if(db.prepare("SELECT COUNT(*) AS n FROM reward_claims WHERE prize=? AND status IN ('pending','issued')").get(prize).n>=p.total)error(409,'Призы закончились');
  const cid=crypto.randomUUID();db.prepare("INSERT INTO reward_claims VALUES(?,?,?,'pending',?,NULL,NULL)").run(cid,id,prize,stamp());
  db.prepare('INSERT INTO reward_ledger VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),id,'spend',cid,-p.cost,month(stamp()),stamp());return cid;
 }
 function reserveRacket(){if(db.prepare("SELECT 1 FROM reward_claims WHERE prize='racket' AND status IN ('pending','issued')").get())return;const candidates=db.prepare("SELECT u.id,MAX(l.created_at) AS reached FROM users u JOIN reward_ledger l ON l.user_id=u.id WHERE u.role='player' AND u.blocked_at IS NULL AND EXISTS(SELECT 1 FROM reward_ledger a WHERE a.user_id=u.id AND a.task='annual') AND NOT EXISTS(SELECT 1 FROM reward_claims c WHERE c.user_id=u.id AND c.prize='racket' AND c.status='rejected') GROUP BY u.id HAVING SUM(l.amount)>=10000 ORDER BY reached,u.id").all();if(candidates.length)claim(candidates[0].id,'racket',true);}
 function snapshot(id){return {id:campaignId,startsAt:start,...balance(id),monthly:db.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM reward_ledger WHERE user_id=? AND period=? AND task NOT IN ('annual','spend','refund')").get(id,month(stamp())).n,limit:250,tasks:tasks.map(([id,title,points,limit])=>({id,title,points,limit})),prizes:prizes.map(p=>({...p,remaining:p.total-db.prepare("SELECT COUNT(*) AS n FROM reward_claims WHERE prize=? AND status IN ('pending','issued')").get(p.id).n})),leaders:leaders(3),annual:annual(id),claims:db.prepare('SELECT * FROM reward_claims WHERE user_id=? ORDER BY created_at DESC').all(id),checks:db.prepare('SELECT * FROM reward_checks WHERE user_id=? ORDER BY starts_at DESC LIMIT 40').all(id),history:db.prepare('SELECT * FROM reward_ledger WHERE user_id=? ORDER BY created_at DESC LIMIT 40').all(id),referralCode:id};}
 function proof(me,kind,source){
  if(!['game','training','court'].includes(kind))error(400,'Неизвестное подтверждение');
  if(kind==='game'){
    const g=db.prepare('SELECT * FROM games WHERE id=?').get(source),members=db.prepare('SELECT user_id FROM participants WHERE game_id=?').all(source);
    if(!g||g.cancelled_at||g.starts_at<start||members.length!==g.seats||!members.some(p=>p.user_id===me.id)||Date.parse(g.starts_at)+g.duration*60000>Date.now())error(409,'Подтверждение доступно участникам после завершения полной встречи');
    db.prepare('INSERT OR IGNORE INTO reward_proofs VALUES(?,?,?,?)').run(kind,source,me.id,stamp());return;
  }
  if(kind==='training'){
    const t=db.prepare('SELECT * FROM trainings WHERE id=?').get(source),p=db.prepare('SELECT p.*,u.role FROM training_participants p JOIN users u ON u.id=p.user_id WHERE training_id=? AND user_id=?').get(source,me.id);
    if(!t||!p||p.role!=='player'||t.cancelled_at||t.starts_at<start||t.duration<45||t.created_at>=t.starts_at||p.joined_at>=t.starts_at||Date.parse(t.starts_at)+t.duration*60000>Date.now()||!db.prepare('SELECT 1 FROM completed_trainings WHERE training_id=?').get(source))error(409,'Нужны предварительная запись и подтверждение проведения тренером');
    if(!db.prepare('SELECT 1 FROM reward_partners WHERE user_id=?').get(t.coach_id))error(409,'Тренер пока не подтверждён администратором программы');
    transaction(()=>{if(db.prepare('SELECT 1 FROM reward_checks WHERE user_id=? AND kind=? AND source=?').get(me.id,kind,source))return;const reason=restrictions(me.id,kind,source,t.starts_at,t.duration,[]);check(me.id,kind,source,t.starts_at,t.duration,[],reason?'rejected':'accepted',reason);if(!reason)credit(me.id,'training',source,20,t.starts_at);});return;
  }
  error(400,'Подтверждение корта выдаёт представитель клуба');
 }
 async function route(req,url,me,readBody){
  if(!url.pathname.startsWith('/api/rewards'))return null;
  const endpoint=url.pathname.slice('/api/rewards'.length),method=req.method;
  if(method==='GET'&&endpoint===''){reconcile();return snapshot(me.id);}
  if(method==='POST'&&endpoint==='/proof'){const b=await readBody(req);proof(me,b.kind,String(b.source||''));reconcile(true);return snapshot(me.id);}
  if(method==='POST'&&endpoint==='/claim'){if(me.role!=='player')error(403,'Призы доступны игрокам');reconcile(true);const b=await readBody(req),cid=transaction(()=>claim(me.id,b.prize));for(const u of db.prepare('SELECT id FROM users').all())if(admin(u.id))notify(u.id,'Новая заявка на приз Tennis GO','news');return {claimId:cid,...snapshot(me.id)};}
  if(method==='POST'&&endpoint==='/referral'){const b=await readBody(req),inviter=String(b.code||'').trim(),u=db.prepare('SELECT * FROM users WHERE id=?').get(inviter),invitee=db.prepare('SELECT created_at FROM users WHERE id=?').get(me.id);
    if(me.role!=='player'||!u||u.role!=='player'||u.blocked_at||inviter===me.id||Date.now()-Date.parse(invitee.created_at)>7*86400000||db.prepare('SELECT 1 FROM reward_checks WHERE user_id=?').get(me.id))error(409,'Код может указать новый игрок в первые 7 дней, до первой засчитанной встречи');
    if(db.prepare('SELECT 1 FROM reward_referrals WHERE invitee=?').get(me.id))error(409,'Пригласивший уже указан');db.prepare('INSERT INTO reward_referrals VALUES(?,?,?)').run(me.id,inviter,stamp());return {ok:true};}
  if(method==='GET'&&endpoint==='/court'){if(me.role!=='club'&&!admin(me.id))error(403,'Раздел доступен клубам');return {games:db.prepare("SELECT g.id,g.venue,g.starts_at AS startsAt FROM games g WHERE g.court_id=? AND g.starts_at>=? AND g.starts_at<=? AND g.cancelled_at IS NULL ORDER BY g.starts_at DESC LIMIT 30").all('club-'+me.id,start,stamp())};}
  if(method==='POST'&&endpoint==='/court'){const b=await readBody(req),g=db.prepare('SELECT * FROM games WHERE id=?').get(String(b.source||'')),club=db.prepare("SELECT * FROM clubs WHERE owner_id=? AND status='approved'").get(me.id);
    if(!g||!club||g.court_id!=='club-'+me.id||!db.prepare('SELECT 1 FROM reward_partners WHERE user_id=?').get(me.id))error(403,'Подтверждение выдаёт проверенный представитель этого корта');
    reconcile(true);transaction(()=>{const accepted=db.prepare("SELECT * FROM reward_checks WHERE source=? AND kind='game' AND status='accepted'").all(g.id);if(!accepted.length)error(409,'Сначала участники должны подтвердить завершённый матч');for(const r of accepted){check(r.user_id,'court',g.id,g.starts_at,g.duration,[],'accepted','Подтверждено представителем корта');credit(r.user_id,'court',g.id,5,g.starts_at);}db.prepare('INSERT OR IGNORE INTO reward_proofs VALUES(?,?,?,?)').run('court',g.id,me.id,stamp());});return {ok:true};}
  if(!admin(me.id))error(403,'Только администратор');
  if(method==='GET'&&endpoint==='/admin'){reconcile();return {checks:db.prepare("SELECT c.*,u.name FROM reward_checks c JOIN users u ON u.id=c.user_id WHERE c.status='pending' ORDER BY c.starts_at LIMIT 100").all(),claims:db.prepare("SELECT c.*,u.name FROM reward_claims c JOIN users u ON u.id=c.user_id WHERE c.status='pending' ORDER BY c.created_at").all(),partners:db.prepare("SELECT u.id,u.name,u.role,p.user_id IS NOT NULL AS approved FROM users u LEFT JOIN reward_partners p ON p.user_id=u.id WHERE u.role IN ('coach','club') AND u.blocked_at IS NULL AND u.registration_version>=2").all(),annual:db.prepare("SELECT DISTINCT u.id,u.name FROM users u JOIN reward_checks c ON c.user_id=u.id WHERE u.role='player' AND u.blocked_at IS NULL AND c.kind='game' AND c.status='accepted'").all().map(u=>({...u,...annual(u.id)})).filter(u=>u.eligible&&!u.awarded)};}
  if(method==='POST'&&endpoint==='/admin'){
    const b=await readBody(req),reason=String(b.reason||'').trim().slice(0,300);if(reason.length<3)error(400,'Укажите основание проверки');
    reconcile(true);transaction(()=>{
      if(b.action==='partner'){const u=db.prepare('SELECT role FROM users WHERE id=?').get(b.userId);if(!u||!['coach','club'].includes(u.role))error(400,'Выберите тренера или клуб');if(b.approved)db.prepare('INSERT OR REPLACE INTO reward_partners VALUES(?,?,?)').run(b.userId,me.id,stamp());else db.prepare('DELETE FROM reward_partners WHERE user_id=?').run(b.userId);}
      else if(b.action==='check'){const r=db.prepare("SELECT * FROM reward_checks WHERE user_id=? AND kind='game' AND source=? AND status='pending'").get(b.userId,b.source);if(!r)error(409,'Проверка уже завершена');if(b.approved&&!gameValid(db.prepare('SELECT * FROM games WHERE id=?').get(r.source)))error(409,'Матч больше не соответствует правилам');const invalid=b.approved?restrictions(r.user_id,r.kind,r.source,r.starts_at,r.duration,JSON.parse(r.peers)):'';if(invalid)error(409,invalid);db.prepare("UPDATE reward_checks SET status=?,reason=? WHERE user_id=? AND kind=? AND source=?").run(b.approved?'accepted':'rejected',reason,r.user_id,r.kind,r.source);if(b.approved)awardGame(r);}
      else if(b.action==='claim'){const c=db.prepare("SELECT * FROM reward_claims WHERE id=? AND status='pending'").get(b.claimId);if(!c)error(409,'Заявка уже обработана');if(b.approved&&db.prepare('SELECT blocked_at FROM users WHERE id=?').get(c.user_id)?.blocked_at)error(409,'Получатель приза заблокирован');if(b.approved&&balance(c.user_id).balance<0)error(409,'Начисления отозваны: отрицательный баланс');db.prepare('UPDATE reward_claims SET status=?,reason=?,resolved_at=? WHERE id=?').run(b.approved?'issued':'rejected',reason,stamp(),c.id);if(!b.approved)db.prepare('INSERT INTO reward_ledger VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),c.user_id,'refund',c.id,prizes.find(p=>p.id===c.prize).cost,month(stamp()),stamp());notify(c.user_id,b.approved?'Приз Tennis GO подтверждён. Свяжитесь с поддержкой для получения.':'Заявка на приз отклонена: '+reason,'news');}
      else if(b.action==='annual'){if(b.approved!==true)error(400,'Подтвердите годовое задание');const a=annual(b.userId);if(!a.eligible||a.awarded)error(409,'Годовое задание ещё не выполнено или уже награждено');credit(b.userId,'annual',campaignId,7500,stamp());if(balance(b.userId).balance>=10000&&!db.prepare("SELECT 1 FROM reward_claims WHERE prize='racket' AND status IN ('pending','issued')").get())claim(b.userId,'racket',true);}
      else error(400,'Неизвестное действие');
      db.prepare('INSERT INTO reward_audit VALUES(?,?,?,?,?,?)').run(crypto.randomUUID(),me.id,b.action,b.userId||b.claimId||'',reason,stamp());
    });return {ok:true};
  }
  error(404,'Раздел не найден');
 }
 return {route,reconcile,snapshot,leaders,balance,start,annual};
}
