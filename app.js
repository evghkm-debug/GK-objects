(() => {
  'use strict';

  const APP_VERSION = '0.3.0';
  const DB_NAME = 'objectsSurveyDB';
  const DB_VERSION = 1;
  const STORE = 'objects';
  const $app = document.getElementById('app');
  const $toast = document.getElementById('toast');

  const STATUS = {
    new: ['Новый', 'chip-new'],
    field: ['Зафиксирован', 'chip-new'],
    survey: ['Обследование начато', 'chip-progress'],
    surveyed: ['Обследован', 'chip-done'],
    good: ['Перспективный', 'chip-good'],
    review: ['Нужно уточнить', 'chip-review'],
    bad: ['Не подходит', 'chip-bad']
  };

  const STEPS = [
    {
      key: 'facade', phase: 'field', title: 'Фасад', desc: 'Быстрая фиксация с улицы. Снимите то, что успели — всё можно сохранить и продолжить позже.',
      photos: [
        ['facade_front', 'Фасад прямо', true, 'Снимите фасад целиком прямо перед собой.'],
        ['facade_left', 'Фасад слева', true, 'Сделайте кадр с левой стороны здания.'],
        ['facade_right', 'Фасад справа', true, 'Сделайте кадр с правой стороны здания.'],
        ['building_wide', 'Общий вид здания', true, 'Отойдите дальше, чтобы было видно здание и подъезд.']
      ]
    },
    {
      key: 'surroundings', phase: 'field', title: 'Окружение', desc: 'Зафиксируйте, что находится вокруг объекта. Это часть первичной базы.',
      photos: [
        ['view_left', 'Вид налево', true, 'Встаньте у входа и снимите улицу налево.'],
        ['view_right', 'Вид направо', true, 'Встаньте у входа и снимите улицу направо.'],
        ['view_across', 'Вид напротив', true, 'Снимите противоположную сторону улицы.'],
        ['territory_wide', 'Общий вид территории', false, 'Покажите объект в контексте окружающей территории.']
      ],
      fields: [{key:'surroundings_comment', label:'Комментарий по окружению', type:'textarea'}]
    },
    {
      key: 'parking', phase: 'field', title: 'Парковка и подъезд', desc: 'Заполните только то, что удалось понять с улицы или по телефону.',
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
      key: 'unloading', phase: 'visit', title: 'Разгрузка', desc: 'Полный осмотр начинается здесь — когда вы приехали на объект и можете посмотреть его подробнее.',
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
      key: 'interior', phase: 'visit', title: 'Помещение внутри', desc: 'Сделайте общий набор кадров внутри помещения.',
      fields: [
        {key:'ceiling_height', label:'Высота потолка, м', type:'number', step:'0.1', placeholder:'Например, 4.2'},
        {key:'interior_comment', label:'Комментарий по помещению', type:'textarea'}
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
      key: 'technical', phase: 'visit', title: 'Техническая часть', desc: 'Заполните только то, что удалось выяснить. Любое поле можно оставить пустым и вернуться позже.',
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
      key: 'summary', phase: 'visit', title: 'Итог', desc: 'Проверьте собранные данные и при желании завершите полный осмотр.',
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
      req.onsuccess = () => resolve((req.result || []).map(normalizeObject));
      req.onerror = () => reject(req.error);
    });
  }

  async function dbGet(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(normalizeObject(req.result || null));
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


  function normalizeObject(o) {
    if (!o) return o;
    if (!Array.isArray(o.contacts)) {
      o.contacts = o.phone ? [{id:id(), name:'', phone:o.phone, label:'Основной'}] : [];
    }
    if (!Array.isArray(o.premises)) {
      o.premises = o.area ? [{id:id(), area:String(o.area), label:''}] : [];
    }
    o.survey ||= {started:false, completed:false, stepIndex:0, answers:{}, photos:{}, finalComment:''};
    o.survey.answers ||= {};
    o.survey.photos ||= {};
    return o;
  }

  function cleanPhone(v='') { return String(v).replace(/[^+\d]/g, ''); }

  function premiseSummary(o, fallback='Не указаны') {
    const ps = (normalizeObject(o).premises || []).filter(x => x && x.area);
    if (!ps.length) return fallback;
    return ps.map(x => `${x.area} м²`).join(' + ');
  }

  function premiseTotal(o) {
    const nums = (normalizeObject(o).premises || []).map(x => Number(String(x.area||'').replace(',','.'))).filter(Number.isFinite);
    if (!nums.length) return '';
    const total = nums.reduce((a,b)=>a+b,0);
    return Number.isInteger(total) ? String(total) : total.toFixed(1).replace('.', ',');
  }

  function contactsText(o) {
    return (normalizeObject(o).contacts || []).map(c => [c.name,c.phone,c.label].filter(Boolean).join(' ')).join(' ');
  }

  function sourceOptions(current='') {
    const vals = ['','В полях','Avito','ЦИАН','Яндекс / карты','Знакомые / собственник','Другое'];
    if (current && !vals.includes(current)) vals.push(current);
    return vals.map(v => `<option value="${esc(v)}" ${v===current?'selected':''}>${esc(v || 'Не указано')}</option>`).join('');
  }

  function premiseRowHtml(p={}) {
    return `<div class="repeat-row" data-premise-row>
      <div class="repeat-row-grid">
        <div class="field"><label>Площадь, м²</label><input data-premise-area type="number" inputmode="decimal" value="${esc(p.area||'')}" placeholder="Например, 180"></div>
        <div class="field"><label>Пометка</label><input data-premise-label type="text" value="${esc(p.label||'')}" placeholder="1 этаж / цоколь / помещение 2"></div>
      </div>
      <button type="button" class="repeat-remove" data-remove-row>Удалить</button>
    </div>`;
  }

  function contactRowHtml(c={}) {
    return `<div class="repeat-row" data-contact-row>
      <div class="field"><label>Имя контакта</label><input data-contact-name type="text" value="${esc(c.name||'')}" placeholder="Например, Александр"></div>
      <div class="repeat-row-grid">
        <div class="field"><label>Телефон</label><input data-contact-phone type="tel" value="${esc(c.phone||'')}" placeholder="+7 ..."></div>
        <div class="field"><label>Пометка</label><input data-contact-label type="text" value="${esc(c.label||'')}" placeholder="Собственник / агент / с вывески"></div>
      </div>
      <button type="button" class="repeat-remove" data-remove-row>Удалить</button>
    </div>`;
  }

  function bindRepeaters(scope=document) {
    scope.querySelectorAll('[data-remove-row]').forEach(btn => btn.onclick = () => btn.closest('.repeat-row')?.remove());
  }

  function collectPremises(scope) {
    return [...scope.querySelectorAll('[data-premise-row]')].map(row => ({
      id:id(), area:(row.querySelector('[data-premise-area]')?.value||'').trim(), label:(row.querySelector('[data-premise-label]')?.value||'').trim()
    })).filter(x => x.area || x.label);
  }

  function collectContacts(scope) {
    return [...scope.querySelectorAll('[data-contact-row]')].map(row => ({
      id:id(), name:(row.querySelector('[data-contact-name]')?.value||'').trim(), phone:(row.querySelector('[data-contact-phone]')?.value||'').trim(), label:(row.querySelector('[data-contact-label]')?.value||'').trim()
    })).filter(x => x.name || x.phone || x.label);
  }

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
    return surveyStats(obj).pct;
  }

  function firstPhoto(obj) {
    const photos = obj?.survey?.photos || {};
    const keys = Object.keys(photos);
    return keys.length ? photos[keys[0]] : null;
  }

  function shell({title='Объекты', subtitle='MVP 0.2', content='', nav='objects', back=false, actions='', showNav=true}) {
    $app.innerHTML = `
      <div class="app-shell ${showNav ? '' : 'no-bottom-nav'}">
        <header class="topbar"><div class="topbar-row">
          ${back ? `<button class="icon-btn" data-go-back aria-label="Назад">←</button>` : `<div class="logo">О</div>`}
          <div class="brand">
            <div class="title-wrap"><div class="title">${esc(title)}</div><div class="subtitle">${esc(subtitle)}</div></div>
          </div>
          <div class="top-actions">${actions}</div>
        </div></header>
        <main>${content}</main>
        ${showNav ? `<nav class="bottom-nav"><div class="bottom-nav-inner">
          <button class="nav-btn ${nav==='objects'?'active':''}" data-route="#/objects"><span class="ico">▤</span><span>Объекты</span></button>
          <button class="nav-btn" data-route="#/new" aria-label="Добавить объект"><span class="nav-add">＋</span></button>
          <button class="nav-btn ${nav==='map'?'active':''}" data-route="#/map"><span class="ico">⌖</span><span>Карта</span></button>
        </div></nav>` : ''}
      </div>`;
    bindGlobal();
  }

  function bindGlobal() {
    document.querySelectorAll('[data-route]').forEach(b => b.onclick = () => location.hash = b.dataset.route);
    document.querySelectorAll('[data-go-back]').forEach(b => b.onclick = () => history.back());
  }

  async function renderObjects() {
    const objects = (await dbAll()).sort((a,b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    const q = searchText.toLowerCase();
    const filtered = objects.filter(o => (o.address || '').toLowerCase().includes(q) || contactsText(o).toLowerCase().includes(q));
    const list = filtered.length ? filtered.map(o => {
      const stats = surveyStats(o);
      const p = stats.pct;
      const photo = firstPhoto(o);
      return `<div class="card object-row" data-open-object="${esc(o.id)}">
        <div class="thumb">${photo ? `<img src="${photo}" alt="">` : '⌂'}</div>
        <div>
          <div class="object-address">${esc(o.address || 'Без адреса')}</div>
          <div class="object-meta">${statusChip(o.status)} ${(o.premises||[]).length ? `<span>${esc(premiseSummary(o,''))}</span>`:''} <span>${fmtDate(o.createdAt)}</span></div>
          ${o.survey?.started ? `<div class="progress-wrap"><div class="progress-label"><span>${o.survey.completed ? 'Обследовано' : `Этап ${stats.step} из ${STEPS.length}`}</span><span>${p}% · ${stats.photos} фото</span></div><div class="progress"><div style="width:${p}%"></div></div></div>` : ''}
        </div><div class="chev">›</div>
      </div>`;
    }).join('') : `<div class="card empty-state"><div class="empty-icon">⌂</div><h3>${objects.length ? 'Ничего не найдено' : 'Объектов пока нет'}</h3><p>${objects.length ? 'Попробуйте изменить запрос.' : 'Добавьте первый объект, который увидели или нашли онлайн.'}</p><button class="btn btn-primary" data-route="#/new">＋ Новый объект</button></div>`;

    shell({
      title:'Объекты', subtitle:`${objects.length} объектов · MVP 0.3`, nav:'objects',
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
    shell({title:'Новый объект', subtitle:'Быстрая фиксация в базу', back:true, nav:'', showNav:false, content:`
      <form id="newForm" class="card form-card">
        <div class="mode-note field-mode"><strong>1. Сначала просто фиксируем объект</strong><span>Адрес, GPS, источник, помещения и контакты. Остальное можно добавить позже.</span></div>
        <div class="field"><label>Адрес <span class="required-mark">*</span></label><input name="address" type="text" required placeholder="Санкт-Петербург, ул. ..."></div>
        <div class="field"><label>Местоположение</label><input name="coords" id="coords" type="hidden"><div class="location-box" id="locationBox"><div><strong>📍 Геопозиция не сохранена</strong><div class="help" id="coordsPreview">Можно добавить объект и без GPS.</div></div><button type="button" class="btn btn-secondary btn-small" id="geoBtn">Определить</button></div></div>
        <div class="field"><label>Источник</label><select name="source">${sourceOptions('')}</select></div>
        <div class="field"><label>Ссылка на объявление</label><input name="link" type="url" placeholder="https://..."></div>

        <div class="section-title form-section-title">Помещения на этом адресе</div>
        <div class="help section-help">Можно добавить несколько помещений одного собственника, например 100 м² и 180 м².</div>
        <div id="premisesList">${premiseRowHtml({})}</div>
        <button type="button" class="btn btn-secondary btn-block add-repeat" id="addPremiseBtn">＋ Добавить ещё площадь</button>

        <div class="section-title form-section-title">Контакты</div>
        <div class="help section-help">Для каждого номера можно указать имя и пометку: собственник, агент, номер с вывески и т. п.</div>
        <div id="contactsList">${contactRowHtml({})}</div>
        <button type="button" class="btn btn-secondary btn-block add-repeat" id="addContactBtn">＋ Добавить ещё контакт</button>

        <div class="field" style="margin-top:18px"><label>Комментарий</label><textarea name="comment" placeholder="Что сразу бросилось в глаза / что узнали по телефону"></textarea></div>
        <button class="btn btn-primary btn-block" type="submit">Сохранить объект в базу</button>
      </form>`});

    bindRepeaters(document);
    document.getElementById('addPremiseBtn').onclick = () => {
      document.getElementById('premisesList').insertAdjacentHTML('beforeend', premiseRowHtml({})); bindRepeaters(document);
    };
    document.getElementById('addContactBtn').onclick = () => {
      document.getElementById('contactsList').insertAdjacentHTML('beforeend', contactRowHtml({})); bindRepeaters(document);
    };

    document.getElementById('geoBtn').onclick = () => {
      if (!navigator.geolocation) return toast('Геолокация не поддерживается');
      const b = document.getElementById('geoBtn'); b.disabled = true; b.textContent = 'Определяю…';
      navigator.geolocation.getCurrentPosition(pos => {
        document.getElementById('coords').value = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
        b.disabled = false; b.textContent = 'Обновить';
        document.getElementById('locationBox').classList.add('location-ok');
        document.getElementById('locationBox').querySelector('strong').textContent = '✓ Местоположение сохранено';
        document.getElementById('coordsPreview').textContent = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
      }, () => { b.disabled = false; b.textContent = 'Определить'; toast('Не удалось получить геопозицию'); }, {enableHighAccuracy:true, timeout:12000});
    };

    document.getElementById('newForm').onsubmit = async e => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const now = new Date().toISOString();
      const premises = collectPremises(e.currentTarget);
      const contacts = collectContacts(e.currentTarget);
      const obj = {
        id:id(), address:fd.get('address').trim(), coords:fd.get('coords').trim(), source:fd.get('source'), link:fd.get('link').trim(),
        premises, contacts, area:premises[0]?.area || '', phone:contacts[0]?.phone || '', comment:fd.get('comment').trim(), status:'new', createdAt:now, updatedAt:now,
        survey:{started:false, completed:false, stepIndex:0, answers:{}, photos:{}, finalComment:''}
      };
      await dbPut(obj);
      toast('Объект сохранён в базу');
      location.hash = `#/object/${obj.id}`;
    };
  }

  async function renderObject(objectId) {
    const o = await dbGet(objectId);
    if (!o) return notFound();
    const stats = surveyStats(o);
    const photo = firstPhoto(o);
    const photosCount = Object.keys(o.survey?.photos || {}).length;
    const missing = missingObjectInfo(o);
    const mapUrl = mapsUrl(o.coords, o.address);
    const premises = o.premises || [];
    const contacts = o.contacts || [];
    const fieldStats = phaseProgress(o, 'field');
    const visitStats = phaseProgress(o, 'visit');
    const current = Number(o.survey?.stepIndex || 0);
    const fieldRoute = `#/survey/${o.id}/${current >= 0 && current <= 2 ? current : 0}`;
    const visitRoute = `#/survey/${o.id}/${current >= 3 && current <= 6 ? current : 3}`;
    const details = [
      ['Статус', STATUS[o.status]?.[0] || 'Новый'],
      ['Помещения', premises.length ? `${premises.length} · ${premiseSummary(o)}` : 'Не указаны'],
      ['Контакты', contacts.length ? `${contacts.length}` : 'Не указаны'],
      ['Источник', o.source || 'Не указан'],
      ['Координаты', o.coords || 'Не указаны'],
      ['Создан', fmtDate(o.createdAt)]
    ];

    shell({title:o.address || 'Объект', subtitle:'Карточка объекта', back:true, nav:'objects', actions:`<button class="icon-btn" id="editBtn" title="Редактировать">✎</button>`, content:`
      ${photo ? `<div class="card" style="overflow:hidden;margin-bottom:12px"><img src="${photo}" style="width:100%;height:230px;object-fit:cover" alt="Фото объекта"></div>`:''}
      <div class="card card-pad">
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><div class="small">ОБЪЕКТ</div><h2 style="margin:4px 0 7px;font-size:22px">${esc(o.address)}</h2></div>${statusChip(o.status)}</div>
        ${o.comment ? `<p style="margin:10px 0 0;line-height:1.45">${esc(o.comment)}</p>`:''}
        ${o.survey?.started ? `<div class="progress-wrap" style="margin-top:14px"><div class="progress-label"><span>${o.survey.completed ? 'Полный осмотр завершён' : `Сохранено · этап ${stats.step} из ${STEPS.length}`}</span><span>${photosCount} фото</span></div><div class="progress"><div style="width:${stats.pct}%"></div></div></div>`:''}
      </div>

      <div class="section-title">Основное</div>
      <div class="details-grid">${details.map(([k,v])=>`<div class="detail-box"><div class="detail-k">${esc(k)}</div><div class="detail-v">${esc(v)}</div></div>`).join('')}</div>

      ${premises.length ? `<div class="section-title">Помещения</div><div class="card card-pad compact-list">${premises.map((p,i)=>`<div class="compact-row"><div><strong>${esc(p.label || `Помещение ${i+1}`)}</strong><span>${p.area ? `${esc(p.area)} м²` : 'Площадь не указана'}</span></div></div>`).join('')}${premises.length>1 && premiseTotal(o) ? `<div class="compact-total">Суммарно: <strong>${esc(premiseTotal(o))} м²</strong></div>`:''}</div>`:''}

      <div class="section-title">Контакты</div>
      ${contacts.length ? `<div class="card card-pad compact-list">${contacts.map((c,i)=>`<div class="compact-row contact-row"><div><strong>${esc(c.name || `Контакт ${i+1}`)}</strong><span>${esc(c.label || 'Без пометки')}</span></div>${c.phone ? `<a class="contact-phone" href="tel:${esc(cleanPhone(c.phone))}">${esc(c.phone)} ☎</a>`:''}</div>`).join('')}</div>` : `<div class="card card-pad"><div class="help">Контакты пока не добавлены. Нажмите ✎, чтобы добавить имя, телефон и пометку.</div></div>`}

      <div class="object-actions">
        ${mapUrl ? `<a class="btn btn-secondary" target="_blank" rel="noopener" href="${esc(mapUrl)}">📍 Яндекс Карты</a>`:''}
        ${o.link ? `<a class="btn btn-secondary" target="_blank" rel="noopener" href="${esc(o.link)}">↗ Объявление</a>`:''}
      </div>

      <div class="section-title">Рабочий процесс</div>
      <div class="workflow-card field-workflow">
        <div class="workflow-number">1</div><div class="workflow-body"><strong>В полях</strong><span>Фасад, окружение, парковка и то, что удалось выяснить по телефону.</span><small>${fieldStats.photos} фото · ${fieldStats.filled} ответов · можно сохранить в любой момент</small></div>
        <button class="btn btn-secondary" id="fieldModeBtn">${fieldStats.started ? 'Продолжить / открыть' : 'Начать фиксацию'} →</button>
      </div>
      <div class="workflow-connector"></div>
      <div class="workflow-card visit-workflow">
        <div class="workflow-number">2</div><div class="workflow-body"><strong>На объекте</strong><span>Когда вас пустили внутрь: разгрузка, помещение, техническая часть и итог.</span><small>${o.survey?.completed ? 'Полный осмотр завершён' : visitStats.started ? `${visitStats.photos} фото · ${visitStats.filled} ответов` : 'Можно продолжить позже, когда будет встреча'}</small></div>
        <button class="btn btn-primary" id="visitModeBtn">${o.survey?.completed ? 'Посмотреть осмотр' : visitStats.started ? 'Продолжить осмотр' : 'Начать полный осмотр'} →</button>
      </div>

      ${missing.length ? `<div class="section-title">Что ещё уточнить</div><div class="card card-pad missing-card"><div class="missing-list">${missing.slice(0,8).map(x=>`<span>${esc(x)}</span>`).join('')}</div>${missing.length>8?`<div class="help">И ещё ${missing.length-8}</div>`:''}</div>` : `<div class="complete-note">✓ Основные данные заполнены</div>`}

      <div class="section-title">Быстрый статус</div>
      <div class="quick-status" id="quickStatus">
        <button data-status="good" class="${o.status==='good'?'active good':''}">Перспективный</button>
        <button data-status="review" class="${o.status==='review'?'active review':''}">Уточнить</button>
        <button data-status="bad" class="${o.status==='bad'?'active bad':''}">Не подходит</button>
      </div>
      ${photosCount ? `<div style="margin-top:12px"><button class="btn btn-secondary btn-block" id="galleryBtn">Посмотреть все фото (${photosCount})</button></div>`:''}
      <div style="margin-top:22px"><button class="btn btn-danger btn-block" id="deleteBtn">Удалить объект</button></div>
    `});

    document.getElementById('fieldModeBtn').onclick = () => location.hash = fieldRoute;
    document.getElementById('visitModeBtn').onclick = () => location.hash = visitRoute;
    document.getElementById('editBtn').onclick = () => location.hash = `#/edit/${o.id}`;
    document.getElementById('galleryBtn')?.addEventListener('click', () => location.hash = `#/gallery/${o.id}`);
    document.querySelectorAll('#quickStatus [data-status]').forEach(btn => btn.onclick = async () => {
      o.status = btn.dataset.status;
      if (o.survey?.completed) o.survey.finalStatus = btn.dataset.status;
      o.updatedAt = new Date().toISOString();
      await dbPut(o);
      toast('Статус обновлён');
      renderObject(o.id);
    });
    document.getElementById('deleteBtn').onclick = async () => {
      if (!confirm('Удалить объект и все его фотографии?')) return;
      await dbDelete(o.id); toast('Объект удалён'); location.hash = '#/objects';
    };
  }

  async function renderEdit(objectId) {
    const o = await dbGet(objectId); if (!o) return notFound();
    shell({title:'Редактировать', subtitle:o.address, back:true, nav:'', showNav:false, content:`
      <form id="editForm" class="card form-card">
        <div class="field"><label>Адрес</label><input name="address" required value="${esc(o.address)}"></div>
        <div class="field"><label>Координаты</label><input name="coords" value="${esc(o.coords||'')}"></div>
        <div class="field"><label>Источник</label><select name="source">${sourceOptions(o.source||'')}</select></div>
        <div class="field"><label>Ссылка</label><input name="link" type="url" value="${esc(o.link||'')}"></div>

        <div class="section-title form-section-title">Помещения на этом адресе</div>
        <div id="premisesList">${(o.premises?.length ? o.premises : [{}]).map(p=>premiseRowHtml(p)).join('')}</div>
        <button type="button" class="btn btn-secondary btn-block add-repeat" id="addPremiseBtn">＋ Добавить ещё площадь</button>

        <div class="section-title form-section-title">Контакты</div>
        <div id="contactsList">${(o.contacts?.length ? o.contacts : [{}]).map(c=>contactRowHtml(c)).join('')}</div>
        <button type="button" class="btn btn-secondary btn-block add-repeat" id="addContactBtn">＋ Добавить ещё контакт</button>

        <div class="field" style="margin-top:18px"><label>Комментарий</label><textarea name="comment">${esc(o.comment||'')}</textarea></div>
        <button class="btn btn-primary btn-block">Сохранить изменения</button>
      </form>`});

    bindRepeaters(document);
    document.getElementById('addPremiseBtn').onclick = () => { document.getElementById('premisesList').insertAdjacentHTML('beforeend', premiseRowHtml({})); bindRepeaters(document); };
    document.getElementById('addContactBtn').onclick = () => { document.getElementById('contactsList').insertAdjacentHTML('beforeend', contactRowHtml({})); bindRepeaters(document); };

    document.getElementById('editForm').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.currentTarget);
      const premises = collectPremises(e.currentTarget);
      const contacts = collectContacts(e.currentTarget);
      Object.assign(o,{
        address:fd.get('address').trim(), coords:fd.get('coords').trim(), source:fd.get('source').trim(), link:fd.get('link').trim(),
        premises, contacts, area:premises[0]?.area || '', phone:contacts[0]?.phone || '', comment:fd.get('comment').trim(), updatedAt:new Date().toISOString()
      });
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
    const mark = required ? ' <span class="control-mark">контрольное</span>' : '';
    return `<div class="photo-slot ${data?'done':''}">
      ${data ? `<div class="photo-caption">${esc(label)}${mark}</div><img src="${data}" alt="${esc(label)}"><div class="photo-actions"><button class="btn btn-secondary photo-replace" data-photo-key="${key}">↻ Переснять</button><button class="btn btn-danger photo-delete" data-photo-key="${key}">Удалить</button></div>` : `<div class="photo-empty"><div style="font-size:28px">📷</div><strong>${esc(label)}${mark}</strong><span class="small">${esc(hint)}</span><button class="btn btn-secondary btn-small photo-capture" data-photo-key="${key}">Сделать фото</button></div>`}
      <input class="file-input" id="file-${key}" data-file-key="${key}" type="file" accept="image/*" capture="environment">
    </div>`;
  }

  function requiredPhotosComplete(obj, step) {
    const photos = obj.survey.photos || {};
    return (step.photos || []).filter(p => p[2]).every(p => !!photos[p[0]]);
  }

  function requiredPhotoStats(obj, step) {
    const required = (step.photos || []).filter(p => p[2]);
    const photos = obj.survey?.photos || {};
    const done = required.filter(p => !!photos[p[0]]).length;
    return {done, total: required.length, missing: Math.max(0, required.length - done)};
  }

  function surveyStats(obj) {
    if (!obj.survey?.started) return {pct:0, step:0, photos:0, requiredDone:0, requiredTotal:0};
    const photos = obj.survey.photos || {};
    const photoSteps = STEPS.slice(0, STEPS.length - 1);
    const required = photoSteps.flatMap(s => (s.photos || []).filter(p => p[2]));
    const requiredDone = required.filter(p => !!photos[p[0]]).length;
    const current = Math.max(0, Math.min(STEPS.length - 1, obj.survey.stepIndex || 0));
    if (obj.survey.completed) return {pct:100, step:STEPS.length, photos:Object.keys(photos).length, requiredDone, requiredTotal:required.length};
    const step = STEPS[current];
    const stepPhoto = requiredPhotoStats(obj, step);
    const within = stepPhoto.total ? stepPhoto.done / stepPhoto.total : 0;
    const pct = Math.min(99, Math.round(((current + within) / (STEPS.length - 1)) * 100));
    return {pct, step:current + 1, photos:Object.keys(photos).length, requiredDone, requiredTotal:required.length};
  }

  function phaseProgress(obj, phase) {
    const steps = STEPS.filter(s => s.phase === phase && !s.summary);
    const photoDefs = steps.flatMap(s => s.photos || []);
    const fieldDefs = steps.flatMap(s => s.fields || []);
    const photos = obj.survey?.photos || {};
    const answers = obj.survey?.answers || {};
    const photoKeys = new Set(photoDefs.map(p => p[0]));
    const fieldKeys = new Set(fieldDefs.map(f => f.key));
    const photoCount = Object.keys(photos).filter(k => photoKeys.has(k)).length;
    const filled = Object.keys(answers).filter(k => fieldKeys.has(k) && answers[k] && answers[k] !== 'Неизвестно').length;
    const current = Number(obj.survey?.stepIndex || 0);
    const started = photoCount > 0 || filled > 0 || (phase === 'field' ? (obj.survey?.started && current <= 2) : current >= 3);
    return {photos:photoCount, filled, started};
  }

  function missingObjectInfo(obj) {
    const a = obj.survey?.answers || {};
    const checks = [
      ['Площади помещений', (obj.premises || []).some(p => p.area)],
      ['Контакт', (obj.contacts || []).some(c => c.phone || c.name)],
      ['Геопозиция', obj.coords],
      ['Мощность', a.power_kw],
      ['Нагрузка на пол', a.floor_load],
      ['Парковка', a.parking],
      ['Подъезд грузового транспорта', a.truck_access],
      ['Разгрузка', a.unloading],
      ['Вода', a.water],
      ['Канализация', a.sewer],
      ['Отопление', a.heating],
      ['Вентиляция', a.ventilation]
    ];
    return checks.filter(([,v]) => !v || v === 'Неизвестно').map(([label]) => label);
  }

  function mapsUrl(coords, label='Объект') {
    const c = parseCoords(coords);
    if (!c) return '';
    return `https://yandex.ru/maps/?pt=${encodeURIComponent(c.lng + ',' + c.lat)}&z=17&l=map`;
  }

  async function renderSurvey(objectId, stepIndexRaw) {
    const o = await dbGet(objectId); if (!o) return notFound();
    const stepIndex = Math.max(0, Math.min(STEPS.length-1, Number(stepIndexRaw) || 0));
    const step = STEPS[stepIndex];
    o.survey ||= {started:false,completed:false,stepIndex:0,answers:{},photos:{}};
    o.survey.started = true;
    if (!o.survey.completed && stepIndex > (o.survey.stepIndex || 0)) o.survey.stepIndex = stepIndex;
    if (!o.survey.completed) {
      if (step.phase === 'field' && o.status === 'new') o.status = 'field';
      if (step.phase === 'visit' && (o.status === 'new' || o.status === 'field')) o.status = 'survey';
    }
    o.updatedAt = new Date().toISOString();
    await dbPut(o);

    const stagePhotoStats = requiredPhotoStats(o, step);
    const stats = surveyStats({...o, survey:{...o.survey, stepIndex}});
    const pct = step.summary ? 100 : stats.pct;
    const photoStatus = step.summary ? `${Object.keys(o.survey.photos||{}).length} фото` : (stagePhotoStats.total ? `${stagePhotoStats.done} из ${stagePhotoStats.total} контрольных фото` : `${Object.keys(o.survey.photos||{}).length} фото`);
    const phaseLabel = step.phase === 'field' ? 'В ПОЛЯХ' : 'НА ОБЪЕКТЕ';
    const phaseClass = step.phase === 'field' ? 'phase-field' : 'phase-visit';
    let body = `<div class="check-stage-head"><div class="phase-badge ${phaseClass}">${phaseLabel}</div><div class="step-counter">ЭТАП ${stepIndex+1} ИЗ ${STEPS.length}</div><h2>${esc(step.title)}</h2><p>${esc(step.desc)}</p><div class="progress-wrap"><div class="progress-label"><span>${pct}%</span><span>${photoStatus}</span></div><div class="progress"><div style="width:${pct}%"></div></div></div></div>`;

    if (stepIndex === 2) body += `<div class="mode-note field-mode"><strong>Первичная фиксация уже достаточна для базы</strong><span>Можно нажать «Сохранить и выйти». Полный осмотр продолжите позже, когда будет встреча и доступ внутрь.</span></div>`;
    if (stepIndex === 3) body += `<div class="mode-note visit-mode"><strong>Начинается полный осмотр</strong><span>Этот блок проходите, когда приехали на объект и вас пустили осмотреть помещение.</span></div>`;

    if (step.summary) {
      const a = o.survey.answers || {};
      body += `<div class="card card-pad">
        <div class="section-title" style="margin-top:0">Краткое резюме</div>
        <div class="details-grid">
          ${[['Адрес',o.address],['Помещения',premiseSummary(o)],['Контакты',(o.contacts||[]).length || 'Не указаны'],['Мощность',a.power_kw ? a.power_kw+' кВт' : 'Неизвестно'],['Парковка',a.parking||'Неизвестно'],['Разгрузка',a.unloading||'Неизвестно'],['Фото',Object.keys(o.survey.photos||{}).length]].map(([k,v])=>`<div class="detail-box"><div class="detail-k">${esc(k)}</div><div class="detail-v">${esc(v)}</div></div>`).join('')}
        </div><hr class="sep">
        <div class="field"><label>Итог по объекту</label><div class="summary-status">
          <label class="status-option"><input type="radio" name="final_status" value="good" ${o.survey.finalStatus==='good'?'checked':''}><span>🟢 Перспективный</span></label>
          <label class="status-option"><input type="radio" name="final_status" value="review" ${o.survey.finalStatus==='review'?'checked':''}><span>🟡 Нужно уточнить</span></label>
          <label class="status-option"><input type="radio" name="final_status" value="bad" ${o.survey.finalStatus==='bad'?'checked':''}><span>🔴 Не подходит</span></label>
        </div></div>
        <div class="field"><label>Итоговый комментарий</label><textarea id="finalComment" placeholder="Главные выводы по объекту">${esc(o.survey.finalComment||'')}</textarea></div>
        <div class="summary-actions"><button class="btn btn-secondary" id="saveSummaryExit">Сохранить и выйти</button><button class="btn btn-primary" id="finishSurvey">Завершить полный осмотр</button></div>
      </div>`;
    } else {
      body += `<div class="card form-card" id="stageForm">
        ${(step.fields||[]).map(f => fieldHtml(f, o.survey.answers?.[f.key] || '')).join('')}
        ${(step.photos||[]).length ? `<div class="section-title">Фото этапа</div><div class="photo-grid">${step.photos.map(p => photoHtml(o,p)).join('')}</div>`:''}
      </div>`;
    }

    if (!step.summary) {
      body += `${stagePhotoStats.missing ? `<div class="required-hint">Не снято контрольных фото: <strong>${stagePhotoStats.missing}</strong>. Это не мешает сохранить объект и продолжить позже.</div>` : ''}<div class="stage-nav stage-nav-3"><button class="btn btn-secondary" id="prevStep" ${stepIndex===0?'disabled':''}>← Назад</button><button class="btn btn-save" id="saveExit">Сохранить</button><button class="btn btn-primary" id="nextStep">${stepIndex===STEPS.length-2?'К итогу':'Далее'} →</button></div>`;
    }

    shell({title:o.address, subtitle:`${step.phase === 'field' ? 'Фиксация в базе' : 'Полный осмотр'} · ${step.title}`, back:true, nav:'', content:body, showNav:false});

    if (step.summary) {
      const saveSummary = async () => {
        o.survey.finalStatus = document.querySelector('input[name="final_status"]:checked')?.value || o.survey.finalStatus || '';
        o.survey.finalComment = document.getElementById('finalComment').value.trim();
        o.updatedAt = new Date().toISOString();
        await dbPut(o);
      };
      document.getElementById('saveSummaryExit').onclick = async () => { await saveSummary(); toast('Сохранено'); location.hash = `#/object/${o.id}`; };
      document.getElementById('finishSurvey').onclick = async () => {
        await saveSummary();
        const chosen = o.survey.finalStatus;
        if (!chosen) return toast('Для завершения выберите итоговый статус');
        o.survey.completed = true; o.survey.stepIndex = STEPS.length-1; o.status = chosen; o.updatedAt = new Date().toISOString();
        await dbPut(o); toast('Полный осмотр завершён'); location.hash = `#/object/${o.id}`;
      };
      document.querySelectorAll('input[name="final_status"]').forEach(el => el.onchange = saveSummary);
      let t;
      document.getElementById('finalComment').oninput = () => { clearTimeout(t); t=setTimeout(saveSummary,450); };
      document.querySelector('[data-go-back]').onclick = async () => { await saveSummary(); location.hash = `#/object/${o.id}`; };
      return;
    }

    const saveFields = async () => {
      for (const f of step.fields || []) {
        let val = '';
        if (f.type === 'tri') val = document.querySelector(`[name="${CSS.escape(f.key)}"]:checked`)?.value || '';
        else val = document.querySelector(`[name="${CSS.escape(f.key)}"]`)?.value || '';
        o.survey.answers[f.key] = val;
      }
      o.updatedAt = new Date().toISOString(); await dbPut(o);
    };
    let autosaveTimer;
    const queueSave = () => { clearTimeout(autosaveTimer); autosaveTimer = setTimeout(()=>saveFields().catch(console.error), 450); };
    document.querySelectorAll('#stageForm input:not([type="file"]), #stageForm textarea, #stageForm select').forEach(el => {
      el.addEventListener('change', saveFields);
      el.addEventListener('input', queueSave);
    });

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
      delete o.survey.photos[btn.dataset.photoKey]; o.updatedAt = new Date().toISOString(); await dbPut(o); renderSurvey(o.id, stepIndex);
    });

    document.getElementById('prevStep').onclick = async () => { await saveFields(); location.hash = `#/survey/${o.id}/${Math.max(0,stepIndex-1)}`; };
    document.getElementById('saveExit').onclick = async () => { await saveFields(); toast('Сохранено'); location.hash = `#/object/${o.id}`; };
    document.getElementById('nextStep').onclick = async () => {
      await saveFields();
      const next = Math.min(STEPS.length-1, stepIndex+1);
      if (next > o.survey.stepIndex) o.survey.stepIndex = next;
      await dbPut(o); location.hash = `#/survey/${o.id}/${next}`;
    };
    document.querySelector('[data-go-back]').onclick = async () => { await saveFields(); location.hash = `#/object/${o.id}`; };
  }

  async function renderGallery(objectId) {
    const o = await dbGet(objectId); if (!o) return notFound();
    const photos = o.survey?.photos || {};
    const allDefs = STEPS.flatMap(s => s.photos || []);
    const byStep = STEPS.filter(s => (s.photos||[]).some(p => photos[p[0]])).map(s => `<div class="section-title">${esc(s.title)}</div><div class="photo-grid">${(s.photos||[]).filter(p=>photos[p[0]]).map(p=>`<div class="photo-slot done"><img src="${photos[p[0]]}" alt="${esc(p[1])}"><div style="padding:9px;font-size:12px;font-weight:700;background:#fff">${esc(p[1])}</div></div>`).join('')}</div>`).join('');
    shell({title:'Фотографии',subtitle:o.address,back:true,nav:'',showNav:false,content: byStep || `<div class="card empty-state"><div class="empty-icon">📷</div><h3>Фото пока нет</h3></div>`});
  }

  async function renderMap() {
    const objects = await dbAll();
    const withCoords = objects.filter(o => parseCoords(o.coords));
    shell({title:'Карта',subtitle:`${withCoords.length} объектов с GPS`,nav:'map',content:`
      <div class="map-card"><div id="objectsMap" class="objects-map"></div><div id="mapFallback" class="map-fallback" hidden>Не удалось загрузить карту. Проверьте интернет.</div></div>
      <div class="section-title">Объекты на карте · ${withCoords.length}</div>
      <div class="map-object-list">${withCoords.map(o=>`<button class="card map-row" data-open-object="${esc(o.id)}"><span class="map-pin-dot status-${esc(o.status || 'new')}"></span><span><strong>${esc(o.address)}</strong><small>${esc(STATUS[o.status]?.[0] || 'Новый')}</small></span><span>›</span></button>`).join('') || `<div class="card empty-state"><div class="empty-icon">⌖</div><h3>Нет GPS-точек</h3><p>При добавлении объекта нажмите «Определить» в блоке местоположения.</p></div>`}</div>`});

    document.querySelectorAll('[data-open-object]').forEach(el => el.onclick = () => location.hash = `#/object/${el.dataset.openObject}`);
    const mapEl = document.getElementById('objectsMap');
    if (!mapEl) return;
    if (!window.L) {
      mapEl.hidden = true;
      document.getElementById('mapFallback').hidden = false;
      return;
    }
    const map = L.map(mapEl, {zoomControl:true}).setView([59.9386, 30.3141], 10);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);
    const bounds = [];
    const colorMap = {new:'#2563eb',survey:'#f59e0b',surveyed:'#16a34a',good:'#16a34a',review:'#eab308',bad:'#6b7280'};
    withCoords.forEach(o => {
      const c = parseCoords(o.coords); if (!c) return;
      bounds.push([c.lat,c.lng]);
      const icon = L.divIcon({className:'object-map-marker-wrap',html:`<span class="object-map-marker" style="--pin:${colorMap[o.status]||'#2563eb'}"></span>`,iconSize:[26,26],iconAnchor:[13,26]});
      L.marker([c.lat,c.lng],{icon}).addTo(map).bindPopup(`<div class="map-popup"><strong>${esc(o.address)}</strong><div>${esc(STATUS[o.status]?.[0] || 'Новый')}</div><a href="#/object/${esc(o.id)}">Открыть объект</a><br><a target="_blank" rel="noopener" href="${esc(mapsUrl(o.coords, o.address))}">Яндекс Карты ↗</a></div>`);
    });
    if (bounds.length === 1) map.setView(bounds[0], 15);
    else if (bounds.length > 1) map.fitBounds(bounds, {padding:[28,28], maxZoom:15});
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => {
      const here = L.divIcon({className:'my-map-marker-wrap',html:'<span class="my-map-marker"></span>',iconSize:[22,22],iconAnchor:[11,11]});
      L.marker([pos.coords.latitude,pos.coords.longitude],{icon:here,zIndexOffset:1000}).addTo(map).bindPopup('Вы здесь');
    },()=>{}, {enableHighAccuracy:false,timeout:5000,maximumAge:120000});
    setTimeout(()=>map.invalidateSize(), 100);
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
