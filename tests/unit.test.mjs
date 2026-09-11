import {Window} from 'happy-dom';
import {IDBFactory} from 'fake-indexeddb';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import assert from 'node:assert/strict';
const workspace='11111111-1111-4111-8111-111111111111';
const cloud={rows:new Map(),photos:new Map(),calls:0};
const windows=[];
const root=new URL('../',import.meta.url);
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let pauseUpload=null;
async function device(cloudEnabled=true){
  const w=new Window({url:'https://example.test/GK-objects/',settings:{enableJavaScriptEvaluation:true,suppressInsecureJavaScriptEnvironmentWarning:true,disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});windows.push(w);
  Object.defineProperty(w,'indexedDB',{value:new IDBFactory()});Object.defineProperty(w,'crypto',{value:webcrypto});w.structuredClone=structuredClone;
  w.GK_CLOUD_CONFIG=cloudEnabled?{url:'https://example.supabase.co',publishableKey:'sb_publishable_TEST',workspaceId:workspace}:{};
  w.document.body.innerHTML='<div id="app"></div><div id="toast"></div>';
  w.confirm=()=>true;
  w.fetch=async(url,options={})=>{
    cloud.calls++;const u=new URL(url),body=options.body;
    const json=data=>new w.Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
    if(u.pathname==='/auth/v1/token')return json({access_token:'test',refresh_token:'refresh',expires_in:3600,user:{id:'user-a',email:'test@example.test'}});
    if(u.pathname==='/auth/v1/logout')return json({});
    if(u.pathname==='/rest/v1/gk_members')return json([{user_id:'user-a',display_name:'Тестовый сотрудник'}]);
    if(u.pathname.startsWith('/storage/v1/object/')){
      const key=u.pathname.replace('/authenticated/','/');
      if(options.method==='POST'){
        if(cloud.photos.has(key))return new w.Response('{}',{status:409});
        cloud.photos.set(key,{data:await body.arrayBuffer(),type:body.type});return json({});
      }
      const entry=cloud.photos.get(key);return entry?new w.Response(entry.data,{headers:{'Content-Type':entry.type}}):new w.Response('{}',{status:404});
    }
    if(u.pathname==='/rest/v1/rpc/gk_save_object'){
      const p=JSON.parse(body);
      if(pauseUpload){const pause=pauseUpload;pauseUpload=null;await pause();}
      const old=cloud.rows.get(p.p_id);
      if(old && (old.operation_id===p.p_operation || JSON.stringify(old.payload)===JSON.stringify(p.p_payload)))return json({ok:true,row:old});
      if(old && old.revision!==p.p_base_revision)return json({ok:false,conflict:true,row:old});
      const row={id:p.p_id,revision:(old?.revision||0)+1,payload:p.p_payload,operation_id:p.p_operation,updated_at:new Date().toISOString(),updated_by:'user-a'};
      cloud.rows.set(p.p_id,structuredClone(row));return json({ok:true,row});
    }
    if(u.pathname==='/rest/v1/gk_objects'){
      const after=(u.searchParams.get('id')||'').replace(/^gt\./,'');return json([...cloud.rows.values()].filter(x=>x.id>after).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,50));
    }
    throw new Error('Unexpected request '+url);
  };
  for(const file of ['gk-core.js','gk-store.js','gk-sync.js','gk-photos.js'])w.eval(await readFile(new URL(file,root),'utf8'));
  return w;
}
try{
  const a=await device(),core=a.GKCore;
  const data='data:image/jpeg;base64,'+Buffer.from('test-photo-binary').toString('base64');
  let value='Записано',written=[];
  const saver=core.saver(()=>value,async snapshot=>written.push(snapshot),10);
  saver.queue();await saver.save();value='';await saver.close();await delay(20);assert.deepEqual(written,['Записано']);
  const nativeBack=core.saver(()=>value,async snapshot=>written.push(snapshot),10);value='Назад';nativeBack.queue();value='';await nativeBack.close();assert.equal(written.at(-1),'Назад');
  console.log('PASS: explicit save and native back retain captured input after the DOM changes.');
  const old={id:'legacy',address:'Тест',phone:'123',area:'100',contacts:[{id:'contact-1',name:'Иван',phone:'123',label:'Собственник'},{id:'contact-2',name:'Анна',phone:'456',label:'Агент'}],premises:[{id:'p1',area:'100',label:'Первое'},{id:'p2',area:'180',label:'Второе'}],survey:{started:true,photos:{facade_front:data},answers:{power_kw:'100'}},custom:{untouched:true}};
  await a.GKStore.save(old);
  await a.GKSync.login('test@example.test','test');assert.equal(cloud.rows.size,0);
  await a.GKSync.adopt();assert.equal(a.GKSync.info().status,'synced');assert.equal(cloud.rows.size,1);assert.equal(cloud.photos.size,1);assert(cloud.rows.get(old.id).payload.survey.photos.facade_front.startsWith('gk-photo:'));
  const b=await device();await b.GKSync.login('test@example.test','test');
  const remote=await b.GKStore.get('legacy');assert.equal(remote.survey.photos.facade_front,data);assert.equal(remote.contacts.length,2);assert.equal(remote.premises[1].area,'180');assert(remote.custom.untouched);
  console.log('PASS: two isolated devices exchange the original object, two contacts, two premises and identical photo bytes.');
  // Separate devices edit the same acknowledged revision while offline.
  await a.GKStore.patch('legacy',x=>x.comment='Телефон A');await b.GKStore.patch('legacy',x=>x.comment='Телефон B');
  await a.GKSync.sync();await b.GKSync.sync();assert.equal(cloud.rows.size,2);
  const variants=[...cloud.rows.values()].map(x=>x.payload.comment);assert(variants.includes('Телефон A'));assert(variants.includes('Телефон B'));
  assert.equal((await b.GKStore.all()).filter(x=>x.reviewRequired).length,1);
  console.log('PASS: conflicting edits are retained as two versions; neither is silently overwritten.');
  // Edits occurring during a request remain dirty and get a subsequent revision.
  let release,started;const began=new Promise(r=>started=r),gate=new Promise(r=>release=r);
  pauseUpload=async()=>{started();await gate;};
  await a.GKStore.patch('legacy',x=>x.comment='First in flight');const pending=a.GKSync.sync();await began;
  await a.GKStore.patch('legacy',x=>x.comment='Edited during upload');release();await pending;
  assert.equal(cloud.rows.get('legacy').payload.comment,'Edited during upload');assert.equal((await a.GKStore.get('legacy'))._sync.dirty,false);
  console.log('PASS: acknowledgement never clears an edit made while an upload is in flight.');
  const before=cloud.rows.size;await a.GKSync.sync();assert.equal(cloud.rows.size,before);
  await a.GKStore.archive('legacy');await a.GKSync.sync();await b.GKSync.sync();assert((await b.GKStore.get('legacy')).archivedAt);assert.equal((await b.GKStore.get('legacy')).survey.photos.facade_front,data);
  await a.GKStore.archive('legacy',false);await a.GKSync.sync();
  console.log('PASS: repeat sync is idempotent; archive synchronizes and retains photos.');
  const snapshot=structuredClone(await a.GKStore.get('legacy'));
  let imported=await a.GKStore.importObjects(core.validateBackup({objects:[snapshot]}));assert.equal(imported.duplicates,1);
  snapshot.comment='Different backup';imported=await a.GKStore.importObjects(core.validateBackup({objects:[snapshot]}));assert.equal(imported.copies,1);assert.notEqual((await a.GKStore.get('legacy')).comment,'Different backup');
  assert.throws(()=>core.validateBackup({objects:[{id:'bad',stageData:{},photos:[]}]}));assert.throws(()=>core.validateBackup({objects:[{id:'bad',survey:{photos:{x:'javascript:alert(1)'}}}]}));
  console.log('PASS: backup restore preserves originals, retains different copies and rejects incompatible or unsafe photos before writing.');
  const saved=await a.GKStore.get('legacy');const photo=a.GKPhotos.file(saved,'facade_front','Фасад');assert.equal(await photo.text(),'test-photo-binary');
  assert(!core.safeName('../../a:b').includes('/'));
  let download; a.GKPhotos.download=(blob,name)=>download={blob,name};
  // ZIP helper closes over download: intercept browser file handoff instead.
  a.setImmediate=(fn,...args)=>a.setTimeout(fn,0,...args);a.clearImmediate=id=>a.clearTimeout(id);
  a.eval(await readFile(new URL('vendor/jszip.min.js',root),'utf8'));
  const blobs=[];a.URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:test';};a.URL.revokeObjectURL=()=>{};
  a.HTMLAnchorElement.prototype.click=()=>{};
  await a.GKPhotos.archive(saved,{facade_front:'Фасад'});
  const zip=await a.JSZip.loadAsync(new a.Uint8Array(await blobs.at(-1).arrayBuffer()));assert.equal(Object.keys(zip.files).length,1);assert.equal(await Object.values(zip.files)[0].async('string'),'test-photo-binary');
  console.log('PASS: individual photo and generated ZIP preserve stored image bytes.');
  await a.GKSync.logout();assert.equal(a.GKSync.isVisible(saved),false);assert(await a.GKStore.get('legacy'));
  console.log('PASS: sign-out hides shared records without deleting the local copy.');
  // Application handlers in a DOM emulator, not a live site or a user's browser database.
  const local=await device(false);local.eval(await readFile(new URL('app.js',root),'utf8'));
  local.location.hash='#/new';local.dispatchEvent(new local.Event('load'));await delay(50);
  const form=local.document.getElementById('newForm');assert(form);assert.equal(form.elements.address.required,false);
  await form.onsubmit({preventDefault(){},currentTarget:form});await delay(30);
  const records=await local.GKStore.all();assert.equal(records.length,1);assert.equal(records[0].address,'');
  local.location.hash=`#/survey/${records[0].id}/1`;await delay(30);
  const field=local.document.querySelector('[name="surroundings_comment"]');field.value='Сохрани меня';field.dispatchEvent(new local.Event('input'));
  await local.document.getElementById('saveExit').onclick();await delay(600);assert.equal((await local.GKStore.get(records[0].id)).survey.answers.surroundings_comment,'Сохрани меня');
  console.log('PASS: existing application creates an addressless object and keeps stage text after save/exit and the old debounce interval.');
  await local.GKStore.patch(records[0].id,x=>{x.survey.photos={facade_front:data,view_left:data};});
  local.setImmediate=(fn,...args)=>local.setTimeout(fn,0,...args);local.clearImmediate=id=>local.clearTimeout(id);
  local.eval(await readFile(new URL('vendor/jszip.min.js',root),'utf8'));
  const uiBlobs=[];local.URL.createObjectURL=blob=>{uiBlobs.push(blob);return 'blob:test';};local.URL.revokeObjectURL=()=>{};local.HTMLAnchorElement.prototype.click=()=>{};
  local.location.hash='#/objects';await delay(30);
  local.location.hash=`#/object/${records[0].id}`;await delay(30);
  for(const buttonId of ['downloadObjectPhotos','downloadPhotos']){
    if(buttonId==='downloadPhotos'){local.location.hash=`#/gallery/${records[0].id}`;await delay(30);}
    const button=local.document.getElementById(buttonId);assert(button);
    await button.onclick();assert.equal(button.disabled,false);
    const result=await local.JSZip.loadAsync(new local.Uint8Array(await uiBlobs.at(-1).arrayBuffer()));
    assert.equal(Object.keys(result.files).length,2);
    for(const entry of Object.values(result.files))assert.equal(await entry.async('string'),'test-photo-binary');
  }
  console.log('PASS: card and gallery buttons each download all photos from different stages in one ZIP.');
}catch(error){console.error(error.message,error.stack?.split('\n').filter(x=>x.startsWith('    at')).slice(-4).join('\n'));process.exitCode=1;}finally{for(const w of windows){await w.happyDOM.abort();w.close();}}
