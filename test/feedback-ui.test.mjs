import {createClubUI} from '../public/club-ui.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import .*;\n/, '');
function ui(){
 const handlers={};const app={innerHTML:'',addEventListener:(name,fn)=>handlers[name]=fn,querySelectorAll(){return []},querySelector(){return null}};
 const intervals=[],listeners={};
 const context=vm.createContext({createClubUI,window:{setInterval:(fn,ms)=>intervals.push({fn,ms})},document:{querySelector:()=>app,addEventListener:(event,fn)=>listeners[event]=fn,visibilityState:'visible'},localStorage:{getItem:()=>null,setItem(){}},crypto,URLSearchParams,Intl,Date,console});
 const bootStart=source.indexOf('(async()=>{try{state.config=');
 const bootEnd=source.indexOf('\nwindow.setInterval',bootStart);
 vm.runInContext(source.slice(0,bootStart)+source.slice(bootEnd),context);
 vm.runInContext(`state.me={id:'player-a',name:'Игрок',role:'player',registered:true};state.loading=false;globalThis.game={id:'test-game',venue:'Динамо',startsAt:new Date(Date.now()-10800000).toISOString(),duration:60,seats:2,joined:true,members:[{id:'player-a',name:'А',team:'A'},{id:'player-b',name:'Б',team:'B'}]};state.pendingVotes=[game];state.pendingFeedback=[game];`,context);
 return {context,app,handlers,intervals,listeners,run:code=>vm.runInContext(code,context)};
}
test('feedback page and game details stay accessible while a match result is pending',()=>{
 const {run}=ui();
 assert.match(run('voteOverlay()'),/data-feedback-game/);
 run("state.form='game-feedback';state.feedbackGame=game");assert.equal(run('voteOverlay()'),'');
 const html=run('gameFeedbackPage()');assert.match(html,/id="game-feedback-form"/);assert.equal((html.match(/type="radio"/g)||[]).length,5);assert.match(html,/name="comment"/);
 run("state.form='';state.detail=game");assert.equal(run('voteOverlay()'),'');
 run('state.detail=null;state.dismissedVotes=[game.id]');assert.equal(run('voteOverlay()'),'');
});
test('polling discovers feedback without erasing an open form and refreshes the home panel',async()=>{
 const {run,intervals,listeners}=ui();
 assert.ok(intervals.some(i=>i.ms===30000&&i.fn.name==='pollFeedback'));assert.equal(typeof listeners.visibilitychange,'function');
 run("globalThis.renders=0;render=()=>renders++;api=async()=>({games:[game]});state.pendingFeedback=[];state.form='game-feedback'");
 await run('pollFeedback()');assert.equal(run('renders'),0);assert.equal(run('state.pendingFeedback.length'),1);
 run("state.form='';state.pendingFeedback=[]");await run('pollFeedback()');assert.equal(run('renders'),1);assert.match(run('pendingFeedbackPanel()'),/data-feedback-game="test-game"/);
 run('state.detail=game;state.pendingFeedback=[]');await run('pollFeedback()');assert.equal(run('renders'),1);
});
test('feedback notification opens the direct scoring action and submitted games show a receipt',()=>{
 const {run}=ui();
 run("state.notifications=[{body:'Оцените игру',createdAt:game.startsAt,link:'feedback_'+game.id}]");assert.match(run('notificationsPage()'),/data-feedback-game="test-game"/);
 run('game.feedbackSubmitted=true');assert.doesNotMatch(run('gameFeedbackForm(game)'),/game-feedback-form/);assert.match(run('gameFeedbackForm(game)'),/Вы оценили/);
});

test('chat tab changes immediately while the network is pending and concurrent inbox requests are combined',async()=>{
 const {run,handlers}=ui();run("globalThis.calls=0;globalThis.renders=0;render=()=>renders++;api=()=>{calls++;return new Promise(resolve=>globalThis.finish=resolve)}");
 const el={dataset:{tab:'chat'},hasAttribute:()=>false};await handlers.click({target:{closest:()=>el}});
 assert.equal(run('state.tab'),'chat');assert.equal(run('renders'),1);assert.equal(run('calls'),1);
 const pending=run('loadInbox(false)');assert.equal(run('calls'),1);
 run("finish({threads:[],unread:0,hasMore:false})");await pending;assert.equal(run('state.inboxLoading'),false);
});
test('deletion confirmation specifies local-only history and back closes it',()=>{
 const {run}=ui();run("state.deleteDialog={kind:'direct',peerId:'player-b',peerName:'Игрок Б'}");
 assert.match(run('deleteDialogOverlay()'),/Собеседник сохранит/);assert.match(run('deleteDialogOverlay()'),/data-confirm-delete-dialog/);
 run('render=()=>{};back()');assert.equal(run('state.deleteDialog'),null);
});
test('chat polling avoids duplicate requests and preserves message draft during silent refresh',async()=>{
 const {context,run}=ui();
 const box={innerHTML:'',scrollTop:0,scrollHeight:100},draft={value:'Неотправленный текст'};
 context.document.querySelector=sel=>sel==='.chat-messages'?box:sel==='textarea'?draft:null;
 run("globalThis.renders=0;render=()=>renders++;state.chat={kind:'direct',peerId:'player-b',messages:[]};globalThis.calls=0;api=()=>{calls++;return new Promise(resolve=>globalThis.finish=resolve)}");
 const one=run('refreshChat(true)'),two=run('refreshChat(true)');assert.equal(run('calls'),1);
 run("finish({messages:[{id:'m1',senderId:'player-b',body:'Новое сообщение',createdAt:new Date().toISOString()}]})");await Promise.all([one,two]);
 assert.match(box.innerHTML,/Новое сообщение/);assert.equal(draft.value,'Неотправленный текст');assert.equal(run('renders'),0);
});

test('campaign news and carousel display a live top three and real stock counts',()=>{
 const {run}=ui();run(`state.rewards={id:'tennis-go-rewards-v1',balance:420,earned:420,monthly:50,limit:250,leaders:[{id:'a',name:'Роман',points:420},{id:'b',name:'Анна',points:365},{id:'c',name:'Алексей',points:310}],prizes:[{id:'balls',title:'Туба мячей',cost:200,total:5,remaining:5,icon:'🎾',time:'около месяца'},{id:'merch',title:'Футболка или кепка',cost:500,total:3,remaining:3},{id:'hoodie',title:'Худи или сумка',cost:1000,total:3,remaining:3},{id:'racket',title:'Ракетка',cost:10000,total:1,remaining:1}],claims:[],checks:[],history:[],tasks:[],annual:{games:0,activeMonths:0,opponents:0,visits:0},referralCode:'a'};state.news=[{id:state.rewards.id,title:'Играешь — получаешь призы',body:'Описание акции',publishedAt:new Date().toISOString(),sport:'all',campaign:state.rewards}];`);
 const news=run('newsPage()');assert.equal((news.match(/class="reward-top-row"/g)||[]).length,3);assert.match(news,/Осталось 5 из 5/);assert.match(news,/Как заработать баллы/);assert.match(run('eventsCarousel()'),/420/);
 run("state.leaderboardMode='bonus';state.leaderboard=[{id:'a',name:'Роман',city:'Краснодар',rating:1150,matches:3,points:420}]");assert.match(run('leaderboardPage()'),/420 баллов/);
 assert.equal((run('rewardsPage()').match(/class="card reward-prize"/g)||[]).length,4);
 run("state.rewards.leaders=[]");assert.match(run('rewardTop(state.rewards.leaders)'),/Первые участники появятся/);
});
test('reward polling keeps edited forms and avoids parallel requests',async()=>{
 const {run,intervals}=ui();assert.ok(intervals.some(i=>i.fn.name==='pollRewards'));run("state.form='rewards';globalThis.renders=0;render=()=>renders++;globalThis.calls=0;api=()=>{calls++;return new Promise(r=>globalThis.finishReward=r)}");
 const first=run('pollRewards()');await run('pollRewards()');assert.equal(run('calls'),1);run("document.activeElement={tagName:'INPUT'};finishReward({id:'tennis-go-rewards-v1',leaders:[]})");await first;assert.equal(run('renders'),0);run("document.activeElement=null;api=async()=>({id:'tennis-go-rewards-v1',leaders:[]})");await run('pollRewards()');assert.equal(run('renders'),1);
});

test('email registration and recovery screens lead to code verification without requiring Telegram',()=>{
 const {run,app}=ui();run('state.config={emailRegistration:true};webEntry()');assert.match(app.innerHTML,/data-email-register/);assert.match(app.innerHTML,/data-email-reset/);assert.match(app.innerHTML,/Email или логин/);
 run("emailEntry('register')");assert.match(app.innerHTML,/web-register-form/);assert.match(app.innerHTML,/Подтверждать почту не нужно/);
 run("emailFlow.email='player@example.com';emailEntry('reset',true)");assert.match(app.innerHTML,/email-verify-form/);assert.match(app.innerHTML,/one-time-code/);assert.match(app.innerHTML,/player@example.com/);
 run("emailEntry('reset')");assert.match(app.innerHTML,/Восстановить пароль/);
 run("state.registrationRole='coach'");const form=run("identityFields({role:'coach'},true)");assert.ok(!/name="telegramContact"[^>]*required/.test(form));
});

test('coach proximity uses nearest profile court and respects missing location/coordinates',()=>{
 const {run}=ui();run("state.catalog.courts=[{id:'near',name:'Рядом',latitude:45.01,longitude:39},{id:'far',name:'Далеко',latitude:45.2,longitude:39},{id:'unknown',name:'Нет координат'}];state.location={latitude:45,longitude:39}");
 assert.match(run("coachDistanceBadge(['far','near'])"),/Рядом/);assert.match(run("coachDistanceBadge(['far'])"),/Далеко/);assert.equal(run("coachDistanceBadge(['unknown'])"),'');assert.equal(run('coachDistanceBadge([])'),'');
 run('state.location=null');assert.equal(run("coachDistanceBadge(['near'])"),'');
});
