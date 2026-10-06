import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import crypto from 'node:crypto';
function setup(){
 const handlers={},preview={innerHTML:''},status={textContent:''};
 const app={innerHTML:'',addEventListener:(n,f)=>{handlers[n]=f;},querySelectorAll:()=>[]};
 const document={querySelector:s=>s==='#photo-preview'?preview:s==='#profile-photo-status'?status:app,querySelectorAll:()=>[],addEventListener(){},createElement:()=>({setAttribute(){},scrollIntoView(){}})};
 const ctx=vm.createContext({window:{setInterval(){}},document,localStorage:{getItem:()=>'',setItem(){}},crypto,URLSearchParams,Intl,Date,console,setTimeout,clearTimeout,FormData:class{constructor(form){this.data=form.data}get(k){return this.data[k]??null}getAll(k){const v=this.get(k);return Array.isArray(v)?v:v?[v]:[]}has(k){return k in this.data}}});
 let s=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');const a=s.indexOf('(async()=>{try{state.config='),b=s.indexOf('\nwindow.setInterval',a);vm.runInContext(s.slice(0,a)+s.slice(b),ctx);
 const run=s=>vm.runInContext(s,ctx);run("state.me={id:'a',name:'Анна',registered:false};state.registrationRole='coach';state.registrationStep=2;render=()=>{};toast=message=>globalThis.lastToast=message;api=async()=>({courts:[]});globalThis.resolvers=[];imageData=()=>new Promise((resolve,reject)=>resolvers.push({resolve,reject}));");
 const button={disabled:false,textContent:'Далее',before(box){form.error=box}},form={id:'registration-form',data:{role:'coach',firstName:'Анна',lastName:'Иванова',gender:'female',playingYears:'5',phone:'+79991234567',city:'Краснодар',coachSports:['tennis']},querySelector:s=>s==='.identity-form-error'?null:button};
 ctx.input={files:[{type:'image/jpeg'}],isConnected:true,value:'photo.jpg'};
 return {run,ctx,form,button,status,submit:()=>handlers.submit({target:form,preventDefault(){}})};
}
test('Next waits for the selected photo, then keeps it in the coach registration draft',async()=>{
 const u=setup(),upload=u.run('uploadProfilePhoto(input)'),submit=u.submit();
 assert.equal(u.button.disabled,true);assert.match(u.button.textContent,/Обрабатываем/);assert.equal(u.run('state.registrationStep'),2);
 u.run("resolvers[0].resolve('data:image/jpeg;base64,PHOTO')");await upload;await submit;
 assert.equal(u.run('state.registrationStep'),3);assert.equal(u.run('state.registrationDraft.photoData'),'data:image/jpeg;base64,PHOTO');assert.equal(u.run('state.registrationDraft.firstName'),'Анна');assert.equal(u.button.disabled,false);
});
test('Failed decoding shows an inline error and allows retry without losing entered data',async()=>{
 const u=setup(),upload=u.run('uploadProfilePhoto(input)'),submit=u.submit();u.run("resolvers[0].reject(Error('Фото не распознано'))");await upload;await submit;
 assert.equal(u.run('state.registrationStep'),2);assert.match(u.form.error.textContent,/Фото не распознано/);assert.equal(u.button.disabled,false);
 const retry=u.run('uploadProfilePhoto(input)');u.run("resolvers[1].resolve('data:image/jpeg;base64,RETRY')");await retry;await u.submit();assert.equal(u.run('state.registrationStep'),3);
});
test('A newer photo wins even when an older upload finishes last',async()=>{
 const u=setup(),first=u.run('uploadProfilePhoto(input)'),second=u.run('uploadProfilePhoto(input)');u.run("resolvers[1].resolve('new')");await second;u.run("resolvers[0].resolve('old')");await first;assert.equal(u.run('state.profilePhotoData'),'new');
});
test('Choosing an avatar cancels a pending photo instead of overwriting the avatar later',async()=>{
 const u=setup(),upload=u.run('uploadProfilePhoto(input)');u.run("cancelProfilePhoto();state.profilePhotoData=null;state.avatarId='female-cap';resolvers[0].resolve('late')");await upload;await u.submit();assert.equal(u.run('state.registrationDraft.avatarId'),'female-cap');assert.equal(u.run('state.registrationDraft.photoData'),null);
});
test('Player registration also waits for photo before saving the profile',async()=>{
 const u=setup();u.form.data.role='player';u.form.data.ntrpLevel='3';u.run("saveIdentity=async payload=>globalThis.saved=payload");
 const upload=u.run('uploadProfilePhoto(input)'),submit=u.submit();assert.equal(u.run('globalThis.saved'),undefined);
 u.run("resolvers[0].resolve('data:image/jpeg;base64,PLAYER')");await upload;await submit;assert.equal(u.run('saved.photoData'),'data:image/jpeg;base64,PLAYER');assert.equal(u.run('saved.role'),'player');
});
