import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

test('offline HTML renders home, games, and create form without a server',async()=>{
 const dir=path.dirname(fileURLToPath(import.meta.url));
 const html=fs.readFileSync(path.join(dir,'../OPEN_DEMO.html'),'utf8');
 const source=html.split('<script>')[1]?.split('</script>')[0];assert.ok(source);
 const app={innerHTML:'',addEventListener(){}};const storage=new Map();
 const context={window:{},document:{querySelector:q=>q==='#app'?app:null},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},crypto,Intl,Date,URLSearchParams,location:{search:'',origin:'file://'},navigator:{},setTimeout,console};
 vm.createContext(context);vm.runInContext(source,context);await new Promise(resolve=>setTimeout(resolve,20));
 assert.match(app.innerHTML,/Ближайшие игры/);assert.match(app.innerHTML,/Стадион «Динамо»/);assert.match(app.innerHTML,/class="brand-logo"><img src="data:image\/png;base64,/);assert.doesNotMatch(app.innerHTML,/Ваша следующая/);
 vm.runInContext("state.tab='games'; render()",context);assert.match(app.innerHTML,/Найти игру/);
 vm.runInContext("state.form='create'; render()",context);assert.match(app.innerHTML,/id="create-form"/);assert.match(app.innerHTML,/Академия «Вопреки» — ул. Невкипелого, 24\/4/);assert.match(app.innerHTML,/Что означают уровни 1.0–7.0/);
 const boxes={'#level-guide-items':{innerHTML:''},'#court-address':{textContent:''},'#level-summary':{innerHTML:''}};
 const form={elements:{sport:{value:'padel'},seats:{value:'2'},courtId:{value:'padel360',innerHTML:''},levelMin:{value:'2.5',innerHTML:''},levelMax:{value:'3.5',innerHTML:''}},querySelector:q=>boxes[q]};
 context.fakeForm=form;vm.runInContext('updateCreateChoices(fakeForm)',context);
 assert.equal(form.elements.seats.value,'4');
 assert.match(form.elements.courtId.innerHTML,/360° Падел — ул. Тополиная, 33А/);
 assert.doesNotMatch(form.elements.courtId.innerHTML,/Стадион «Динамо»/);
 assert.match(boxes['#level-guide-items'].innerHTML,/Использую стены/);
});
