(() => {
  'use strict';
  function filename(object,key,label){return window.GKCore.safeName(object.address||'Без адреса')+' — '+window.GKCore.safeName(label||key)+'.jpg';}
  function download(blob,name){
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.rel='noopener';
    document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function file(object,key,label){const blob=window.GKCore.photoBlob(object.survey?.photos?.[key]);return new File([blob],filename(object,key,label),{type:blob.type});}
  async function share(object,key,label){
    const photo=file(object,key,label);
    if(navigator.canShare?.({files:[photo]})){await navigator.share({files:[photo],title:object.address||'Фото объекта'});}
    else download(photo,photo.name);
  }
  async function archive(object,labels){
    if(typeof JSZip==='undefined')throw new Error('Не удалось открыть архиватор. Обновите приложение.');
    const zip=new JSZip();let index=0;
    for(const [key,data] of Object.entries(object.survey?.photos||{})){
      const blob=window.GKCore.photoBlob(data);
      zip.file(String(++index).padStart(3,'0')+' — '+filename(object,key,labels[key]),new Uint8Array(await blob.arrayBuffer()));
    }
    if(!index)throw new Error('В объекте пока нет фото.');
    download(new Blob([await zip.generateAsync({type:'uint8array',compression:'STORE'})],{type:'application/zip'}),window.GKCore.safeName(object.address||'Объект')+' — фотографии.zip');
  }
  window.GKPhotos={file,download,share,archive};
})();
