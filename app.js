(() => {
  'use strict';

  const APP_VERSION = '0.1.0';
  const DB_NAME = 'objectsSurveyDB';
  const DB_VERSION = 1;
  const STORE = 'objects';
  const $app = document.getElementById('app');
  const $toast = document.getElementById('toast');

  const STATUS = {
    new: ['Новый', 'chip-new'],
    survey: ['Обследование начато', 'chip-progress'],
    surveyed: ['Обследован', 'chip-done'],
    good: ['Перспективный', 'chip-good'],
    review: ['Нужно уточнить', 'chip-review'],
    bad: ['Не подходит', 'chip-bad']
  };

  const STEPS = [
    {
      key: 'facade', title: 'Фасад', desc: 'Сделайте одинаковый набор внешних кадров.',
      photos: [
        ['facade_front', 'Фасад прямо', true, 'Снимите фасад целиком прямо перед собой.'],
        ['facade_left', 'Фасад слева', true, 'Сделайте кадр с левой стороны здания.'],
        ['facade_right', 'Фасад справа', true, 'Сделайте кадр с правой стороны здания.'],
        ['building_wide', 'Общий вид здания', true, 'Отойдите дальше, чтобы было видно здание и подъезд.']
      ]
    },
    {
      key: 'surroundings', title: 'Окружение', desc: 'Зафиксируйте, что находится вокруг объекта.',
      photos: [
        ['view_left', 'Вид налево', true, 'Встаньте у входа и снимите улицу налево.'],
        ['view_right', 'Вид направо', true, 'Встаньте у входа и снимите улицу направо.'],
        ['view_across', 'Вид напротив', true, 'Снимите противоположную сторону улицы.'],
        ['territory_wide', 'Общий вид территории', false, 'Покажите объект в контексте окружающей территории.']
      ],
      fields: [{key:'surroundings_comment', label:'Комментарий по окружению', type:'textarea'}]
    },
    {
      key: 'parking', title: 'Парковка и подъезд', desc: 'Оцените возможность подъезда покупателей и грузового транспорта.',
      fields: [
        {key:'parking', label:'Парковка есть?', type:'tri'},
        {key:'truck_access', label:'Подъезд грузового транспорта возможен?', type:'tri'}
      ],
      photos: [
        ['parking_photo', 'Парковка', true, 'Снимите парковку так, чтобы была понятна её вместимость.'],
        ['access_photo', 'Подъезд', true, 'Покажите основной подъезд к объекту.'],
        ['entrance_territory', 'Въезд на территорию', false, 'Снимите въезд с дороги на территорию объекта.']
      ]
    },
    {
      key: 'unloading', title: 'Разгрузка', desc: 'Покажите место и возможность подъезда к разгрузке.',
      fields: [
        {key:'unloading', label:'Место разгрузки есть?', type:'tri'},
        {key:'unloading_comment', label:'Комментарий по разгрузке', type:'textarea'}
      ],
      photos: [
        ['unloading_place', 'Место разгрузки', true, 'Снимите предполагаемое место разгрузки.'],
        ['unloading_gate', 'Ворота / вход', true, 'Снимите ворота или вход, через который будет идти товар.'],
        ['unloading_access', 'Подъезд к разгрузке', true, 'Покажите путь грузовой машины к месту разгрузки.']
      ]
    },
    {
      key: 'interior', title: 'Помещение внутри', desc: 'Сделайте общий набор кадров и зафиксируйте размеры.',
      fields: [
        {key:'area', label:'Примерная площадь, м²', type:'number', placeholder:'Например, 750'},
        {key:'ceiling_height', label:'Высота потолка, м', type:'number', step:'0.1', placeholder:'Например, 4.2'}
      ],
      photos: [
        ['inside_entrance', 'Общий вид от входа', true, 'Снимите помещение от входа широким кадром.'],
        ['inside_center', 'Из центра помещения', true, 'Встаньте примерно в центре и снимите общий вид.'],
        ['inside_back', 'Противоположная сторона', true, 'Снимите противоположную сторону помещения.'],
        ['ceiling_photo', 'Потолок', true, 'Покажите потолок и коммуникации.'],
        ['floor_photo', 'Пол', true, 'Покажите состояние и тип пола.']
      ]
    },
    {
      key: 'technical', title: 'Техническая часть', desc: 'Заполните то, что удалось выяснить. Неизвестные параметры можно оставить как «Неизвестно».',
      fields: [
        {key:'power_kw', label:'Электрическая мощность, кВт', type:'number', placeholder:'Если неизвестно — оставьте пустым'},
        {key:'water', label:'Вода', type:'tri'},
        {key:'sewer', label:'Канализация', type:'tri'},
        {key:'heating', label:'Отопление', type:'tri'},
        {key:'ventilation', label:'Вентиляция', type:'tri'},
        {key:'floor_load', label:'Нагрузка на пол, кг/м²', type:'number', placeholder:'Если известно'}
      ],
      photos: [
        ['electric_panel', 'Электрощитовая', false, 'Если есть доступ — сфотографируйте щитовую и автоматы.'],
        ['technical_room', 'Технические помещения', false, 'Если доступны — сделайте общий кадр технического помещения.']
      ]
    },
    {
      key: 'summary', title: 'Итог', desc: 'Проверьте собранные данные и поставьте итоговый статус.',
      summary: true
    }
  ];

  let dbPromise = null;
  let searchText = '';

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function dbAll() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGet(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function dbPut(obj) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(obj);
      tx.oncomplete = () => resolve(obj);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function dbDelete(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  const esc = (v='') => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmtDate = s => s ? new Date(s).toLocaleDateString('ru-RU') : '—';
  const id = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => $toast.classList.remove('show'), 2200);
  }

  function statusChip(status) {
    const [label, cls] = STATUS[status] || STATUS.new;
    return `<span class="chip ${cls}">${esc(label)}</span>`;
  }

  function objectProgress(obj) {
    if (!obj.survey || !obj.survey.started) return 0;
    if (obj.survey.completed) return 100;
    return Math.min(99, Math.round(((obj.survey.stepIndex || 0) / (STEPS.length - 1)) * 100));
  }

  function firstPhoto(obj) {
    const photos = obj?.survey?.photos || {};
    const keys = Object.keys(photos);
    return keys.length ? photos[keys[0]] : null;
  }

  function shell({title='Объекты', subtitle='MVP 0.1', content='', nav='objects', back=false, actions=''}) {
    $app.innerHTML = `
      <div class="app-shell">
        <header class="topbar"><div class="topbar-row">
          ${back ? `<button class="icon-btn" data-go-back aria-label="Назад">←</button>` : `<div class="logo">О</div>`}
          <div class="brand">
            <div class="title-wrap"><div class="title">${esc(title)}</div><div class="subtitle">${esc(subtitle)}</div></div>
          </div>
          <div class="top-actions">${actions}</div>
        </div></header>
        <main>${content}</main>
        <nav class="bottom-nav"><div class="bottom-nav-inner">
          <button class="nav-btn ${nav==='objects'?'active':''}" data-route="#/objects"><span class="ico">▤</span><span>Объекты</span></button>
          <button class="nav-btn" data-route="#/new" aria-label="Добавить объект"><span class="nav-add">＋</span></button>
          <button class="nav-btn ${nav==='map'?'active':''}" data-route="#/map"><span class="ico">⌖</span><span>Карта</span></button>
        </div></nav>
      </div>`;
    bindGlobal();
  }

  function bindGlobal() {
    document.querySelectorAll('[data-route]').forEach(b => b.onclick = () => location.hash = b.dataset.route);
    document.querySelectorAll('[data-go-back]').forEach(b => b.onclick = () => history.back());
  }

  async function renderObjects() {
    const objects = (await dbAll()).sort((a,b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    const filtered = objects.filter(o => (o.address || '').toLowerCase().includes(searchText.toLowerCase()) || (o.phone || '').includes(searchText));
    const list = filtered.length ? filtered.map(o => {
      const p = objectProgress(o);
      const photo = firstPhoto(o);
      return `<div class="card object-row" data-open-object="${esc(o.id)}">
        <div class="thumb">${photo ? `<img src="${photo}" alt="">` : '⌂'}</div>
        <div>
          <div class="object-address">${esc(o.address || 'Без адреса')}</div>
          <div class="object-meta">${statusChip(o.status)} ${o.area ? `<span>${esc(o.area)} м²</span>`:''} <span>${fmtDate(o.createdAt)}</span></div>
          ${o.survey?.started ? `<div class="progress-wrap"><div class="progress-label"><span>Обследование</span><span>${p}%</span></div><div class="progress"><div style="width:${p}%"></div></div></div>` : ''}
        </div><div class="chev">›</div>
      </div>`;
    }).join('') : `<div class="card empty-state"><div class="empty-icon">⌂</div><h3>${objects.length ? 'Ничего не найдено' : 'Объектов пока нет'}</h3><p>${objects.length ? 'Попробуйте изменить запрос.' : 'Добавьте первый объект, который увидели или нашли онлайн.'}</p><button class="btn btn-primary" data-route="#/new">＋ Новый объект</button></div>`;

    shell({
      title:'Объекты', subtitle:`${objects.length} объектов · локальная версия`, nav:'objects',
      actions:`<button class="icon-btn" id="exportBtn" title="Резервная копия">⇩</button>`,
      content:`
        <section class="hero"><h2>Фиксируй объект сразу</h2><p>Добавил адрес → приехал → прошёл чек-лист → сохранил одинаковый набор фото.</p><div class="hero-actions"><button class="btn btn-light" data-route="#/new">＋ Новый объект</button></div></section>
        <div class="search"><input id="searchInput" value="${esc(searchText)}" placeholder="Поиск по адресу или телефону"></div>
        <div class="object-list">${list}</div>`
    });
    document.getElementById('searchInput').oninput = e => { searchText = e.target.value; renderObjects(); };
    document.querySelectorAll('[data-open-object]').forEach(el => el.onclick = () => location.hash = `#/object/${el.dataset.openObject}`);
    document.getElementById('exportBtn').onclick = exportBackup;
  }

  async function renderNew() {
    shell({title:'Новый объект', subtitle:'Быстрое добавление', back:true, nav:'', content:`
      <form id="newForm" class="card form-card">
        <div class="field"><label>Адрес <span class="required-mark">*</span></label><input name="address" type="text" required placeholder="Санкт-Петербург, ул. ..."></div>
        <div class="field"><label>Координаты</label><input name="coords" id="coords" type="text" placeholder="59.000000, 30.000000"><div class="inline-actions" style="margin-top:8px"><button type="button" class="btn btn-secondary btn-small" id="geoBtn">⌖ Взять моё местоположение</button></div></div>
        <div class="field"><label>Источник</label><select name="source"><option value="">Не указано</option><option>Увидел на улице</option><option>Avito</option><option>ЦИАН</option><option>Яндекс / карты</option><option>Знакомые / собственник</option><option>Другое</option></select></div>
        <div class="field"><label>Ссылка на объявление</label><input name="link" type="url" placeholder="https://..."></div>
        <div class="field"><label>Площадь, м²</label><input name="area" type="number" inputmode="decimal" placeholder="Если известна"></div>
        <div class="field"><label>Телефон</label><input name="phone" type="tel" placeholder="+7 ..."></div>
        <div class="field"><label>Комментарий</label><textarea name="comment" placeholder="Что сразу бросилось в глаза"></textarea></div>
        <button class="btn btn-primary btn-block" type="submit">Сохранить объект</button>
      </form>`});

    document.getElementById('geoBtn').onclick = () => {
      if (!navigator.geolocation) return toast('Геолокация не поддерживается');
      const b = document.getElementById('geoBtn'); b.disabled = true; b.textContent = 'Определяю…';
      navigator.geolocation.getCurrentPosition(pos => {
        document.getElementById('coords').value = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
        b.disabled = false; b.textContent = '✓ Местоположение получено';
      }, () => { b.disabled = false; b.textContent = '⌖ Взять моё местоположение'; toast('Не удалось получить геопозицию'); }, {enableHighAccuracy:true, timeout:12000});
    };

    document.getElementById('newForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const now = new Date().toISOString();
      const obj = {
        id:id(), address:fd.get('address').trim(), coords:fd.get('coords').trim(), source:fd.get('source'), link:fd.get('link').trim(),
        area:fd.get('area').trim(), phone:fd.get('phone').trim(), comment:fd.get('comment').trim(), status:'new', createdAt:now, updatedAt:now,
        survey:{started:false, completed:false, stepIndex:0, answers:{}, photos:{}, finalComment:''}
      };
      await dbPut(obj);
      toast('Объект сохранён');
      location.hash = `#/object/${obj.id}`;
    };
  }

  async function renderObject(objectId) {
    const o = await dbGet(objectId);
    if (!o) return notFound();
    const progress = objectProgress(o);
    const photo = firstPhoto(o);
    const surveyBtn = o.survey?.completed ? 'Посмотреть обследование' : o.survey?.started ? 'Продолжить обследование' : 'Начать обследование';
    const surveyRoute = `#/survey/${o.id}/${o.survey?.completed ? 0 : (o.survey?.stepIndex || 0)}`;
    const details = [
      ['Статус', STATUS[o.status]?.[0] || 'Новый'], ['Площадь', o.area ? `${o.area} м²` : 'Не указана'], ['Телефон', o.phone || 'Не указан'],
      ['Источник', o.source || 'Не указан'], ['Координаты', o.coords || 'Не указаны'], ['Создан', fmtDate(o.createdAt)]
    ];
    const photosCount = Object.keys(o.survey?.photos || {}).length;
    shell({title:o.address || 'Объект', subtitle:'Карточка объекта', back:true, nav:'objects', actions:`<button class="icon-btn" id="editBtn" title="Редактировать">✎</button>`, content:`
      ${photo ? `<div class="card" style="overflow:hidden;margin-bottom:12px"><img src="${photo}" style="width:100%;height:230px;object-fit:cover" alt="Фото объекта"></div>`:''}
      <div class="card card-pad">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><div class="small">ОБЪЕКТ</div><h2 style="margin:4px 0 7px;font-size:22px">${esc(o.address)}</h2></div>${statusChip(o.status)}</div>
        ${o.comment ? `<p style="margin:10px 0 0;line-height:1.45">${esc(o.comment)}</p>`:''}
        ${o.survey?.started ? `<div class="progress-wrap" style="margin-top:14px"><div class="progress-label"><span>Обследование</span><span>${progress}% · ${photosCount} фото</span></div><div class="progress"><div style="width:${progress}%"></div></div></div>`:''}
      </div>
      <div class="section-title">Основное</div>
      <div class="details-grid">${details.map(([k,v])=>`<div class="detail-box"><div class="detail-k">${esc(k)}</div><div class="detail-v">${esc(v)}</div></div>`).join('')}</div>
      ${o.link ? `<div style="margin-top:12px"><a class="btn btn-secondary btn-block" target="_blank" rel="noopener" href="${esc(o.link)}">Открыть объявление ↗</a></div>`:''}
      ${o.phone ? `<div style="margin-top:8px"><a class="btn btn-secondary btn-block" href="tel:${esc(o.phone)}">☎ Позвонить</a></div>`:''}
      <div style="margin-top:16px"><button class="btn btn-primary btn-block" id="surveyBtn">${surveyBtn} →</button></div>
      ${o.survey?.completed ? `<div style="margin-top:8px"><button class="btn btn-secondary btn-block" id="galleryBtn">Посмотреть все фото (${photosCount})</button></div>`:''}
      <div style="margin-top:22px"><button class="btn btn-danger btn-block" id="deleteBtn">Удалить объект</button></div>
    `});
    document.getElementById('surveyBtn').onclick = () => location.hash = surveyRoute;
    document.getElementById('editBtn').onclick = () => location.hash = `#/edit/${o.id}`;
    document.getElementById('galleryBtn')?.addEventListener('click', () => location.hash = `#/gallery/${o.id}`);
    document.getElementById('deleteBtn').onclick = async () => {
      if (!confirm('Удалить объект и все его фотографии?')) return;
      await dbDelete(o.id); toast('Объект удалён'); location.hash = '#/objects';
    };
  }

  async function renderEdit(objectId) {
    const o = await dbGet(objectId); if (!o) return notFound();
    shell({title:'Редактировать', subtitle:o.address, back:true, nav:'', content:`
      <form id="editForm" class="card form-card">
        <div class="field"><label>Адрес</label><input name="address" required value="${esc(o.address)}"></div>
        <div class="field"><label>Координаты</label><input name="coords" value="${esc(o.coords||'')}"></div>
        <div class="field"><label>Источник</label><input name="source" value="${esc(o.source||'')}"></div>
        <div class="field"><label>Ссылка</label><input name="link" type="url" value="${esc(o.link||'')}"></div>
        <div class="field"><label>Площадь, м²</label><input name="area" type="number" value="${esc(o.area||'')}"></div>
        <div class="field"><label>Телефон</label><input name="phone" type="tel" value="${esc(o.phone||'')}"></div>
        <div class="field"><label>Комментарий</label><textarea name="comment">${esc(o.comment||'')}</textarea></div>
        <button class="btn btn-primary btn-block">Сохранить изменения</button>
      </form>`});
    document.getElementById('editForm').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.currentTarget);
      Object.assign(o,{address:fd.get('address').trim(),coords:fd.get('coords').trim(),source:fd.get('source').trim(),link:fd.get('link').trim(),area:fd.get('area').trim(),phone:fd.get('phone').trim(),comment:fd.get('comment').trim(),updatedAt:new Date().toISOString()});
      await dbPut(o); toast('Изменения сохранены'); location.hash = `#/object/${o.id}`;
    };
  }

  function fieldHtml(field, value='') {
    if (field.type === 'tri') {
      return `<div class="field"><label>${esc(field.label)}</label><div class="segment">
        ${[['Да','Да'],['Нет','Нет'],['Неизвестно','Неизвестно']].map(([v,l]) => `<label><input type="radio" name="${esc(field.key)}" value="${v}" ${value===v?'checked':''}><span>${l}</span></label>`).join('')}
      </div></div>`;
    }
    if (field.type === 'textarea') return `<div class="field"><label>${esc(field.label)}</label><textarea name="${esc(field.key)}">${esc(value)}</textarea></div>`;
    return `<div class="field"><label>${esc(field.label)}</label><input name="${esc(field.key)}" type="${field.type||'text'}" ${field.step?`step="${field.step}"`:''} value="${esc(value)}" placeholder="${esc(field.placeholder||'')}"></div>`;
  }

  function photoHtml(obj, [key,label,required,hint]) {
    const data = obj.survey.photos?.[key];
    return `<div class="photo-slot ${data?'done':''}">
      ${data ? `<img src="${data}" alt="${esc(label)}"><div class="photo-actions"><button class="btn btn-secondary photo-replace" data-photo-key="${key}">Переснять</button><button class="btn btn-danger photo-delete" data-photo-key="${key}">Удалить</button></div>` : `<div class="photo-empty"><div style="font-size:28px">📷</div><strong>${esc(label)}${required?' <span class="required-mark">*</span>':''}</strong><span class="small">${esc(hint)}</span><button class="btn btn-secondary btn-small photo-capture" data-photo-key="${key}">Сделать фото</button></div>`}
      <input class="file-input" id="file-${key}" data-file-key="${key}" type="file" accept="image/*" capture="environment">
    </div>`;
  }

  function requiredPhotosComplete(obj, step) {
    const photos = obj.survey.photos || {};
    return (step.photos || []).filter(p => p[2]).every(p => !!photos[p[0]]);
  }

  async function renderSurvey(objectId, stepIndexRaw) {
    const o = await dbGet(objectId); if (!o) return notFound();
    const stepIndex = Math.max(0, Math.min(STEPS.length-1, Number(stepIndexRaw) || 0));
    const step = STEPS[stepIndex];
    o.survey ||= {started:false,completed:false,stepIndex:0,answers:{},photos:{}};
    o.survey.started = true;
    if (!o.survey.completed && stepIndex > (o.survey.stepIndex || 0)) o.survey.stepIndex = stepIndex;
    if (o.status === 'new') o.status = 'survey';
    o.updatedAt = new Date().toISOString();
    await dbPut(o);

    const pct = Math.round((stepIndex/(STEPS.length-1))*100);
    let body = `<div class="check-stage-head"><div class="step-counter">ЭТАП ${stepIndex+1} ИЗ ${STEPS.length}</div><h2>${esc(step.title)}</h2><p>${esc(step.desc)}</p><div class="progress-wrap"><div class="progress-label"><span>${pct}%</span><span>${Object.keys(o.survey.photos||{}).length} фото</span></div><div class="progress"><div style="width:${pct}%"></div></div></div></div>`;

    if (step.summary) {
      const a = o.survey.answers || {};
      body += `<div class="card card-pad">
        <div class="section-title" style="margin-top:0">Краткое резюме</div>
        <div class="details-grid">
          ${[['Адрес',o.address],['Площадь',a.area ? a.area+' м²' : o.area ? o.area+' м²' : 'Не указана'],['Мощность',a.power_kw ? a.power_kw+' кВт' : 'Неизвестно'],['Парковка',a.parking||'Неизвестно'],['Разгрузка',a.unloading||'Неизвестно'],['Фото',Object.keys(o.survey.photos||{}).length]].map(([k,v])=>`<div class="detail-box"><div class="detail-k">${esc(k)}</div><div class="detail-v">${esc(v)}</div></div>`).join('')}
        </div><hr class="sep">
        <div class="field"><label>Итог по объекту <span class="required-mark">*</span></label><div class="summary-status">
          <label class="status-option"><input type="radio" name="final_status" value="good" ${o.survey.finalStatus==='good'?'checked':''}><span>🟢 Перспективный</span></label>
          <label class="status-option"><input type="radio" name="final_status" value="review" ${o.survey.finalStatus==='review'?'checked':''}><span>🟡 Нужно уточнить</span></label>
          <label class="status-option"><input type="radio" name="final_status" value="bad" ${o.survey.finalStatus==='bad'?'checked':''}><span>🔴 Не подходит</span></label>
        </div></div>
        <div class="field"><label>Итоговый комментарий</label><textarea id="finalComment" placeholder="Главные выводы по объекту">${esc(o.survey.finalComment||'')}</textarea></div>
        <button class="btn btn-primary btn-block" id="finishSurvey">Завершить обследование</button>
      </div>`;
    } else {
      body += `<div class="card form-card" id="stageForm">
        ${(step.fields||[]).map(f => fieldHtml(f, o.survey.answers?.[f.key] || (f.key==='area' ? o.area || '' : ''))).join('')}
        ${(step.photos||[]).length ? `<div class="section-title">Фото этапа</div><div class="photo-grid">${step.photos.map(p => photoHtml(o,p)).join('')}</div>`:''}
      </div>`;
    }

    if (!step.summary) body += `<div class="stage-nav"><button class="btn btn-secondary" id="prevStep" ${stepIndex===0?'disabled':''}>← Назад</button><button class="btn btn-primary" id="nextStep">${stepIndex===STEPS.length-2?'К итогу':'Далее'} →</button></div>`;

    shell({title:o.address, subtitle:`Обследование · ${step.title}`, back:true, nav:'', content:body});

    if (step.summary) {
      document.getElementById('finishSurvey').onclick = async () => {
        const chosen = document.querySelector('input[name="final_status"]:checked')?.value;
        if (!chosen) return toast('Выберите итоговый статус');
        o.survey.finalStatus = chosen;
        o.survey.finalComment = document.getElementById('finalComment').value.trim();
        o.survey.completed = true; o.survey.stepIndex = STEPS.length-1; o.status = chosen; o.updatedAt = new Date().toISOString();
        await dbPut(o); toast('Обследование завершено'); location.hash = `#/object/${o.id}`;
      };
      document.querySelectorAll('input[name="final_status"]').forEach(el => el.onchange = async () => { o.survey.finalStatus = el.value; await dbPut(o); });
      document.getElementById('finalComment').onchange = async e => { o.survey.finalComment = e.target.value; await dbPut(o); };
      return;
    }

    const saveFields = async () => {
      for (const f of step.fields || []) {
        let val = '';
        if (f.type === 'tri') val = document.querySelector(`[name="${CSS.escape(f.key)}"]:checked`)?.value || '';
        else val = document.querySelector(`[name="${CSS.escape(f.key)}"]`)?.value || '';
        o.survey.answers[f.key] = val;
        if (f.key === 'area' && val) o.area = val;
      }
      o.updatedAt = new Date().toISOString(); await dbPut(o);
    };
    document.querySelectorAll('#stageForm input:not([type="file"]), #stageForm textarea, #stageForm select').forEach(el => el.addEventListener('change', saveFields));

    document.querySelectorAll('.photo-capture,.photo-replace').forEach(btn => btn.onclick = () => document.getElementById(`file-${btn.dataset.photoKey}`).click());
    document.querySelectorAll('[data-file-key]').forEach(inp => inp.onchange = async e => {
      const file = e.target.files?.[0]; if (!file) return;
      toast('Обрабатываю фото…');
      try {
        const data = await compressImage(file, 1280, .76);
        o.survey.photos[e.target.dataset.fileKey] = data; o.updatedAt = new Date().toISOString(); await dbPut(o); toast('Фото сохранено'); renderSurvey(o.id, stepIndex);
      } catch (err) { console.error(err); toast('Не удалось сохранить фото'); }
    });
    document.querySelectorAll('.photo-delete').forEach(btn => btn.onclick = async () => {
      delete o.survey.photos[btn.dataset.photoKey]; await dbPut(o); renderSurvey(o.id, stepIndex);
    });

    document.getElementById('prevStep').onclick = async () => { await saveFields(); location.hash = `#/survey/${o.id}/${Math.max(0,stepIndex-1)}`; };
    document.getElementById('nextStep').onclick = async () => {
      await saveFields();
      if (!requiredPhotosComplete(o, step)) return toast('Сначала сделайте обязательные фотографии');
      const next = Math.min(STEPS.length-1, stepIndex+1);
      if (next > o.survey.stepIndex) o.survey.stepIndex = next;
      await dbPut(o); location.hash = `#/survey/${o.id}/${next}`;
    };
  }

  async function renderGallery(objectId) {
    const o = await dbGet(objectId); if (!o) return notFound();
    const photos = o.survey?.photos || {};
    const allDefs = STEPS.flatMap(s => s.photos || []);
    const byStep = STEPS.filter(s => (s.photos||[]).some(p => photos[p[0]])).map(s => `<div class="section-title">${esc(s.title)}</div><div class="photo-grid">${(s.photos||[]).filter(p=>photos[p[0]]).map(p=>`<div class="photo-slot done"><img src="${photos[p[0]]}" alt="${esc(p[1])}"><div style="padding:9px;font-size:12px;font-weight:700;background:#fff">${esc(p[1])}</div></div>`).join('')}</div>`).join('');
    shell({title:'Фотографии',subtitle:o.address,back:true,nav:'',content: byStep || `<div class="card empty-state"><div class="empty-icon">📷</div><h3>Фото пока нет</h3></div>`});
  }

  async function renderMap() {
    const objects = await dbAll();
    const withCoords = objects.filter(o => parseCoords(o.coords));
    // MVP 0.1 deliberately avoids external map SDK. This screen confirms GPS data and opens native maps.
    const rows = withCoords.map(o => {
      const c = parseCoords(o.coords);
      const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.lat+','+c.lng)}`;
      return `<div class="card card-pad" style="display:flex;gap:12px;align-items:center"><div style="font-size:26px">📍</div><div style="flex:1"><div class="object-address">${esc(o.address)}</div><div class="small">${esc(o.coords)}</div></div><a class="btn btn-secondary btn-small" href="${url}" target="_blank" rel="noopener">Открыть</a></div>`;
    }).join('');
    shell({title:'Карта',subtitle:'MVP 0.1 · GPS-точки',nav:'map',content:`
      <div class="card card-pad"><h2 style="margin:0 0 7px">Карта будет в версии 0.2</h2><p style="margin:0;color:var(--muted);line-height:1.45">В первой версии мы не усложняем проект. Уже сейчас координаты сохраняются. Ниже можно открыть каждую точку в установленном картографическом сервисе.</p></div>
      <div class="section-title">Объекты с координатами · ${withCoords.length}</div>${rows || `<div class="card empty-state"><div class="empty-icon">⌖</div><h3>Нет GPS-точек</h3><p>При добавлении объекта нажмите «Взять моё местоположение».</p></div>`}`});
  }

  function parseCoords(s) {
    if (!s) return null;
    const m = String(s).match(/(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return null; const lat=Number(m[1]), lng=Number(m[2]);
    return Number.isFinite(lat)&&Number.isFinite(lng)?{lat,lng}:null;
  }

  async function compressImage(file, maxDim=1280, quality=.76) {
    const dataUrl = await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
    const img = await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=dataUrl;});
    let {width,height}=img; const scale=Math.min(1,maxDim/Math.max(width,height)); width=Math.round(width*scale);height=Math.round(height*scale);
    const c=document.createElement('canvas');c.width=width;c.height=height; const ctx=c.getContext('2d');ctx.drawImage(img,0,0,width,height);
    return c.toDataURL('image/jpeg',quality);
  }

  async function exportBackup() {
    const data = await dbAll();
    const blob = new Blob([JSON.stringify({version:APP_VERSION, exportedAt:new Date().toISOString(), objects:data},null,2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `objects-backup-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    toast('Резервная копия создана');
  }

  function notFound() { shell({title:'Не найдено',back:true,nav:'',content:`<div class="card empty-state"><div class="empty-icon">?</div><h3>Объект не найден</h3></div>`}); }

  async function router() {
    const parts = (location.hash || '#/objects').replace(/^#\//,'').split('/');
    const [route,a,b] = parts;
    try {
      if (route === 'new') return renderNew();
      if (route === 'object') return renderObject(a);
      if (route === 'edit') return renderEdit(a);
      if (route === 'survey') return renderSurvey(a,b);
      if (route === 'gallery') return renderGallery(a);
      if (route === 'map') return renderMap();
      return renderObjects();
    } catch (err) {
      console.error(err);
      shell({title:'Ошибка',nav:'objects',content:`<div class="card empty-state"><div class="empty-icon">!</div><h3>Что-то пошло не так</h3><p>${esc(err.message || err)}</p><button class="btn btn-primary" data-route="#/objects">На главную</button></div>`});
    }
  }

  window.addEventListener('hashchange', router);
  window.addEventListener('load', () => {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('./sw.js').catch(console.warn);
    router();
  });
})();
