import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function ui(){
 const app={innerHTML:'',addEventListener(){},querySelectorAll(){return []},querySelector(){return null}};
 const intervals=[],listeners={};
 const context=vm.createContext({window:{setInterval:(fn,ms)=>intervals.push({fn,ms})},document:{querySelector:()=>app,addEventListener:(event,fn)=>listeners[event]=fn,visibilityState:'visible'},localStorage:{getItem:()=>null,setItem(){}},crypto,URLSearchParams,Intl,Date,console});
 const bootStart=source.indexOf('(async()=>{try{state.config=');
 const bootEnd=source.indexOf('\nwindow.setInterval',bootStart);
 vm.runInContext(source.slice(0,bootStart)+source.slice(bootEnd),context);
 vm.runInContext(`state.me={id:'player-a',name:'Игрок',role:'player',registered:true};state.loading=false;globalThis.game={id:'test-game',venue:'Динамо',startsAt:new Date(Date.now()-10800000).toISOString(),duration:60,seats:2,joined:true,members:[{id:'player-a',name:'А',team:'A'},{id:'player-b',name:'Б',team:'B'}]};state.pendingVotes=[game];state.pendingFeedback=[game];`,context);
 return {context,app,intervals,listeners,run:code=>vm.runInContext(code,context)};
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
