from pathlib import Path
import base64,json
root=Path(__file__).resolve().parents[1]
css=(root/'public/style.css').read_text()
js=(root/'public/app.js').read_text()
for name,mime in [('hero_court.png','image/png'),('coach.jpg','image/jpeg'),('dinamo.png','image/png'),('svetlaya.png','image/png'),('tennis-go-approved-logo.png','image/png'),('court_generic.svg','image/svg+xml')]:
    uri='data:'+mime+';base64,'+base64.b64encode((root/'public/assets'/name).read_bytes()).decode()
    js=js.replace('/assets/'+name,uri)
    css=css.replace('/assets/'+name,uri)
start=js.index('async function api(')
end=js.index('function toast(',start)
stub=r'''const offlineKey='tennis-go-offline-v012';
const uid=()=>globalThis.crypto?.randomUUID?.()||('offline-'+Math.random().toString(36).slice(2));
let offline;try{offline=JSON.parse(localStorage.getItem(offlineKey)||'null');}catch{}
if(!offline){
 const next=new Date(Date.now()+86400000);next.setUTCHours(16,0,0,0);
 offline={me:{id:demoId,name:'Роман',username:'',tennis_rating:1200,padel_rating:1200},games:[
 {id:uid(),sport:'tennis',city:'Краснодар',venue:'Стадион «Динамо»',courtId:'dinamo',courtAddress:'ул. Красная, 190',startsAt:next.toISOString(),duration:90,levelMin:2.5,levelMax:3.5,seats:2,price:1200,kind:'friendly',note:'Пример игры для просмотра',creatorId:'demo-host',members:[{id:'demo-host',name:'Алексей'}],joined:false,result:null,resultBy:null,resultConfirmed:false},
 {id:uid(),sport:'padel',city:'Краснодар',venue:'360° Падел',courtId:'padel360',courtAddress:'ул. Тополиная, 33А',startsAt:new Date(next.getTime()+7200000).toISOString(),duration:90,levelMin:2.5,levelMax:3.5,seats:4,price:800,kind:'friendly',note:'Пример игры для просмотра',creatorId:'demo-host',members:[{id:'demo-host',name:'Алексей'}],joined:false,result:null,resultBy:null,resultConfirmed:false}
 ],bookings:[]};
}
const persist=()=>{try{localStorage.setItem(offlineKey,JSON.stringify(offline));}catch{}};
async function api(route,method='GET',payload){
 if(route==='/config')return {demo:true,botUsername:''};
 if(route==='/me')return {user:offline.me};
 if(route==='/catalog')return {coaches:[{id:'anastasia',name:'Анастасия',sport:'Теннис',description:'Индивидуальная тренировка · любой уровень',price:2500,image:'COACH_IMAGE'}],courts:COURTS_JSON};
 if(route==='/bookings'&&method==='GET')return {bookings:offline.bookings};
 if(route==='/bookings'&&method==='POST'){
  const catalog=await api('/catalog');const coach=catalog.coaches.find(c=>c.id===payload.coachId),court=catalog.courts.find(c=>c.id===payload.courtId);
  if(!coach||!court)throw Error('Выберите тренера и корт');
  const b={id:uid(),coach,court,startsAt:payload.startsAt};offline.bookings.unshift(b);persist();return {bookingId:b.id};
 }
 if(route==='/games'&&method==='GET')return {games:offline.games};
 if(route==='/games'&&method==='POST'){
  if(payload.levelMin>payload.levelMax)throw Error('Проверьте диапазон уровня');
  if(payload.kind==='rating'&&payload.seats!==2)throw Error('Рейтинг доступен для игры 1 на 1');
  const court=(await api('/catalog')).courts.find(c=>c.id===payload.courtId&&c.sport===payload.sport);if(!court)throw Error('Выберите корт для этого вида спорта');
  const g={id:uid(),sport:payload.sport,city:payload.city,venue:court.name,courtId:court.id,courtAddress:court.address,startsAt:payload.startsAt,duration:payload.duration,levelMin:payload.levelMin,levelMax:payload.levelMax,seats:payload.seats,price:payload.price,kind:payload.kind,note:payload.note,creatorId:demoId,members:[{id:demoId,name:'Роман'}],joined:true,result:null,resultBy:null,resultConfirmed:false};
  offline.games.push(g);persist();return {game:g};
 }
 const match=route.match(/^\/games\/([^/]+)(?:\/(join|leave|result|confirm))?$/);
 if(match){const g=offline.games.find(x=>x.id===match[1]);if(!g)throw Error('Игра не найдена');
  if(method==='GET')return {game:g};
  if(match[2]==='join'){if(g.joined||g.members.length>=g.seats)throw Error('Свободных мест нет');g.members.push({id:demoId,name:'Роман'});g.joined=true;}
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
js=js[:start]+stub+js[end:]
html='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no"><title>Tennis GO · офлайн демо</title><style>'+css+'</style></head><body><div id="app">Загружаем демо…</div><script>'+js+'</script></body></html>'
(root/'OPEN_DEMO.html').write_text(html)
print('Built OPEN_DEMO.html:',len(html),'characters')
