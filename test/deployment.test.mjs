import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,cpSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

test('server starts and serves its API and frontend from the exact Docker COPY contents',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),temp=mkdtempSync(path.join(tmpdir(),'tennis-container-'));
 try{
  const dockerfile=readFileSync(path.join(root,'Dockerfile'),'utf8');
  for(const line of dockerfile.split('\n')){
   if(!line.startsWith('COPY '))continue;
   const tokens=line.split(/\s+/).slice(1),destination=tokens.pop();
   for(const source of tokens){const from=path.join(root,source);cpSync(from,statSync(from).isDirectory()?path.join(temp,destination):path.join(temp,destination,path.basename(source)),{recursive:true});}
  }
  const script=`const {server,db}=await import(${JSON.stringify(pathToFileURL(path.join(temp,'server.mjs')).href)});
  try{await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const config=await fetch(base+'/api/config');if(config.status!==200)throw new Error('API unavailable');
  const index=await fetch(base+'/');if(index.status!==200)throw new Error('Frontend unavailable');
  if(!db.prepare("SELECT 1 FROM news WHERE id='tennis-go-rewards-v1'").get())throw new Error('Campaign news missing');
  }finally{await new Promise(r=>server.close(r));db.close();}`;
  const env={...process.env,DB_PATH:path.join(temp,'data','test.sqlite')};delete env.BOT_TOKEN;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{env,encoding:'utf8',timeout:15000});
  assert.equal(result.status,0,result.stderr||result.error?.message);
 }finally{rmSync(temp,{recursive:true,force:true});}
});
