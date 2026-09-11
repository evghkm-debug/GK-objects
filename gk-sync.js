(() => {
  'use strict';
  const cfg=window.GK_CLOUD_CONFIG || {}, store=window.GKStore, core=window.GKCore;
  const configured=!!(cfg.url && cfg.publishableKey && cfg.workspaceId);
  const sessionKey='gk-session:'+cfg.url, ownershipKey='gk-workspace-binding';
  let session=null,busy=false,stopped=false,members={},uploaded=new Set(),status='local',message='',refreshing;
  try {session=JSON.parse(localStorage.getItem(sessionKey)||'null');}catch{}
  function emit(next,text=''){status=next;message=text;window.dispatchEvent(new Event('gk-sync-status'));}
  function isVisible(object){return !object._sync?.workspace || (!!session && object._sync.workspace===cfg.workspaceId);}
  function persist(value){session=value;if(value)localStorage.setItem(sessionKey,JSON.stringify(value));else localStorage.removeItem(sessionKey);}
  function checkConfig(){
    if(!configured)throw new Error('Общая база ещё не подключена.');
    if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.url) || !/^[0-9a-f-]{36}$/.test(cfg.workspaceId))throw new Error('Проверьте настройки общей базы.');
    if(!cfg.publishableKey.startsWith('sb_publishable_')){
      try{if(JSON.parse(atob(cfg.publishableKey.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role!=='anon')throw Error();}catch{throw new Error('Нужен публичный ключ приложения.');}
    }
  }
  async function raw(path,options={}){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
    try{return await fetch(cfg.url+path,{...options,signal:controller.signal,cache:'no-store',headers:{apikey:cfg.publishableKey,...options.headers}});}finally{clearTimeout(timer);}
  }
  async function refresh(){
    if(refreshing)return refreshing;
    refreshing=(async()=>{
      const expected=session?.refresh_token;if(!expected)throw new Error('Войдите в общую базу.');
      const response=await raw('/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:expected})});
      if(!response.ok){if(response.status===400||response.status===401){persist(null);emit('login','Войдите снова. Локальные изменения сохранены.');}throw new Error('Не удалось продлить вход.');}
      const value=await response.json();if(session?.refresh_token===expected)persist({...value,expires_at:Math.floor(Date.now()/1000)+value.expires_in});
    })().finally(()=>{refreshing=null;});return refreshing;
  }
  async function request(path,options={}){
    if(!session)throw new Error('Войдите в общую базу.');
    if(session.expires_at<Date.now()/1000+60)await refresh();
    let response=await raw(path,{...options,headers:{Authorization:'Bearer '+session.access_token,...options.headers}});
    if(response.status===401){await refresh();response=await raw(path,{...options,headers:{Authorization:'Bearer '+session.access_token,...options.headers}});}
    if(!response.ok){const e=new Error(response.status===403?'Нет доступа к общей базе.':'Не удалось обменяться данными. Повторим при подключении.');e.status=response.status;throw e;}
    return response;
  }
  async function login(email,password){
    checkConfig();stopped=false;
    const response=await raw('/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    if(!response.ok)throw new Error('Не удалось войти. Проверьте почту и пароль.');
    const value=await response.json();persist({...value,expires_at:Math.floor(Date.now()/1000)+value.expires_in});
    try{await loadMembers();}catch(error){persist(null);throw error;}
    if(!(await store.all()).some(x=>!x._sync?.workspace))localStorage.setItem(ownershipKey,cfg.workspaceId);
    emit('ready');await sync();
  }
  async function logout(){
    if(busy)throw new Error('Дождитесь завершения синхронизации.');
    stopped=true;try{if(session)await request('/auth/v1/logout?scope=local',{method:'POST'});}catch{}
    persist(null);members={};uploaded.clear();emit('login','Вы вышли. Копии на этом устройстве сохранены.');
  }
  async function loadMembers(){
    const response=await request('/rest/v1/gk_members?workspace_id=eq.'+cfg.workspaceId+'&select=user_id,display_name');
    const rows=await response.json();if(!rows.some(x=>x.user_id===session?.user?.id))throw new Error('Для этой учётной записи не открыт доступ к команде.');
    members=Object.fromEntries(rows.map(x=>[x.user_id,x.display_name]));
  }
  async function photoHash(blob){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');}
  async function uploadPhoto(data){
    const blob=core.photoBlob(data),hash=await photoHash(blob),path=cfg.workspaceId+'/photos/'+hash+'.jpg';
    if(!uploaded.has(hash)){
      try{await request('/storage/v1/object/gk-photos/'+path,{method:'POST',headers:{'Content-Type':blob.type,'x-upsert':'false'},body:blob});}
      catch(error){
        // Never treat a generic upload error as success: verify the existing immutable bytes.
        const existing=await request('/storage/v1/object/authenticated/gk-photos/'+path);
        if(await photoHash(await existing.blob())!==hash)throw error;
      }
      uploaded.add(hash);
    }
    return 'gk-photo:'+hash;
  }
  async function encode(object){
    const copy=core.payload(object);copy.survey ||= {photos:{},answers:{}};
    for(const [key,data] of Object.entries(copy.survey.photos || {}))copy.survey.photos[key]=await uploadPhoto(data);
    return copy;
  }
  function toDataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});}
  async function decode(row){
    const copy=structuredClone(row.payload);
    for(const [key,ref] of Object.entries(copy.survey?.photos || {})){
      if(!/^gk-photo:[0-9a-f]{64}$/.test(ref))throw new Error('Некорректная ссылка на фотографию.');
      const hash=ref.slice(9),response=await request('/storage/v1/object/authenticated/gk-photos/'+cfg.workspaceId+'/photos/'+hash+'.jpg');
      const blob=await response.blob();if(await photoHash(blob)!==hash)throw new Error('Не удалось проверить фотографию.');
      copy.survey.photos[key]=await toDataURL(blob);uploaded.add(hash);
    }
    core.validateBackup({objects:[copy]});
    copy._sync={workspace:cfg.workspaceId,version:row.revision,generation:0,dirty:false,serverUpdatedAt:row.updated_at,updatedBy:row.updated_by};
    return copy;
  }
  async function adopt(){
    if(!session)throw new Error('Сначала войдите.');await loadMembers();
    const bound=localStorage.getItem(ownershipKey);
    if(bound && bound!==cfg.workspaceId)throw new Error('На телефоне сохранена другая общая база. Нужен отдельный перенос.');
    for(const object of await store.all()){
      if(object._sync?.workspace)continue;
      await store.atomic(object.id,current=>{
        if(!current || current._sync?.workspace)return {};
        current._sync={...current._sync,workspace:cfg.workspaceId,version:0,dirty:true,generation:(current._sync?.generation||0)+1,operationId:crypto.randomUUID()};
        return {put:[current]};
      });
    }
    localStorage.setItem(ownershipKey,cfg.workspaceId);await sync();
  }
  async function push(object){
    const payload=await encode(object);
    const response=await request('/rest/v1/rpc/gk_save_object',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_workspace:cfg.workspaceId,p_id:object.id,p_payload:payload,p_base_revision:object._sync?.version||0,p_operation:object._sync.operationId})});
    const result=await response.json();
    if(result.conflict){
      const remote=await decode(result.row);
      await store.atomic(object.id,current=>{
        if(!current || current._sync?.workspace!==cfg.workspaceId)return {};
        // Preserve even edits made while the upload was in flight.
        const copy=core.conflictCopy(current);return {put:[copy,remote]};
      });
      window.dispatchEvent(new CustomEvent('gk-conflict',{detail:object.id}));
    }else if(result.ok){
      await store.atomic(object.id,current=>{const next=core.acknowledgement(current,object,result.row,cfg.workspaceId);return {put:next?[next]:[]};});
    }else throw new Error('Сервер не подтвердил сохранение.');
  }
  async function pull(){
    let after='';
    for(;;){
      const response=await request('/rest/v1/gk_objects?workspace_id=eq.'+cfg.workspaceId+'&select=id,payload,revision,updated_by,updated_at&order=id.asc&limit=50'+(after?'&id=gt.'+encodeURIComponent(after):''));
      const rows=await response.json();
      for(const row of rows){
        const local=await store.get(row.id);
        if(window.GK_EDITING_ID===row.id || (local && (local._sync?.workspace!==cfg.workspaceId || local._sync.dirty || (local._sync.version||0)>=row.revision)))continue;
        const remote=await decode(row);
        await store.atomic(row.id,current=>{
          if(window.GK_EDITING_ID===row.id || (current && (current._sync?.workspace!==cfg.workspaceId || current._sync.dirty || (current._sync.version||0)>=row.revision)))return {};
          return {put:[remote]};
        });
      }
      if(rows.length<50)break;after=rows.at(-1).id;
    }
  }
  async function run(){
    if(busy||stopped||!configured||!session)return;
    if(!navigator.onLine){emit('offline','Нет интернета. Изменения сохранены на телефоне.');return;}
    busy=true;emit('syncing','Синхронизация…');
    try{
      checkConfig();await loadMembers();
      const bound=localStorage.getItem(ownershipKey);
      if(bound===cfg.workspaceId){
        for(const item of await store.all())if(!item._sync?.workspace)await store.atomic(item.id,current=>{
          if(!current || current._sync?.workspace)return {};
          current._sync={...current._sync,workspace:cfg.workspaceId,version:0,dirty:true,operationId:current._sync?.operationId||crypto.randomUUID()};return {put:[current]};
        });
      }
      // Two passes also upload conflict copies; further local edits remain queued for the next run.
      for(let pass=0;pass<2;pass++){
        for(const item of await store.all())if(item._sync?.workspace===cfg.workspaceId && item._sync.dirty)await push(item);
      }
      await pull();
      const pending=(await store.all()).filter(x=>x._sync?.workspace===cfg.workspaceId&&x._sync.dirty).length;
      emit(pending?'pending':'synced',pending?'Есть изменения, ожидающие отправки.':'Синхронизировано');
      window.dispatchEvent(new Event('gk-remote-change'));
    }catch(error){console.warn('Sync failed:',error.message);emit(session?'error':'login',error.message || 'Связь прервана. Изменения сохранены на телефоне.');}
    finally{busy=false;}
  }
  function sync(){return navigator.locks?navigator.locks.request('gk-sync',{ifAvailable:true},lock=>lock?run():undefined):run();}
  let debounce;
  window.addEventListener('gk-local-change',()=>{clearTimeout(debounce);debounce=setTimeout(sync,1500);});
  window.addEventListener('online',sync);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
  window.addEventListener('storage',e=>{if(e.key===sessionKey){try{session=JSON.parse(e.newValue||'null');}catch{session=null;}uploaded.clear();emit(session?'ready':'login');}});
  setInterval(()=>{if(!document.hidden)sync();},30000);
  window.GKSync={configured,login,logout,sync,adopt,isVisible,info:()=>({status,message,busy,email:session?.user?.email || '',memberName:members[session?.user?.id] || '',configured}),author:uid=>members[uid] || 'Участник команды'};
})();
