/* ============================================================
   GymTracker — application logic (vanilla JS)
   ============================================================ */

/* ---------- Storage (per-profilo) ---------- */
const GLOBAL_KEYS = new Set(['profiles','activeProfile','fdbIndex']);
const DB = {
  _k(k){ return GLOBAL_KEYS.has(k) ? k : ('pf:'+(localStorage.getItem('activeProfile')||'default')+':'+k); },
  get(k, def){ try { const v = localStorage.getItem(this._k(k)); return v==null ? def : JSON.parse(v); } catch(e){ return def; } },
  set(k, v){ localStorage.setItem(this._k(k), JSON.stringify(v)); this._cloud(k); },
  del(k){ localStorage.removeItem(this._k(k)); this._cloud(k); },
  _cloud(k){ if(window.Cloud && Cloud.user && !GLOBAL_KEYS.has(k) && activeProfileId()===Cloud.user.uid) Cloud.push(); }
};

/* ---------- Profili ---------- */
function profiles(){ try{ return JSON.parse(localStorage.getItem('profiles')||'[]'); }catch(e){ return []; } }
function saveProfiles(list){ localStorage.setItem('profiles', JSON.stringify(list)); }
function activeProfileId(){ return localStorage.getItem('activeProfile')||'default'; }
function activeProfile(){ const list=profiles(); return list.find(p=>p.id===activeProfileId())||list[0]||{id:'default',name:'Tommy'}; }
function migrateProfiles(){
  if(localStorage.getItem('profiles')) return;
  const DATA=['activeWorkoutPlan','workoutLog','bodyMetrics','settings','progressPhotos','chatHistory','currentSession','expressMode','warmupOpen','stagnationNotified','planAgeNotified','trainReminded'];
  localStorage.setItem('activeProfile','default');
  let hadData=false;
  DATA.forEach(k=>{ const v=localStorage.getItem(k); if(v!=null){ localStorage.setItem('pf:default:'+k, v); localStorage.removeItem(k); hadData=true; } });
  let nm='Tommy'; try{ nm=JSON.parse(localStorage.getItem('pf:default:settings')||'{}').userName||'Tommy'; }catch(e){}
  saveProfiles([{id:'default', name:nm, sex:'m'}]);
  if(hadData) localStorage.setItem('pf:default:onboarded','true'); // utente esistente: niente intervista forzata
}
function switchProfile(id){ localStorage.setItem('activeProfile',id); curDayIdx=0; applyTheme(); closeSheet(); go('scheda'); toast('Profilo: '+(activeProfile().name||'')); }
function createProfile(name, sex){
  const id='p'+Date.now().toString(36); const list=profiles();
  list.push({id, name:name||'Nuovo', sex:sex||'m'}); saveProfiles(list);
  localStorage.setItem('activeProfile', id);
  const def={ userName:name||'Nuovo', email:'', planStartDate:today(), lastPlanChange:today(),
    emailjsServiceId:'', emailjsTemplateId:'', emailjsUserId:'', claudeApiKey:'', claudeModel:'claude-sonnet-4-6',
    notifyWeeks:6, trainingDays:[1,2,4,6], theme: (settingsRaw()||{}).theme||'light', sex:sex||'m' };
  localStorage.setItem(DB._k('settings'), JSON.stringify(def));
  return id;
}
function settingsRaw(){ try{ return JSON.parse(localStorage.getItem(DB._k('settings'))||'null'); }catch(e){ return null; } }

/* ============================================================
   Cloud (Firebase Auth + Firestore) — account email/password,
   dati sincronizzati per uid. Config inserita in-app.
   ============================================================ */
function parseFbConfig(t){
  t=(t||'').trim(); const m=t.match(/\{[\s\S]*\}/); if(m) t=m[0];
  try{ return JSON.parse(t); }catch(e){}
  let s=t.replace(/([{,]\s*)([A-Za-z0-9_]+)\s*:/g,'$1"$2":').replace(/'/g,'"').replace(/,(\s*[}\]])/g,'$1');
  return JSON.parse(s);
}
// Configurazione del progetto Firebase dell'app (pubblica per natura; la sicurezza è nelle regole Firestore)
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyA_ut2x-Kuua7qiqnxbAXTiwHd8l3OlUWE",
  authDomain: "gymtracker-tom.firebaseapp.com",
  projectId: "gymtracker-tom",
  storageBucket: "gymtracker-tom.firebasestorage.app",
  messagingSenderId: "749812349718",
  appId: "1:749812349718:web:c94f30c004826b21e7ae37"
};
const Cloud = {
  loaded:false, user:null, auth:null, fs:null, _t:null,
  keys:['activeWorkoutPlan','workoutLog','bodyMetrics','settings','chatHistory','bestLifts','lastKudos','expressMode','warmupOpen','onboarded'],
  config(){ try{ const ov=localStorage.getItem('firebaseConfig'); if(ov) return JSON.parse(ov); }catch(e){} return FIREBASE_CONFIG; },
  async load(){
    if(this.loaded) return true;
    const cfg=this.config(); if(!cfg) return false;
    const base='https://www.gstatic.com/firebasejs/10.12.2/';
    for(const f of ['firebase-app-compat.js','firebase-auth-compat.js','firebase-firestore-compat.js']){
      await new Promise((res,rej)=>{ const sc=document.createElement('script'); sc.src=base+f; sc.onload=res; sc.onerror=rej; document.head.appendChild(sc); });
    }
    firebase.initializeApp(cfg); this.auth=firebase.auth(); this.fs=firebase.firestore();
    this.loaded=true; return true;
  },
  async init(){
    if(!await this.load()) return;
    this.auth.onAuthStateChanged(async (u)=>{
      this.user=u||null;
      if(u){ try{ await this.pull(); }catch(e){ console.warn('pull',e); } curDayIdx=recommendedDayIdx(); go('scheda'); }
      renderAuthState();
    });
  },
  async signup(email,pass){ await this.load(); return this.auth.createUserWithEmailAndPassword(email,pass); },
  async login(email,pass){ await this.load(); return this.auth.signInWithEmailAndPassword(email,pass); },
  async logout(){ if(this.auth) await this.auth.signOut(); this.user=null; localStorage.setItem('activeProfile','default'); applyTheme(); curDayIdx=0; go('scheda'); },
  async pull(){
    const uid=this.user.uid; const prev=activeProfileId();
    let list=profiles(); if(!list.find(p=>p.id===uid)){ list.push({id:uid, name:this.user.email||'Account', sex:(settingsRaw()||{}).sex||'m', cloud:true}); saveProfiles(list); }
    const ref=this.fs.collection('users').doc(uid); const snap=await ref.get();
    if(snap.exists && snap.data().data){
      const data=snap.data().data;
      localStorage.setItem('activeProfile', uid);
      this.keys.forEach(k=>{ if(data[k]!==undefined) localStorage.setItem('pf:'+uid+':'+k, JSON.stringify(data[k])); });
    } else {
      const blob={};
      this.keys.forEach(k=>{ const v=localStorage.getItem('pf:'+prev+':'+k); if(v!=null){ localStorage.setItem('pf:'+uid+':'+k, v); try{blob[k]=JSON.parse(v);}catch(e){} } });
      localStorage.setItem('activeProfile', uid);
      await ref.set({ data:blob, email:this.user.email, updatedAt:Date.now() });
    }
    applyTheme();
  },
  push(){
    if(!this.user || !this.fs) return;
    clearTimeout(this._t);
    this._t=setTimeout(async ()=>{
      const uid=this.user.uid; const blob={};
      this.keys.forEach(k=>{ const v=localStorage.getItem('pf:'+uid+':'+k); if(v!=null){ try{blob[k]=JSON.parse(v);}catch(e){} } });
      try{ await this.fs.collection('users').doc(uid).set({ data:blob, email:this.user.email, updatedAt:Date.now() }); }catch(e){ console.warn('push',e); }
    }, 1500);
  }
};
window.Cloud = Cloud;
function renderAuthState(){ const a=$('#tabbar button.active'); if(a && a.dataset.tab==='impostazioni') VIEWS.impostazioni(); }

window.saveFbConfig=function(){
  try{ const o=parseFbConfig($('#fb-config').value); if(!o.apiKey||!o.projectId) throw new Error('mancano apiKey/projectId');
    localStorage.setItem('firebaseConfig', JSON.stringify(o)); toast('Config salvata'); Cloud.loaded=false; Cloud.init(); VIEWS.impostazioni();
  }catch(e){ alert('Configurazione non valida: '+e.message); }
};
window.fbSignup=async function(){ const e=$('#fb-email').value.trim(), p=$('#fb-pass').value;
  if(!e||!p){ alert('Inserisci email e password (min 6 caratteri)'); return; }
  try{ await Cloud.signup(e,p); toast('Account creato ✅'); }catch(err){ alert('Errore: '+err.message); } };
window.fbLogin=async function(){ const e=$('#fb-email').value.trim(), p=$('#fb-pass').value;
  try{ await Cloud.login(e,p); toast('Accesso effettuato ✅'); }catch(err){ alert('Errore: '+err.message); } };
window.fbLogout=async function(){ if(confirm('Disconnettere l\'account? I dati restano sul cloud.')){ await Cloud.logout(); toast('Disconnesso'); VIEWS.impostazioni(); } };
window.fbSyncNow=function(){ Cloud.push(); toast('Sincronizzazione avviata'); };
window.fbReset=function(){ if(confirm('Rimuovere la configurazione Firebase da questo dispositivo?')){ localStorage.removeItem('firebaseConfig'); location.reload(); } };

function ymd(d){ const x=new Date(d); x.setMinutes(x.getMinutes()-x.getTimezoneOffset()); return x.toISOString().slice(0,10); }
const today = () => ymd(new Date());
const nowISO = () => new Date().toISOString();
const $ = (s,r=document) => r.querySelector(s);
const $$ = (s,r=document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s==null?'':s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function toast(msg){
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._tm); t._tm = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* ---------- Default state bootstrap ---------- */
function settings(){
  return DB.get('settings', {
    userName:'Tommy', email:'tommy190594@gmail.com',
    planStartDate: today(), lastPlanChange: today(),
    emailjsServiceId:'', emailjsTemplateId:'', emailjsUserId:'',
    claudeApiKey:'', claudeModel:'claude-sonnet-4-6', notifyWeeks:6,
    trainingDays:[1,2,4,6], // Lun, Mar, Gio, Sab (0=Dom ... 6=Sab)
    theme:'light'
  });
}
function applyTheme(){ document.documentElement.dataset.theme = settings().theme || 'light'; }
window.setTheme = function(t){ const s=settings(); s.theme=t; saveSettings(s); applyTheme(); VIEWS.impostazioni(); };

/* ============================================================
   Onboarding interview + plan generator
   ============================================================ */
const INTERVIEW=[
  {k:'name', q:'Come ti chiami?', type:'text', ph:'Il tuo nome'},
  {k:'sex', q:'Sesso', type:'choice', opts:[['m','♂ Uomo'],['f','♀ Donna'],['x','Preferisco non dirlo']]},
  {k:'age', q:'Quanti anni hai?', type:'number', ph:'Età'},
  {k:'goal', q:'Qual è il tuo obiettivo principale?', type:'choice', opts:[['definizione','Definizione / asciutto'],['massa','Aumento massa'],['dimagrimento','Dimagrimento'],['tonificazione','Tonificazione'],['forza','Forza']]},
  {k:'place', q:'Dove ti alleni?', type:'choice', opts:[['palestra','🏋️ Palestra'],['casa','🏠 Casa'],['entrambi','Entrambi']]},
  {k:'equip', q:'Che attrezzatura hai a disposizione?', type:'multi', opts:[['Rack','Bilanciere / Rack'],['Manubri','Manubri'],['Multi-power','Multi-power / Cavi'],['Spin Bike','Spin bike'],['Elastici','Elastici'],['Corpo libero','Corpo libero']]},
  {k:'freq', q:'Quante volte a settimana vuoi allenarti?', type:'choice', opts:[['2','2 volte'],['3','3 volte'],['4','4 volte'],['5','5 volte']]},
  {k:'level', q:'Il tuo livello di esperienza', type:'choice', opts:[['Principiante','Principiante'],['Intermedio','Intermedio'],['Avanzato','Avanzato']]},
  {k:'notes', q:'Limitazioni o preferenze? (opzionale)', type:'text', ph:'Es: mal di schiena, niente salti, focus glutei...'}
];
const SPLITS={
  2:[ {type:'A',name:'Full Body A',groups:['petto','schiena','spalle','core']},
      {type:'B',name:'Full Body B',groups:['gambe','glutei','bicipiti','tricipiti']} ],
  3:[ {type:'A',name:'Spinta · Petto/Spalle/Tricipiti',groups:['petto','spalle','tricipiti']},
      {type:'B',name:'Tirata · Schiena/Bicipiti',groups:['schiena','bicipiti']},
      {type:'C',name:'Gambe & Glutei',groups:['gambe','glutei','core']} ],
  4:[ {type:'A',name:'Petto + Tricipiti',groups:['petto','tricipiti']},
      {type:'B',name:'Schiena + Bicipiti',groups:['schiena','bicipiti']},
      {type:'C',name:'Gambe + Spalle',groups:['gambe','glutei','spalle']},
      {type:'D',name:'Full Body + Core',groups:['petto','schiena','gambe','core']} ],
  5:[ {type:'A',name:'Petto + Tricipiti',groups:['petto','tricipiti']},
      {type:'B',name:'Schiena + Bicipiti',groups:['schiena','bicipiti']},
      {type:'C',name:'Gambe',groups:['gambe','core']},
      {type:'D',name:'Spalle + Braccia',groups:['spalle','bicipiti','tricipiti']},
      {type:'E',name:'Glutei + Core',groups:['glutei','gambe','core']} ]
};
function freqToDays(f){ return ({2:[1,4],3:[1,3,5],4:[1,2,4,6],5:[1,2,3,5,6]})[f]||[1,2,4,6]; }
function buildPlanFromInterview(a){
  const freq=Math.min(5,Math.max(2,+a.freq||4));
  const available=(a.equip&&a.equip.length?a.equip.slice():['Corpo libero']);
  if(!available.includes('Corpo libero')) available.push('Corpo libero');
  const female=a.sex==='f';
  const reps=({definizione:'12-15',dimagrimento:'12-15',tonificazione:'12-15',massa:'8-10',forza:'5-6'})[a.goal]||'10-12';
  const tmpl=SPLITS[freq]||SPLITS[4]; const set=new Set(available);
  const days=tmpl.map(d=>{
    let groups=d.groups.slice();
    if(female && groups.includes('gambe') && !groups.includes('glutei')) groups.unshift('glutei');
    const picks=[]; let gi=0, guard=0;
    while(picks.length<6 && guard<300){ guard++;
      const g=groups[gi%groups.length]; gi++;
      const cand=EXERCISES.find(e=>e.cat===g && e.equip.some(q=>set.has(q)) && !picks.find(p=>p.exId===e.id));
      if(cand) picks.push({exId:cand.id, sets:picks.length===0?4:3, reps});
      if(gi>groups.length*8) break;
    }
    return {type:d.type, name:d.name, muscleGroup:groups[0], exercises:picks};
  }).filter(d=>d.exercises.length);
  return {version:1, startDate:today(), days};
}

let onboardState={ i:0, ans:{} };
window.startOnboarding=function(prefill){
  onboardState={ i:0, ans: prefill? JSON.parse(JSON.stringify(prefill)) : {} };
  $('#onboard').classList.remove('hidden'); document.body.style.overflow='hidden';
  renderOnboard();
};
function closeOnboard(){ $('#onboard').classList.add('hidden'); document.body.style.overflow=''; }
function renderOnboard(){
  const step=INTERVIEW[onboardState.i]; const ans=onboardState.ans; const v=ans[step.k];
  const total=INTERVIEW.length;
  let body='';
  if(step.type==='choice'){
    body=step.opts.map(([val,lbl])=>`<button class="ob-opt ${v===val?'on':''}" onclick="obChoose('${step.k}','${val}')">${esc(lbl)}</button>`).join('');
  } else if(step.type==='multi'){
    const arr=Array.isArray(v)?v:[];
    body=step.opts.map(([val,lbl])=>`<button class="ob-opt ${arr.includes(val)?'on':''}" onclick="obToggle('${step.k}','${val}')">${esc(lbl)}</button>`).join('')
      +`<button class="btn primary block" style="margin-top:14px" onclick="obNext()">Avanti</button>`;
  } else {
    body=`<input id="ob-input" type="${step.type==='number'?'number':'text'}" placeholder="${esc(step.ph||'')}" value="${esc(v||'')}" style="font-size:18px;padding:14px">
      <button class="btn primary block" style="margin-top:14px" onclick="obNextInput()">${onboardState.i===total-1?'Crea la mia scheda 🚀':'Avanti'}</button>
      ${step.k==='notes'?`<button class="btn ghost block sm" style="margin-top:8px" onclick="ans_skip_notes()">Salta</button>`:''}`;
  }
  $('#onboard').innerHTML=`
    <div class="ob-top">
      ${onboardState.i>0?`<button class="btn x" onclick="obBack()">‹</button>`:`<button class="btn x" onclick="closeOnboard()">✕</button>`}
      <div class="pl-dots">${INTERVIEW.map((_,k)=>`<i class="${k<onboardState.i?'done':''} ${k===onboardState.i?'cur':''}"></i>`).join('')}</div>
    </div>
    <div class="ob-body">
      <div class="ob-step">Domanda ${onboardState.i+1} di ${total}</div>
      <h2 class="ob-q">${esc(step.q)}</h2>
      <div class="ob-opts">${body}</div>
    </div>`;
  const inp=$('#ob-input'); if(inp) setTimeout(()=>inp.focus(),50);
}
window.obChoose=(k,val)=>{ onboardState.ans[k]=val; obAdvance(); };
window.obToggle=(k,val)=>{ const a=onboardState.ans; a[k]=Array.isArray(a[k])?a[k]:[]; if(a[k].includes(val)) a[k]=a[k].filter(x=>x!==val); else a[k].push(val); renderOnboard(); };
window.obNext=()=>obAdvance();
window.obNextInput=()=>{ const inp=$('#ob-input'); const step=INTERVIEW[onboardState.i]; if(inp) onboardState.ans[step.k]=inp.value.trim(); obAdvance(); };
window.ans_skip_notes=()=>{ obAdvance(); };
window.obBack=()=>{ if(onboardState.i>0){ onboardState.i--; renderOnboard(); } };
function obAdvance(){ if(onboardState.i<INTERVIEW.length-1){ onboardState.i++; renderOnboard(); } else finishOnboard(); }
async function finishOnboard(){
  const a=onboardState.ans;
  const s=settings();
  s.userName=a.name||s.userName; s.sex=a.sex||'m'; s.interview=a; s.trainingDays=freqToDays(+a.freq||4);
  saveSettings(s);
  const list=profiles(); const p=list.find(x=>x.id===activeProfileId()); if(p){ p.name=a.name||p.name; p.sex=a.sex; saveProfiles(list); }
  const plan=buildPlanFromInterview(a); DB.set('activeWorkoutPlan',plan); DB.del('currentSession');
  DB.set('onboarded', true);
  closeOnboard(); curDayIdx=0; go('scheda'); toast('Scheda creata su misura 💪');
  if(settings().claudeApiKey||settings().claudeProxyUrl){ setTimeout(()=>aiRefineFromInterview(a),500); }
}
async function aiRefineFromInterview(a){
  const eq=(a.equip||[]).join(', ');
  const msg=`Crea la scheda di allenamento ideale per questo profilo. Sesso: ${a.sex}. Età: ${a.age}. Obiettivo: ${a.goal}. Si allena: ${a.place}. Attrezzatura: ${eq}. Frequenza: ${a.freq} volte/settimana. Livello: ${a.level}. Note: ${a.notes||'nessuna'}. Genera ${a.freq} giorni adeguati. Rispondi con una breve spiegazione e poi il blocco JSON della scheda.`;
  pushChat('user','[Intervista] '+msg);
  pushChat('assistant','Sto preparando la tua scheda personalizzata… ⏳');
  const reply=await callClaude(msg);
  const h=DB.get('chatHistory',[]); h[h.length-1]={role:'assistant',content:reply}; DB.set('chatHistory',h);
  const plan=extractPlan(reply); if(plan) showPlanSheet(plan);
}
function getTrainingDays(){ const t=settings().trainingDays; return Array.isArray(t)?t:[1,2,4,6]; }
const WD_SHORT = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
const WD_LONG  = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
function nextTrainingDayName(){
  const td=getTrainingDays(); const now=new Date().getDay();
  for(let i=1;i<=7;i++){ const d=(now+i)%7; if(td.includes(d)) return i===1?'domani ('+WD_LONG[d]+')':WD_LONG[d]; }
  return '—';
}
function saveSettings(s){ DB.set('settings', s); }

function activePlan(){
  let p = DB.get('activeWorkoutPlan', null);
  if (!p){ p = JSON.parse(JSON.stringify(DEFAULT_PLAN)); p.startDate = today(); DB.set('activeWorkoutPlan', p); }
  return p;
}

/* ============================================================
   REAL-MEDIA resolver (free-exercise-db) with SVG fallback
   ============================================================ */
const Media = {
  index: null, loading: null,
  norm(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); },
  async load(){
    if (this.index) return this.index;
    const cached = DB.get('fdbIndex', null);
    if (cached && cached.ts && (Date.now()-cached.ts) < 14*864e5){ this.index = cached.data; return this.index; }
    if (this.loading) return this.loading;
    this.loading = fetch(FDB_JSON).then(r=>r.json()).then(arr=>{
      const idx = {};
      arr.forEach(x => { if (x.images && x.images.length) idx[this.norm(x.name)] = x.images; });
      this.index = idx;
      try { DB.set('fdbIndex', {ts:Date.now(), data:idx}); } catch(e){}
      return idx;
    }).catch(()=>{ this.index = {}; return {}; });
    return this.loading;
  },
  // returns [url0,url1] or null for an English exercise name
  framesByName(q){
    if (!this.index || !q) return null;
    const nq = this.norm(q);
    let imgs = this.index[nq];
    if (!imgs){ // token-subset fallback
      const qt = nq.split(' ');
      let best=null, bestScore=0;
      for (const name in this.index){
        const nt = name.split(' ');
        const hit = qt.filter(t=>nt.includes(t)).length;
        if (hit>bestScore && hit>=Math.min(2,qt.length)){ bestScore=hit; best=this.index[name]; }
      }
      imgs = best;
    }
    if (!imgs) return null;
    return imgs.slice(0,2).map(p => FDB_IMG + p);
  },
  match(ex){ return this.framesByName(FDB_MATCH[ex.id]); }
};

// build an animated 2-frame viewer from raw frame URLs (hides itself if image fails)
function animFrames(frames, alt){
  if (!frames) return '';
  return `<div class="frames"><div class="frame anim-box" style="flex:1.4">
      <img class="anim-img" data-f0="${frames[0]}" data-f1="${frames[1]||frames[0]}" src="${frames[0]}" alt="${esc(alt||'')}" loading="lazy" onerror="this.closest('.frame').style.display='none'">
      <div class="lbl">▶ Movimento</div></div></div>`;
}

/* Renders an animated, GIF-like 2-frame viewer; falls back to SVG figure.
   mode 'anim' = single auto-toggling box; 'dual' = two frames side by side. */
// If a real photo fails to load, swap that frame for the SVG figure.
window.mediaFail = function(img){
  const ex = EX_BY_ID[img.dataset.ex]; if(!ex) return;
  const pose = img.dataset.pose==='end' ? ex.end : ex.start;
  const frame = img.closest('.frame'); const lbl = frame.querySelector('.lbl');
  frame.innerHTML = buildFigure(pose, ex.primary, ex.secondary) + (lbl?lbl.outerHTML:'');
};

function exerciseMedia(ex, mode){
  mode = mode || 'anim';
  const frames = Media.match(ex);
  if (!frames){
    // SVG fallback — two frames side by side
    return `<div class="frames">
      <div class="frame">${buildFigure(ex.start,ex.primary,ex.secondary)}<div class="lbl">INIZIO</div></div>
      <div class="frame">${buildFigure(ex.end,ex.primary,ex.secondary)}<div class="lbl">CONTRAZIONE</div></div></div>`;
  }
  if (mode === 'dual'){
    return `<div class="frames">
      <div class="frame"><img src="${frames[0]}" alt="inizio" loading="lazy" data-ex="${ex.id}" data-pose="start" onerror="mediaFail(this)"><div class="lbl">INIZIO</div></div>
      <div class="frame"><img src="${frames[1]||frames[0]}" alt="fine" loading="lazy" data-ex="${ex.id}" data-pose="end" onerror="mediaFail(this)"><div class="lbl">CONTRAZIONE</div></div></div>`;
  }
  // animated single viewer (alternates the 2 frames like a GIF)
  return `<div class="frames"><div class="frame anim-box" style="flex:1.4">
      <img class="anim-img" data-f0="${frames[0]}" data-f1="${frames[1]||frames[0]}" data-ex="${ex.id}" data-pose="start" src="${frames[0]}" alt="${esc(ex.name)}" loading="lazy" onerror="mediaFail(this)">
      <div class="lbl">▶ Movimento</div></div></div>`;
}

// muscle map block (omino) with legend
function muscleMapBlock(ex){
  return `<div class="musclemap card" style="padding:10px;margin-top:10px;background:var(--card-2)">
    <div class="tiny muted" style="margin-bottom:2px">🧍 Muscoli coinvolti</div>
    ${buildMuscleMap(ex.primary, ex.secondary)}
    <div class="row" style="gap:16px;justify-content:center;margin-top:2px">
      <span class="tiny"><span class="dot" style="background:#E8472A"></span> Primari</span>
      <span class="tiny"><span class="dot" style="background:#1A6FBF"></span> Secondari</span>
    </div></div>`;
}

// drive all .anim-img toggling between start/end frame
let _animTimer = null;
function startAnimations(){
  clearInterval(_animTimer);
  let flip = false;
  _animTimer = setInterval(()=>{
    flip = !flip;
    $$('.anim-img').forEach(img => {
      const t = flip ? img.dataset.f1 : img.dataset.f0;
      if (t && img.src !== t) img.src = t;
    });
  }, 850);
}

/* ============================================================
   Sheet / modal
   ============================================================ */
function openSheet(html){
  $('#sheet-content').innerHTML = html;
  $('#sheet-bg').classList.add('show');
  requestAnimationFrame(()=> $('#sheet').classList.add('show'));
}
function closeSheet(){
  $('#sheet').classList.remove('show');
  $('#sheet-bg').classList.remove('show');
}
$('#sheet-bg').addEventListener('click', closeSheet);

/* ============================================================
   Router
   ============================================================ */
const VIEWS = {};
function go(tab){
  $$('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab===tab));
  $$('.view').forEach(v => v.classList.remove('active'));
  $('#view-'+tab).classList.add('active');
  if (VIEWS[tab]) VIEWS[tab]();
  window.scrollTo(0,0);
  startAnimations();
}
$$('#tabbar button').forEach(b => b.addEventListener('click', ()=>go(b.dataset.tab)));

/* ============================================================
   TAB 1 — SCHEDA
   ============================================================ */
let curDayIdx = 0;

// Smart rotation: propose the day AFTER the last completed workout (A→B→C→D→A).
function recommendedDayIdx(){
  const plan = activePlan();
  // if there's an unfinished session today, stick to that day
  const s = DB.get('currentSession', null);
  if (s && s.date === today()) return s.dayIdx;
  const log = DB.get('workoutLog', {});
  const dates = Object.keys(log).sort(); // ascending by date string
  for (let i = dates.length-1; i >= 0; i--){
    const idx = plan.days.findIndex(d => d.type === log[dates[i]].dayType);
    if (idx >= 0) return (idx+1) % plan.days.length;
  }
  return 0; // no history → Giorno A
}

function getSession(){ return DB.get('currentSession', null); }
function ensureSession(dayIdx){
  const plan = activePlan(); const day = plan.days[dayIdx];
  let s = getSession();
  if (!s || s.dayIdx !== dayIdx || s.date !== today()){
    s = { date: today(), dayIdx, dayType: day.type, startTime: nowISO(), exercises:{} };
    day.exercises.forEach(e => {
      s.exercises[e.exId] = { sets: Array.from({length:e.sets}, ()=>({kg:'',reps:'',done:false})), completed:false };
    });
    DB.set('currentSession', s);
  }
  return s;
}
function saveSession(s){ DB.set('currentSession', s); }

VIEWS.scheda = function(){
  const plan = activePlan(); const day = plan.days[curDayIdx];
  const s = ensureSession(curDayIdx);
  const express = DB.get('expressMode', false);
  const exList = express ? day.exercises.slice(0,4) : day.exercises;
  const totalEx = exList.length;
  const doneEx = exList.filter(e=> s.exercises[e.exId] && s.exercises[e.exId].completed).length;
  const pct = totalEx ? Math.round(doneEx/totalEx*100) : 0;

  const recIdx = recommendedDayIdx();
  const recDay = plan.days[recIdx];
  const doneToday = DB.get('workoutLog', {})[today()];
  const todayStr = new Date().toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
  const todayCap = todayStr.charAt(0).toUpperCase()+todayStr.slice(1);

  let h = `<div class="topbar"><div>
      <h1>Ciao ${esc(settings().userName)} 💪</h1>
      <div class="sub">${todayCap}</div>
    </div></div>`;

  h += renderWeekStrip();

  // smart recommendation banner
  const isTrainingDay = getTrainingDays().includes(new Date().getDay());
  if (doneToday){
    h += `<div class="card" style="border-color:var(--ok)">
      <div class="row" style="gap:10px"><span style="font-size:22px">✅</span>
      <div><b>Oggi hai completato il Giorno ${doneToday.dayType}</b>
      <div class="tiny muted">Prossimo consigliato: Giorno ${recDay.type} — ${esc(recDay.name)} · ${nextTrainingDayName()}</div></div></div></div>`;
  } else if (!isTrainingDay){
    h += `<div class="card">
      <div class="row" style="gap:10px"><span style="font-size:22px">🛌</span>
      <div><b>Oggi è giorno di riposo</b>
      <div class="tiny muted">Prossimo allenamento: ${nextTrainingDayName()} · Giorno ${recDay.type}. Se vuoi allenarti comunque, è già pronto.</div></div></div></div>`;
  } else {
    h += `<div class="card acc-${recDay.type}" style="border-color:${DAY_HEX[recDay.type]}">
      <div class="row" style="gap:10px"><span class="dot bg-${recDay.type}" style="width:14px;height:14px"></span>
      <div><b style="color:${DAY_HEX[recDay.type]}">Oggi tocca al Giorno ${recDay.type} 💪</b>
      <div class="tiny muted">${esc(recDay.name)} · è uno dei tuoi giorni di allenamento</div></div></div></div>`;
  }

  h += coachBanner();

  // "fai una scheda diversa"
  if (curDayIdx!==recIdx && !doneToday){
    h += `<div class="tiny muted center" style="margin:-4px 0 10px">Stai guardando il Giorno ${day.type} (consigliato: ${recDay.type})</div>`;
  } else if (!doneToday){
    h += `<button class="btn ghost block sm" style="margin-bottom:10px" onclick="pickDifferentDay()">🔀 Voglio fare una scheda diversa</button>`;
  }

  // day selector
  h += `<div class="scroller" style="margin-bottom:12px">`;
  plan.days.forEach((d,i)=>{
    const isRec = i===recIdx && !doneToday;
    h += `<button class="chip ${i===curDayIdx?'on':''} ${isRec?'rec':''}" onclick="selectDay(${i})">
      <span class="dot bg-${d.type}"></span> Giorno ${d.type}${isRec?' ★':''}</button>`;
  });
  h += `</div>`;

  // time mode selector
  h += `<div class="row" style="gap:8px;margin-bottom:12px">
    <button class="chip ${!express?'on':''}" style="flex:1;text-align:center;justify-content:center" onclick="setTime(false)">⏱ Completo · ~60'</button>
    <button class="chip ${express?'on':''}" style="flex:1;text-align:center;justify-content:center" onclick="setTime(true)">⚡ Express · ~30'</button></div>`;
  if (express) h += `<div class="notice">⚡ Modalità Express: solo i ${exList.length} esercizi principali, fai 2–3 serie ciascuno. Riscaldamento breve.</div>`;

  // icon tiles (entrata stile home iPhone)
  const stretchId = suggestStretch(day);
  h += `<div class="tilegrid">
    <div class="tile" onclick="warmupSheet()"><div class="ic">🔥</div><div class="tl">Riscaldamento</div></div>
    <div class="tile accent" onclick="startGuided()"><div class="ic">▶️</div><div class="tl">Allenamento</div></div>
    <div class="tile" onclick="openExercise('${stretchId}')"><div class="ic">🧘</div><div class="tl">Stretching</div></div>
  </div>`;
  h += `<button class="btn primary block" style="margin-bottom:14px" onclick="startGuided()">▶ Inizia allenamento guidato</button>`;

  // progress header
  h += `<div class="card"><div class="row between" style="margin-bottom:8px">
      <h3 class="acc-${day.type}">Giorno ${day.type} — ${esc(day.name)}</h3>
      <span class="pill">${doneEx}/${totalEx} esercizi</span></div>
      <div class="progbar"><i style="width:${pct}%"></i></div></div>`;

  // exercise list (modifica manuale)
  h += `<h2>Esercizi <span class="tiny muted" style="font-weight:400">· tocca per dettagli e log manuale</span></h2>`;
  exList.forEach((e,i)=>{
    const ex = EX_BY_ID[e.exId]; if (!ex) return;
    const st = s.exercises[e.exId];
    h += renderExCard(ex, e, st, i);
  });

  h += `<button class="btn ok block" style="margin:8px 0 4px" onclick="finishWorkout()">✅ TERMINA ALLENAMENTO</button>`;
  h += `<button class="btn ghost block small" onclick="if(confirm('Azzerare la sessione di oggi?')){DB.del('currentSession');VIEWS.scheda();}">Reset sessione</button>`;

  $('#view-scheda').innerHTML = h;
};

function renderExCard(ex, planEx, st, idx){
  const open = st._open ? 'open' : '';
  const done = st.completed ? 'done' : '';
  let h = `<div class="card ex-card ${open} ${done}" id="exc-${ex.id}">
    <div class="ex-head" onclick="toggleEx('${ex.id}')">
      ${st.completed?'<span class="dot" style="background:var(--ok)"></span>':'<span class="dot" style="background:var(--border)"></span>'}
      <div><h3>${esc(ex.name)}</h3>
        <div class="tiny muted">${planEx.sets} serie × ${esc(planEx.reps)} · ${esc(ex.cat)}</div></div>
      <button class="btn sm ghost" title="Sostituisci" style="margin-left:auto;padding:6px 9px" onclick="event.stopPropagation();openSwap('${ex.id}')">🔄</button>
      <span class="chev">›</span>
    </div>
    <div class="ex-body">
      ${exerciseMedia(ex,'anim')}
      <div class="muscle-line">● Muscoli: <b>${ex.primary.map(m=>MUSCLE_LABELS[m]||m).join(', ')}</b>${ex.secondary.length?' · '+ex.secondary.map(m=>MUSCLE_LABELS[m]||m).join(', '):''}</div>
      ${muscleMapBlock(ex)}
      <button class="btn sm block" style="margin-top:10px" onclick="openSwap('${ex.id}')">🔄 Sostituisci con un esercizio equivalente</button>
      <div class="sets" id="sets-${ex.id}">${renderSets(ex.id, st)}</div>
      <div class="tech"><b class="small">Tecnica</b><ol>${ex.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>
        <div class="tiny muted" style="margin-top:6px">↗ Più facile: ${esc(ex.variants.easier)} · ↘ Più difficile: ${esc(ex.variants.harder)}</div></div>
    </div></div>`;
  return h;
}

function renderSets(exId, st){
  let h = '';
  st.sets.forEach((set,i)=>{
    h += `<div class="set-row ${set.done?'done':''}">
      <span class="sn">SERIE ${i+1}</span>
      <input type="number" inputmode="decimal" placeholder="kg" value="${set.kg}" onchange="setVal('${exId}',${i},'kg',this.value)">
      <span class="x">×</span>
      <input type="number" inputmode="numeric" placeholder="rip" value="${set.reps}" onchange="setVal('${exId}',${i},'reps',this.value)">
      ${i>0?`<button class="btn sm copy" onclick="copyPrev('${exId}',${i})">↑ Copia</button>`:''}
      <button class="chk" onclick="toggleSet('${exId}',${i})">${set.done?'✓':''}</button>
    </div>`;
  });
  h += `<div class="set-actions">
    <button class="btn sm" onclick="addSet('${exId}')">+ Aggiungi serie</button>
    <button class="btn sm" onclick="repeatAll('${exId}')">🔄 Ripeti tutte</button></div>`;
  return h;
}

let _wuId = 0;
function warmupCard(item, express){
  const id = 'wu'+(_wuId++);
  // resolve media: linked exercise (exId) or direct FDB name (fdb)
  let media = '', steps = item.steps || [];
  if (item.exId){
    const ex = EX_BY_ID[item.exId];
    if (ex){ media = exerciseMedia(ex, 'anim'); if (!steps.length) steps = ex.steps; }
  } else if (item.fdb){
    media = animFrames(Media.framesByName(item.fdb), item.name);
  }
  const icon = item.icon || '🔥';
  return `<div class="card ex-card" id="${id}" style="padding:12px">
    <div class="ex-head" onclick="toggleGeneric('${id}')">
      <span style="font-size:18px">${icon}</span>
      <div><h3 style="font-size:14px">${esc(item.name)}</h3><div class="tiny muted">${esc(item.detail)}</div></div>
      <span class="chev">›</span></div>
    <div class="ex-body">
      ${media}
      ${steps.length?`<ol class="small" style="padding-left:18px;margin:8px 0 0;color:#cfcfcf">${steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`:''}
    </div></div>`;
}
function renderWarmup(day, express){
  const specific = WARMUPS[day.muscleGroup] || [];
  const gen = express ? WARMUP_GENERAL.slice(0,3) : WARMUP_GENERAL;
  const spin = Object.assign({}, SPIN_WARMUP, express?{detail:'3–4 min · cadenza progressiva'}:{});
  let h = `<h2>🔥 Riscaldamento <span class="tiny muted" style="font-weight:400">· ${express?'~5 min':'~8–10 min'} · tocca per i dettagli</span></h2>`;
  h += warmupCard(spin, express);
  h += `<div class="tiny muted" style="margin:10px 0 6px;text-transform:uppercase;letter-spacing:.04em">Mobilità generale</div>`;
  h += gen.map(it=>warmupCard(it,express)).join('');
  if (specific.length){
    h += `<div class="tiny muted" style="margin:10px 0 6px;text-transform:uppercase;letter-spacing:.04em">Attivazione ${esc(day.name)}</div>`;
    h += specific.map(it=>warmupCard(it,express)).join('');
  }
  return h;
}
window.toggleGeneric = (id)=>{ const el=$('#'+id); if(el){ el.classList.toggle('open'); startAnimations(); } };
window.warmupSheet = function(){
  const day=activePlan().days[curDayIdx]; const express=DB.get('expressMode',false);
  openSheet(renderWarmup(day, express)); startAnimations();
};
window.setTime = (express)=>{ DB.set('expressMode', express); VIEWS.scheda(); startAnimations(); };

function renderWeekStrip(){
  const log=DB.get('workoutLog',{});
  const now=new Date(); const monday=new Date(now); monday.setHours(0,0,0,0);
  monday.setDate(now.getDate()-((now.getDay()+6)%7));
  let h=`<div class="weekstrip">`;
  for(let i=0;i<7;i++){ const d=new Date(monday); d.setDate(monday.getDate()+i);
    const ds=ymd(d); const isToday=ds===today();
    const w=log[ds]; const isTrain=getTrainingDays().includes(d.getDay());
    const mark = w?`<span class="wk-let bg-${w.dayType}">${w.dayType}</span>`:(isTrain?`<span class="wk-dot"></span>`:`<span class="wk-dot empty"></span>`);
    h+=`<div class="wk-cell ${isToday?'today':''}"><div class="wk-dow">${WD_SHORT[d.getDay()]}</div><div class="wk-num">${d.getDate()}</div>${mark}</div>`;
  }
  return h+`</div>`;
}
window.pickDifferentDay = function(){
  const plan=activePlan();
  openSheet(`<h3>🔀 Scegli la scheda di oggi</h3>
    <p class="small muted">La rotazione riprenderà dal giorno che completi.</p>
    ${plan.days.map((d,i)=>`<button class="btn block" style="margin-bottom:8px;text-align:left" onclick="selectDay(${i});closeSheet()">
      <span class="dot bg-${d.type}" style="margin-right:8px"></span> Giorno ${d.type} — ${esc(d.name)}</button>`).join('')}`);
};
window.selectDay = (i)=>{ curDayIdx=i; VIEWS.scheda(); startAnimations(); };
window.toggleEx = (id)=>{ const s=getSession(); s.exercises[id]._open=!s.exercises[id]._open; saveSession(s);
  $('#exc-'+id).classList.toggle('open'); startAnimations(); };
window.setVal = (id,i,f,v)=>{ const s=getSession(); s.exercises[id].sets[i][f]=v; saveSession(s); };
window.copyPrev = (id,i)=>{ const s=getSession(); const p=s.exercises[id].sets[i-1];
  s.exercises[id].sets[i].kg=p.kg; s.exercises[id].sets[i].reps=p.reps; saveSession(s);
  $('#sets-'+id).innerHTML=renderSets(id,s.exercises[id]); toast('Serie copiata'); };
window.repeatAll = (id)=>{ const s=getSession(); const f=s.exercises[id].sets[0];
  s.exercises[id].sets.forEach((set,i)=>{ if(i>0){set.kg=f.kg; set.reps=f.reps;} }); saveSession(s);
  $('#sets-'+id).innerHTML=renderSets(id,s.exercises[id]); toast('Valori ripetuti'); };
window.addSet = (id)=>{ const s=getSession(); s.exercises[id].sets.push({kg:'',reps:'',done:false}); saveSession(s);
  $('#sets-'+id).innerHTML=renderSets(id,s.exercises[id]); };
window.toggleSet = (id,i)=>{ const s=getSession(); const set=s.exercises[id].sets[i];
  set.done=!set.done;
  const ex=s.exercises[id]; ex.completed = ex.sets.every(x=>x.done);
  saveSession(s);
  $('#sets-'+id).innerHTML=renderSets(id,ex);
  const card=$('#exc-'+id); card.classList.toggle('done', ex.completed);
  // update header dot + progress
  VIEWS.scheda(); startAnimations();
};

/* ---- Exercise swap: suggest equivalents (same muscles, different tool/position) ---- */
function suggestAlternatives(ex){
  const prim = new Set(ex.primary);
  return EXERCISES.filter(c => c.id!==ex.id && c.cat!=='stretching')
    .map(c => {
      const overlap = c.primary.filter(m=>prim.has(m)).length;
      const secOverlap = c.secondary.filter(m=>prim.has(m)).length;
      const diffEquip = c.equip.some(e=>!ex.equip.includes(e)) || ex.equip.some(e=>!c.equip.includes(e));
      const sameCat = c.cat===ex.cat ? 1 : 0;
      // score: prefer same primary muscles, then same category, bonus if different equipment/position
      const score = overlap*4 + secOverlap + sameCat*2 + (diffEquip?1:0);
      return {c, overlap, score};
    })
    .filter(o => o.overlap>=1 || o.c.cat===ex.cat)
    .sort((a,b)=> b.score-a.score)
    .slice(0,6)
    .map(o=>o.c);
}

window.openSwap = function(exId){
  const ex = EX_BY_ID[exId]; if(!ex) return;
  const alts = suggestAlternatives(ex);
  let h = `<h3>🔄 Sostituisci: ${esc(ex.name)}</h3>
    <p class="small muted">Alternative che allenano gli stessi muscoli (${ex.primary.map(m=>MUSCLE_LABELS[m]||m).join(', ')}) con attrezzo o posizione diversa:</p>`;
  if(!alts.length){ h+=`<p class="muted">Nessuna alternativa trovata.</p>`; }
  alts.forEach(a=>{
    const shared = a.primary.filter(m=>ex.primary.includes(m)).map(m=>MUSCLE_LABELS[m]||m).join(', ');
    h += `<div class="card" style="margin-bottom:8px;cursor:pointer" onclick="doSwap('${exId}','${a.id}')">
      <div class="row" style="gap:10px">
        <div style="width:84px;flex:none">${exerciseMedia(a,'anim')}</div>
        <div style="flex:1"><b>${esc(a.name)}</b>
          <div class="tiny muted">${a.equip.join(', ')} · ${a.diff}</div>
          <div class="tiny acc-C">✓ ${esc(shared||a.cat)}</div></div>
        <span class="chev">›</span></div></div>`;
  });
  openSheet(h); startAnimations();
};

window.doSwap = function(oldId, newId){
  const plan = activePlan(); const day = plan.days[curDayIdx];
  const i = day.exercises.findIndex(e=>e.exId===oldId);
  if(i<0){ closeSheet(); return; }
  const oldEntry = day.exercises[i];
  day.exercises[i] = { exId:newId, sets:oldEntry.sets, reps:oldEntry.reps };
  DB.set('activeWorkoutPlan', plan);
  // update current session: replace exercise entry, fresh empty sets
  const s = getSession();
  if (s && s.exercises[oldId]){
    s.exercises[newId] = { sets: Array.from({length:oldEntry.sets},()=>({kg:'',reps:'',done:false})), completed:false, _open:true };
    delete s.exercises[oldId]; saveSession(s);
  }
  closeSheet(); toast('Esercizio sostituito'); VIEWS.scheda(); startAnimations();
};

function suggestStretch(day){
  // pick stretch by the day's primary muscle group
  const map = { petto:'chest-stretch', schiena:'lat-stretch', gambe:'quad-stretch',
                spalle:'shoulder-stretch', core:'cobra-stretch', bicipiti:'biceps-stretch',
                tricipiti:'triceps-stretch', glutei:'glute-stretch' };
  return map[day.muscleGroup] || 'cat-cow';
}

function finishWorkout(){
  const s = getSession(); if (!s){ toast('Nessuna sessione attiva'); return; }
  const end = nowISO();
  const dur = Math.max(1, Math.round((new Date(end)-new Date(s.startTime))/60000));
  let volume = 0, doneCount = 0, totalSets = 0;
  const exOut = {};
  for (const id in s.exercises){
    const ex = s.exercises[id];
    const sets = ex.sets.filter(x=>x.done || x.kg || x.reps);
    if (!sets.length && !ex.completed) continue;
    sets.forEach(x=>{ const kg=parseFloat(x.kg)||0, r=parseInt(x.reps)||0; volume += kg*r; if(x.done) totalSets++; });
    if (ex.completed) doneCount++;
    exOut[id] = { completed: ex.completed, sets: ex.sets.map(x=>({kg:parseFloat(x.kg)||0, reps:parseInt(x.reps)||0, done:!!x.done})) };
  }
  const log = DB.get('workoutLog', {});
  log[s.date] = { dayType: s.dayType, dayName: activePlan().days[s.dayIdx].name,
    startTime: s.startTime, endTime: end, durationMin: dur, exercises: exOut };
  DB.set('workoutLog', log);
  DB.del('currentSession');
  // PR detection
  const bests=DB.get('bestLifts',{}); const prs=[];
  for(const id in exOut){ const top=Math.max(0,...exOut[id].sets.filter(x=>x.done).map(x=>x.kg||0));
    if(top>0 && top>(bests[id]||0)){ if(bests[id]) prs.push((EX_BY_ID[id]||{}).name||id); bests[id]=top; } }
  DB.set('bestLifts',bests);
  if(prs.length) DB.set('lastKudos','🏆 Nuovo record su '+prs.slice(0,2).join(', ')+(prs.length>2?' e altri':'')+'! Stai spingendo forte, '+(settings().userName||'')+'. 💪');
  else DB.del('lastKudos');
  checkStagnation();
  openSheet(`<h3>🎉 Allenamento completato!</h3>
    <div class="statline" style="margin-top:14px">
      <div class="stat"><div class="v">${dur}'</div><div class="l">Durata</div></div>
      <div class="stat"><div class="v">${doneCount}</div><div class="l">Esercizi</div></div>
      <div class="stat"><div class="v">${Math.round(volume)}</div><div class="l">Volume kg</div></div>
    </div>
    ${prs.length?`<div class="coach-banner" style="margin-top:14px"><span class="av">🏆</span><span class="tx"><b>Nuovo record!</b> ${esc(prs.slice(0,3).join(', '))} — hai alzato i carichi. Grande!</span></div>`:`<div class="coach-banner" style="margin-top:14px"><span class="av">🤖</span><span class="tx">${esc(coachMessage())}</span></div>`}
    <p class="small muted center" style="margin-top:10px">Salvato nel calendario il ${fmtDate(s.date)}.</p>
    <button class="btn primary block" onclick="closeSheet();go('calendario')">Vedi nel calendario</button>`);
  VIEWS.scheda();
}
window.finishWorkout = finishWorkout;

/* ===== Coach motivazionale ===== */
function coachMessage(){
  const log=DB.get('workoutLog',{}); const dates=Object.keys(log).sort();
  const name=settings().userName||'';
  const kudos=DB.get('lastKudos',null);
  if(!dates.length) return `Ciao ${name}! Primo allenamento in vista? Si parte piano e costanti: la regolarità batte tutto. 💪`;
  if(kudos) return kudos;
  const last=dates[dates.length-1];
  const daysSince=Math.floor((Date.now()-new Date(last+'T12:00:00').getTime())/864e5);
  if(daysSince>=7) return `Bentornato ${name}! Dopo una pausa si riparte con carichi un filo più leggeri e tecnica pulita. Ci sei. 🔥`;
  if(daysSince>=3) return `${name}, è ora di rimetterci le mani: oggi diamo gas! 💥`;
  const now=new Date(); const monday=new Date(now); monday.setHours(0,0,0,0); monday.setDate(now.getDate()-((now.getDay()+6)%7));
  const wk=dates.filter(d=>new Date(d+'T12:00:00')>=monday).length; const target=getTrainingDays().length||4;
  if(wk>=target) return `Settimana completata (${wk}/${target})! Costanza da vero atleta, ${name}. 🏆`;
  if(wk>0) return `${wk}/${target} questa settimana — sei in linea, tieni il ritmo! 💪`;
  return `Forza ${name}, una serie alla volta si costruisce il fisico. 💪`;
}
function coachBanner(){ return `<div class="coach-banner"><span class="av">🤖</span><span class="tx">${esc(coachMessage())}</span></div>`; }
window.openCoach=function(){
  const has=settings().claudeApiKey||settings().claudeProxyUrl;
  openSheet(`<h3>🤖 Il tuo Coach</h3>
    <div class="coach-banner"><span class="av">🤖</span><span class="tx">${esc(coachMessage())}</span></div>
    ${has?`<input id="coach-q" placeholder="Chiedi qualcosa al coach...">
      <button class="btn primary block" style="margin-top:10px" onclick="coachAsk()">Invia</button>
      <button class="btn ghost block sm" style="margin-top:8px" onclick="closeSheet();go('progressi')">Apri chat completa →</button>`
    :`<button class="btn primary block" style="margin-top:6px" onclick="closeSheet();go('impostazioni')">Configura l'AI per chattare col coach</button>`}`);
  setTimeout(()=>{ const i=$('#coach-q'); if(i) i.focus(); },60);
};
window.coachAsk=function(){ const i=$('#coach-q'); const q=i?i.value.trim():''; if(!q) return; closeSheet(); progressTab='coach'; go('progressi');
  setTimeout(()=>{ const inp=$('#ai-input'); if(inp){ inp.value=q; window.aiSend(); } },120); };

/* ============================================================
   Guided player — un esercizio alla volta, in sequenza
   ============================================================ */
let guided = { seq:[], i:0, targets:{} };
const REST_DEFAULT = 90;

window.startGuided = function(){
  const plan=activePlan(); const day=plan.days[curDayIdx];
  const express = DB.get('expressMode', false);
  const exList = express ? day.exercises.slice(0,4) : day.exercises;
  if(!exList.length){ toast('Nessun esercizio'); return; }
  ensureSession(curDayIdx);
  guided = { seq: exList.map(e=>e.exId), i:0, targets:{} };
  exList.forEach(e=> guided.targets[e.exId]=e.sets);
  $('#player').classList.remove('hidden');
  document.body.style.overflow='hidden';
  renderPlayer();
};
window.closePlayer = function(){
  $('#player').classList.add('hidden'); $('#rest').classList.add('hidden');
  clearInterval(_restInt); document.body.style.overflow=''; VIEWS.scheda();
};
function planEntry(exId){ return (activePlan().days[curDayIdx].exercises.find(e=>e.exId===exId))||{}; }

function renderPlayer(){
  const exId=guided.seq[guided.i]; const ex=EX_BY_ID[exId];
  const s=getSession(); const st=s.exercises[exId];
  const target=guided.targets[exId]||3;
  const done=st.sets.filter(x=>x.done).length;
  const minSets=Math.min(target,2);
  const canNext=done>=minSets;
  const last=guided.i===guided.seq.length-1;
  let h=`<div class="pl-top">
    <button class="x" onclick="closePlayer()">✕</button>
    <div class="pl-dots">${guided.seq.map((_,k)=>`<i class="${k<guided.i?'done':''} ${k===guided.i?'cur':''}"></i>`).join('')}</div></div>`;
  h+=`<div class="pl-media">${exerciseMedia(ex,'anim')}</div>`;
  h+=`<div class="pl-body">
    <div class="row between"><h2 style="margin:0;font-size:19px">${esc(ex.name)}</h2><span class="pill">${guided.i+1}/${guided.seq.length}</span></div>
    <div class="tiny muted" style="margin:3px 0 12px">Obiettivo: ${target} serie × ${esc(planEntry(exId).reps||'')} · servono almeno ${minSets} serie per proseguire</div>
    <div class="sets" id="plsets">${playerSets(exId,st)}</div>
    ${muscleMapBlock(ex)}
    <div class="tech"><b class="small">Tecnica</b><ol>${ex.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div>
    <div class="pl-actions">
      ${guided.i>0?`<button class="btn ghost" style="flex:.6" onclick="playerPrev()">‹</button>`:''}
      <button class="btn ghost" onclick="playerSkip()">Salta</button>
      <button class="btn ${canNext?'primary':''}" ${canNext?'':'disabled'} onclick="playerNext()">${last?'🏁 Termina':'Prossimo ›'}</button>
    </div></div>`;
  $('#player').innerHTML=h; $('#player').scrollTop=0; startAnimations();
}
function playerSets(exId, st){
  let h='';
  st.sets.forEach((set,i)=>{
    h+=`<div class="set-row ${set.done?'done':''}">
      <span class="sn">SERIE ${i+1}</span>
      <input type="number" inputmode="decimal" placeholder="kg" value="${set.kg}" onchange="playerSetVal('${exId}',${i},'kg',this.value)">
      <span class="x">×</span>
      <input type="number" inputmode="numeric" placeholder="rip" value="${set.reps}" onchange="playerSetVal('${exId}',${i},'reps',this.value)">
      ${i>0?`<button class="btn sm copy" onclick="playerCopy('${exId}',${i})">↑</button>`:''}
      <button class="chk" onclick="playerToggle('${exId}',${i})">${set.done?'✓':''}</button></div>`;
  });
  h+=`<div class="set-actions"><button class="btn sm" onclick="playerAdd('${exId}')">+ Serie</button>
    <button class="btn sm" onclick="playerRepeat('${exId}')">🔄 Ripeti</button></div>`;
  return h;
}
window.playerSetVal=(id,i,f,v)=>{ const s=getSession(); s.exercises[id].sets[i][f]=v; saveSession(s); };
window.playerCopy=(id,i)=>{ const s=getSession(); const p=s.exercises[id].sets[i-1]; const set=s.exercises[id].sets[i];
  set.kg=p.kg; set.reps=p.reps; saveSession(s); $('#plsets').innerHTML=playerSets(id,s.exercises[id]); };
window.playerRepeat=(id)=>{ const s=getSession(); const f=s.exercises[id].sets[0];
  s.exercises[id].sets.forEach((set,i)=>{ if(i>0){set.kg=f.kg; set.reps=f.reps;} }); saveSession(s); $('#plsets').innerHTML=playerSets(id,s.exercises[id]); };
window.playerAdd=(id)=>{ const s=getSession(); s.exercises[id].sets.push({kg:'',reps:'',done:false}); saveSession(s); $('#plsets').innerHTML=playerSets(id,s.exercises[id]); };
window.playerToggle=(id,i)=>{ const s=getSession(); const set=s.exercises[id].sets[i]; set.done=!set.done;
  const ex=s.exercises[id]; ex.completed=ex.sets.every(x=>x.done); saveSession(s);
  renderPlayer();
  if(set.done && i < s.exercises[id].sets.length-1) startRest(REST_DEFAULT);
};
window.playerNext=()=>{ if(guided.i>=guided.seq.length-1){ finishWorkout(); $('#player').classList.add('hidden'); document.body.style.overflow=''; return; } guided.i++; renderPlayer(); };
window.playerPrev=()=>{ if(guided.i>0){ guided.i--; renderPlayer(); } };
window.playerSkip=()=>{ if(guided.i>=guided.seq.length-1){ finishWorkout(); $('#player').classList.add('hidden'); document.body.style.overflow=''; return; } guided.i++; renderPlayer(); };

/* rest timer — basato su orario reale (continua anche se esci dall'app) + suono */
let _restEnd=0, _restInt=null, _audio=null, _restDone=false;
function ensureAudio(){ try{ if(!_audio) _audio=new (window.AudioContext||window.webkitAudioContext)(); if(_audio.state==='suspended') _audio.resume(); }catch(e){} return _audio; }
function beep(){ try{ const c=ensureAudio(); if(!c) return;
  [0,0.18,0.36].forEach((off,i)=>{ const o=c.createOscillator(), g=c.createGain(); o.connect(g); g.connect(c.destination);
    o.frequency.value = i===2?1320:880; const t=c.currentTime+off;
    g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.25,t+0.02); g.gain.exponentialRampToValueAtTime(0.0001,t+0.15);
    o.start(t); o.stop(t+0.16); });
}catch(e){} }
function restRemaining(){ return Math.max(0, Math.round((_restEnd-Date.now())/1000)); }
function tickRest(){ const e=$('#rest .t'); const r=restRemaining(); if(e) e.textContent='00:'+String(r).padStart(2,'0');
  if(r<=0 && !_restDone){ _restDone=true; beep(); if(navigator.vibrate) try{navigator.vibrate([200,80,200]);}catch(e){}
    clearInterval(_restInt); setTimeout(()=>$('#rest').classList.add('hidden'),700); } }
function startRest(sec){ _restEnd=Date.now()+sec*1000; _restDone=false; ensureAudio();
  const r=$('#rest');
  r.innerHTML=`<div class="lbl">RIPOSO</div><div class="t">00:${String(sec).padStart(2,'0')}</div>
    <div class="row"><button class="btn" onclick="addRest(20)">+20s</button>
    <button class="btn primary" onclick="skipRest()">SALTA</button></div>
    <div class="tiny" style="opacity:.85">🔔 Suono alla fine · continua anche fuori dall'app</div>`;
  r.classList.remove('hidden'); clearInterval(_restInt); _restInt=setInterval(tickRest,250); tickRest();
}
window.addRest=(s)=>{ _restEnd+=s*1000; _restDone=false; tickRest(); };
window.skipRest=()=>{ clearInterval(_restInt); $('#rest').classList.add('hidden'); };

/* ============================================================
   TAB 2 — CALENDARIO
   ============================================================ */
let calYear, calMonth;
const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const DOW = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];

function fmtDate(d){ if(!d) return '—'; const dt=new Date(d); return dt.toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'}); }
function fmtLong(d){ const dt=new Date(d); return dt.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'}); }

VIEWS.calendario = function(){
  if (calYear==null){ const n=new Date(); calYear=n.getFullYear(); calMonth=n.getMonth(); }
  const log = DB.get('workoutLog', {});
  let h = `<div class="topbar"><h1>Calendario</h1>
    <button class="btn sm primary" onclick="addManualWorkout()">+ Aggiungi</button></div>`;

  h += `<div class="card"><div class="row between" style="margin-bottom:10px">
    <button class="btn sm ghost" onclick="calNav(-1)">‹</button>
    <b>${MONTHS[calMonth]} ${calYear}</b>
    <button class="btn sm ghost" onclick="calNav(1)">›</button></div>`;
  h += `<div class="cal-grid">${DOW.map(d=>`<div class="cal-dow">${d}</div>`).join('')}`;

  const first = new Date(calYear, calMonth, 1);
  let startDow = (first.getDay()+6)%7; // Mon=0
  const days = new Date(calYear, calMonth+1, 0).getDate();
  for (let i=0;i<startDow;i++) h += `<div class="cal-cell empty"></div>`;
  for (let d=1; d<=days; d++){
    const ds = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const w = log[ds];
    const isToday = ds===today();
    let mk = '';
    if (w){
      const total = Object.keys(w.exercises).length;
      const done = Object.values(w.exercises).filter(x=>x.completed).length;
      const partial = done < total ? 'partial' : '';
      mk = `<div class="mk ${partial} bg-${w.dayType}">${w.dayType}</div>`;
    } else { mk = `<span>${d}</span>`; }
    h += `<div class="cal-cell ${isToday?'today':''}" onclick="${w?`dayDetail('${ds}')`:`addManualWorkout('${ds}')`}">${mk}</div>`;
  }
  h += `</div></div>`;

  // stats
  h += renderCalStats(log);
  $('#view-calendario').innerHTML = h;
};

window.calNav = (d)=>{ calMonth+=d; if(calMonth<0){calMonth=11;calYear--;} if(calMonth>11){calMonth=0;calYear++;} VIEWS.calendario(); };

function renderCalStats(log){
  const dates = Object.keys(log);
  // week count
  const now = new Date(); const monday = new Date(now); monday.setDate(now.getDate()-((now.getDay()+6)%7)); monday.setHours(0,0,0,0);
  const weekCount = dates.filter(d=> new Date(d) >= monday).length;
  // month volume
  let monthVol = 0;
  dates.forEach(d=>{ const dt=new Date(d); if(dt.getFullYear()===calYear && dt.getMonth()===calMonth){
    Object.values(log[d].exercises).forEach(ex=>ex.sets.forEach(s=>monthVol+=(s.kg||0)*(s.reps||0))); } });
  // streak
  let streak=0; let cur=new Date(); cur.setHours(12,0,0,0);
  for(;;){ const ds=ymd(cur); if(log[ds]){streak++; cur.setDate(cur.getDate()-1);} else { if(ds===today()){cur.setDate(cur.getDate()-1); continue;} break; } }
  return `<div class="statline">
    <div class="stat"><div class="v">${weekCount}/4</div><div class="l">Settimana</div></div>
    <div class="stat"><div class="v">${Math.round(monthVol/1000*10)/10}t</div><div class="l">Volume mese</div></div>
    <div class="stat"><div class="v">${streak}🔥</div><div class="l">Streak</div></div></div>`;
}

window.dayDetail = function(ds){
  const log = DB.get('workoutLog', {}); const w = log[ds]; if(!w) return;
  let h = `<h3>📅 ${fmtLong(ds)}</h3>
    <div class="small acc-${w.dayType}">Giorno ${w.dayType} — ${esc(w.dayName||'')}</div>
    <div class="small muted">⏱ Durata: ${w.durationMin||'—'} minuti</div><div class="divider"></div>`;
  for (const id in w.exercises){
    const ex = EX_BY_ID[id]; const data = w.exercises[id];
    const icon = data.completed ? '✅' : '⏭';
    h += `<div style="margin-bottom:12px"><b>${icon} ${esc(ex?ex.name:id)}</b>`;
    if (data.completed || data.sets.some(s=>s.kg||s.reps)){
      data.sets.forEach((s,i)=>{ if(s.kg||s.reps) h += `<div class="small muted">Serie ${i+1}: ${s.kg}kg × ${s.reps}</div>`; });
    } else { h += `<div class="small muted">(non eseguito)</div>`; }
    h += `</div>`;
  }
  h += `<div class="row" style="gap:8px"><button class="btn warn" style="flex:1" onclick="editWorkout('${ds}')">✏️ Modifica</button>
    <button class="btn" style="flex:1" onclick="deleteWorkout('${ds}')">🗑 Elimina</button></div>`;
  openSheet(h);
};
window.deleteWorkout = function(ds){
  if(!confirm('Eliminare questo allenamento?')) return;
  const log=DB.get('workoutLog',{}); delete log[ds]; DB.set('workoutLog',log); closeSheet(); VIEWS.calendario();
};
window.editWorkout = function(ds){ addManualWorkout(ds, true); };

window.addManualWorkout = function(presetDate, edit){
  const log = DB.get('workoutLog', {});
  const ex = (typeof presetDate==='string' && edit) ? log[presetDate] : null;
  const date = (typeof presetDate==='string') ? presetDate : today();
  const plan = activePlan();
  let h = `<h3>${edit?'✏️ Modifica':'+ Aggiungi'} allenamento</h3>
    <label class="fld">Data</label><input type="date" id="mw-date" value="${date}">
    <label class="fld">Tipo giorno</label>
    <select id="mw-type">${plan.days.map(d=>`<option value="${d.type}" ${ex&&ex.dayType===d.type?'selected':''}>Giorno ${d.type} — ${esc(d.name)}</option>`).join('')}
      <option value="X">Personalizzato</option></select>
    <label class="fld">Durata (minuti)</label><input type="number" id="mw-dur" value="${ex?ex.durationMin:60}">
    <label class="fld">Note / esercizi svolti</label>
    <textarea id="mw-notes" rows="4" placeholder="Es: Panca 60x10, 65x8...">${ex&&ex.notes?esc(ex.notes):''}</textarea>
    <button class="btn primary block" style="margin-top:12px" onclick="saveManualWorkout('${edit?date:''}')">Salva</button>`;
  openSheet(h);
};
window.saveManualWorkout = function(orig){
  const date=$('#mw-date').value, type=$('#mw-type').value, dur=parseInt($('#mw-dur').value)||0, notes=$('#mw-notes').value;
  const log=DB.get('workoutLog',{});
  if (orig && orig!==date) delete log[orig];
  const plan=activePlan(); const day=plan.days.find(d=>d.type===type);
  const exObj={};
  if (day) day.exercises.forEach(e=>{ exObj[e.exId]={completed:false, sets:[]}; });
  log[date]={ dayType:type, dayName: day?day.name:'Personalizzato', startTime:date+'T08:00:00',
    endTime:date+'T09:00:00', durationMin:dur, notes, exercises:exObj, manual:true };
  DB.set('workoutLog',log); closeSheet(); toast('Allenamento salvato'); VIEWS.calendario();
};

/* ============================================================
   TAB 3 — LIBRERIA
   ============================================================ */
let libFilters = { cat:'', equip:'', diff:'', q:'' };

VIEWS.libreria = function(){
  let h = `<div class="topbar"><h1>Esercizi</h1><span class="pill">${EXERCISES.length}</span></div>`;
  h += `<input type="text" placeholder="🔍 Cerca esercizio..." value="${esc(libFilters.q)}" oninput="libSearch(this.value)" style="margin-bottom:10px">`;
  // category chips
  h += `<div class="scroller" style="margin-bottom:8px"><button class="chip ${!libFilters.cat?'on':''}" onclick="libCat('')">Tutti</button>`;
  CATEGORIES.forEach(c=> h+=`<button class="chip ${libFilters.cat===c.id?'on':''}" onclick="libCat('${c.id}')">${c.icon} ${c.label}</button>`);
  h += `</div>`;
  // equip + diff chips
  h += `<div class="scroller" style="margin-bottom:8px"><button class="chip ${!libFilters.equip?'on':''}" onclick="libEquip('')">Tutta attrezzatura</button>`;
  EQUIPMENT.forEach(e=> h+=`<button class="chip ${libFilters.equip===e?'on':''}" onclick="libEquip('${e}')">${e}</button>`);
  h += `</div>`;
  h += `<div class="scroller" style="margin-bottom:12px"><button class="chip ${!libFilters.diff?'on':''}" onclick="libDiff('')">Ogni livello</button>`;
  DIFFICULTIES.forEach(d=> h+=`<button class="chip ${libFilters.diff===d?'on':''}" onclick="libDiff('${d}')">${d}</button>`);
  h += `</div>`;

  const list = EXERCISES.filter(x=>{
    if (libFilters.cat && x.cat!==libFilters.cat) return false;
    if (libFilters.equip && !x.equip.includes(libFilters.equip)) return false;
    if (libFilters.diff && x.diff!==libFilters.diff) return false;
    if (libFilters.q && !(x.name.toLowerCase().includes(libFilters.q.toLowerCase()))) return false;
    return true;
  });

  if (!list.length){ h += `<p class="muted center">Nessun esercizio trovato.</p>`; }
  else {
    h += `<div class="exlist">`;
    list.forEach(x=>{
      const fr = Media.match(x);
      const thumb = fr ? `<img class="exli-img" src="${fr[0]}" loading="lazy" onerror="this.style.visibility='hidden'">`
                       : `<span class="exli-img exli-ph">🏋️</span>`;
      h += `<div class="exli" onclick="openExercise('${x.id}')">
        ${thumb}
        <div class="exli-tx"><div class="exli-nm">${esc(x.name)}</div>
          <div class="exli-cat">${CATEGORIES.find(c=>c.id===x.cat)?.label||x.cat} · ${x.diff}</div></div>
        <span class="chev">›</span></div>`;
    });
    h += `</div>`;
  }
  $('#view-libreria').innerHTML = h;
};
window.libSearch = (v)=>{ libFilters.q=v; const list=document.querySelector('.libgrid'); VIEWS.libreria(); $$('#view-libreria input')[0].focus(); startAnimations(); };
window.libCat = (c)=>{ libFilters.cat=c; VIEWS.libreria(); startAnimations(); };
window.libEquip = (e)=>{ libFilters.equip=e; VIEWS.libreria(); startAnimations(); };
window.libDiff = (d)=>{ libFilters.diff=d; VIEWS.libreria(); startAnimations(); };

window.openExercise = function(id){
  const ex = EX_BY_ID[id]; if(!ex) return;
  let h = `<h3>${esc(ex.name)}</h3>
    <div class="small muted">${CATEGORIES.find(c=>c.id===ex.cat)?.label||ex.cat} · ${ex.diff} · ${ex.equip.join(', ')}</div>
    <div style="margin-top:12px">${exerciseMedia(ex,'dual')}</div>
    ${muscleMapBlock(ex)}
    <div class="muscle-line">● Primari: <b>${ex.primary.map(m=>MUSCLE_LABELS[m]||m).join(', ')}</b></div>
    ${ex.secondary.length?`<div class="muscle-line">○ Secondari: ${ex.secondary.map(m=>MUSCLE_LABELS[m]||m).join(', ')}</div>`:''}
    <div class="tech"><b class="small">Istruzioni</b><ol>${ex.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></div>
    <div class="small" style="margin-top:8px"><b>Varianti</b><br>↗ Più facile: ${esc(ex.variants.easier)}<br>↘ Più difficile: ${esc(ex.variants.harder)}</div>
    ${ex.stretch?`<button class="btn block" style="margin-top:12px" onclick="openExercise('${ex.stretch}')">🧘 Stretching collegato</button>`:''}`;
  openSheet(h);
  startAnimations();
};

/* ============================================================
   TAB 4 — PROGRESSI & AI COACH
   ============================================================ */
let metricPeriod = 90;
// Tutti i campi misurazione (coprono i dati della bilancia Renpho)
const METRIC_FIELDS = [
  {k:'weight', l:'Peso (kg)'},
  {k:'bodyFat', l:'Grasso corporeo %'},
  {k:'muscleMass', l:'Massa muscolare (kg)'},
  {k:'water', l:'Acqua corporea %'},
  {k:'skeletalMuscle', l:'Muscolo scheletrico %'},
  {k:'leanMass', l:'Peso senza grassi (kg)'},
  {k:'subcutaneousFat', l:'Grasso sottocutaneo %'},
  {k:'visceralFat', l:'Grasso viscerale'},
  {k:'boneMass', l:'Massa ossea (kg)'},
  {k:'protein', l:'Proteine %'},
  {k:'bmr', l:'BMR (kcal)'},
  {k:'metabolicAge', l:'Età metabolica'},
  {k:'bmi', l:'BMI'},
  {k:'waist', l:'Vita (cm)'},
  {k:'chest', l:'Petto (cm)'},
  {k:'arms', l:'Braccia (cm)'},
  {k:'thighs', l:'Cosce (cm)'}
];
let progressTab = 'misure';
window.setProgressTab = (t)=>{ progressTab=t; VIEWS.progressi(); startAnimations(); };
VIEWS.progressi = function(){
  const metrics = DB.get('bodyMetrics', []);
  const photos = DB.get('progressPhotos', []);
  const last = metrics[metrics.length-1];
  let h = `<div class="topbar"><h1>Progressi</h1></div>`;

  const weeks = weeksSincePlanChange();
  if (weeks >= settings().notifyWeeks){
    h += `<div class="notice">⚠️ Sono passate ${weeks} settimane dall'ultima scheda. <b>È ora di cambiare!</b>
      <button class="btn sm primary" style="margin-top:8px" onclick="setProgressTab('coach');requestPlanChange()">Genera nuova scheda</button></div>`;
  }

  // segmented control
  const tabs=[['misure','Misure'],['grafici','Grafici'],['foto','Foto'],['coach','Coach']];
  h += `<div class="seg">${tabs.map(([t,l])=>`<button class="${progressTab===t?'on':''}" onclick="setProgressTab('${t}')">${l}</button>`).join('')}</div>`;

  if (progressTab==='misure'){
    h += `<div class="card">
      <div class="grid2">
        ${METRIC_FIELDS.map(f=>`<div><label class="fld">${f.l}</label>
          <input type="number" inputmode="decimal" id="m-${f.k}" value="${last&&last[f.k]!=null?last[f.k]:''}"></div>`).join('')}
      </div>
      <button class="btn primary block" style="margin-top:14px" onclick="saveMetric()">💾 Salva misurazione di oggi</button>
      <button class="btn ghost block sm" style="margin-top:8px" onclick="healthSyncInfo()">📲 Sincronizza da Apple Salute / Renpho</button>
    </div>`;
    if (last) h += `<p class="tiny muted center" style="margin-top:4px">Ultima misurazione: ${fmtDate(last.date)}</p>`;
  }
  else if (progressTab==='grafici'){
    h += `<div class="seg sub">${[30,90,180,9999].map(p=>`<button class="${metricPeriod===p?'on':''}" onclick="setPeriod(${p})">${p===9999?'Tutto':p+'gg'}</button>`).join('')}</div>`;
    h += `<div class="chartbox"><b class="small">Peso (kg)</b>${lineChart(metrics,'weight','#E8472A')}</div>`;
    h += `<div class="chartbox"><b class="small">Grasso corporeo (%)</b>${lineChart(metrics,'bodyFat','#F5A623')}</div>`;
    h += `<div class="chartbox"><b class="small">Massa muscolare (kg)</b>${lineChart(metrics,'muscleMass','#2EAD6B')}</div>`;
  }
  else if (progressTab==='foto'){
    h += `<div class="card">
      <label class="btn block" style="text-align:center">📷 Carica foto<input type="file" accept="image/*" style="display:none" onchange="addPhoto(this)"></label>`;
    if (photos.length){
      h += `<div class="scroller" style="margin-top:12px">`;
      photos.slice().reverse().forEach((p,i)=>{ h+=`<div style="min-width:120px"><img class="photo-thumb" src="${p.base64}" onclick="viewPhoto(${photos.length-1-i})"><div class="tiny muted center" style="margin-top:4px">${fmtDate(p.date)}</div></div>`; });
      h += `</div>`;
      if (photos.length>=2) h += `<button class="btn block sm" style="margin-top:10px" onclick="comparePhotos()">↔️ Confronta due date</button>`;
    } else { h += `<p class="tiny muted center" style="margin-top:10px">Carica una foto per iniziare il confronto nel tempo.</p>`; }
    h += `</div>`;
  }
  else if (progressTab==='coach'){
    h += `<div class="card"><div class="row" style="gap:8px;flex-wrap:wrap">
      <button class="btn sm" onclick="requestPlanChange()">🔄 Cambia scheda</button>
      <button class="btn sm" onclick="aiAnalyze()">📈 Analizza progressi</button></div>
      <div class="chat" id="ai-chat" style="margin-top:12px">${renderChat()}</div>
      <div class="chat-input">
        <input type="text" id="ai-input" placeholder="Chiedi al coach..." onkeydown="if(event.key==='Enter')aiSend()">
        <button class="btn primary" onclick="aiSend()">➤</button></div>
      ${(settings().claudeApiKey||settings().claudeProxyUrl)?'':'<div class="tiny muted" style="margin-top:8px">⚠️ Configura la API key di Claude (o il Proxy URL) nelle Impostazioni per attivare il coach.</div>'}
    </div>`;
  }

  $('#view-progressi').innerHTML = h;
};
window.setPeriod = (p)=>{ metricPeriod=p; VIEWS.progressi(); };

window.healthSyncInfo = function(){
  const base = location.origin + location.pathname;
  const example = base + '?weight=78.5&bf=22&muscle=58&water=55';
  openSheet(`<h3>📲 Sincronizza con Apple Salute / Renpho</h3>
    <p class="small">Renpho non ha un collegamento diretto per i siti web, ma su iPhone si può automatizzare con l'app <b>Scorciatoie</b> (Shortcuts), che legge i dati da <b>Apple Salute</b> dove Renpho li sincronizza.</p>
    <ol class="small" style="padding-left:18px;line-height:1.6">
      <li>Nell'app <b>Renpho</b>: Profilo → impostazioni → attiva la sincronizzazione con <b>Apple Salute</b> (peso, massa grassa, ecc.).</li>
      <li>Apri <b>Scorciatoie</b> → crea una scorciatoia con i blocchi: <i>"Trova campioni di salute"</i> (Peso, ultimo valore) → <i>"Trova campioni di salute"</i> (Percentuale massa grassa) → <i>"Apri URL"</i>.</li>
      <li>Nell'URL incolla questo schema, sostituendo i numeri con le variabili lette da Salute:</li>
    </ol>
    <div class="card" style="word-break:break-all"><code class="small">${esc(base)}?weight=PESO&bf=GRASSO&muscle=MASSA&water=ACQUA</code></div>
    <p class="tiny muted">Parametri accettati: weight, bf, muscle, water, waist, chest, arms, thighs.</p>
    <button class="btn block sm" onclick="copyText('${esc(base)}?weight=&bf=&muscle=&water=')">📋 Copia lo schema URL</button>
    <button class="btn block sm" style="margin-top:8px" onclick="copyText('${esc(example)}')">📋 Copia un esempio compilato</button>
    <p class="small" style="margin-top:12px">In <b>Automazione</b> puoi farla partire ogni mattina: leggerà i dati e li salverà qui in automatico. Aprendo quell'indirizzo l'app mostra "Dati salute importati ✅".</p>
    <p class="tiny muted">Nota: questo è il metodo affidabile per una PWA; un collegamento "nativo" diretto richiederebbe un'app dell'App Store.</p>`);
};
window.copyText = function(t){ try{ navigator.clipboard.writeText(t); toast('Copiato'); }catch(e){ toast('Copia manuale: '+t.slice(0,40)+'…'); } };

window.saveMetric = function(){
  const m = { date:today() };
  METRIC_FIELDS.forEach(f=>{ const v=num('m-'+f.k); if(v!=null) m[f.k]=v; });
  const arr = DB.get('bodyMetrics', []);
  const i = arr.findIndex(x=>x.date===m.date);
  if (i>=0) arr[i]=Object.assign(arr[i], m); else arr.push(m);
  arr.sort((a,b)=>a.date.localeCompare(b.date));
  DB.set('bodyMetrics', arr); toast('Misurazione salvata'); VIEWS.progressi();
};
function num(id){ const v=parseFloat($('#'+id).value); return isNaN(v)?null:v; }

function lineChart(metrics, field, color){
  const cutoff = Date.now() - metricPeriod*864e5;
  const pts = metrics.filter(m=> metricPeriod>=9999 || new Date(m.date).getTime()>=cutoff).filter(m=>m[field]!=null);
  if (pts.length<2) return `<div class="muted small center" style="padding:24px 0">Servono almeno 2 misurazioni nel periodo.</div>`;
  const W=320,H=120,P=8;
  const xs=pts.map(p=>new Date(p.date).getTime());
  const ys=pts.map(p=>p[field]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const sx=x=>P+(maxX===minX?0:(x-minX)/(maxX-minX))*(W-2*P);
  const sy=y=>H-P-(maxY===minY?0.5:(y-minY)/(maxY-minY))*(H-2*P);
  const d=pts.map((p,i)=>`${i?'L':'M'}${sx(xs[i]).toFixed(1)} ${sy(ys[i]).toFixed(1)}`).join(' ');
  const dots=pts.map((p,i)=>`<circle cx="${sx(xs[i]).toFixed(1)}" cy="${sy(ys[i]).toFixed(1)}" r="3" fill="${color}"/>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" style="margin-top:8px"><path d="${d}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>${dots}
    <text x="${P}" y="12" fill="#888" font-size="10">${maxY}</text>
    <text x="${P}" y="${H-2}" fill="#888" font-size="10">${minY}</text></svg>`;
}

window.addPhoto = function(input){
  const f=input.files[0]; if(!f) return;
  const r=new FileReader(); r.onload=()=>{ const arr=DB.get('progressPhotos',[]);
    arr.push({date:today(), base64:r.result}); DB.set('progressPhotos',arr); toast('Foto salvata'); VIEWS.progressi(); };
  r.readAsDataURL(f);
};
window.viewPhoto = function(i){ const p=DB.get('progressPhotos',[])[i];
  openSheet(`<h3>${fmtDate(p.date)}</h3><img class="photo-thumb" src="${p.base64}">
    <button class="btn block" style="margin-top:10px" onclick="delPhoto(${i})">🗑 Elimina foto</button>`); };
window.delPhoto = function(i){ const arr=DB.get('progressPhotos',[]); arr.splice(i,1); DB.set('progressPhotos',arr); closeSheet(); VIEWS.progressi(); };
window.comparePhotos = function(){
  const arr=DB.get('progressPhotos',[]);
  const opts=arr.map((p,i)=>`<option value="${i}">${fmtDate(p.date)}</option>`).join('');
  openSheet(`<h3>Confronta foto</h3>
    <div class="grid2"><div><label class="fld">Prima</label><select id="cp-a">${opts}</select></div>
    <div><label class="fld">Dopo</label><select id="cp-b">${opts}</select></div></div>
    <button class="btn primary block" style="margin-top:10px" onclick="doCompare()">Mostra</button>
    <div id="cp-out" class="grid2" style="margin-top:12px"></div>`);
  $('#cp-b').value=arr.length-1;
};
window.doCompare = function(){
  const arr=DB.get('progressPhotos',[]); const a=arr[+$('#cp-a').value], b=arr[+$('#cp-b').value];
  $('#cp-out').innerHTML=`<div><img class="photo-thumb" src="${a.base64}"><div class="tiny muted center">${fmtDate(a.date)}</div></div>
    <div><img class="photo-thumb" src="${b.base64}"><div class="tiny muted center">${fmtDate(b.date)}</div></div>`;
};

/* ===== AI Coach (Claude API, client-side) ===== */
// mini markdown → HTML (grassetto, titoli, liste, righe, blocchi codice)
function mdToHtml(t){
  let s = esc(t);
  s = s.replace(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/g,(m,c)=>`<pre style="white-space:pre-wrap;background:var(--card-2);padding:8px;border-radius:8px;font-size:11px;overflow-x:auto;margin:6px 0">${c.trim()}</pre>`);
  s = s.replace(/^\s*#{3}\s+(.*)$/gm,'<b>$1</b>');
  s = s.replace(/^\s*#{1,2}\s+(.*)$/gm,'<b style="font-size:15px">$1</b>');
  s = s.replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');
  s = s.replace(/^\s*[-*•]\s+(.*)$/gm,'• $1');
  s = s.replace(/^\s*-{3,}\s*$/gm,'<hr style="border:none;border-top:1px solid var(--border);margin:8px 0">');
  s = s.replace(/^\s*\|(.+)\|\s*$/gm,(m,row)=>'· '+row.split('|').map(c=>c.trim()).filter(Boolean).join('  ·  '));
  return s;
}
function renderChat(){
  const hist = DB.get('chatHistory', []);
  if (!hist.length) return `<div class="msg ai">Ciao Tommy! 💪 Sono il tuo AI Coach. Chiedimi qualsiasi cosa su allenamento, tecnica o alimentazione. Se ti propongo una nuova scheda, comparirà un pulsante per applicarla davvero all'app.</div>`;
  return hist.map(m=>`<div class="msg ${m.role==='user'?'me':'ai'}">${m.role==='user'?esc(m.content):mdToHtml(m.content)}</div>`).join('');
}
function pushChat(role, content){ const h=DB.get('chatHistory',[]); h.push({role,content}); DB.set('chatHistory',h);
  const c=$('#ai-chat'); if(c){ c.innerHTML=renderChat(); c.scrollTop=c.scrollHeight; } }

function buildContext(){
  const s=settings(); const plan=activePlan(); const log=DB.get('workoutLog',{});
  const metrics=DB.get('bodyMetrics',[]);
  const recent=Object.entries(log).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,10)
    .map(([d,w])=>`${d}: Giorno ${w.dayType}, ${w.durationMin}min`).join('; ');
  const last=metrics[metrics.length-1];
  const lastStr = last ? METRIC_FIELDS.filter(f=>last[f.k]!=null).map(f=>`${f.l}: ${last[f.k]}`).join(', ') : 'nessuna';
  return `[DATI TOMMY]
Scheda attiva (v${plan.version}, dal ${plan.startDate}): ${plan.days.map(d=>`Giorno ${d.type} ${d.name} [${d.exercises.map(e=>e.exId).join(', ')}]`).join(' | ')}
Giorni di allenamento/settimana: ${getTrainingDays().length}
Settimane dall'ultima modifica scheda: ${weeksSincePlanChange()}
Ultime sessioni: ${recent||'nessuna'}
Ultima misurazione (${last?last.date:'-'}): ${lastStr}
Misurazioni totali registrate: ${metrics.length}
EXID_DISPONIBILI (usa solo questi per le schede): ${EXERCISES.filter(e=>e.cat!=='stretching').map(e=>e.id).join(', ')}`;
}
const SYS_PROMPT = `Sei un personal trainer esperto e nutrizionista sportivo. Il tuo cliente si chiama Tommy, ha circa 30 anni, obiettivo Men's Physique (definizione, pancia piatta, no bulk eccessivo). Attrezzatura disponibile: Spin Bike, Rack con bilancieri, manubri, multi-power. Parla sempre in italiano, sii diretto e motivante. Quando analizzi i dati di allenamento, considera: frequenza settimanale, progressione dei pesi, volume totale, recupero.

REGOLA IMPORTANTE PER CAMBIARE LA SCHEDA: quando proponi o modifichi una scheda, includi SEMPRE un blocco \`\`\`json con ESATTAMENTE questa struttura:
{"days":[{"type":"A","name":"Petto + Tricipiti","muscleGroup":"petto","exercises":[{"exId":"panca-piana","sets":4,"reps":"8-10"}]}]}
Usa SOLO valori "exId" presi dalla lista ufficiale fornita nel contesto (campo EXID_DISPONIBILI). Non inventare exId. L'app leggerà quel JSON e mostrerà a Tommy un pulsante per applicare la scheda. Puoi aggiungere testo/spiegazione prima del blocco JSON.`;

async function callClaude(userMsg, extra){
  const s=settings();
  if (!s.claudeApiKey && !s.claudeProxyUrl){ return '⚠️ Manca la configurazione AI. Vai in Impostazioni → Claude AI e inserisci la API key oppure il Proxy URL.'; }
  const hist=DB.get('chatHistory',[]).slice(-8).map(m=>({role:m.role, content:m.content}));
  const messages=[...hist, {role:'user', content:(extra?extra+'\n\n':'')+userMsg}];
  const body={ model:s.claudeModel||'claude-sonnet-4-6', max_tokens:1200,
    system: SYS_PROMPT+'\n\n'+buildContext(), messages };
  try {
    let res;
    if (s.claudeProxyUrl){
      // il proxy custodisce la chiave lato server (consigliato)
      let purl=s.claudeProxyUrl; if(!/^https?:\/\//i.test(purl)) purl='https://'+purl;
      res=await fetch(purl,{ method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
    } else {
      res=await fetch('https://api.anthropic.com/v1/messages',{ method:'POST',
        headers:{'content-type':'application/json','x-api-key':s.claudeApiKey,
          'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify(body) });
    }
    if(!res.ok){ const t=await res.text(); return '❌ Errore API ('+res.status+'): '+t.slice(0,200); }
    const data=await res.json();
    return (data.content && data.content[0] && data.content[0].text) || '(nessuna risposta)';
  } catch(e){ return '❌ Errore di rete: '+e.message; }
}

window.aiSend = async function(){
  const inp=$('#ai-input'); const msg=inp.value.trim(); if(!msg) return;
  inp.value=''; pushChat('user',msg); pushChat('assistant','…');
  const reply=await callClaude(msg);
  const h=DB.get('chatHistory',[]); h[h.length-1]={role:'assistant',content:reply}; DB.set('chatHistory',h);
  const c=$('#ai-chat'); if(c){ c.innerHTML=renderChat(); c.scrollTop=c.scrollHeight; }
  const plan=extractPlan(reply); if(plan) showPlanSheet(plan);
};
window.aiAnalyze = async function(){
  pushChat('user','Analizza i miei progressi recenti e dammi consigli.');
  pushChat('assistant','…');
  const reply=await callClaude('Analizza frequenza, volume e progressione delle ultime settimane. Dammi 3 consigli pratici.');
  const h=DB.get('chatHistory',[]); h[h.length-1]={role:'assistant',content:reply}; DB.set('chatHistory',h);
  const c=$('#ai-chat'); if(c){ c.innerHTML=renderChat(); c.scrollTop=c.scrollHeight; }
};

window.requestPlanChange = function(){
  openSheet(`<h3>🔄 Richiedi cambio scheda</h3>
    <p class="small muted">L'AI genererà una nuova scheda basata sui tuoi progressi.</p>
    <button class="btn block" style="margin-top:6px" onclick="genPlan('downgrade')">📉 Downgrade — troppo difficile</button>
    <button class="btn block" style="margin-top:8px" onclick="genPlan('upgrade')">📈 Upgrade — mi sono adattato</button>
    <button class="btn block" style="margin-top:8px" onclick="genPlan('cambio')">🔄 Cambio completo — mi sono stufato</button>
    <label class="fld" style="margin-top:12px">✏️ Personalizza</label>
    <textarea id="pc-custom" rows="3" placeholder="Es: voglio più focus su spalle e dorsali..."></textarea>
    <button class="btn primary block" style="margin-top:8px" onclick="genPlan('custom')">Genera scheda</button>`);
};
window.genPlan = async function(type){
  const custom = type==='custom' ? ($('#pc-custom')?.value||'') : '';
  const map={downgrade:'Riduci difficoltà e volume',upgrade:'Aumenta intensità e progressione',cambio:'Cambia completamente gli esercizi mantenendo l\'obiettivo',custom:custom};
  closeSheet();
  progressTab='coach'; go('progressi');
  pushChat('user','Richiesta cambio scheda: '+(map[type]||type));
  pushChat('assistant','Sto preparando la nuova scheda… ⏳');
  const instruction=`Genera una NUOVA scheda di allenamento (${map[type]||type}). Rispondi prima con una breve spiegazione, poi un blocco JSON con questa struttura: {"days":[{"type":"A","name":"...","muscleGroup":"petto|schiena|gambe|spalle|core|...","exercises":[{"exId":"<id esercizio dalla libreria>","sets":4,"reps":"8-10"}]}]}. Usa SOLO questi exId disponibili: ${EXERCISES.map(e=>e.id).join(', ')}.`;
  const reply=await callClaude(instruction);
  const h=DB.get('chatHistory',[]); h[h.length-1]={role:'assistant',content:reply}; DB.set('chatHistory',h);
  VIEWS.progressi();
  const plan=extractPlan(reply);
  if (plan) showPlanSheet(plan); else toast('Leggi la proposta nella chat');
};
// Parser tollerante: accetta chiavi IT/EN ed esercizi per exId o per nome.
function extractPlan(text){
  try {
    let raw=null; const fence=text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
    if(fence) raw=fence[1]; else { const br=text.match(/\{[\s\S]*\}/); raw=br?br[0]:null; }
    if(!raw) return null;
    const obj=JSON.parse(raw);
    let days=obj.days||obj.giorni||(obj.scheda&&(obj.scheda.days||obj.scheda.giorni));
    if(!Array.isArray(days)) return null;
    const nameIdx={}; EXERCISES.forEach(e=>{ nameIdx[Media.norm(e.name)]=e.id; });
    const resolveId=(e)=>{
      if(typeof e==='string'){ e={nome:e}; }
      if(e.exId&&EX_BY_ID[e.exId]) return e.exId;
      const n=Media.norm(e.nome||e.name||e.esercizio||'');
      if(!n) return null;
      if(nameIdx[n]) return nameIdx[n];
      let best=null,score=0; const qt=n.split(' ');
      for(const k in nameIdx){ const kt=k.split(' '); const hit=qt.filter(t=>kt.includes(t)).length; if(hit>score){score=hit;best=nameIdx[k];} }
      return score>=1?best:null;
    };
    const out=days.map(d=>{
      const exs=(d.exercises||d.esercizi||[]).map(e=>{ const id=resolveId(e);
        return id?{exId:id, sets:+(e.sets||e.serie)||3, reps:String(e.reps||e.ripetizioni||'10')}:null; }).filter(Boolean);
      return { type:String(d.type||d.id||'A').toUpperCase().slice(0,2), name:d.name||d.nome||'Allenamento',
        muscleGroup:d.muscleGroup||d.gruppo||'core', exercises:exs };
    }).filter(d=>d.exercises.length);
    return out.length?{days:out}:null;
  } catch(e){ return null; }
}
function showPlanSheet(plan){
  window._pendingPlan=plan;
  openSheet(`<h3>📋 Scheda proposta dall'AI</h3>
    <p class="small muted">Controlla e applica per aggiornare davvero la tua scheda nell'app.</p>
    ${plan.days.map(d=>`<div class="card"><b class="acc-${d.type}">Giorno ${d.type} — ${esc(d.name)}</b>
      ${d.exercises.map(e=>`<div class="small muted">• ${esc((EX_BY_ID[e.exId]||{}).name||e.exId)} — ${e.sets}×${esc(e.reps)}</div>`).join('')}</div>`).join('')}
    <button class="btn ok block" onclick='applyPlan()'>✅ Approva e applica</button>
    <button class="btn ghost block small" onclick="closeSheet()">Annulla</button>`);
}
window.applyPlan = function(){
  const p=window._pendingPlan; if(!p) return;
  const plan=activePlan(); plan.version=(plan.version||1)+1; plan.startDate=today(); plan.days=p.days;
  DB.set('activeWorkoutPlan',plan);
  const s=settings(); s.lastPlanChange=today(); saveSettings(s);
  DB.del('currentSession'); closeSheet(); toast('Scheda aggiornata! 💪'); curDayIdx=0; go('scheda');
};

/* ============================================================
   TAB 5 — IMPOSTAZIONI
   ============================================================ */
VIEWS.impostazioni = function(){
  const s=settings();
  let h=`<div class="topbar"><h1>Impostazioni</h1></div>`;
  h+=`<h2>👤 Profilo</h2><div class="card">
    <label class="fld">Profilo attivo</label>
    <select onchange="switchProfile(this.value)">
      ${profiles().map(p=>`<option value="${p.id}" ${p.id===activeProfileId()?'selected':''}>${esc(p.name)}${p.sex==='f'?' ♀':p.sex==='m'?' ♂':''}</option>`).join('')}
    </select>
    <div class="row" style="gap:8px;margin-top:10px">
      <button class="btn sm" style="flex:1" onclick="newProfileSheet()">+ Nuovo profilo</button>
      <button class="btn sm" style="flex:1" onclick="startOnboarding(settings().interview)">✏️ Rifai intervista</button>
    </div>
    ${profiles().length>1?`<button class="btn ghost block sm" style="margin-top:8px" onclick="deleteProfileSheet()">🗑 Elimina profilo attivo</button>`:''}
    <div class="tiny muted" style="margin-top:8px">Ogni profilo ha scheda e dati separati. Crea un profilo finto per testare l'intervista senza toccare il tuo.</div>
  </div>`;

  // ---- Account cloud (Firebase) ----
  h+=`<h2>☁️ Account</h2><div class="card">`;
  if(Cloud.user){
    h+=`<div class="small" style="color:var(--ok)">✅ Connesso come <b>${esc(Cloud.user.email||'')}</b></div>
      <div class="tiny muted" style="margin-top:4px">I tuoi dati si sincronizzano in automatico sul cloud e ti seguono su ogni dispositivo.</div>
      <button class="btn block sm" style="margin-top:10px" onclick="fbSyncNow()">🔄 Sincronizza ora</button>
      <button class="btn ghost block sm" style="margin-top:8px" onclick="fbLogout()">Esci dall'account</button>`;
  } else {
    h+=`<div class="tiny muted" style="margin-bottom:8px">Accedi (o registrati la prima volta) per salvare tutto sul cloud e ritrovare i tuoi dati su qualsiasi telefono.</div>
      <label class="fld">Email</label><input id="fb-email" type="email" autocomplete="username" placeholder="tua@email.com">
      <label class="fld">Password</label><input id="fb-pass" type="password" autocomplete="current-password" placeholder="almeno 6 caratteri">
      <div class="row" style="gap:8px;margin-top:12px">
        <button class="btn primary" style="flex:1" onclick="fbLogin()">Accedi</button>
        <button class="btn" style="flex:1" onclick="fbSignup()">Registrati</button></div>`;
  }
  h+=`</div>`;

  h+=`<h2>🎨 Aspetto</h2><div class="card"><div class="row" style="gap:8px">
    ${[['light','☀️ Chiaro'],['dark','🌙 Scuro'],['auto','⚙️ Auto']].map(([v,l])=>
      `<button class="chip ${ (s.theme||'light')===v?'on':''}" style="flex:1;justify-content:center" onclick="setTheme('${v}')">${l}</button>`).join('')}
  </div><div class="tiny muted" style="margin-top:8px">"Auto" segue le impostazioni del telefono (chiaro di giorno, scuro di sera).</div></div>`;
  h+=`<div class="card">
    <label class="fld">Nome utente</label><input id="s-name" value="${esc(s.userName)}">
    <label class="fld">Email notifiche</label><input id="s-email" value="${esc(s.email)}">
    <label class="fld">Data inizio scheda</label><input type="date" id="s-start" value="${s.planStartDate}">
    <label class="fld">Avvisa cambio scheda dopo (settimane)</label><input type="number" id="s-weeks" value="${s.notifyWeeks}">
    <button class="btn primary block" style="margin-top:12px" onclick="saveGeneral()">Salva</button></div>`;

  h+=`<h2>📆 Settimana-tipo & promemoria</h2><div class="card">
    <div class="tiny muted" style="margin-bottom:8px">Scegli i giorni in cui ti alleni. L'app ti ricorderà e aprirà la scheda giusta in quei giorni.</div>
    <div class="row" style="gap:6px;flex-wrap:wrap">
      ${[1,2,3,4,5,6,0].map(d=>`<button class="chip ${getTrainingDays().includes(d)?'on':''}" onclick="toggleTD(${d})">${WD_SHORT[d]}</button>`).join('')}
    </div>
    <div class="small muted" style="margin-top:10px">Consigliato per iniziare: <b>4 volte a settimana</b> (es. Lun · Mar · Gio · Sab).</div>
    <button class="btn block sm" style="margin-top:10px" onclick="setTrainingDays([1,2,4,6])">Usa Lun · Mar · Gio · Sab</button>
    ${getTrainingDays().length?`<div class="divider"></div>
      <div class="tiny muted" style="margin-bottom:6px">Orario promemoria per ogni giorno</div>
      <div class="grid2">
        ${getTrainingDays().slice().sort().map(d=>`<div><label class="fld">${WD_LONG[d]}</label>
          <input type="time" id="tt-${d}" value="${(s.trainingTimes&&s.trainingTimes[d])||'06:30'}" onchange="setTrainingTime(${d},this.value)"></div>`).join('')}
      </div>
      <label class="fld">Tipo di promemoria</label>
      <select id="notifyType" onchange="setNotifyType(this.value)">
        <option value="push" ${(s.notifyType||'push')==='push'?'selected':''}>🔔 Notifica push (app installata)</option>
        <option value="email" ${s.notifyType==='email'?'selected':''}>📧 Email (richiede EmailJS)</option>
        <option value="off" ${s.notifyType==='off'?'selected':''}>🔕 Nessuno</option>
      </select>
      <div class="tiny muted" style="margin-top:6px">Su iPhone una web-app non invia notifiche affidabili ad app chiusa: per gli orari fissi aggiungi gli stessi orari come eventi nel <b>Calendario</b>.</div>`:''}
  </div>`;

  const keyMask = s.claudeApiKey ? ('✅ Chiave salvata ('+s.claudeApiKey.slice(0,7)+'…'+s.claudeApiKey.slice(-4)+')') : '⚠️ Nessuna chiave salvata';
  h+=`<h2>🤖 Claude AI</h2><div class="card">
    <div class="small" style="margin-bottom:8px;color:${s.claudeApiKey?'var(--ok)':'var(--warn)'}">${keyMask}</div>
    <label class="fld">API Key (sk-ant-...) — lascia vuoto per non cambiarla</label>
    <input id="s-key" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${s.claudeApiKey?'••• già salvata •••':'incolla qui sk-ant-...'}">
    <label class="fld">Modello</label><input id="s-model" value="${esc(s.claudeModel)}">
    <label class="fld">Proxy URL (opzionale, consigliato — vedi sotto)</label>
    <input id="s-proxy" type="text" autocomplete="off" placeholder="https://...workers.dev" value="${esc(s.claudeProxyUrl||'')}">
    <div class="tiny muted" style="margin-top:8px">Con il <b>Proxy URL</b> la chiave resta sul server e non serve inserirla qui. Senza proxy, la chiave è salvata solo su questo dispositivo.</div>
    <button class="btn primary block" style="margin-top:10px" onclick="saveAI()">Salva AI</button>
    ${s.claudeApiKey?'<button class="btn ghost block sm" style="margin-top:8px" onclick="clearKey()">Rimuovi chiave salvata</button>':''}</div>`;

  h+=`<h2>📧 EmailJS</h2><div class="card">
    <label class="fld">Service ID</label><input id="s-sid" value="${esc(s.emailjsServiceId)}">
    <label class="fld">Template ID</label><input id="s-tid" value="${esc(s.emailjsTemplateId)}">
    <label class="fld">Public Key (User ID)</label><input id="s-uid" value="${esc(s.emailjsUserId)}">
    <button class="btn block" style="margin-top:10px" onclick="saveEmail()">Salva EmailJS</button>
    <button class="btn ghost block sm" style="margin-top:8px" onclick="testEmail()">Invia email di test</button></div>`;

  h+=`<h2>🔔 Notifiche</h2><div class="card">
    <button class="btn block" onclick="enableNotifications()">Attiva notifiche push</button></div>`;

  h+=`<h2>💾 Dati</h2><div class="card">
    <button class="btn block" onclick="exportData()">⬇️ Esporta backup (JSON)</button>
    <label class="btn block" style="margin-top:8px;text-align:center">⬆️ Importa backup<input type="file" accept="application/json" style="display:none" onchange="importData(this)"></label>
    <button class="btn warn block" style="margin-top:8px" onclick="resetApp()">🗑 Reset completo app</button></div>`;

  h+=`<p class="tiny muted center" style="margin-top:16px">GymTracker v1.0 · ${EXERCISES.length} esercizi · PWA</p>`;
  $('#view-impostazioni').innerHTML=h;
};
window.switchProfile = switchProfile;
window.newProfileSheet=function(){
  openSheet(`<h3>Nuovo profilo</h3>
    <label class="fld">Nome</label><input id="np-name" placeholder="Es. Giulia">
    <label class="fld">Sesso</label>
    <select id="np-sex"><option value="m">Uomo</option><option value="f">Donna</option><option value="x">Preferisco non dirlo</option></select>
    <button class="btn primary block" style="margin-top:12px" onclick="doNewProfile()">Crea e fai l'intervista</button>`);
};
window.doNewProfile=function(){ const n=($('#np-name').value||'').trim()||'Nuovo'; const sx=$('#np-sex').value;
  createProfile(n,sx); closeSheet(); applyTheme(); startOnboarding({name:n,sex:sx}); };
window.deleteProfileSheet=function(){ if(!confirm('Eliminare il profilo attivo e tutti i suoi dati?')) return;
  const id=activeProfileId();
  Object.keys(localStorage).filter(k=>k.indexOf('pf:'+id+':')===0).forEach(k=>localStorage.removeItem(k));
  const list=profiles().filter(p=>p.id!==id); saveProfiles(list);
  localStorage.setItem('activeProfile', (list[0]&&list[0].id)||'default'); applyTheme(); go('scheda'); toast('Profilo eliminato');
};
window.toggleTD=function(d){ const s=settings(); let t=Array.isArray(s.trainingDays)?s.trainingDays.slice():[1,2,4,6];
  if(t.includes(d)) t=t.filter(x=>x!==d); else t.push(d); t.sort(); s.trainingDays=t; saveSettings(s); VIEWS.impostazioni(); };
window.setTrainingDays=function(arr){ const s=settings(); s.trainingDays=arr.slice(); saveSettings(s); toast('Settimana impostata'); VIEWS.impostazioni(); };
window.setTrainingTime=function(d,v){ const s=settings(); s.trainingTimes=s.trainingTimes||{}; s.trainingTimes[d]=v; saveSettings(s); };
window.setNotifyType=function(v){ const s=settings(); s.notifyType=v; saveSettings(s); };
window.saveGeneral=function(){ const s=settings(); s.userName=$('#s-name').value; s.email=$('#s-email').value;
  s.planStartDate=$('#s-start').value; s.notifyWeeks=parseInt($('#s-weeks').value)||6; saveSettings(s); toast('Salvato'); };
window.saveAI=function(){ const s=settings();
  const k=$('#s-key').value.trim(); if(k) s.claudeApiKey=k;   // vuoto = non cambiare
  s.claudeModel=$('#s-model').value.trim()||'claude-sonnet-4-6';
  s.claudeProxyUrl=normalizeUrl($('#s-proxy').value.trim());
  saveSettings(s); toast((s.claudeApiKey||s.claudeProxyUrl)?'AI salvato ✅':'AI salvato'); VIEWS.impostazioni(); };
function normalizeUrl(u){ if(!u) return ''; if(!/^https?:\/\//i.test(u)) u='https://'+u; return u.replace(/\/+$/,''); }
window.clearKey=function(){ const s=settings(); s.claudeApiKey=''; saveSettings(s); toast('Chiave rimossa'); VIEWS.impostazioni(); };
window.saveEmail=function(){ const s=settings(); s.emailjsServiceId=$('#s-sid').value.trim(); s.emailjsTemplateId=$('#s-tid').value.trim(); s.emailjsUserId=$('#s-uid').value.trim(); saveSettings(s); toast('EmailJS salvato'); };

window.exportData=function(){
  const dump={}; ['activeWorkoutPlan','workoutLog','bodyMetrics','settings','progressPhotos','chatHistory'].forEach(k=>dump[k]=DB.get(k,null));
  const blob=new Blob([JSON.stringify(dump,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='gymtracker-backup-'+today()+'.json'; a.click(); toast('Backup esportato');
};
window.importData=function(input){ const f=input.files[0]; if(!f) return;
  const r=new FileReader(); r.onload=()=>{ try{ const d=JSON.parse(r.result);
    Object.keys(d).forEach(k=>{ if(d[k]!=null) DB.set(k,d[k]); }); toast('Backup importato'); go('scheda');
  }catch(e){ alert('File non valido'); } }; r.readAsText(f);
};
window.resetApp=function(){ if(confirm('Cancellare TUTTI i dati? Operazione irreversibile.')){ localStorage.clear(); location.reload(); } };

/* ===== Notifications ===== */
window.enableNotifications=async function(){
  if(!('Notification' in window)){ toast('Notifiche non supportate'); return; }
  const p=await Notification.requestPermission();
  if(p==='granted'){ toast('Notifiche attivate'); maybeNotify(true); } else toast('Permesso negato');
};
function maybeNotify(force){
  if(Notification && Notification.permission==='granted'){
    const w=weeksSincePlanChange();
    if(force || w>=settings().notifyWeeks){
      navigator.serviceWorker?.ready.then(reg=>{
        reg.showNotification('🏋️ GymTracker', {body: w>=settings().notifyWeeks?`Sono passate ${w} settimane: è ora di cambiare scheda!`:'Pronto per il prossimo allenamento!', icon:'icons/icon-192.png'});
      }).catch(()=>{});
    }
  }
}

/* ===== EmailJS ===== */
function loadEmailJS(){
  return new Promise((resolve,reject)=>{
    if(window.emailjs) return resolve(window.emailjs);
    const sc=document.createElement('script');
    sc.src='https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
    sc.onload=()=>{ try{ window.emailjs.init(settings().emailjsUserId); }catch(e){} resolve(window.emailjs); };
    sc.onerror=reject; document.head.appendChild(sc);
  });
}
async function sendEmail(reason, planText){
  const s=settings();
  if(!s.emailjsServiceId||!s.emailjsTemplateId||!s.emailjsUserId) return false;
  try{ const ej=await loadEmailJS();
    await ej.send(s.emailjsServiceId, s.emailjsTemplateId, {
      to_email:s.email, user_name:s.userName, date:fmtDate(today()), reason, plan:planText||'',
      message:`Ciao ${s.userName}, ${reason}. Apri GymTracker per vedere la nuova scheda.`
    }, s.emailjsUserId);
    return true;
  }catch(e){ console.warn('email',e); return false; }
}
window.testEmail=async function(){ const ok=await sendEmail('Email di test da GymTracker'); toast(ok?'Email inviata':'Configura EmailJS o controlla i dati'); };

/* ============================================================
   Automation triggers
   ============================================================ */
function weeksSincePlanChange(){
  const s=settings(); const d=new Date(s.lastPlanChange||s.planStartDate||today());
  return Math.floor((Date.now()-d.getTime())/(7*864e5));
}
function checkStagnation(){
  // same top-set weight on a lift for 3+ distinct sessions -> notify
  const log=DB.get('workoutLog',{});
  const byEx={};
  Object.entries(log).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([d,w])=>{
    for(const id in w.exercises){ const sets=w.exercises[id].sets||[]; const top=Math.max(0,...sets.map(s=>s.kg||0));
      if(top>0){ (byEx[id]=byEx[id]||[]).push(top); } }
  });
  for(const id in byEx){ const arr=byEx[id].slice(-3);
    if(arr.length>=3 && arr.every(v=>v===arr[0])){
      const s=settings(); const flag=DB.get('stagnationNotified',{});
      if(flag[id]!==arr[0]){ flag[id]=arr[0]; DB.set('stagnationNotified',flag);
        sendEmail(`Stagnazione rilevata su ${(EX_BY_ID[id]||{}).name||id}: stesso peso per 3 sessioni`);
        toast('💡 Stagnazione rilevata: valuta un cambio scheda'); }
    }
  }
}
function trainingReminder(){
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  if(!getTrainingDays().includes(new Date().getDay())) return;
  if(DB.get('workoutLog',{})[today()]) return;            // già allenato oggi
  if(DB.get('trainReminded',null)===today()) return;      // già avvisato oggi
  DB.set('trainReminded', today());
  const rec=activePlan().days[recommendedDayIdx()];
  navigator.serviceWorker?.ready.then(reg=>reg.showNotification('🏋️ GymTracker',
    {body:`Oggi tocca al Giorno ${rec.type} — ${rec.name}. Forza Tommy! 💪`, icon:'icons/icon-192.png'})).catch(()=>{});
}

// Importa misurazioni passate via URL (?weight=78&bf=22&muscle=58...) — usato dalla Scorciatoia iOS che legge Apple Salute/Renpho.
function ingestHealthParams(){
  let qs; try{ qs=new URLSearchParams(location.search); }catch(e){ return; }
  if(![...qs.keys()].length) return;
  const map={weight:'weight',peso:'weight',bf:'bodyFat',bodyfat:'bodyFat',grasso:'bodyFat',muscle:'muscleMass',
    massa:'muscleMass',water:'water',acqua:'water',waist:'waist',vita:'waist',chest:'chest',petto:'chest',
    arms:'arms',braccia:'arms',thighs:'thighs',cosce:'thighs',
    bmi:'bmi',lean:'leanMass',skeletal:'skeletalMuscle',visceral:'visceralFat',subcutaneous:'subcutaneousFat',
    bone:'boneMass',protein:'protein',proteine:'protein',bmr:'bmr',metabolicage:'metabolicAge',eta:'metabolicAge'};
  const arr=DB.get('bodyMetrics',[]); const i=arr.findIndex(x=>x.date===today());
  let m = i>=0 ? Object.assign({},arr[i]) : {date:today()}; let got=false;
  for(const [k,v] of qs.entries()){ const f=map[k.toLowerCase()]; const val=parseFloat(String(v).replace(',','.'));
    if(f && !isNaN(val)){ m[f]=val; got=true; } }
  if(got){ if(i>=0)arr[i]=m; else arr.push(m); arr.sort((a,b)=>a.date.localeCompare(b.date)); DB.set('bodyMetrics',arr);
    try{ history.replaceState(null,'',location.pathname); }catch(e){}
    setTimeout(()=>toast('Dati salute importati ✅'),700); }
}

function autoCheckPlanAge(){
  const w=weeksSincePlanChange();
  if(w>=settings().notifyWeeks){
    const flag=DB.get('planAgeNotified',null);
    if(flag!==settings().lastPlanChange){
      DB.set('planAgeNotified',settings().lastPlanChange);
      sendEmail(`Sono passate ${w} settimane dalla tua ultima scheda`);
      maybeNotify();
    }
  }
}

/* ============================================================
   Init
   ============================================================ */
function init(){
  // register SW
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('sw.js').catch(()=>{}); }
  migrateProfiles();
  applyTheme();
  document.addEventListener('visibilitychange', ()=>{ if(!document.hidden){ const r=$('#rest'); if(r && !r.classList.contains('hidden')) tickRest(); } });
  ingestHealthParams(); // importa dati salute passati via URL (Scorciatoia iOS)
  Media.load().then(()=>{ // re-render current view once images resolve
    const act=$('#tabbar button.active'); if(act) go(act.dataset.tab);
  });
  curDayIdx = recommendedDayIdx(); // open the smart-recommended day
  go('scheda');
  autoCheckPlanAge();
  trainingReminder();
  if(!DB.get('onboarded', false)) window.startOnboarding(); // primo accesso: intervista
  Cloud.init().catch(()=>{}); // se configurato, ripristina sessione e sincronizza
}
init();
