from pathlib import Path
import base64,json
root=Path(__file__).resolve().parents[1]
css=(root/'public/style.css').read_text()
js=(root/'public/app.js').read_text()
for name,mime in [('hero_court.png','image/png'),('coach.jpg','image/jpeg'),('dinamo.png','image/png'),('svetlaya.png','image/png'),('tennis-go-approved-logo.png','image/png'),('tennis-avatars-v2.png','image/png'),('court_generic.svg','image/svg+xml')]:
    uri='data:'+mime+';base64,'+base64.b64encode((root/'public/assets'/name).read_bytes()).decode()
    js=js.replace('/assets/'+name,uri)
    css=css.replace('/assets/'+name,uri)
start=js.index('async function api(')
end=js.index('function toast(',start)
stub=r'''const offlineKey='tennis-go-offline-v014';
const uid=()=>globalThis.crypto?.randomUUID?.()||('offline-'+Math.random().toString(36).slice(2));
let offline;try{offline=JSON.parse(localStorage.getItem(offlineKey)||'null');}catch{}
if(!offline){
 const next=new Date(Date.now()+86400000);next.setUTCHours(16,0,0,0);
 offline={me:{id:demoId,name:'Роман',username:'',ntrpLevel:null,photoData:null,role:null,gender:null,playingYears:null,about:'',coachYears:null,avatarId:null,city:'Краснодар',phone:null,telegramContact:null,coachSports:[],registered:false},games:[
 {id:uid(),sport:'tennis',city:'Краснодар',venue:'Стадион «Динамо»',courtId:'dinamo',courtAddress:'ул. Красная, 190',startsAt:next.toISOString(),duration:90,levelMin:2.5,levelMax:3.5,seats:2,price:1200,kind:'friendly',note:'Пример игры для просмотра',creatorId:'demo-host',creatorGender:'male',creatorNtrp:3,creatorRole:'player',opponentGender:'any',members:[{id:'demo-host',name:'Алексей'}],joined:false,result:null,resultBy:null,resultConfirmed:false},
 {id:uid(),sport:'padel',city:'Краснодар',venue:'360° Падел',courtId:'padel360',courtAddress:'ул. Тополиная, 33А',startsAt:new Date(next.getTime()+7200000).toISOString(),duration:90,levelMin:2.5,levelMax:3.5,seats:4,price:800,kind:'friendly',note:'Пример игры для просмотра',creatorId:'demo-host',creatorGender:'male',creatorNtrp:3,creatorRole:'player',opponentGender:'any',members:[{id:'demo-host',name:'Алексей'}],joined:false,result:null,resultBy:null,resultConfirmed:false}
 ],bookings:[],trainings:[{id:uid(),sport:'tennis',coachId:'demo-coach',coachName:'Анастасия',coachGender:'female',coachYears:7,coachAvatarId:'female-cap',coachPhotoData:null,format:'split',seats:2,courtId:'dinamo',courtName:'Стадион «Динамо»',courtAddress:'ул. Красная, 190',startsAt:next.toISOString(),duration:90,ntrpMin:2.5,ntrpMax:4,price:2500,note:'Пример тренировки',members:[],joined:false}]};
}
offline.trainings ||= [];
offline.me.city ||= 'Краснодар';
if(offline.me.role==='coach'&&!offline.me.coachSports)offline.me.coachSports=['tennis','padel'];
if(offline.me.registrationVersion!==2)offline.me.registered=false;
for(const t of offline.trainings){t.sport ||= 'tennis';if(t.coachGender===undefined)t.coachGender=t.coachId===demoId?offline.me.gender:'female';if(t.ntrpMin===undefined)t.ntrpMin=t.avgNtrp??null;if(t.ntrpMax===undefined)t.ntrpMax=t.avgNtrp??null;}
const persist=()=>{try{localStorage.setItem(offlineKey,JSON.stringify(offline));}catch{}};
async function api(route,method='GET',payload){
 if(route==='/config')return {demo:true,botUsername:'',cities:CITIES_JSON};
 if(route==='/me')return {user:offline.me};
 if(route==='/profile'&&method==='POST'){if(payload.city&&!CITIES_JSON.includes(payload.city))throw Error('Выберите город из списка');if(payload.role==='coach'&&payload.coachSports!==undefined&&!payload.coachSports.length)throw Error('Выберите теннис, падел или оба вида спорта');offline.me={...offline.me,...payload,city:payload.city||'Краснодар',coachSports:payload.role==='coach'?(payload.coachSports||['tennis','padel']):[],registered:true,registrationVersion:2};for(const g of offline.games){for(const member of g.members)if(member.id===demoId){member.name=payload.name;member.avatarId=payload.avatarId;member.photoData=payload.photoData;}if(g.creatorId===demoId){g.creatorNtrp=payload.ntrpLevel;g.creatorRole=payload.role;}}for(const t of offline.trainings){for(const member of t.members)if(member.id===demoId){member.name=payload.name;member.avatarId=payload.avatarId;member.photoData=payload.photoData;}if(t.coachId===demoId){t.coachName=payload.name;t.coachGender=payload.gender;t.coachYears=payload.coachYears;t.coachAvatarId=payload.avatarId;t.coachPhotoData=payload.photoData;}}persist();return {user:offline.me};}
 if(!offline.me.registered)throw Error('Завершите регистрацию');
 if(route.startsWith('/users/')&&method==='GET'){const id=decodeURIComponent(route.slice(7));if(id===demoId)return {user:offline.me};if(id==='demo-coach')return {user:{id,name:'Анастасия',role:'coach',gender:'female',playingYears:12,coachYears:7,ntrpLevel:null,about:'Тренирую игроков разного уровня.',avatarId:'female-cap',photoData:null,city:'Краснодар',phone:null,telegramContact:null,coachSports:['tennis']}};if(id==='demo-host')return {user:{id,name:'Алексей',role:'player',gender:'male',playingYears:4,coachYears:null,ntrpLevel:3,about:'Ищу партнёров для игры.',avatarId:'male-cap',photoData:null,city:'Краснодар',phone:null,telegramContact:null,coachSports:[]}};throw Error('Профиль не найден');}
 if(route==='/catalog')return {coaches:[{id:'anastasia',name:'Анастасия',sport:'Теннис',description:'Индивидуальная тренировка · любой уровень',price:2500,image:'COACH_IMAGE'}],courts:COURTS_JSON};
 if(route==='/trainings'&&method==='GET')return {trainings:offline.trainings};
 if(route==='/trainings'&&method==='POST'){
  if(offline.me.role!=='coach')throw Error('Создать тренировку может только тренер');
  if(!['tennis','padel'].includes(payload.sport))throw Error('Выберите теннис или падел');
  if(!offline.me.coachSports.includes(payload.sport))throw Error('Добавьте этот вид спорта в профиль тренера');
  const court=(await api('/catalog')).courts.find(c=>c.id===payload.courtId&&c.sport===payload.sport);if(!court)throw Error('Выберите корт для выбранного вида спорта');
  if((payload.ntrpMin===null)!==(payload.ntrpMax===null)||payload.ntrpMin!==null&&payload.ntrpMin>payload.ntrpMax)throw Error('Проверьте диапазон NTRP');
  const t={id:uid(),sport:payload.sport,coachId:demoId,coachName:offline.me.name,coachGender:offline.me.gender,coachYears:offline.me.coachYears,coachAvatarId:offline.me.avatarId,coachPhotoData:offline.me.photoData,format:payload.format,seats:payload.seats,courtId:court.id,courtName:court.name,courtAddress:court.address,startsAt:payload.startsAt,duration:payload.duration,ntrpMin:payload.ntrpMin,ntrpMax:payload.ntrpMax,price:payload.price,note:payload.note,members:[],joined:false};offline.trainings.push(t);persist();return {training:t};
 }
 const trainingMatch=route.match(/^\/trainings\/([^/]+)\/(join|leave)$/);
 if(trainingMatch&&method==='POST'){const t=offline.trainings.find(x=>x.id===trainingMatch[1]);if(!t)throw Error('Тренировка не найдена');if(t.coachId===demoId)throw Error('Это ваша тренировка');if(trainingMatch[2]==='join'){if(t.members.length>=t.seats)throw Error('Мест нет');t.members.push({id:demoId,name:offline.me.name,avatarId:offline.me.avatarId,photoData:offline.me.photoData});t.joined=true;}else{t.members=t.members.filter(m=>m.id!==demoId);t.joined=false;}persist();return {training:t};}
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
 if(route==='/games'&&method==='GET')return {games:offline.games};
 if(route==='/games'&&method==='POST'){
  if(payload.levelMin>payload.levelMax)throw Error('Проверьте диапазон уровня');
  if(payload.kind==='rating'&&payload.seats!==2)throw Error('Рейтинг доступен для игры 1 на 1');
  const court=(await api('/catalog')).courts.find(c=>c.id===payload.courtId&&c.sport===payload.sport);if(!court)throw Error('Выберите корт для этого вида спорта');
  const g={id:uid(),sport:payload.sport,city:payload.city,venue:court.name,courtId:court.id,courtAddress:court.address,startsAt:payload.startsAt,duration:payload.duration,levelMin:payload.levelMin,levelMax:payload.levelMax,seats:payload.seats,price:payload.price,kind:payload.kind,note:payload.note,creatorId:demoId,creatorGender:offline.me.gender,creatorNtrp:offline.me.ntrpLevel,creatorRole:offline.me.role,opponentGender:payload.opponentGender,members:[{id:demoId,name:offline.me.name,avatarId:offline.me.avatarId,photoData:offline.me.photoData}],joined:true,result:null,resultBy:null,resultConfirmed:false};
  offline.games.push(g);persist();return {game:g};
 }
 const match=route.match(/^\/games\/([^/]+)(?:\/(join|leave|result|confirm))?$/);
 if(match){const g=offline.games.find(x=>x.id===match[1]);if(!g)throw Error('Игра не найдена');
  if(method==='GET')return {game:g};
  if(match[2]==='join'){if(g.joined||g.members.length>=g.seats)throw Error('Свободных мест нет');if(g.opponentGender!=='any'&&g.opponentGender!==offline.me.gender)throw Error('Создатель игры указал другой пол участников');g.members.push({id:demoId,name:offline.me.name,avatarId:offline.me.avatarId,photoData:offline.me.photoData});g.joined=true;}
  if(match[2]==='leave'){g.members=g.members.filter(m=>m.id!==demoId);g.joined=false;}
  if(match[2]==='result'){g.result=payload.score;g.resultBy=demoId;}
  if(match[2]==='confirm')throw Error('Для подтверждения нужен второй игрок в серверной версии');
  persist();return {game:g,user:offline.me};
 }
 throw Error('Неизвестный запрос');
}
'''
def data_uri(name):
    mime={'svg':'image/svg+xml','jpg':'image/jpeg','png':'image/png'}[name.rsplit('.',1)[-1]]
    return 'data:'+mime+';base64,'+base64.b64encode((root/'public/assets'/name).read_bytes()).decode()
with (root/'public/courts.json').open() as file:
    courts=json.load(file)
for court in courts:
    court['image']=data_uri(court['image'].split('/')[-1])
stub=stub.replace('COURTS_JSON',json.dumps(courts,ensure_ascii=False)).replace('COACH_IMAGE',data_uri('coach.jpg'))
stub=stub.replace('CITIES_JSON',json.dumps(json.loads((root/'public/cities.json').read_text()),ensure_ascii=False))
js=js[:start]+stub+js[end:]
html='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"><title>Tennis GO · офлайн демо</title><style>'+css+'</style></head><body><div id="app">Загружаем демо…</div><script>'+js+'</script></body></html>'
(root/'OPEN_DEMO.html').write_text(html)
print('Built OPEN_DEMO.html:',len(html),'characters')
