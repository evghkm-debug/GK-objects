(() => {
  'use strict';
  const safeName = value => String(value || 'Объект').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').replace(/\.+/g,'.').slice(0,100);
  function payload(object) {
    const copy=structuredClone(object); delete copy._sync; return copy;
  }
  function stable(value) {
    if(Array.isArray(value)) return value.map(stable);
    if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
    return value;
  }
  function equalContent(a,b) {
    const clean=x=>{const p=payload(x);delete p.updatedAt;return p;};
    return JSON.stringify(stable(clean(a)))===JSON.stringify(stable(clean(b)));
  }
  function photoBlob(data) {
    if(typeof data!=='string' || !/^data:image\/(jpeg|png|webp);base64,/.test(data))throw new Error('Неподдерживаемый формат фотографии');
    const comma=data.indexOf(','), bytes=atob(data.slice(comma+1));
    return new Blob([Uint8Array.from(bytes,c=>c.charCodeAt(0))],{type:data.slice(5,data.indexOf(';'))});
  }
  function validateBackup(data) {
    if(!data || !Array.isArray(data.objects))throw new Error('В файле нет списка объектов.');
    const seen=new Set();
    for(const item of data.objects) {
      if(!item || typeof item.id!=='string' || !/^[a-zA-Z0-9_-]{1,150}$/.test(item.id) || seen.has(item.id))throw new Error('Некорректный или повторяющийся ID объекта.');
      seen.add(item.id);
      if(item.stageData || Array.isArray(item.photos))throw new Error('Это копия восстановленной v0.3.1. Нужен отдельный перенос её формата; текущие данные не изменены.');
      for(const key of ['address','coords','source','link','comment'])if(item[key]!=null && typeof item[key]!=='string')throw new Error('Некорректные поля объекта.');
      for(const key of ['contacts','premises'])if(item[key]!=null && (!Array.isArray(item[key]) || item[key].some(x=>!x || typeof x!=='object' || Object.values(x).some(v=>typeof v==='object' && v!==null))))throw new Error('Некорректные контакты или площади.');
      if(item.survey && (typeof item.survey!=='object' || Array.isArray(item.survey)))throw new Error('Некорректные данные осмотра.');
      for(const photo of Object.values(item.survey?.photos || {})) photoBlob(photo);
    }
    return data.objects;
  }
  function acknowledgement(current,sent,row,workspace) {
    if(!current)return null;
    const next=structuredClone(current), changed=current._sync?.generation!==sent._sync?.generation;
    next._sync={...current._sync,workspace,version:row.revision,dirty:changed,serverUpdatedAt:row.updated_at,updatedBy:row.updated_by};
    return next;
  }
  function conflictCopy(current) {
    const copy=payload(current); copy.id=crypto.randomUUID();copy.conflictCopyOf=current.id;
    copy.reviewRequired=true;copy.updatedAt=new Date().toISOString();
    copy._sync={workspace:current._sync?.workspace,dirty:true,generation:1,version:0,operationId:crypto.randomUUID()};
    return copy;
  }
  // Capture immediately. The delayed write never reads a later page's DOM.
  function saver(capture,write,delay=450) {
    let timer,pending,chain=Promise.resolve(),closed=false;
    function flush(){clearTimeout(timer);if(pending===undefined)return chain;const value=pending;pending=undefined;chain=chain.catch(()=>{}).then(()=>write(value));return chain;}
    return {
      queue(){if(closed)return;pending=capture();clearTimeout(timer);timer=setTimeout(()=>{flush().catch(error=>{console.error(error);window.dispatchEvent(new Event('gk-save-error'));})},delay);},
      save(){if(!closed)pending=capture();return flush();},
      close(){closed=true;return flush();}
    };
  }
  window.GKCore={safeName,payload,equalContent,photoBlob,validateBackup,acknowledgement,conflictCopy,saver};
})();
