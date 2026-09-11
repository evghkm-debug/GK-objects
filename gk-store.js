/* The existing objectsSurveyDB and object/photo format are retained. */
(() => {
  'use strict';
  let opening;
  const clone = value => structuredClone(value);
  function open() {
    return opening ||= new Promise((resolve, reject) => {
      const req = indexedDB.open('objectsSurveyDB', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('objects')) req.result.createObjectStore('objects', {keyPath:'id'});
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { opening = null; reject(req.error); };
      req.onblocked = () => { opening = null; reject(new Error('Закройте другие вкладки приложения и повторите.')); };
    });
  }
  async function get(key) {
    const db = await open();
    return new Promise((resolve,reject) => {
      const req = db.transaction('objects').objectStore('objects').get(key);
      req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error);
    });
  }
  async function all() {
    const db = await open();
    return new Promise((resolve,reject) => {
      const req = db.transaction('objects').objectStore('objects').getAll();
      req.onsuccess = () => resolve(req.result || []); req.onerror = () => reject(req.error);
    });
  }
  // Read/modify/write occurs in one IndexedDB transaction, including sync acknowledgements.
  async function atomic(key, change) {
    const db = await open();
    return new Promise((resolve,reject) => {
      const tx = db.transaction('objects','readwrite'), store = tx.objectStore('objects');
      const req = store.get(key); let result;
      req.onsuccess = () => {
        try { const changes = change(req.result || null); result = changes.result;
          for (const value of changes.put || []) store.put(value);
        } catch (error) { tx.abort(); reject(error); }
      };
      tx.oncomplete = () => resolve(result); tx.onerror = tx.onabort = () => reject(tx.error || new Error('Запись не сохранена. Повторите.'));
    });
  }
  async function save(object) {
    const saved = await atomic(object.id, current => {
      const next = clone(object), previous = current?._sync || {};
      next._sync = {...previous, generation:(previous.generation || 0)+1, dirty:true, operationId:crypto.randomUUID()};
      next.updatedAt = new Date().toISOString();
      return {put:[next],result:next};
    });
    Object.assign(object, saved);
    window.dispatchEvent(new Event('gk-local-change'));
    return saved;
  }
  async function archive(key, archived = true) {
    const object = await get(key); if (!object) return;
    object.archivedAt = archived ? new Date().toISOString() : null;
    return save(object);
  }
  async function patch(key,change) {
    const saved=await atomic(key,current=>{
      if(!current)throw new Error('Объект не найден.');
      change(current);
      current._sync={...current._sync,generation:(current._sync?.generation||0)+1,dirty:true,operationId:crypto.randomUUID()};
      current.updatedAt=new Date().toISOString();return {put:[current],result:current};
    });
    window.dispatchEvent(new Event('gk-local-change'));return saved;
  }
  async function importObjects(objects) {
    const db = await open();
    return new Promise((resolve,reject) => {
      const tx=db.transaction('objects','readwrite'), store=tx.objectStore('objects');
      let added=0, duplicates=0, copies=0;
      for (const object of objects) {
        const req=store.get(object.id);
        req.onsuccess=()=>{
          const current=req.result;
          if(current && window.GKCore.equalContent(current,object)){duplicates++;return;}
          const item=clone(object); delete item._sync;
          if(current){item.id=crypto.randomUUID();item.restoredFrom=object.id;copies++;}
          item._sync={dirty:true,generation:1,operationId:crypto.randomUUID()};
          store.put(item);added++;
        };
      }
      tx.oncomplete=()=>{window.dispatchEvent(new Event('gk-local-change'));resolve({added,duplicates,copies});};
      tx.onerror=tx.onabort=()=>reject(tx.error || new Error('Не удалось восстановить копию.'));
    });
  }
  window.GKStore={open,get,all,atomic,save,patch,archive,importObjects};
})();
