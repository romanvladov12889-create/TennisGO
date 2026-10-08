import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Keep anonymous event references so other participants retain their history.
export function deleteAccount(db,id,mediaDir){
 const stamp=new Date().toISOString(),anonymous='deleted-'+crypto.randomUUID();
 const media=db.prepare('SELECT id FROM profile_media WHERE owner_id=?').all(id);
 const quote=s=>'"'+s.replaceAll('"','""')+'"';
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec('PRAGMA defer_foreign_keys=ON');
  db.prepare('DELETE FROM email_challenges WHERE email IN (SELECT email FROM web_emails WHERE user_id=?)').run(id);
  for(const table of ['web_sessions','web_passwords','web_emails','web_challenges','club_bot_links','club_bot_tokens','profile_media']){
   const cols=db.prepare(`PRAGMA table_info(${quote(table)})`).all();
   const col=cols.find(c=>['user_id','owner_id'].includes(c.name));
   if(col)db.prepare(`DELETE FROM ${quote(table)} WHERE ${quote(col.name)}=?`).run(id);
  }
  db.prepare('DELETE FROM bot_outbox WHERE user_id=?').run(id);
  db.prepare('DELETE FROM notifications WHERE user_id=?').run(id);
  db.prepare('DELETE FROM friendships WHERE sender_id=? OR receiver_id=?').run(id,id);
  for(const table of ['direct_messages','chat_messages'])db.prepare(`UPDATE ${table} SET body='Сообщение удалено',deleted_at=? WHERE sender_id=?`).run(stamp,id);
  for(const table of ['training_reviews','game_feedback'])db.prepare(`UPDATE ${table} SET body='' WHERE user_id=?`).run(id);
  db.prepare('UPDATE games SET cancelled_at=? WHERE creator_id=? AND starts_at>? AND cancelled_at IS NULL').run(stamp,id,stamp);
  db.prepare('UPDATE trainings SET cancelled_at=? WHERE coach_id=? AND starts_at>? AND cancelled_at IS NULL').run(stamp,id,stamp);
  db.prepare('UPDATE training_requests SET cancelled_at=?,note=\'\' WHERE player_id=?').run(stamp,id);
  db.prepare('DELETE FROM participants WHERE user_id=? AND game_id IN (SELECT id FROM games WHERE starts_at>?)').run(id,stamp);
  db.prepare('DELETE FROM training_participants WHERE user_id=? AND training_id IN (SELECT id FROM trainings WHERE starts_at>?)').run(id,stamp);
  db.prepare('DELETE FROM training_request_participants WHERE user_id=?').run(id);
  db.prepare("UPDATE join_requests SET status='rejected',resolved_at=? WHERE user_id=? AND status='pending'").run(stamp,id);
  db.prepare("UPDATE court_reservations SET status='cancelled',cancelled_at=? WHERE (user_id=? OR club_id=?) AND starts_at>? AND status IN ('pending','confirmed')").run(stamp,id,id,stamp);
  db.prepare("UPDATE court_reservations SET guest_name='Удалённый пользователь',guest_phone='',note='' WHERE user_id=? OR club_id=?").run(id,id);
  db.prepare("UPDATE clubs SET status='rejected',name='Удалённый клуб',address='',phone='',photo_data=NULL,photos_json='[]' WHERE owner_id=?").run(id);
  // Replace every stored account reference, including non-FK audit references.
  for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){
   const refs=new Set(db.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all().filter(f=>f.table==='users').map(f=>f.from));
   for(const col of db.prepare(`PRAGMA table_info(${quote(name)})`).all()){
    if(col.name==='id'&&name==='users'||col.name.endsWith('_id')||refs.has(col.name))db.prepare(`UPDATE ${quote(name)} SET ${quote(col.name)}=? WHERE ${quote(col.name)}=?`).run(anonymous,id);
   }
  }
  db.prepare(`UPDATE users SET name='Удалённый пользователь',display_name=NULL,username=NULL,phone=NULL,telegram_contact=NULL,photo_data=NULL,avatar_id=NULL,about=NULL,city=NULL,gender=NULL,role=NULL,playing_years=NULL,coach_years=NULL,coach_courts='[]',coach_achievements=NULL,coach_sports=NULL,preferred_sports='[]',registered_at=NULL,registration_version=0,blocked_at=?,blocked_reason='account-deleted' WHERE id=?`).run(stamp,anonymous);
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
 for(const m of media)fs.rmSync(path.join(mediaDir,m.id),{force:true});
 return {ok:true};
}
