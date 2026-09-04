import { db, auth } from './firebase-config.js';
import {
  collection, addDoc, deleteDoc, doc, onSnapshot,
  query, where, orderBy, serverTimestamp, setDoc, getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ═══════════════════════════════
// CONSTANTS
// ═══════════════════════════════
const CATS_GASTO = [
  { id:'fijos',        label:'Gastos Fijos',   icon:'🏠', bg:'rgba(255,107,53,.18)',  bar:'#ff6b35' },
  { id:'ocio',         label:'Ocio',           icon:'🎉', bg:'rgba(255,230,109,.18)', bar:'#ffe66d' },
  { id:'viajes',       label:'Viajes',         icon:'✈️',  bg:'rgba(78,205,196,.18)',  bar:'#4ecdc4' },
  { id:'ropa',         label:'Ropa',           icon:'👕', bg:'rgba(149,225,211,.18)', bar:'#95e1d3' },
  { id:'comida',       label:'Comida',         icon:'🍔', bg:'rgba(248,181,0,.18)',   bar:'#f8b500' },
  { id:'inversion',    label:'Inversión',      icon:'📈', bg:'rgba(48,209,88,.18)',   bar:'#30d158' },
  { id:'transporte',   label:'Transporte',     icon:'🚗', bg:'rgba(77,150,255,.18)',  bar:'#4d96ff' },
  { id:'alimentacion', label:'Alimentación',   icon:'🛒', bg:'rgba(199,125,255,.18)', bar:'#c77dff' },
  { id:'salud',        label:'Salud',          icon:'❤️',  bg:'rgba(255,100,100,.18)', bar:'#ff6464' },
  { id:'gasolina',     label:'Gasolina',       icon:'⛽', bg:'rgba(255,179,71,.18)',  bar:'#ffb347' },
  { id:'educacion',    label:'Educación',      icon:'📚', bg:'rgba(135,206,235,.18)', bar:'#87ceeb' },
  { id:'otros',        label:'Otros',          icon:'💰', bg:'rgba(221,160,221,.18)', bar:'#dda0dd' },
];
const CATS_INGRESO = [
  { id:'nomina',   label:'Nómina',   icon:'💼', bg:'rgba(48,209,88,.18)',   bar:'#30d158' },
  { id:'bizum',    label:'Bizum',    icon:'📲', bg:'rgba(78,205,196,.18)',  bar:'#4ecdc4' },
  { id:'apuestas', label:'Apuestas', icon:'🎰', bg:'rgba(255,230,109,.18)', bar:'#ffe66d' },
  { id:'otros',    label:'Otros',    icon:'💰', bg:'rgba(221,160,221,.18)', bar:'#dda0dd' },
];
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ═══════════════════════════════
// STATE
// ═══════════════════════════════
const state = {
  user:         null,
  view:         'dashboard',
  dashAccount:  'personal',
  histFilter:   'all',
  month:        getMonthKey(new Date()),
  transactions: [],
  unsub:        null,
  saldo:        null,      // saldo manual en cuenta
  // Form state (persists across category changes)
  addType:      'gasto',
  addAccount:   'personal',
  addCategory:  '',
  addAmount:    '',
  addConcept:   '',
  addDate:      '',
};

// ═══════════════════════════════
// UTILS
// ═══════════════════════════════
function getMonthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function parseMonthKey(k) {
  const [y,m] = k.split('-');
  return new Date(+y, +m-1, 1);
}
function formatMonthLabel(k) {
  const d = parseMonthKey(k);
  return `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}
function prevMonth(k) { const d=parseMonthKey(k); d.setMonth(d.getMonth()-1); return getMonthKey(d); }
function nextMonth(k) { const d=parseMonthKey(k); d.setMonth(d.getMonth()+1); return getMonthKey(d); }
function formatEur(n) {
  return new Intl.NumberFormat('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)+' €';
}
function formatDateGroup(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const today = new Date(); today.setHours(0,0,0,0);
  const day   = new Date(d); day.setHours(0,0,0,0);
  if (day.getTime()===today.getTime()) return 'Hoy';
  if (day.getTime()===today.getTime()-86400000) return 'Ayer';
  return d.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});
}
function getCat(id, type) {
  const list = type==='ingreso' ? CATS_INGRESO : CATS_GASTO;
  return list.find(c=>c.id===id) || {id:'otros',label:'Otros',icon:'💰',bg:'rgba(0,0,0,.2)',bar:'#666'};
}
function showToast(msg, type='') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast show ${type}`;
  setTimeout(()=>{ el.className='toast'; }, 2500);
}
function qs(sel, ctx=document) { return ctx.querySelector(sel); }

// Save current form inputs to state (prevents loss on re-render)
function saveFormInputs() {
  const a = qs('#inp-amount');
  const c = qs('#inp-concept');
  const d = qs('#inp-date');
  if (a) state.addAmount  = a.value;
  if (c) state.addConcept = c.value;
  if (d) state.addDate    = d.value;
}

// ═══════════════════════════════
// FIRESTORE - TRANSACTIONS
// ═══════════════════════════════
function subscribeTransactions() {
  if (state.unsub) state.unsub();
  if (!state.user) return;
  const q = query(
    collection(db,'users',state.user.uid,'transactions'),
    where('month','==',state.month),
    orderBy('date','desc')
  );
  state.unsub = onSnapshot(q, snap => {
    state.transactions = snap.docs.map(d=>({id:d.id,...d.data()}));
    if (state.view==='dashboard') renderDashboard();
    if (state.view==='history')   renderHistory();
  }, err => console.warn('Firestore:', err));
}

async function saveTransaction(data) {
  await addDoc(collection(db,'users',state.user.uid,'transactions'), {
    ...data, month:state.month, createdAt:serverTimestamp()
  });
}

async function deleteTx(id) {
  await deleteDoc(doc(db,'users',state.user.uid,'transactions',id));
}

// ═══════════════════════════════
// FIRESTORE - SALDO
// ═══════════════════════════════
async function loadSaldo() {
  try {
    const snap = await getDoc(doc(db,'users',state.user.uid,'config','saldo'));
    if (snap.exists()) state.saldo = snap.data().amount;
  } catch(e) {}
}

async function saveSaldo(amount) {
  await setDoc(doc(db,'users',state.user.uid,'config','saldo'),
    { amount, updatedAt: serverTimestamp() }
  );
  state.saldo = amount;
}

// ═══════════════════════════════
// CALCULATIONS
// ═══════════════════════════════
function calcSummary(txs, account) {
  const f = account==='all' ? txs : txs.filter(t=>t.account===account);
  const ingresos = f.filter(t=>t.type==='ingreso').reduce((s,t)=>s+t.amount,0);
  const gastos   = f.filter(t=>t.type==='gasto').reduce((s,t)=>s+t.amount,0);
  return { ingresos, gastos, balance: ingresos-gastos };
}

function calcCategoryTotals(txs, account) {
  const f = txs.filter(t=>t.type==='gasto'&&(account==='all'||t.account===account));
  const map = {};
  f.forEach(t=>{ map[t.category]=(map[t.category]||0)+t.amount; });
  const max = Math.max(...Object.values(map),1);
  return Object.entries(map)
    .sort((a,b)=>b[1]-a[1])
    .map(([id,total])=>({...getCat(id,'gasto'),total,pct:total/max*100}));
}

// ═══════════════════════════════
// RENDER: LOGIN
// ═══════════════════════════════
function renderLogin() {
  qs('#app').innerHTML = `
    <div class="login-screen">
      <div class="login-logo">💸</div>
      <div class="login-title">
        <h1>KikoGastos</h1>
        <p>Tu control financiero personal</p>
      </div>
      <button class="btn-google" id="btn-login">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Entrar con Google
      </button>
    </div>`;
  qs('#btn-login').addEventListener('click', async () => {
    const btn = qs('#btn-login');
    btn.disabled = true;
    btn.textContent = 'Abriendo Google…';
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch(e) {
      btn.disabled = false;
      btn.innerHTML = '🔄 Reintentar';
      if (e.code !== 'auth/popup-closed-by-user') showToast('Error: '+e.code, 'error');
    }
  });
}

// ═══════════════════════════════
// RENDER: SHELL
// ═══════════════════════════════
function renderShell() {
  qs('#app').innerHTML = `
    <div class="app-header">
      <div class="header-top">
        <span class="header-title">💸 KikoGastos</span>
        <button class="icon-btn" id="btn-logout">👤</button>
      </div>
      <div class="month-nav">
        <button id="btn-prev">‹</button>
        <span class="month-label" id="month-label">${formatMonthLabel(state.month)}</span>
        <button id="btn-next">›</button>
      </div>
    </div>
    <div class="app-content" id="content"></div>
    <nav class="bottom-nav">
      <button class="nav-item active" data-nav="dashboard">
        <span class="nav-icon">📊</span><span class="nav-label">Resumen</span>
      </button>
      <button class="nav-fab" data-nav="add" aria-label="Añadir">+</button>
      <button class="nav-item" data-nav="history">
        <span class="nav-icon">📋</span><span class="nav-label">Historial</span>
      </button>
    </nav>`;

  qs('#btn-prev').addEventListener('click', () => {
    state.month = prevMonth(state.month);
    qs('#month-label').textContent = formatMonthLabel(state.month);
    subscribeTransactions();
  });
  qs('#btn-next').addEventListener('click', () => {
    if (state.month >= getMonthKey(new Date())) return;
    state.month = nextMonth(state.month);
    qs('#month-label').textContent = formatMonthLabel(state.month);
    subscribeTransactions();
  });
  qs('#btn-logout').addEventListener('click', async () => {
    if (confirm('¿Cerrar sesión?')) { await signOut(auth); }
  });
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.nav));
  });
}

// ═══════════════════════════════
// RENDER: DASHBOARD
// ═══════════════════════════════
function renderDashboard() {
  const content = qs('#content');
  if (!content) return;
  const acc  = state.dashAccount;
  const txs  = state.transactions;
  const sumP = calcSummary(txs,'personal');
  const cats = calcCategoryTotals(txs, acc);
  const recent = txs.filter(t=>acc==='all'||t.account===acc).slice(0,6);

  // Saldo card
  const saldoHtml = `
    <div class="saldo-card" id="saldo-card">
      <div class="saldo-left">
        <div class="saldo-label">💰 Saldo en cuenta</div>
        <div class="saldo-value">${state.saldo!==null ? formatEur(state.saldo) : '—'}</div>
      </div>
      <button class="saldo-edit-btn" id="btn-edit-saldo">✏️ Actualizar</button>
    </div>`;

  // Balance card
  let balanceHtml = '';
  if (acc==='personal') {
    const sign = sumP.balance>=0?'pos':'neg';
    balanceHtml = `
      <div class="balance-card">
        <div class="balance-label">Balance calculado del mes</div>
        <div class="balance-amount ${sign}">${sumP.balance<0?'-':''}${formatEur(Math.abs(sumP.balance))}</div>
        <div class="balance-row">
          <div class="balance-stat">
            <div class="balance-stat-label">Ingresos</div>
            <div class="balance-stat-value pos">+${formatEur(sumP.ingresos)}</div>
          </div>
          <div class="balance-stat">
            <div class="balance-stat-label">Gastos</div>
            <div class="balance-stat-value neg">-${formatEur(sumP.gastos)}</div>
          </div>
        </div>
      </div>`;
  } else {
    const sumM = calcSummary(txs,'madre');
    balanceHtml = `
      <div class="balance-card">
        <div class="balance-label">Tarjeta Mamá · Gastado este mes</div>
        <div class="balance-amount neutral">${formatEur(sumM.gastos)}</div>
        <div class="madre-note">💜 Estos gastos no van contra tu cuenta personal.</div>
      </div>`;
  }

  const catsHtml = cats.length
    ? cats.map(c=>`
        <div class="category-item">
          <div class="category-icon" style="background:${c.bg}">${c.icon}</div>
          <div class="category-info">
            <div class="category-name">${c.label}</div>
            <div class="category-bar-wrap"><div class="category-bar" style="width:${c.pct}%;background:${c.bar}"></div></div>
          </div>
          <div class="category-amount">${formatEur(c.total)}</div>
        </div>`).join('')
    : '<div style="padding:16px;color:var(--text2);text-align:center;font-size:14px">Sin gastos este mes</div>';

  const recentHtml = recent.length
    ? recent.map(t=>txItemHtml(t)).join('')
    : '<div style="padding:16px;color:var(--text2);text-align:center;font-size:14px">Sin transacciones aún</div>';

  content.innerHTML = `
    <div class="account-tabs">
      <button class="account-tab ${acc==='personal'?'active-personal':''}" data-acc="personal">Mi Cuenta</button>
      <button class="account-tab ${acc==='madre'?'active-madre':''}" data-acc="madre">Tarjeta Mamá</button>
    </div>
    ${acc==='personal' ? saldoHtml : ''}
    ${balanceHtml}
    <div class="section">
      <div class="section-header"><span class="section-title">Gastos por categoría</span></div>
      <div class="category-list">${catsHtml}</div>
    </div>
    <div class="section">
      <div class="section-header">
        <span class="section-title">Últimas transacciones</span>
        <button class="section-link" data-nav="history">Ver todas</button>
      </div>
      <div class="tx-group">${recentHtml}</div>
    </div>`;

  content.querySelectorAll('[data-acc]').forEach(b=>
    b.addEventListener('click', ()=>{ state.dashAccount=b.dataset.acc; renderDashboard(); })
  );
  content.querySelectorAll('[data-nav]').forEach(b=>
    b.addEventListener('click', ()=>navigate(b.dataset.nav))
  );
  content.querySelectorAll('[data-del]').forEach(b=>
    b.addEventListener('click', async()=>{
      if (confirm('¿Eliminar esta transacción?')) {
        await deleteTx(b.dataset.del); showToast('Eliminado','success');
      }
    })
  );

  // Saldo edit button
  const editBtn = qs('#btn-edit-saldo');
  if (editBtn) {
    editBtn.addEventListener('click', ()=> showSaldoModal());
  }
}

// Saldo modal (simple prompt-style UI)
function showSaldoModal() {
  // Create overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px`;
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:20px;padding:28px 24px;width:100%;max-width:340px">
      <h3 style="font-size:20px;font-weight:700;margin-bottom:8px">💰 Saldo en cuenta</h3>
      <p style="color:var(--text2);font-size:14px;margin-bottom:20px;line-height:1.4">Introduce el saldo real que tienes ahora mismo en tu cuenta bancaria.</p>
      <div style="display:flex;align-items:center;gap:8px;background:var(--surface2);border-radius:12px;padding:14px 16px;margin-bottom:20px">
        <span style="font-size:22px;color:var(--text2)">€</span>
        <input id="saldo-input" type="number" inputmode="decimal" step="0.01" placeholder="0,00"
          value="${state.saldo!==null?state.saldo:''}"
          style="flex:1;font-size:28px;font-weight:700;background:none;border:none;outline:none;color:var(--text)">
      </div>
      <div style="display:flex;gap:10px">
        <button id="saldo-cancel" style="flex:1;padding:14px;border-radius:12px;background:var(--surface2);color:var(--text2);font-size:15px;font-weight:600;border:none;cursor:pointer">Cancelar</button>
        <button id="saldo-save" style="flex:2;padding:14px;border-radius:12px;background:var(--accent);color:#fff;font-size:15px;font-weight:700;border:none;cursor:pointer">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const input = qs('#saldo-input', overlay);
  input.focus();
  input.select();

  qs('#saldo-cancel', overlay).addEventListener('click', ()=> overlay.remove());
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); });
  qs('#saldo-save', overlay).addEventListener('click', async()=>{
    const val = parseFloat(input.value);
    if (isNaN(val)) { showToast('Introduce un importe válido','error'); return; }
    qs('#saldo-save', overlay).textContent = 'Guardando…';
    await saveSaldo(val);
    overlay.remove();
    showToast('Saldo actualizado ✓','success');
    renderDashboard();
  });
}

// ═══════════════════════════════
// RENDER: HISTORY
// ═══════════════════════════════
function renderHistory() {
  const content = qs('#content');
  if (!content) return;
  const f   = state.histFilter;
  const txs = state.transactions.filter(t=>f==='all'||t.account===f);
  const groups = {};
  txs.forEach(t=>{
    const key = formatDateGroup(t.date);
    if (!groups[key]) groups[key]=[];
    groups[key].push(t);
  });
  const groupsHtml = Object.entries(groups).map(([date,items])=>`
    <div class="tx-group">
      <div class="tx-date">${date}</div>
      ${items.map(t=>txItemHtml(t)).join('')}
    </div>`).join('');

  content.innerHTML = `
    <div class="history-filters">
      <button class="filter-pill ${f==='all'?'active':''}" data-f="all">Todas</button>
      <button class="filter-pill ${f==='personal'?'active':''}" data-f="personal">Mi Cuenta</button>
      <button class="filter-pill ${f==='madre'?'active':''}" data-f="madre">Tarjeta Mamá</button>
    </div>
    ${txs.length ? groupsHtml : `<div class="empty"><div class="empty-icon">🔍</div><h3>Sin registros</h3><p>No hay transacciones con este filtro en ${formatMonthLabel(state.month)}.</p></div>`}`;

  content.querySelectorAll('[data-f]').forEach(b=>
    b.addEventListener('click',()=>{ state.histFilter=b.dataset.f; renderHistory(); })
  );
  content.querySelectorAll('[data-del]').forEach(b=>
    b.addEventListener('click',async()=>{
      if (confirm('¿Eliminar esta transacción?')) {
        await deleteTx(b.dataset.del); showToast('Eliminado','success');
      }
    })
  );
}

function txItemHtml(t) {
  const cat  = getCat(t.category, t.type);
  const sign = t.type==='ingreso'?'+':'-';
  const cls  = t.type==='ingreso'?'pos':'neg';
  const badge = t.account==='madre'
    ? '<span class="tx-badge badge-madre">Mamá</span>'
    : '<span class="tx-badge badge-personal">Personal</span>';
  return `
    <div class="tx-item">
      <div class="tx-icon" style="background:${cat.bg}">${cat.icon}</div>
      <div class="tx-info">
        <div class="tx-concept">${t.concept||cat.label}</div>
        <div class="tx-meta"><span class="tx-cat">${cat.label}</span>${badge}</div>
      </div>
      <div class="tx-right">
        <span class="tx-amount ${cls}">${sign}${formatEur(t.amount)}</span>
        <button class="tx-del" data-del="${t.id}">Eliminar</button>
      </div>
    </div>`;
}

// ═══════════════════════════════
// RENDER: ADD FORM
// ═══════════════════════════════
function renderAdd() {
  const content = qs('#content');
  if (!content) return;
  const type = state.addType;
  const acc  = state.addAccount;
  const cats = type==='gasto' ? CATS_GASTO : CATS_INGRESO;
  const today = new Date().toISOString().split('T')[0];
  const dateVal = state.addDate || today;

  const accHtml = type==='gasto' ? `
    <div class="form-field">
      <div class="form-label">¿Con qué cuenta?</div>
      <div class="account-select">
        <button class="acct-btn ${acc==='personal'?'active-personal':''}" data-acct="personal">💳 Mi Cuenta</button>
        <button class="acct-btn ${acc==='madre'?'active-madre':''}" data-acct="madre">💜 Tarjeta Mamá</button>
      </div>
    </div>` : '';

  const catsHtml = cats.map(c=>`
    <div class="cat-option ${state.addCategory===c.id?'selected':''}" data-cat="${c.id}">
      <span class="icon">${c.icon}</span>
      <span class="label">${c.label}</span>
    </div>`).join('');

  content.innerHTML = `
    <div class="add-screen">
      <div class="add-header">
        <h2>Nueva transacción</h2>
        <button class="add-cancel" data-nav="dashboard">Cancelar</button>
      </div>
      <div class="add-body">
        <div class="type-toggle">
          <button class="type-btn ${type==='gasto'?'active-gasto':''}" data-type="gasto">− Gasto</button>
          <button class="type-btn ${type==='ingreso'?'active-ingreso':''}" data-type="ingreso">+ Ingreso</button>
        </div>
        ${accHtml}
        <div class="amount-wrap">
          <span class="amount-currency">€</span>
          <input class="amount-input" id="inp-amount" type="number" inputmode="decimal"
            placeholder="0,00" min="0" step="0.01" value="${state.addAmount}">
        </div>
        <div class="form-field">
          <div class="form-label">Concepto (opcional)</div>
          <input class="form-input" id="inp-concept" type="text"
            placeholder="Ej: Cena con amigos" value="${state.addConcept}">
        </div>
        <div class="form-field">
          <div class="form-label">Categoría</div>
          <div class="cat-grid">${catsHtml}</div>
        </div>
        <div class="form-field">
          <div class="form-label">Fecha</div>
          <input class="form-input" id="inp-date" type="date" value="${dateVal}">
        </div>
        <button class="btn-submit" id="btn-save">Guardar transacción</button>
      </div>
    </div>`;

  // ── Type toggle (save inputs first, then re-render) ──
  content.querySelectorAll('[data-type]').forEach(b=>
    b.addEventListener('click',()=>{
      saveFormInputs();
      state.addType    = b.dataset.type;
      state.addAccount = 'personal';
      state.addCategory = '';
      renderAdd();
    })
  );

  // ── Account toggle (save inputs first, then re-render) ──
  content.querySelectorAll('[data-acct]').forEach(b=>
    b.addEventListener('click',()=>{
      saveFormInputs();
      state.addAccount = b.dataset.acct;
      renderAdd();
    })
  );

  // ── Category: ONLY toggle CSS class, NO re-render ──
  content.querySelectorAll('[data-cat]').forEach(b=>
    b.addEventListener('click',()=>{
      state.addCategory = b.dataset.cat;
      content.querySelectorAll('[data-cat]').forEach(btn=>{
        btn.classList.toggle('selected', btn.dataset.cat===state.addCategory);
      });
    })
  );

  // ── Cancel ──
  content.querySelectorAll('[data-nav]').forEach(b=>
    b.addEventListener('click',()=>{
      // Reset form state
      state.addAmount=''; state.addConcept=''; state.addDate='';
      state.addCategory=''; state.addType='gasto'; state.addAccount='personal';
      navigate(b.dataset.nav);
    })
  );

  // ── Save ──
  qs('#btn-save').addEventListener('click', async()=>{
    const amount  = parseFloat(qs('#inp-amount').value);
    const concept = qs('#inp-concept').value.trim();
    const dateVal = qs('#inp-date').value;

    if (!amount || amount<=0)  { showToast('Indica un importe válido','error'); return; }
    if (!state.addCategory)    { showToast('Selecciona una categoría','error'); return; }
    if (!dateVal)              { showToast('Indica una fecha','error'); return; }

    const btn = qs('#btn-save');
    btn.disabled=true; btn.textContent='Guardando…';

    try {
      await saveTransaction({
        type:     state.addType,
        account:  state.addType==='ingreso' ? 'personal' : state.addAccount,
        category: state.addCategory,
        amount:   Math.round(amount*100)/100,
        concept,
        date: new Date(dateVal+'T12:00:00'),
      });
      // Reset form state
      state.addAmount=''; state.addConcept=''; state.addDate='';
      state.addCategory=''; state.addType='gasto'; state.addAccount='personal';
      showToast('✓ Guardado','success');
      navigate('dashboard');
    } catch(e) {
      console.error(e);
      showToast('Error al guardar: '+e.message,'error');
      btn.disabled=false; btn.textContent='Guardar transacción';
    }
  });
}

// ═══════════════════════════════
// NAVIGATION
// ═══════════════════════════════
function navigate(view) {
  state.view = view;
  document.querySelectorAll('.nav-item').forEach(item=>{
    item.classList.toggle('active', item.dataset.nav===view);
  });
  if (view==='dashboard') renderDashboard();
  if (view==='history')   renderHistory();
  if (view==='add')       renderAdd();
}

// ═══════════════════════════════
// INIT
// ═══════════════════════════════
function init() {
  onAuthStateChanged(auth, async user=>{
    state.user = user;
    if (!user) {
      if (state.unsub) { state.unsub(); state.unsub=null; }
      renderLogin();
      return;
    }
    renderShell();
    await loadSaldo();
    subscribeTransactions();
    renderDashboard();
  });
}

init();
