from pathlib import Path
import base64,json
root=Path(__file__).resolve().parents[1]
css=(root/'public/style.css').read_text()
js=(root/'public/app.js').read_text()
for name,mime in [('coach.jpg','image/jpeg'),('tennis-go-approved-logo.webp','image/webp'),('tennis-avatars-v2.webp','image/webp'),('court_generic.svg','image/svg+xml'),('sparring-rhino-bunny-court-white-pink.webp','image/webp'),('training-cat-pullup.webp','image/webp'),('doubles-squirrels-penguins.webp','image/webp'),('tennis-go-marathon-court.webp','image/webp'),('tennis-tournament-2026-10-04.jpg','image/jpeg')]:
    uri='data:'+mime+';base64,'+base64.b64encode((root/'public/assets'/name).read_bytes()).decode()
    js=js.replace('/assets/'+name,uri)
    css=css.replace('/assets/'+name,uri)
start=js.index('async function api(')
end=js.index('function toast(',start)
stub=r'''const offlineKey='tennis-go-offline-v020';
const offlineCourtImages=PHOTO_IMAGES_JSON;
const uid=()=>globalThis.crypto?.randomUUID?.()||('offline-'+Math.random().toString(36).slice(2));
let offline;try{offline=JSON.parse(localStorage.getItem(offlineKey)||'null');}catch{}
if(!offline){
 const next=new Date(Date.now()+86400000);next.setUTCHours(16,0,0,0);
 offline={me:{id:demoId,name:'Роман',username:'',ntrpLevel:null,photoData:null,role:null,gender:null,playingYears:null,about:'',coachYears:null,coachCourts:[],coachAchievements:'',avatarId:null,city:'Краснодар',phone:null,telegramContact:null,coachSports:[],registered:false},games:[
 {id:uid(),sport:'tennis',city:'Краснодар',venue:'Стадион «Динамо»',courtId:'dinamo',courtAddress:'ул. Красная, 190',startsAt:next.toISOString(),duration:90,levelMin:2.5,levelMax:3.5,seats:2,price:1200,kind:'friendly',note:'Пример игры для просмотра',creatorId:'demo-host',creatorGender:'male',creatorNtrp:3,creatorRole:'player',opponentGender:'any',members:[{id:'demo-host',name:'Алексей'}],joined:false,result:null,resultBy:null,resultConfirmed:false},
 {id:uid(),sport:'padel',city:'Краснодар',venue:'360° Падел',courtId:'padel360',courtAddress:'ул. Тополиная, 33А',startsAt:new Date(next.getTime()+7200000).toISOString(),duration:90,levelMin:2.5,levelMax:3.5,seats:4,price:800,kind:'friendly',note:'Пример игры для просмотра',creatorId:'demo-host',creatorGender:'male',creatorNtrp:3,creatorRole:'player',opponentGender:'any',members:[{id:'demo-host',name:'Алексей'}],joined:false,result:null,resultBy:null,resultConfirmed:false}
 ],bookings:[],chats:[],trainings:[{id:uid(),sport:'tennis',coachId:'demo-coach',coachName:'Анастасия',coachGender:'female',coachYears:7,coachAvatarId:'female-cap',coachPhotoData:null,format:'split',seats:2,courtId:'dinamo',courtName:'Стадион «Динамо»',courtAddress:'ул. Красная, 190',startsAt:next.toISOString(),duration:90,ntrpMin:2.5,ntrpMax:4,price:2500,note:'Пример тренировки',members:[],joined:false}]};
}
offline.trainings ||= [];
offline.gameReviews ||= [];
offline.chats ||= [];offline.trainingRequests ||= [];
offline.direct ||= [];offline.notifications ||= [];offline.clubBookings ||= [];offline.news ||= [];
offline.friends ||= [];
offline.me.preferredSports ||= [];
if(!offline.seededTournament){offline.seededTournament=true;offline.news.unshift({id:'tennis-go-tournament-2026-10-04',title:'Турнир по теннису среди мужчин и женщин 🎾',body:OFFLINE_TOURNAMENT_BODY,sport:'tennis',imagePath:'/assets/tennis-tournament-2026-10-04.jpg',publishedAt:new Date().toISOString()});}
const shapeListing=(x,owner)=>{x.requiresApproval ||= false;x.requestStatus ||= null;x.requests ||= [];x.joined=x.members.some(m=>m.id===demoId);if(owner===demoId)x.requestStatus=null;};
offline.games.forEach(g=>shapeListing(g,g.creatorId));offline.trainings.forEach(t=>shapeListing(t,t.coachId));
offline.me.city ||= 'Краснодар';
offline.me.coachCourts ||= [];offline.me.coachAchievements ||= '';
if(offline.me.role==='coach'&&!offline.me.coachSports)offline.me.coachSports=['tennis','padel'];
if(offline.me.registrationVersion!==2)offline.me.registered=false;
for(const t of offline.trainings){t.sport ||= 'tennis';if(t.coachGender===undefined)t.coachGender=t.coachId===demoId?offline.me.gender:'female';if(t.ntrpMin===undefined)t.ntrpMin=t.avgNtrp??null;if(t.ntrpMax===undefined)t.ntrpMax=t.avgNtrp??null;}
const persist=()=>{try{localStorage.setItem(offlineKey,JSON.stringify(offline));}catch{}};
async function api(route,method='GET',payload){
 if(route==='/config')return {demo:true,botUsername:'',cities:CITIES_JSON,version:'0.26.0'};
 if(route==='/me')return {user:offline.me};
 if(route==='/friends'&&method==='GET')return {accepted:offline.friends.filter(f=>f.status==='accepted').map(f=>({id:f.id,name:f.id==='demo-host'?'Алексей':'Анастасия',online:f.id==='demo-host'})),incoming:[],outgoing:offline.friends.filter(f=>f.status==='pending').map(f=>({id:f.id}))};
 const friend=route.match(/^\/friends\/([^/]+)(?:\/(accept|decline))?$/);
 if(friend){if(method==='POST'&&!friend[2]){if(offline.friends.some(f=>f.id===friend[1]))throw Error('Запрос уже существует');offline.friends.push({id:friend[1],status:'pending'});persist();return {status:'pending'};}if(method==='DELETE'){offline.friends=offline.friends.filter(f=>f.id!==friend[1]);persist();return {removed:true};}throw Error('Приглашение ещё не принято другим участником');}
 if(route==='/registration-courts')return {courts:COURTS_JSON};
 if(route==='/profile/city'&&method==='PATCH'){if(!CITIES_JSON.includes(payload.city))throw Error('Выберите город из списка');if(offline.me.role==='club')throw Error('Город клуба меняется в анкете клуба');if(offline.me.city!==payload.city)offline.me.coachCourts=[];offline.me.city=payload.city;persist();return {user:offline.me};}
 if(route==='/preferences/sports'&&method==='PATCH'){const selected=payload.sports;if(!Array.isArray(selected)||selected.length>2||new Set(selected).size!==selected.length||selected.some(s=>!['tennis','padel'].includes(s)))throw Error('Выберите Tennis, Padel или оба вида спорта');offline.me.preferredSports=selected;persist();return {user:offline.me};}
 if(route==='/profile'&&method==='POST'&&payload.role==='club'){offline.me={...offline.me,name:payload.name,role:'club',city:payload.city,registered:true,registrationVersion:2,club:{name:payload.clubName,address:payload.clubAddress,city:payload.city,phone:payload.clubPhone,sports:payload.clubSports,photoData:payload.clubPhotoData,surface:payload.clubSurface,opensAt:payload.opensAt,closesAt:payload.closesAt,hourlyPrice:payload.hourlyPrice,status:'pending'}};persist();return {user:offline.me};}
 if(route==='/profile'&&method==='POST'){if(!offline.me.registered&&(!/^\S+\s+\S+/.test(payload.name||'')||!payload.phone||payload.role==='coach'&&!payload.telegramContact))throw Error('Укажите имя, фамилию, телефон и Telegram тренера');if(payload.city&&!CITIES_JSON.includes(payload.city))throw Error('Выберите город из списка');if(payload.role==='coach'&&payload.coachSports!==undefined&&!payload.coachSports.length)throw Error('Выберите теннис, падел или оба вида спорта');offline.me={...offline.me,...payload,city:payload.city||'Краснодар',coachSports:payload.role==='coach'?(payload.coachSports||['tennis','padel']):[],registered:true,registrationVersion:2};for(const g of offline.games){for(const member of g.members)if(member.id===demoId){member.name=payload.name;member.avatarId=payload.avatarId;member.photoData=payload.photoData;}if(g.creatorId===demoId){g.creatorNtrp=payload.ntrpLevel;g.creatorRole=payload.role;}}for(const t of offline.trainings){for(const member of t.members)if(member.id===demoId){member.name=payload.name;member.avatarId=payload.avatarId;member.photoData=payload.photoData;}if(t.coachId===demoId){t.coachName=payload.name;t.coachGender=payload.gender;t.coachYears=payload.coachYears;t.coachAvatarId=payload.avatarId;t.coachPhotoData=payload.photoData;}}persist();return {user:offline.me};}
 if(route.startsWith('/club/calendar'))return {date:route.split('=')[1],status:offline.me.club?.status||'pending',reservations:[]};
 if(route==='/court-bookings'&&method==='GET')return {bookings:offline.clubBookings};
 if(route==='/court-bookings'&&method==='POST')throw Error('В офлайн-демо пока нет подтверждённых клубов');
 if(route.startsWith('/admin/clubs'))return {clubs:[]};
 if(!offline.me.registered)throw Error('Завершите регистрацию');
 if(route==='/match-polls')return {games:offline.games.filter(g=>g.kind==='rating'&&g.joined&&!g.cancelled&&!g.myVote&&g.members.length===g.seats&&Date.parse(g.startsAt)+g.duration*60000<Date.now()).map(g=>({...g,voteStatus:'pending',members:g.members.map((m,i)=>({...m,team:i%2?'B':'A'}))}))};
 if(route==='/notifications')return {items:offline.notifications,unread:offline.notifications.filter(n=>!n.readAt).length};
 if(route==='/news'&&method==='GET')return {items:offline.news};
 if(route==='/news'&&method==='POST'){if(!offline.me.isAdmin)throw Error('Доступно только администратору');const item={id:uid(),title:payload.title,body:payload.body,sport:payload.sport||'all',imagePath:null,publishedAt:new Date().toISOString()};offline.news.unshift(item);persist();return {item};}
 if(route==='/notifications/read'&&method==='POST'){offline.notifications.forEach(n=>n.readAt=new Date().toISOString());persist();return {ok:true};}
 if(route==='/ratings/history')return {events:[]};
 if(route.startsWith('/leaderboard'))return {sport:new URLSearchParams(route.split('?')[1]||'').get('sport')||'tennis',players:[]};
 if(route==='/progress')return {months:[],totalGames:0,totalTrainings:0,ratingDelta:null};
 if(route==='/events/marathon'){const month=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'Europe/Moscow'}).format(new Date());return {title:'Игровой марафон · '+month,month,goal:20,games:0,leaders:[],earned:false};}
 if(route.startsWith('/users?')&&method==='GET'){const params=new URLSearchParams(route.slice(route.indexOf('?')+1)),q=(params.get('q')||'').toLowerCase(),offset=Number(params.get('offset')||0),role=params.get('role'),users=[{id:'demo-host',name:'Алексей',role:'player',city:'Краснодар',avatarId:'male-cap',photoData:null,ntrpLevel:3,coachSports:[],online:true},{id:'demo-coach',name:'Анастасия',role:'coach',city:'Краснодар',avatarId:'female-cap',photoData:null,ntrpLevel:null,online:false,coachYears:7,coachSports:['tennis'],coachCourts:['alfa-tennis','dinamo'],coachAchievements:'Призёр региональных турниров'}].filter(u=>u.name.toLowerCase().includes(q)&&(!role||u.role===role));return {users:users.slice(offset,offset+30),hasMore:users.length>offset+30};}
 if(/^\/users\/[^/]+\/media$/.test(route)&&method==='GET')return {items:[]};
 if(route==='/profile/media'&&method==='POST')throw Error('Загрузка доступна в приложении через Telegram');
 if(route.startsWith('/users/')&&method==='GET'){const id=decodeURIComponent(route.slice(7));if(id===demoId)return {user:offline.me};if(id==='demo-coach')return {user:{id,name:'Анастасия',role:'coach',gender:'female',playingYears:12,coachYears:7,ntrpLevel:null,about:'Тренирую игроков разного уровня.',avatarId:'female-cap',photoData:null,city:'Краснодар',phone:null,telegramContact:null,coachSports:['tennis'],coachCourts:['alfa-tennis','dinamo'],coachAchievements:'Призёр региональных турниров'}};if(id==='demo-host')return {user:{id,name:'Алексей',role:'player',gender:'male',playingYears:4,coachYears:null,ntrpLevel:3,about:'Ищу партнёров для игры.',avatarId:'male-cap',photoData:null,city:'Краснодар',phone:null,telegramContact:null,coachSports:[],online:true,friendStatus:offline.friends.find(f=>f.id===id)?.status||null,friendDirection:'outgoing'}};throw Error('Профиль не найден');}
 if(route==='/catalog')return {coaches:[{id:'anastasia',name:'Анастасия',sport:'Теннис',description:'Индивидуальная тренировка · любой уровень',price:2500,image:'COACH_IMAGE'}],courts:COURTS_JSON.map(c=>({...c,image:offlineCourtImages[c.image]||c.image}))};
 if(route.startsWith('/weather'))return {hours:[],status:'unavailable',source:'Open-Meteo'};
 if(route==='/inbox'){const threads=[];for(const m of offline.direct){let t=threads.find(t=>t.key==='direct:'+m.peerId);if(!t){t={key:'direct:'+m.peerId,kind:'direct',listingId:null,peerId:m.peerId,peerName:m.peerId==='demo-host'?'Алексей':'Анастасия',title:'Личный чат',peerAvatarId:m.peerId==='demo-host'?'male-cap':'female-cap',peerPhotoData:null,unread:0};threads.push(t);}t.lastMessage=m.body;t.lastAt=m.createdAt;if(m.senderId!==demoId&&!m.readAt)t.unread++;}for(const m of offline.chats){const key=m.kind+':'+m.id+':'+m.peerId;let t=threads.find(t=>t.key===key);if(!t){t={key,kind:m.kind,listingId:m.id,peerId:m.peerId,peerName:m.peerId==='demo-host'?'Алексей':'Анастасия',title:m.kind==='game'?'Игра':'Тренировка',peerAvatarId:null,peerPhotoData:null,unread:0};threads.push(t);}t.lastMessage=m.body;t.lastAt=m.createdAt;if(m.senderId!==demoId&&!m.readAt)t.unread++;}threads.sort((a,b)=>b.lastAt.localeCompare(a.lastAt));return {threads,unread:threads.reduce((n,t)=>n+t.unread,0)};}
 const directRoute=route.match(/^\/direct\/([^/]+)$/);
 if(directRoute){const peerId=directRoute[1];if(!['demo-host','demo-coach'].includes(peerId))throw Error('Пользователь не найден');if(method==='POST'){const message=String(payload.message||'').trim().slice(0,500);if(!message)throw Error('Напишите сообщение');offline.direct.push({peerId,senderId:demoId,body:message,createdAt:new Date().toISOString()});persist();}return {peer:{id:peerId,name:peerId==='demo-host'?'Алексей':'Анастасия'},messages:offline.direct.filter(m=>m.peerId===peerId)};}
 const chatRoute=route.match(/^\/chats\/(game|training)\/([^/]+)(?:\/([^/]+))?$/);
 if(chatRoute){const [,kind,id,peer]=chatRoute,listing=(kind==='game'?offline.games:offline.trainings).find(x=>x.id===id);if(!listing)throw Error('Объявление не найдено');const author=kind==='game'?listing.creatorId:listing.coachId;if(!peer){if(author!==demoId)throw Error('Недоступно');return {threads:[...new Set(offline.chats.filter(m=>m.kind===kind&&m.id===id).map(m=>m.peerId))].map(id=>({id,name:id==='demo-host'?'Алексей':'Участник'}))};}if(author!==demoId&&peer!==author)throw Error('Недоступно');if(method==='POST'){const message=String(payload.message||'').trim().slice(0,500);if(!message)throw Error('Напишите сообщение');offline.chats.push({kind,id,peerId:author===demoId?peer:demoId,senderId:demoId,body:message,createdAt:new Date().toISOString()});persist();}return {messages:offline.chats.filter(m=>m.kind===kind&&m.id===id&&m.peerId===(author===demoId?peer:demoId))};}
 if(route==='/training-requests'&&method==='GET')return {requests:offline.trainingRequests.filter(r=>!r.acceptedTrainingId&&Date.parse(r.endsAt)>Date.now()&&(offline.me.role==='coach'?r.city===offline.me.city&&offline.me.coachSports.includes(r.sport):r.format!=='individual'||r.playerId===demoId))};
 if(route==='/training-requests'&&method==='POST'){
  if(offline.me.role!=='player'&&!offline.me.isAdmin)throw Error('Заявку создаёт игрок');
  const selected=COURTS_JSON.filter(c=>payload.courtIds.includes(c.id)&&c.sport===payload.sport);
  if(!selected.length||selected.length!==payload.courtIds.length)throw Error('Выберите корты');
  const r={id:uid(),playerId:demoId,playerName:offline.me.name,playerAvatarId:offline.me.avatarId,playerPhotoData:offline.me.photoData,playerNtrp:offline.me.ntrpLevel,sport:payload.sport,city:selected[0].city||'Краснодар',format:payload.format,seats:payload.format==='individual'?1:payload.format==='split'?2:payload.seats,members:[{id:demoId,name:offline.me.name,avatarId:offline.me.avatarId,photoData:offline.me.photoData}],joined:true,startsAt:payload.startsAt,endsAt:payload.endsAt,courts:selected.map(c=>({id:c.id,name:c.name,address:c.address})),note:payload.note,createdAt:new Date().toISOString()};offline.trainingRequests.push(r);persist();return {request:r};
 }
 const seeking=route.match(/^\/training-requests\/([^/]+)$/);
 if(seeking){const r=offline.trainingRequests.find(x=>x.id===seeking[1]);if(!r)throw Error('Заявка не найдена');if(method==='DELETE'){if(r.playerId!==demoId)throw Error('Только автор');offline.trainingRequests=offline.trainingRequests.filter(x=>x!==r);persist();return {cancelled:true};}return {request:r};}
 const membership=route.match(/^\/training-requests\/([^/]+)\/(join|leave)$/);
 if(membership&&method==='POST'){const r=offline.trainingRequests.find(x=>x.id===membership[1]&&!x.acceptedTrainingId);if(!r||r.format==='individual'||offline.me.role!=='player'||r.playerId===demoId)throw Error('Присоединение недоступно');r.members||=[{id:r.playerId,name:r.playerName,avatarId:r.playerAvatarId,photoData:r.playerPhotoData}];if(membership[2]==='join'){if(r.members.length>=r.seats||r.members.some(m=>m.id===demoId))throw Error('Свободных мест нет');r.members.push({id:demoId,name:offline.me.name,avatarId:offline.me.avatarId,photoData:offline.me.photoData});}else{if(!r.members.some(m=>m.id===demoId))throw Error('Вы не в заявке');r.members=r.members.filter(m=>m.id!==demoId);}r.joined=r.members.some(m=>m.id===demoId);persist();return {request:r};}
 const acceptRequest=route.match(/^\/training-requests\/([^/]+)\/accept$/);
 if(acceptRequest&&method==='POST'){const r=offline.trainingRequests.find(x=>x.id===acceptRequest[1]&&!x.acceptedTrainingId);if(!r||offline.me.role!=='coach')throw Error('Заявка недоступна');const court=r.courts.find(c=>c.id===payload.courtId);if(!court||Date.parse(payload.startsAt)<Date.parse(r.startsAt)||Date.parse(payload.startsAt)+payload.duration*60000>Date.parse(r.endsAt))throw Error('Выберите корт и время в интервале игрока');const t={id:uid(),sport:r.sport,coachId:demoId,coachName:offline.me.name,coachGender:offline.me.gender,coachYears:offline.me.coachYears,coachAvatarId:offline.me.avatarId,coachPhotoData:offline.me.photoData,format:r.format,seats:r.format==='individual'?1:r.format==='split'?2:payload.seats,courtId:court.id,courtName:court.name,courtAddress:court.address,startsAt:payload.startsAt,duration:payload.duration,ntrpMin:null,ntrpMax:null,price:payload.price,note:r.note,requiresApproval:true,requestStatus:null,requests:[],members:r.members||[{id:r.playerId,name:r.playerName,avatarId:r.playerAvatarId,photoData:r.playerPhotoData}],joined:false};if(t.members.length>t.seats)throw Error('Мест меньше числа участников');r.acceptedTrainingId=t.id;offline.trainings.push(t);persist();return {training:t};}
 if(route==='/trainings'&&method==='GET')return {trainings:(offline.me.role==='coach'&&!offline.me.isAdmin?offline.trainings.filter(t=>t.coachId===demoId):offline.trainings).filter(t=>!t.friendsOnly||t.coachId===demoId||offline.friends.some(f=>f.id===t.coachId&&f.status==='accepted')||t.members.some(m=>m.id===demoId))};
 const trainingRead=route.match(/^\/trainings\/([^/]+)$/);if(trainingRead&&method==='GET'){const t=offline.trainings.find(x=>x.id===trainingRead[1]);if(!t||t.friendsOnly&&t.coachId!==demoId&&!offline.friends.some(f=>f.id===t.coachId&&f.status==='accepted'))throw Error('Тренировка недоступна');return {training:t};}
 if(route==='/trainings'&&method==='POST'){
  if(offline.me.role!=='coach')throw Error('Создать тренировку может только тренер');
  if(!['tennis','padel'].includes(payload.sport))throw Error('Выберите теннис или падел');
  if(!offline.me.coachSports.includes(payload.sport))throw Error('Добавьте этот вид спорта в профиль тренера');
  const court=(await api('/catalog')).courts.find(c=>c.id===payload.courtId&&c.sport===payload.sport);if(!court)throw Error('Выберите корт для выбранного вида спорта');
  if((payload.ntrpMin===null)!==(payload.ntrpMax===null)||payload.ntrpMin!==null&&payload.ntrpMin>payload.ntrpMax)throw Error('Проверьте диапазон NTRP');
  const t={id:uid(),sport:payload.sport,coachId:demoId,coachName:offline.me.name,coachGender:offline.me.gender,coachYears:offline.me.coachYears,coachAvatarId:offline.me.avatarId,coachPhotoData:offline.me.photoData,format:payload.format,seats:payload.seats,courtId:court.id,courtName:court.name,courtAddress:court.address,startsAt:payload.startsAt,duration:payload.duration,ntrpMin:payload.ntrpMin,ntrpMax:payload.ntrpMax,price:payload.price,note:payload.note,requiresApproval:!!payload.requiresApproval,friendsOnly:!!payload.friendsOnly,requestStatus:null,requests:[],members:[],joined:false};t.seriesId=payload.repeat?t.id:null;offline.trainings.push(t);for(let week=1;week<=(payload.repeat?4:0);week++)offline.trainings.push({...t,id:uid(),startsAt:new Date(Date.parse(t.startsAt)+week*7*86400000).toISOString(),members:[],requests:[]});persist();return {training:t,created:payload.repeat?5:1};
 }
 const trainingEdit=route.match(/^\/trainings\/([^/]+)$/);
 if(trainingEdit&&['PATCH','DELETE'].includes(method)){const t=offline.trainings.find(x=>x.id===trainingEdit[1]);if(!t||t.coachId!==demoId||t.cancelled)throw Error('Тренировка недоступна');if(method==='DELETE'){t.cancelled=true;t.requests=[];}else{const court=COURTS_JSON.find(c=>c.id===payload.courtId&&c.sport===payload.sport);if(!court||payload.seats<t.members.length)throw Error('Проверьте корт и места');Object.assign(t,payload,{courtName:court.name,courtAddress:court.address,requiresApproval:!!payload.requiresApproval});if(!t.requiresApproval)t.requests=[];}persist();return {training:t};}
 const trainingRequest=route.match(/^\/trainings\/([^/]+)\/requests\/([^/]+)\/(approve|reject)$/);
 if(trainingRequest&&method==='POST'){const t=offline.trainings.find(x=>x.id===trainingRequest[1]);if(!t||t.coachId!==demoId)throw Error('Недоступно');const index=t.requests.findIndex(u=>u.id===trainingRequest[2]);if(index<0)throw Error('Заявка не найдена');if(trainingRequest[3]==='approve'){if(t.members.length>=t.seats)throw Error('Мест нет');t.members.push(t.requests[index]);}t.requests.splice(index,1);persist();return {training:t};}
 if(/^\/trainings\/[^/]+\/review$/.test(route)&&method==='POST')return {ok:true};
 const completed=route.match(/^\/trainings\/([^/]+)\/complete$/);if(completed&&method==='POST'){const t=offline.trainings.find(x=>x.id===completed[1]);if(!t||t.coachId!==demoId)throw Error('Недоступно');t.completed=true;persist();return {training:t};}
 const trainingMatch=route.match(/^\/trainings\/([^/]+)\/(join|leave)$/);
 if(trainingMatch&&method==='POST'){const t=offline.trainings.find(x=>x.id===trainingMatch[1]);if(!t)throw Error('Тренировка не найдена');if(t.coachId===demoId)throw Error('Это ваша тренировка');if(trainingMatch[2]==='join'){if(t.joined||t.requestStatus==='pending'||t.members.length>=t.seats)throw Error('Мест нет');if(t.requiresApproval){t.requestStatus='pending';t.requests.push({id:demoId,name:offline.me.name,avatarId:offline.me.avatarId,photoData:offline.me.photoData});}else{t.members.push({id:demoId,name:offline.me.name,avatarId:offline.me.avatarId,photoData:offline.me.photoData});t.joined=true;}}else{t.members=t.members.filter(m=>m.id!==demoId);t.requests=t.requests.filter(m=>m.id!==demoId);t.joined=false;t.requestStatus=null;}persist();return {training:t};}
 if(route==='/bookings'&&method==='GET')return {bookings:offline.bookings};
 if(route==='/bookings'&&method==='POST'){
  const catalog=await api('/catalog');const coach=catalog.coaches.find(c=>c.id===payload.coachId),court=catalog.courts.find(c=>c.id===payload.courtId);
  if(!coach||!court)throw Error('Выберите тренера и корт');
  const b={id:uid(),coach,court,startsAt:payload.startsAt};offline.bookings.unshift(b);persist();return {bookingId:b.id};
 }
 if(route.startsWith('/bookings/')&&method==='DELETE'){
  const index=offline.bookings.findIndex(b=>b.id===route.slice('/bookings/'.length));
  if(index<0)throw Error('Заявка не найдена');offline.bookings.splice(index,1);persist();return {cancelled:true};
 }
 const gameReviews=route.match(/^\/games\/([^/]+)\/reviews$/);
 if(gameReviews){const g=offline.games.find(x=>x.id===gameReviews[1]);if(!g||!g.members.some(m=>m.id===demoId))throw Error('Оценка доступна только участникам игры');const finished=Date.parse(g.startsAt)+g.duration*60000<=Date.now();if(method==='GET')return {finished,reviews:offline.gameReviews.filter(x=>x.gameId===g.id&&x.raterId===demoId)};if(!finished||g.members.length<2)throw Error('Оценить игроков можно после завершения игры');const target=g.members.find(m=>m.id===payload.targetId&&m.id!==demoId),score=Number(payload.score);if(!target||!Number.isInteger(score)||score<1||score>5||offline.gameReviews.some(x=>x.gameId===g.id&&x.raterId===demoId&&x.targetId===target.id))throw Error('Проверьте оценку и участника');offline.gameReviews.push({gameId:g.id,raterId:demoId,targetId:target.id,score,comment:String(payload.comment||'').slice(0,240)});const ratings=offline.gameReviews.filter(x=>x.targetId===target.id);target.reputation=Number((ratings.reduce((sum,x)=>sum+x.score,0)/ratings.length).toFixed(2));g.reputation=Number((g.members.reduce((sum,m)=>sum+(m.reputation??5),0)/g.members.length).toFixed(2));persist();return {reputation:{reputation:target.reputation,reputationCount:ratings.length}};}
 if(route==='/games'&&method==='GET')return {games:offline.games.filter(g=>!g.friendsOnly||g.creatorId===demoId||offline.friends.some(f=>f.id===g.creatorId&&f.status==='accepted')||g.members.some(m=>m.id===demoId))};
 if(route==='/games'&&method==='POST'){
  if(payload.levelMin>payload.levelMax)throw Error('Проверьте диапазон уровня');
  
  const court=(await api('/catalog')).courts.find(c=>c.id===payload.courtId&&c.sport===payload.sport);if(!court)throw Error('Выберите корт для этого вида спорта');
  const g={id:uid(),sport:payload.sport,city:payload.city,venue:court.name,courtId:court.id,courtAddress:court.address,startsAt:payload.startsAt,duration:payload.duration,levelMin:payload.levelMin,levelMax:payload.levelMax,seats:payload.seats,price:payload.price,kind:payload.kind,note:payload.note,courtReserved:!!payload.courtReserved,creatorId:demoId,creatorGender:offline.me.gender,creatorNtrp:offline.me.ntrpLevel,creatorRole:offline.me.role,opponentGender:payload.opponentGender,requiresApproval:!!payload.requiresApproval,friendsOnly:!!payload.friendsOnly,requestStatus:null,requests:[],members:[{id:demoId,name:offline.me.name,avatarId:offline.me.avatarId,photoData:offline.me.photoData}],joined:true,result:null,resultBy:null,resultConfirmed:false};g.seriesId=payload.repeat?g.id:null;
  offline.games.push(g);for(let week=1;week<=(payload.repeat?4:0);week++)offline.games.push({...g,id:uid(),startsAt:new Date(Date.parse(g.startsAt)+week*7*86400000).toISOString(),members:[...g.members],requests:[]});persist();return {game:g,created:payload.repeat?5:1};
 }
 const gameEdit=route.match(/^\/games\/([^/]+)$/);
 if(gameEdit&&['PATCH','DELETE'].includes(method)){const g=offline.games.find(x=>x.id===gameEdit[1]);if(!g||g.creatorId!==demoId||g.cancelled)throw Error('Игра недоступна');if(method==='DELETE'){g.cancelled=true;g.requests=[];}else{const court=COURTS_JSON.find(c=>c.id===payload.courtId&&c.sport===payload.sport);if(!court||payload.seats<g.members.length)throw Error('Проверьте корт и места');Object.assign(g,payload,{venue:court.name,courtAddress:court.address,requiresApproval:!!payload.requiresApproval});if(!g.requiresApproval)g.requests=[];}persist();return {game:g};}
 const gameRequest=route.match(/^\/games\/([^/]+)\/requests\/([^/]+)\/(approve|reject)$/);
 if(gameRequest&&method==='POST'){const g=offline.games.find(x=>x.id===gameRequest[1]);if(!g||g.creatorId!==demoId)throw Error('Недоступно');const index=g.requests.findIndex(u=>u.id===gameRequest[2]);if(index<0)throw Error('Заявка не найдена');if(gameRequest[3]==='approve'){if(g.members.length>=g.seats)throw Error('Мест нет');g.members.push(g.requests[index]);}g.requests.splice(index,1);persist();return {game:g};}
 const match=route.match(/^\/games\/([^/]+)(?:\/(join|leave|attend|confirm-attendance|report-absence|contest-absence|result|confirm|dispute|vote))?$/);
 if(match){const g=offline.games.find(x=>x.id===match[1]);if(!g)throw Error('Игра не найдена');
  if(method==='GET')return {game:g};
  if(match[2]==='vote'){if(!g.joined||g.myVote)throw Error('Голосование недоступно');g.myVote=payload.choice;g.voteStatus='pending';persist();return {game:g,vote:{choice:g.myVote,status:'pending'}};}
  if(match[2]==='join'){if(g.joined||g.requestStatus==='pending'||g.members.length>=g.seats)throw Error('Свободных мест нет');if(g.opponentGender!=='any'&&g.opponentGender!==offline.me.gender)throw Error('Создатель игры указал другой пол участников');if(g.requiresApproval){g.requestStatus='pending';g.requests.push({id:demoId,name:offline.me.name,avatarId:offline.me.avatarId,photoData:offline.me.photoData});}else{g.members.push({id:demoId,name:offline.me.name,avatarId:offline.me.avatarId,photoData:offline.me.photoData});g.joined=true;}}
  if(match[2]==='leave'){g.members=g.members.filter(m=>m.id!==demoId);g.requests=g.requests.filter(m=>m.id!==demoId);g.joined=false;g.requestStatus=null;}
  if(match[2]==='result'){g.result=payload.score;g.resultBy=demoId;g.resultDisputed=false;}
  if(match[2]==='attend')g.attendanceBy=demoId;
  if(match[2]==='confirm-attendance')g.attendanceConfirmed=true;
  if(match[2]==='dispute'){g.resultDisputed=true;g.resultDisputeReason=payload.reason;}
  if(match[2]==='report-absence'){g.absenceBy=demoId;g.absenceReason=payload.reason;}
  if(match[2]==='contest-absence')g.absenceDisputed=true;
  if(match[2]==='confirm')throw Error('Для подтверждения нужен второй игрок в серверной версии');
  persist();return {game:g,user:offline.me};
 }
 throw Error('Неизвестный запрос');
}
'''
def data_uri(name):
    mime={'svg':'image/svg+xml','jpg':'image/jpeg','png':'image/png','webp':'image/webp'}[name.rsplit('.',1)[-1]]
    return 'data:'+mime+';base64,'+base64.b64encode((root/'public/assets'/name).read_bytes()).decode()
with (root/'public/courts.json').open() as file:
    courts=json.load(file)
photo_images={name:data_uri(name.split('/')[-1]) for name in {court['image'] for court in courts}}
stub=stub.replace('PHOTO_IMAGES_JSON',json.dumps(photo_images)).replace('COURTS_JSON',json.dumps(courts,ensure_ascii=False)).replace('COACH_IMAGE',data_uri('coach.jpg'))
stub=stub.replace('CITIES_JSON',json.dumps(json.loads((root/'public/cities.json').read_text()),ensure_ascii=False))
server=(root/'server.mjs').read_text()
tournament_body=server.split('const tournamentBody=`',1)[1].split('`;',1)[0]
stub=stub.replace('OFFLINE_TOURNAMENT_BODY',json.dumps(tournament_body,ensure_ascii=False))
js=js[:start]+stub+js[end:]
js=js.replace('/assets/tennis-tournament-2026-10-04.jpg',data_uri('tennis-tournament-2026-10-04.jpg'))
html='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"><title>Tennis GO · офлайн демо</title><style>'+css+'</style></head><body><div id="app">Загружаем демо…</div><script>'+js+'</script></body></html>'
(root/'OPEN_DEMO.html').write_text(html)
print('Built OPEN_DEMO.html:',len(html),'characters')
