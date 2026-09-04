import { db, auth } from './firebase-config.js';
import {
  collection, addDoc, deleteDoc, doc, onSnapshot,
  query, where, serverTimestamp, setDoc, getDoc, getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ─────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────
const CATS_GASTO = [
  { id:'fijos',        label:'Gastos Fijos',  icon:'🏠', bar:'#ff6b35', bg:'rgba(255,107,53,.15)' },
  { id:'ocio',         label:'Ocio',          icon:'🎉', bar:'#ffe66d', bg:'rgba(255,230,109,.15)' },
  { id:'viajes',       label:'Viajes',        icon:'✈️',  bar:'#4ecdc4', bg:'rgba(78,205,196,.15)' },
  { id:'ropa',         label:'Ropa',          icon:'👕', bar:'#95e1d3', bg:'rgba(149,225,211,.15)' },
  { id:'comida',       label:'Comida',        icon:'🍔', bar:'#f8b500', bg:'rgba(248,181,0,.15)' },
  { id:'inversion',    label:'Inversión',     icon:'📈', bar:'#34c759', bg:'rgba(52,199,89,.15)' },
  { id:'transporte',   label:'Transporte',    icon:'🚗', bar:'#007aff', bg:'rgba(0,122,255,.15)' },
  { id:'alimentacion', label:'Alimentación',  icon:'🛒', bar:'#c77dff', bg:'rgba(199,125,255,.15)' },
  { id:'salud',        label:'Salud',         icon:'❤️',  bar:'#ff6464', bg:'rgba(255,100,100,.15)' },
  { id:'gasolina',     label:'Gasolina',      icon:'⛽', bar:'#ffb347', bg:'rgba(255,179,71,.15)' },
  { id:'educacion',    label:'Educación',     icon:'📚', bar:'#87ceeb', bg:'rgba(135,206,235,.15)' },
  { id:'otros',        label:'Otros',         icon:'💰', bar:'#dda0dd', bg:'rgba(221,160,221,.15)' },
];
const CATS_INGRESO = [
  { id:'nomina',   label:'Nómina',   icon:'💼', bar:'#34c759', bg:'rgba(52,199,89,.15)' },
  { id:'bizum',    label:'Bizum',    icon:'📲', bar:'#4ecdc4', bg:'rgba(78,205,196,.15)' },
  { id:'apuestas', label:'Apuestas', icon:'🎰', bar:'#ffe66d', bg:'rgba(255,230,109,.15)' },
  { id:'otros',    label:'Otros',    icon:'💰', bar:'#dda0dd', bg:'rgba(221,160,221,.15)' },
];
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ─────────────────────────────────────
// STATE
// ─────────────────────────────────────
const state = {
  user:null, view:'dashboard', dashAccount:'personal', histFilter:'all',
  month: getMonthKey(new Date()),
  transactions:[], unsub:null,
  saldo:null,           // raw saldo entered by user (for current month)
  addType:'gasto', addAccount:'personal',
  addCategory:'', addAmount:'', addConcept:'', addDate:'',
};

// ─────────────────────────────────────
// UTILS
// ─────────────────────────────────────
function getMonthKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function parseMonthKey(k){ const [y,m]=k.split('-'); return new Date(+y,+m-1,1); }
function formatMonthLabel(k){ const d=parseMonthKey(k); return `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`; }
function formatMonthShort(k){ const d=parseMonthKey(k); return MONTHS_ES[d.getMonth()].slice(0,3); }
function prevMonth(k){ const d=parseMonthKey(k); d.setMonth(d.getMonth()-1); return getMonthKey(d); }
function nextMonth(k){ const d=parseMonthKey(k); d.setMonth(d.getMonth()+1); return getMonthKey(d); }
function formatEur(n, compact=false){
  if(compact && Math.abs(n)>=1000) return (n/1000).toFixed(1)+'k€';
  return new Intl.NumberFormat('es-ES',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)+' €';
}
function formatDateGroup(ts){
  if(!ts) return '';
  const d=ts.toDate?ts.toDate():new Date(ts);
  const today=new Date(); today.setHours(0,0,0,0);
  const day=new Date(d); day.setHours(0,0,0,0);
  if(day.getTime()===today.getTime()) return 'Hoy';
  if(day.getTime()===today.getTime()-86400000) return 'Ayer';
  return d.toLocaleDateString('es-ES',{weekday:'long',day:'numeric',month:'long'});
}
function getCat(id,type){
  const list=type==='ingreso'?CATS_INGRESO:CATS_GASTO;
  return list.find(c=>c.id===id)||{id:'otros',label:'Otros',icon:'💰',bar:'#aaa',bg:'rgba(0,0,0,.15)'};
}
function showToast(msg,type=''){
  const el=document.getElementById('toast');
  el.textContent=msg; el.className=`toast show ${type}`;
  setTimeout(()=>{ el.className='toast'; },2500);
}
function qs(s,c=document){ return c.querySelector(s); }

// ─────────────────────────────────────
// FIRESTORE — TRANSACTIONS
// ─────────────────────────────────────
function subscribeTransactions(){
  if(state.unsub) state.unsub();
  if(!state.user) return;
  // No orderBy → no composite index needed
  const q=query(collection(db,'users',state.user.uid,'transactions'),
    where('month','==',state.month));
  state.unsub=onSnapshot(q, snap=>{
    state.transactions=snap.docs.map(d=>({id:d.id,...d.data()}))
      .sort((a,b)=>(b.date?.toDate?.()?.getTime()||0)-(a.date?.toDate?.()?.getTime()||0));
    if(state.view==='dashboard') renderDashboard();
    if(state.view==='history')   renderHistory();
    if(state.view==='charts')    renderCharts();
  }, err=>console.warn('Firestore:',err.message));
}

async function saveTransaction(data){
  await addDoc(collection(db,'users',state.user.uid,'transactions'),
    {...data, month:state.month, createdAt:serverTimestamp()});
}
async function deleteTx(id){
  await deleteDoc(doc(db,'users',state.user.uid,'transactions',id));
}
async function loadSaldo(){
  try{
    const snap=await getDoc(doc(db,'users',state.user.uid,'config','saldo'));
    if(snap.exists()) state.saldo=snap.data().amount;
  }catch(e){}
}
async function saveSaldo(amount){
  await setDoc(doc(db,'users',state.user.uid,'config','saldo'),
    {amount, updatedAt:serverTimestamp()});
  state.saldo=amount;
}

// ─────────────────────────────────────
// SALDO ESTIMADO POR MES
// Si el usuario tiene €870 ahora (sep) y gastó €27 en sep,
// en agosto tenía €870 + €27 = €897
// Fórmula: saldo_mes_M = saldo_actual + Σ(gastos-ingresos) de meses M+1..ahora
// ─────────────────────────────────────
async function calcSaldoForMonth(targetMonth){
  if(state.saldo===null) return null;
  const currentMonth=getMonthKey(new Date());
  if(targetMonth>=currentMonth) return state.saldo;

  // Collect months between targetMonth (exclusive) and currentMonth (inclusive)
  const months=[];
  let m=nextMonth(targetMonth);
  while(m<=currentMonth){ months.push(m); m=nextMonth(m); }

  let adjusted=state.saldo;
  await Promise.all(months.map(async mo=>{
    const snap=await getDocs(query(
      collection(db,'users',state.user.uid,'transactions'),
      where('month','==',mo)
    ));
    snap.docs.forEach(d=>{
      const t=d.data();
      if(t.account!=='personal') return;
      if(t.type==='gasto')    adjusted+=t.amount;   // se había gastado → antes tenía más
      if(t.type==='ingreso')  adjusted-=t.amount;   // había ingresado → antes tenía menos
    });
  }));
  return adjusted;
}

// ─────────────────────────────────────
// CALCULATIONS
// ─────────────────────────────────────
function calcSummary(txs,account){
  const f=account==='all'?txs:txs.filter(t=>t.account===account);
  const ingresos=f.filter(t=>t.type==='ingreso').reduce((s,t)=>s+t.amount,0);
  const gastos  =f.filter(t=>t.type==='gasto').reduce((s,t)=>s+t.amount,0);
  return {ingresos,gastos,balance:ingresos-gastos};
}
function calcCategoryTotals(txs,account){
  const f=txs.filter(t=>t.type==='gasto'&&(account==='all'||t.account===account));
  const map={};
  f.forEach(t=>{map[t.category]=(map[t.category]||0)+t.amount;});
  const total=Object.values(map).reduce((s,v)=>s+v,0)||1;
  return Object.entries(map).sort((a,b)=>b[1]-a[1])
    .map(([id,v])=>({...getCat(id,'gasto'),total:v,pct:v/total*100}));
}

// ─────────────────────────────────────
// SVG CHARTS
// ─────────────────────────────────────
function svgDonut(cats){
  const total=cats.reduce((s,c)=>s+c.total,0);
  if(!total) return `<div style="text-align:center;color:var(--text2);padding:40px 0;font-size:14px">Sin gastos este mes</div>`;
  const r=72,cx=100,cy=100,C=2*Math.PI*r;
  let cum=0;
  const segs=cats.slice(0,9).map(c=>{
    const dash=c.pct/100*C, offset=C-cum;
    cum+=dash;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${c.bar}" stroke-width="28"
      stroke-dasharray="${dash} ${C-dash}" stroke-dashoffset="${offset}"
      transform="rotate(-90 ${cx} ${cy})"/>`;
  }).join('');
  return `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" style="width:170px;height:170px;display:block;margin:0 auto">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--surface3)" stroke-width="28"/>
    ${segs}
    <text x="100" y="94" text-anchor="middle" fill="var(--text2)" font-size="11" font-family="-apple-system,sans-serif">Gastos</text>
    <text x="100" y="114" text-anchor="middle" fill="white" font-size="14" font-weight="700" font-family="-apple-system,sans-serif">${formatEur(total,true)}</text>
  </svg>`;
}

function svgBars(months){
  const W=320,H=175,pL=44,pR=8,pT=14,pB=30;
  const cW=W-pL-pR,cH=H-pT-pB;
  const maxVal=Math.max(...months.flatMap(m=>[m.ingresos,m.gastos]),50);
  const n=months.length,slot=cW/n,bW=slot*0.27;
  const yTicks=[0,.25,.5,.75,1].map(f=>{
    const y=pT+cH*(1-f), val=maxVal*f;
    return `<line x1="${pL}" y1="${y}" x2="${W-pR}" y2="${y}" stroke="#1e1e28" stroke-width="1"/>
      <text x="${pL-5}" y="${y+4}" text-anchor="end" fill="var(--text3)" font-size="8" font-family="-apple-system,sans-serif">${formatEur(val,true).replace(' €','').replace(',00','')}</text>`;
  }).join('');
  const bars=months.map((m,i)=>{
    const x=pL+i*slot+slot*0.07;
    const iH=Math.max((m.ingresos/maxVal)*cH,m.ingresos?2:0);
    const gH=Math.max((m.gastos/maxVal)*cH,m.gastos?2:0);
    return `<rect x="${x}" y="${pT+cH-iH}" width="${bW}" height="${iH}" fill="var(--pos)" rx="3" opacity=".85"/>
      <rect x="${x+bW+3}" y="${pT+cH-gH}" width="${bW}" height="${gH}" fill="var(--neg)" rx="3" opacity=".85"/>
      <text x="${x+bW+1.5}" y="${H-pB+12}" text-anchor="middle" fill="var(--text2)" font-size="8.5" font-family="-apple-system,sans-serif">${formatMonthShort(m.month)}</text>`;
  }).join('');
  const legend=`<rect x="${pL}" y="${H-pB+20}" width="8" height="8" fill="var(--pos)" rx="2"/>
    <text x="${pL+12}" y="${H-pB+27}" fill="var(--text2)" font-size="9" font-family="-apple-system,sans-serif">Ingresos</text>
    <rect x="${pL+68}" y="${H-pB+20}" width="8" height="8" fill="var(--neg)" rx="2"/>
    <text x="${pL+80}" y="${H-pB+27}" fill="var(--text2)" font-size="9" font-family="-apple-system,sans-serif">Gastos</text>`;
  return `<svg viewBox="0 0 ${W} ${H+14}" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">
    ${yTicks}${bars}${legend}
    <line x1="${pL}" y1="${pT}" x2="${pL}" y2="${pT+cH}" stroke="var(--border)" stroke-width="1"/>
    <line x1="${pL}" y1="${pT+cH}" x2="${W-pR}" y2="${pT+cH}" stroke="var(--border)" stroke-width="1"/>
  </svg>`;
}

// ─────────────────────────────────────
// RENDER: LOGIN
// ─────────────────────────────────────
function renderLogin(){
  qs('#app').innerHTML=`
    <div class="login-screen">
      <div class="login-logo">💸</div>
      <div class="login-title"><h1>KikoGastos</h1><p>Tu control financiero personal</p></div>
      <button class="btn-google" id="btn-login">
        <svg viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        Entrar con Google
      </button>
    </div>`;
  qs('#btn-login').addEventListener('click',async()=>{
    const btn=qs('#btn-login');
    btn.disabled=true; btn.textContent='Conectando…';
    try{ await signInWithPopup(auth,new GoogleAuthProvider()); }
    catch(e){
      btn.disabled=false; btn.textContent='Entrar con Google';
      if(e.code!=='auth/popup-closed-by-user') showToast('Error: '+e.code,'error');
    }
  });
}

// ─────────────────────────────────────
// RENDER: SHELL
// ─────────────────────────────────────
function renderShell(){
  qs('#app').innerHTML=`
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
      <button class="nav-item ${state.view==='dashboard'?'active':''}" data-nav="dashboard">
        <span class="nav-icon">📊</span><span class="nav-label">Resumen</span>
      </button>
      <button class="nav-item ${state.view==='charts'?'active':''}" data-nav="charts">
        <span class="nav-icon">📈</span><span class="nav-label">Gráficas</span>
      </button>
      <button class="nav-fab" data-nav="add">+</button>
      <button class="nav-item ${state.view==='history'?'active':''}" data-nav="history">
        <span class="nav-icon">📋</span><span class="nav-label">Historial</span>
      </button>
    </nav>`;

  function changeMonth(newMonth){
    state.month=newMonth;
    const lbl=qs('#month-label'); if(lbl) lbl.textContent=formatMonthLabel(state.month);
    state.transactions=[];
    if(state.view==='dashboard') renderDashboard();
    if(state.view==='history')   renderHistory();
    if(state.view==='charts')    renderCharts();
    subscribeTransactions();
  }
  qs('#btn-prev').addEventListener('click',()=>changeMonth(prevMonth(state.month)));
  qs('#btn-next').addEventListener('click',()=>{
    if(state.month>=getMonthKey(new Date())) return;
    changeMonth(nextMonth(state.month));
  });
  qs('#btn-logout').addEventListener('click',async()=>{ if(confirm('¿Cerrar sesión?')) await signOut(auth); });
  document.querySelectorAll('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.nav)));
}

// ─────────────────────────────────────
// RENDER: DASHBOARD
// ─────────────────────────────────────
async function renderDashboard(){
  const content=qs('#content'); if(!content) return;
  const acc=state.dashAccount, txs=state.transactions;
  const sumP=calcSummary(txs,'personal');
  const sumM=calcSummary(txs,'madre');
  const cats=calcCategoryTotals(txs,acc);
  const recent=txs.filter(t=>acc==='all'||t.account===acc).slice(0,5);
  const isCurrentMonth=state.month>=getMonthKey(new Date());

  // Saldo hero card
  let heroHtml='';
  if(acc==='personal'){
    // Async: calculate saldo for this month
    const saldoMes=await calcSaldoForMonth(state.month);
    const saldoDisplay=saldoMes!==null ? formatEur(saldoMes) : (state.saldo!==null?formatEur(state.saldo):'—');
    const saldoNote=saldoMes===null?'Toca "Editar" para introducir tu saldo actual'
      :isCurrentMonth?`Saldo actual · Toca Editar para actualizar`
      :`Estimado para ${formatMonthLabel(state.month)} · basado en tu saldo de ${formatMonthLabel(getMonthKey(new Date()))}`;
    const balSign=sumP.balance>=0?'+':'-';
    const balCls=sumP.balance>=0?'pos':'neg';
    heroHtml=`
      <div class="hero-card">
        <div class="hero-label">💰 Saldo en cuenta</div>
        <div class="hero-saldo">${saldoDisplay}</div>
        <div class="hero-saldo-note">${saldoNote}</div>
        <button class="hero-edit-btn" id="btn-edit-saldo">✏️ Editar</button>
        <div class="hero-stats">
          <div class="hero-stat">
            <div class="hero-stat-label">Ingresos</div>
            <div class="hero-stat-val pos">+${formatEur(sumP.ingresos,true)}</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-label">Gastos</div>
            <div class="hero-stat-val neg">-${formatEur(sumP.gastos,true)}</div>
          </div>
          <div class="hero-stat">
            <div class="hero-stat-label">Balance</div>
            <div class="hero-stat-val ${balCls}">${balSign}${formatEur(Math.abs(sumP.balance),true)}</div>
          </div>
        </div>
      </div>`;
  } else {
    heroHtml=`
      <div class="balance-card">
        <div class="balance-label">Tarjeta Mamá · ${formatMonthLabel(state.month)}</div>
        <div class="balance-amount neutral">${formatEur(sumM.gastos)}</div>
        <div class="madre-note">💜 Estos gastos no van contra tu cuenta personal.</div>
      </div>`;
  }

  const catsHtml=cats.length?cats.map(c=>`
    <div class="category-item">
      <div class="category-icon" style="background:${c.bg}">${c.icon}</div>
      <div class="category-info">
        <div class="category-name">${c.label}</div>
        <div class="category-bar-wrap"><div class="category-bar" style="width:${c.pct}%;background:${c.bar}"></div></div>
      </div>
      <div class="category-amount">${formatEur(c.total,true)}</div>
    </div>`).join('')
    :'<div style="padding:24px;color:var(--text2);text-align:center;font-size:14px">Sin gastos en este mes</div>';

  const recentHtml=recent.length?recent.map(t=>txItemHtml(t)).join('')
    :'<div style="padding:24px;color:var(--text2);text-align:center;font-size:14px">Sin transacciones aún</div>';

  content.innerHTML=`
    <div class="account-tabs">
      <button class="account-tab ${acc==='personal'?'active-personal':''}" data-acc="personal">Mi Cuenta</button>
      <button class="account-tab ${acc==='madre'?'active-madre':''}" data-acc="madre">Tarjeta Mamá</button>
    </div>
    ${heroHtml}
    <div class="section">
      <div class="section-header"><span class="section-title">Por categoría</span></div>
      <div class="category-list">${catsHtml}</div>
    </div>
    <div class="section">
      <div class="section-header">
        <span class="section-title">Últimas transacciones</span>
        <button class="section-link" data-nav="history">Ver todas</button>
      </div>
      <div class="tx-group">${recentHtml}</div>
    </div>`;

  content.querySelectorAll('[data-acc]').forEach(b=>b.addEventListener('click',()=>{state.dashAccount=b.dataset.acc;renderDashboard();}));
  content.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.nav)));
  content.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async()=>{
    if(confirm('¿Eliminar?')){ await deleteTx(b.dataset.del); showToast('Eliminado','success'); }
  }));
  const eb=qs('#btn-edit-saldo'); if(eb) eb.addEventListener('click',showSaldoModal);
}

function showSaldoModal(){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:200;display:flex;align-items:center;justify-content:center;padding:24px';
  overlay.innerHTML=`
    <div style="background:var(--surface);border-radius:24px;padding:28px 24px;width:100%;max-width:340px;border:1px solid var(--border)">
      <h3 style="font-size:22px;font-weight:800;margin-bottom:8px">💰 Saldo actual</h3>
      <p style="color:var(--text2);font-size:14px;margin-bottom:20px;line-height:1.5">
        Introduce lo que tienes ahora en el banco. La app calculará automáticamente el saldo de meses anteriores.
      </p>
      <div style="display:flex;align-items:center;gap:8px;background:var(--surface2);border-radius:14px;padding:14px 16px;margin-bottom:20px;border:1.5px solid var(--border)">
        <span style="font-size:24px;color:var(--text2)">€</span>
        <input id="saldo-input" type="number" inputmode="decimal" step="0.01" placeholder="0,00"
          value="${state.saldo!==null?state.saldo:''}"
          style="flex:1;font-size:32px;font-weight:800;background:none;border:none;outline:none;color:var(--text);letter-spacing:-1px">
      </div>
      <div style="display:flex;gap:10px">
        <button id="saldo-cancel" style="flex:1;padding:15px;border-radius:14px;background:var(--surface2);color:var(--text2);font-size:15px;font-weight:600;border:none;cursor:pointer">Cancelar</button>
        <button id="saldo-save" style="flex:2;padding:15px;border-radius:14px;background:linear-gradient(135deg,#ff6b35,#ff9a56);color:#fff;font-size:15px;font-weight:700;border:none;cursor:pointer">Guardar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const inp=qs('#saldo-input',overlay); inp.focus(); inp.select();
  qs('#saldo-cancel',overlay).addEventListener('click',()=>overlay.remove());
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  qs('#saldo-save',overlay).addEventListener('click',async()=>{
    const val=parseFloat(String(inp.value).replace(',','.'));
    if(isNaN(val)){showToast('Importe inválido','error');return;}
    qs('#saldo-save',overlay).textContent='Guardando…';
    await saveSaldo(val); overlay.remove();
    showToast('✓ Saldo guardado','success'); renderDashboard();
  });
}

// ─────────────────────────────────────
// RENDER: CHARTS
// ─────────────────────────────────────
async function renderCharts(){
  const content=qs('#content'); if(!content) return;
  const txs=state.transactions;
  const sumP=calcSummary(txs,'personal');
  const cats=calcCategoryTotals(txs,'personal');

  content.innerHTML=`
    <div class="charts-wrap">
      <div class="chart-card">
        <div class="chart-title">🍩 Gastos por categoría · ${formatMonthLabel(state.month)}</div>
        <div class="donut-wrap">
          ${svgDonut(cats)}
          <div class="donut-legend">
            ${cats.slice(0,8).map(c=>`
              <div class="legend-item">
                <span class="legend-dot" style="background:${c.bar}"></span>
                <span class="legend-label">${c.icon} ${c.label}</span>
                <span class="legend-pct">${c.pct.toFixed(0)}%</span>
                <span class="legend-val">${formatEur(c.total,true)}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon">💸</div>
          <div class="stat-label">Gastado este mes</div>
          <div class="stat-val neg">${formatEur(sumP.gastos,true)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">💰</div>
          <div class="stat-label">Ingresado este mes</div>
          <div class="stat-val pos">${formatEur(sumP.ingresos,true)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">${sumP.balance>=0?'📈':'📉'}</div>
          <div class="stat-label">Balance del mes</div>
          <div class="stat-val ${sumP.balance>=0?'pos':'neg'}">${formatEur(sumP.balance,true)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">🏆</div>
          <div class="stat-label">Mayor gasto</div>
          <div class="stat-val" style="font-size:14px">${cats.length?cats[0].icon+' '+cats[0].label:'—'}</div>
        </div>
      </div>

      <div class="chart-card" id="bar-card">
        <div class="chart-title">📅 Comparativa últimos 6 meses</div>
        <div class="loading"><div class="spinner"></div></div>
      </div>
    </div>`;

  // Load 6-month data async
  try{
    const now=new Date();
    const months=[];
    for(let i=5;i>=0;i--){ const d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push(getMonthKey(d)); }
    const monthly=await Promise.all(months.map(async mo=>{
      const snap=await getDocs(query(collection(db,'users',state.user.uid,'transactions'),where('month','==',mo)));
      const txs2=snap.docs.map(d=>d.data());
      const ingresos=txs2.filter(t=>t.type==='ingreso'&&t.account==='personal').reduce((s,t)=>s+t.amount,0);
      const gastos  =txs2.filter(t=>t.type==='gasto'&&t.account==='personal').reduce((s,t)=>s+t.amount,0);
      return {month:mo,ingresos,gastos,balance:ingresos-gastos};
    }));

    const barCard=qs('#bar-card');
    if(barCard && state.view==='charts'){
      barCard.innerHTML=`
        <div class="chart-title">📅 Comparativa últimos 6 meses</div>
        ${svgBars(monthly)}
        <div class="months-summary">
          ${monthly.map(m=>{
            const bc=m.balance>=0?'pos':'neg';
            return `<div class="month-row">
              <span class="month-name">${formatMonthShort(m.month)}</span>
              <span class="month-sep">·</span>
              <span class="m-ing pos">+${formatEur(m.ingresos,true)}</span>
              <span class="m-gas neg">-${formatEur(m.gastos,true)}</span>
              <span class="m-bal ${bc}">${m.balance>=0?'+':''}${formatEur(m.balance,true)}</span>
            </div>`;}).join('')}
        </div>`;
    }
  }catch(e){ console.warn('Charts load error:',e); }
}

// ─────────────────────────────────────
// RENDER: HISTORY
// ─────────────────────────────────────
function renderHistory(){
  const content=qs('#content'); if(!content) return;
  const f=state.histFilter;
  const txs=state.transactions.filter(t=>f==='all'||t.account===f);
  const groups={};
  txs.forEach(t=>{ const k=formatDateGroup(t.date); if(!groups[k])groups[k]=[]; groups[k].push(t); });
  const html=Object.entries(groups).map(([date,items])=>`
    <div class="tx-group"><div class="tx-date">${date}</div>${items.map(t=>txItemHtml(t)).join('')}</div>`).join('');
  content.innerHTML=`
    <div class="history-filters">
      <button class="filter-pill ${f==='all'?'active':''}" data-f="all">Todas</button>
      <button class="filter-pill ${f==='personal'?'active':''}" data-f="personal">Mi Cuenta</button>
      <button class="filter-pill ${f==='madre'?'active':''}" data-f="madre">Tarjeta Mamá</button>
    </div>
    ${txs.length?html:`<div class="empty"><div class="empty-icon">🔍</div><h3>Sin registros</h3><p>No hay transacciones en ${formatMonthLabel(state.month)}.</p></div>`}`;
  content.querySelectorAll('[data-f]').forEach(b=>b.addEventListener('click',()=>{state.histFilter=b.dataset.f;renderHistory();}));
  content.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',async()=>{
    if(confirm('¿Eliminar?')){ await deleteTx(b.dataset.del); showToast('Eliminado','success'); }
  }));
}

function txItemHtml(t){
  const cat=getCat(t.category,t.type);
  const sign=t.type==='ingreso'?'+':'-', cls=t.type==='ingreso'?'pos':'neg';
  const badge=t.account==='madre'?'<span class="tx-badge badge-madre">Mamá</span>':'<span class="tx-badge badge-personal">Personal</span>';
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

// ─────────────────────────────────────
// RENDER: ADD FORM
// ─────────────────────────────────────
function renderAdd(){
  const type=state.addType, acc=state.addAccount;
  const cats=type==='gasto'?CATS_GASTO:CATS_INGRESO;
  const today=new Date().toISOString().split('T')[0];
  const accHtml=type==='gasto'?`
    <div class="af-field">
      <div class="af-label">¿Con qué cuenta?</div>
      <div class="account-select">
        <button class="acct-btn ${acc==='personal'?'active-personal':''}" data-acct="personal">💳 Mi Cuenta</button>
        <button class="acct-btn ${acc==='madre'?'active-madre':''}" data-acct="madre">💜 Tarjeta Mamá</button>
      </div>
    </div>`:'';
  const catsHtml=cats.map(c=>`
    <button class="cat-option ${state.addCategory===c.id?'selected':''}" data-cat="${c.id}">
      <span class="icon">${c.icon}</span><span class="label">${c.label}</span>
    </button>`).join('');
  qs('#app').innerHTML=`
    <div class="af-page">
      <div class="af-topbar">
        <button class="af-cancel" id="af-cancel">✕ Cancelar</button>
        <span class="af-title">Nueva transacción</span>
      </div>
      <div class="af-body">
        <div class="type-toggle" style="margin-bottom:18px">
          <button class="type-btn ${type==='gasto'?'active-gasto':''}" data-type="gasto">− Gasto</button>
          <button class="type-btn ${type==='ingreso'?'active-ingreso':''}" data-type="ingreso">+ Ingreso</button>
        </div>
        ${accHtml}
        <div class="af-amount-wrap">
          <span class="af-eur">€</span>
          <input id="af-amount" class="af-amount-input" type="number" inputmode="decimal"
            placeholder="0,00" min="0" step="0.01" value="${state.addAmount}" autocomplete="off">
        </div>
        <div class="af-field">
          <div class="af-label">Concepto (opcional)</div>
          <input id="af-concept" class="form-input" type="text"
            placeholder="Ej: Cena con amigos" value="${state.addConcept}" autocomplete="off">
        </div>
        <div class="af-field">
          <div class="af-label">Categoría</div>
          <div class="cat-grid">${catsHtml}</div>
        </div>
        <div class="af-field">
          <div class="af-label">Fecha</div>
          <input id="af-date" class="form-input" type="date" value="${state.addDate||today}">
        </div>
      </div>
      <div class="af-footer">
        <p id="af-err" style="display:none;color:var(--neg);font-size:14px;font-weight:600;text-align:center;margin:0 0 10px"></p>
        <button id="af-save" class="btn-submit">Guardar transacción</button>
      </div>
    </div>`;

  qs('#af-cancel').addEventListener('click',()=>{
    state.addAmount='';state.addConcept='';state.addDate='';state.addCategory='';state.addType='gasto';state.addAccount='personal';
    backToShell('dashboard');
  });
  qs('#app').querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click',()=>{
    state.addAmount=qs('#af-amount').value; state.addConcept=qs('#af-concept').value; state.addDate=qs('#af-date').value;
    state.addType=b.dataset.type; state.addAccount='personal'; state.addCategory=''; renderAdd();
  }));
  qs('#app').querySelectorAll('[data-acct]').forEach(b=>b.addEventListener('click',()=>{
    state.addAmount=qs('#af-amount').value; state.addConcept=qs('#af-concept').value; state.addDate=qs('#af-date').value;
    state.addAccount=b.dataset.acct; renderAdd();
  }));
  qs('#app').querySelectorAll('[data-cat]').forEach(b=>b.addEventListener('click',()=>{
    state.addCategory=b.dataset.cat;
    qs('#app').querySelectorAll('[data-cat]').forEach(btn=>btn.classList.toggle('selected',btn.dataset.cat===state.addCategory));
  }));
  qs('#af-save').addEventListener('click',async()=>{
    const rawAmt=String(qs('#af-amount').value).replace(',','.');
    const amount=parseFloat(rawAmt);
    const concept=qs('#af-concept').value.trim();
    const dateVal=qs('#af-date').value||new Date().toISOString().split('T')[0];
    const showErr=msg=>{const e=qs('#af-err');e.textContent='⚠️ '+msg;e.style.display='block';};
    if(!amount||amount<=0){showErr('Introduce un importe válido');return;}
    if(!state.addCategory){showErr('Selecciona una categoría');return;}
    const btn=qs('#af-save'); btn.disabled=true; btn.textContent='Guardando…';
    try{
      await saveTransaction({
        type:state.addType,
        account:state.addType==='ingreso'?'personal':state.addAccount,
        category:state.addCategory, amount:Math.round(amount*100)/100,
        concept, date:new Date(dateVal+'T12:00:00'),
      });
      state.addAmount='';state.addConcept='';state.addDate='';state.addCategory='';state.addType='gasto';state.addAccount='personal';
      showToast('✓ Guardado','success'); backToShell('dashboard');
    }catch(e){
      console.error('Save error:',e); btn.disabled=false; btn.textContent='Guardar transacción';
      qs('#af-err').textContent='⚠️ Error al guardar. Revisa tu conexión.'; qs('#af-err').style.display='block';
    }
  });
}

// ─────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────
function backToShell(view){
  state.view=view; renderShell();
  document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.nav===view));
  if(view==='dashboard') renderDashboard();
  if(view==='history')   renderHistory();
  if(view==='charts')    renderCharts();
  subscribeTransactions();
}
function navigate(view){
  if(view==='add'){state.view='add';renderAdd();return;}
  state.view=view;
  document.querySelectorAll('.nav-item').forEach(item=>item.classList.toggle('active',item.dataset.nav===view));
  if(view==='dashboard') renderDashboard();
  if(view==='history')   renderHistory();
  if(view==='charts')    renderCharts();
}

// ─────────────────────────────────────
// INIT
// ─────────────────────────────────────
function init(){
  onAuthStateChanged(auth,async user=>{
    state.user=user;
    if(!user){ if(state.unsub){state.unsub();state.unsub=null;} renderLogin(); return; }
    renderShell(); await loadSaldo(); subscribeTransactions(); renderDashboard();
  });
}
init();
