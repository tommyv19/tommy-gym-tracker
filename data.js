/* ============================================================
   GymTracker — Exercise database + SVG dummy-figure engine
   100% offline. No external assets.
   ============================================================ */

const MUSCLE_LABELS = {
  chest:'Petto', back:'Schiena', lats:'Dorsali', traps:'Trapezi',
  shoulders:'Spalle', rearDelts:'Deltoidi post.', biceps:'Bicipiti',
  triceps:'Tricipiti', forearms:'Avambracci', abs:'Addominali',
  obliques:'Obliqui', quads:'Quadricipiti', hamstrings:'Femorali',
  glutes:'Glutei', calves:'Polpacci', adductors:'Adduttori', lowerBack:'Lombari',
  core:'Core'
};

/* ---------- Figure engine ---------- */
const FIG = {
  ACCENT:'#ff4a2a', ACCENT2:'#ffae42', LIMB:'#6b7178', HEAD:'#868d95',
  // neutral standing skeleton (viewBox 0 0 110 150)
  BASE: {
    head:[55,18], neck:[55,28],
    sL:[44,33], sR:[66,33],
    eL:[40,55], eR:[70,55],
    hL:[39,76], hR:[71,76],
    pelvis:[55,78],
    hipL:[48,80], hipR:[62,80],
    kL:[47,108], kR:[63,108],
    fL:[46,134], fR:[64,134]
  }
};

/* pose overrides — only the joints that move */
const POSES = {
  stand: {},
  // ---- biceps curl ----
  curlDown: { eL:[42,57], eR:[68,57], hL:[42,78], hR:[68,78] },
  curlUp:   { eL:[43,56], eR:[67,56], hL:[47,38], hR:[63,38] },
  // ---- overhead / shoulder press ----
  pressDown:{ sL:[42,33], sR:[68,33], eL:[33,44], eR:[77,44], hL:[40,33], hR:[70,33] },
  pressUp:  { eL:[46,16], eR:[64,16], hL:[47,3], hR:[63,3] },
  // ---- lateral raise ----
  latDown:  { eL:[42,56], eR:[68,56], hL:[42,77], hR:[68,77] },
  latUp:    { eL:[33,34], eR:[77,34], hL:[19,33], hR:[91,33] },
  // ---- front raise ----
  frontUp:  { eL:[45,40], eR:[65,40], hL:[47,17], hR:[63,17] },
  // ---- pushdown / triceps extension ----
  pdTop:    { eL:[43,55], eR:[67,55], hL:[45,38], hR:[65,38] },
  pdBottom: { eL:[43,55], eR:[67,55], hL:[44,77], hR:[66,77] },
  // ---- overhead triceps extension ----
  ohExtBent:{ eL:[47,17], eR:[63,17], hL:[55,30], hR:[55,30] },
  ohExtUp:  { eL:[47,15], eR:[63,15], hL:[48,2], hR:[62,2] },
  // ---- row (bent torso) ----
  rowDown:  { head:[40,40], neck:[44,46], pelvis:[70,64], hipL:[74,66], hipR:[76,72],
              sL:[40,50], sR:[50,50], eL:[38,72], eR:[52,72], hL:[37,86], hR:[53,86],
              kL:[74,98], kR:[80,98], fL:[72,132], fR:[82,132] },
  rowUp:    { head:[40,40], neck:[44,46], pelvis:[70,64], hipL:[74,66], hipR:[76,72],
              sL:[40,50], sR:[50,50], eL:[34,58], eR:[56,58], hL:[44,56], hR:[48,56],
              kL:[74,98], kR:[80,98], fL:[72,132], fR:[82,132] },
  // ---- pulldown / pullup ----
  pullTop:  { eL:[40,18], eR:[70,18], hL:[38,3], hR:[72,3] },
  pullBot:  { eL:[36,40], eR:[74,40], hL:[40,26], hR:[70,26] },
  // ---- squat ----
  squatUp:  {},
  squatDn:  { head:[55,30], neck:[55,40], sL:[44,45], sR:[66,45], eL:[40,60], eR:[70,60],
              hL:[39,74], hR:[71,74], pelvis:[55,90], hipL:[47,92], hipR:[63,92],
              kL:[40,104], kR:[70,104], fL:[44,134], fR:[66,134] },
  // ---- hinge (deadlift / RDL / good morning) ----
  hingeUp:  {},
  hingeDn:  { head:[40,44], neck:[45,48], sL:[42,52], sR:[52,52], eL:[42,72], eR:[50,72],
              hL:[42,90], hR:[50,90], pelvis:[72,62], hipL:[74,64], hipR:[76,70],
              kL:[72,100], kR:[78,100], fL:[70,134], fR:[80,134] },
  // ---- lunge ----
  lungeUp:  {},
  lungeDn:  { pelvis:[55,92], hipL:[49,94], hipR:[61,94],
              kL:[40,108], kR:[70,118], fL:[34,134], fR:[78,118] },
  // ---- leg curl (seated) ----
  legcurlEx:{ hipL:[40,82], hipR:[40,90], kL:[78,84], kR:[78,92], fL:[104,84], fR:[104,92],
              pelvis:[40,80], head:[24,70], neck:[32,72], sL:[28,66], sR:[28,78],
              eL:[40,66], eR:[40,78], hL:[52,66], hR:[52,78] },
  legcurlFl:{ hipL:[40,82], hipR:[40,90], kL:[78,84], kR:[78,92], fL:[80,108], fR:[80,116],
              pelvis:[40,80], head:[24,70], neck:[32,72], sL:[28,66], sR:[28,78],
              eL:[40,66], eR:[40,78], hL:[52,66], hR:[52,78] },
  // ---- leg extension (seated) ----
  legextFl:{ hipL:[40,82], hipR:[40,90], kL:[72,92], kR:[72,100], fL:[70,120], fR:[78,120],
             pelvis:[40,80], head:[24,68], neck:[32,72], sL:[28,66], sR:[28,78],
             eL:[40,66], eR:[40,78], hL:[52,66], hR:[52,78] },
  legextEx:{ hipL:[40,82], hipR:[40,90], kL:[72,90], kR:[72,98], fL:[104,86], fR:[104,94],
             pelvis:[40,80], head:[24,68], neck:[32,72], sL:[28,66], sR:[28,78],
             eL:[40,66], eR:[40,78], hL:[52,66], hR:[52,78] },
  // ---- calf ----
  calfFlat: {},
  calfRaise:{ pelvis:[55,74], hipL:[48,76], hipR:[62,76], kL:[47,104], kR:[63,104],
              fL:[46,128], fR:[64,128], head:[55,14], neck:[55,24] },
  // ---- chest press (reclined push) ----
  cpDown:   { sL:[44,33], sR:[66,33], eL:[36,46], eR:[74,46], hL:[40,33], hR:[70,33] },
  cpUp:     { eL:[44,30], eR:[66,30], hL:[47,14], hR:[63,14] },
  // ---- fly ----
  flyOpen:  { eL:[30,40], eR:[80,40], hL:[18,46], hR:[92,46] },
  flyClose: { eL:[46,38], eR:[64,38], hL:[50,30], hR:[60,30] },
  // ---- pullover ----
  povBack:  { eL:[46,18], eR:[64,18], hL:[48,4], hR:[62,4] },
  povFront: { eL:[46,40], eR:[64,40], hL:[50,52], hR:[60,52] },
  // ---- dip ----
  dipUp:    { sL:[44,33], sR:[66,33], eL:[42,52], eR:[68,52], hL:[42,72], hR:[68,72] },
  dipDown:  { sL:[44,40], sR:[66,40], eL:[36,52], eR:[74,52], hL:[40,68], hR:[70,68],
              pelvis:[55,84], hipL:[48,86], hipR:[62,86], kL:[47,108], kR:[63,108] },
  // ---- pushup (horizontal) ----
  puUp:     { head:[24,66], neck:[32,68], sL:[36,64], sR:[36,72], eL:[36,84], eR:[36,90],
              hL:[36,98], hR:[36,104], pelvis:[78,72], hipL:[74,70], hipR:[74,76],
              kL:[98,74], kR:[98,80], fL:[110,76], fR:[110,82] },
  puDown:   { head:[22,76], neck:[30,76], sL:[34,74], sR:[34,80], eL:[24,86], eR:[24,90],
              hL:[34,98], hR:[34,104], pelvis:[78,80], hipL:[74,78], hipR:[74,84],
              kL:[98,82], kR:[98,88], fL:[110,84], fR:[110,90] },
  // ---- plank ----
  plank:    { head:[22,72], neck:[30,73], sL:[34,72], sR:[34,78], eL:[30,88], eR:[30,92],
              hL:[34,98], hR:[34,104], pelvis:[78,76], hipL:[74,74], hipR:[74,80],
              kL:[98,80], kR:[98,86], fL:[110,82], fR:[110,88] },
  // ---- crunch (reclined) ----
  crunchDn: { head:[26,66], neck:[34,70], sL:[34,64], sR:[34,74], eL:[28,58], eR:[28,80],
              hL:[24,52], hR:[24,86], pelvis:[64,84], hipL:[66,82], hipR:[66,88],
              kL:[84,66], kR:[88,70], fL:[74,86], fR:[78,90] },
  crunchUp: { head:[40,60], neck:[44,66], sL:[42,62], sR:[42,72], eL:[50,58], eR:[50,76],
              hL:[60,58], hR:[60,76], pelvis:[64,84], hipL:[66,82], hipR:[66,88],
              kL:[84,66], kR:[88,70], fL:[74,86], fR:[78,90] },
  // ---- leg raise ----
  lrDown:   { head:[24,72], neck:[32,73], sL:[34,72], sR:[34,78], eL:[30,80], eR:[30,84],
              hL:[26,86], hR:[26,90], pelvis:[64,76], hipL:[66,74], hipR:[66,80],
              kL:[90,76], kR:[90,82], fL:[108,76], fR:[108,82] },
  lrUp:     { head:[24,72], neck:[32,73], sL:[34,72], sR:[34,78], eL:[30,80], eR:[30,84],
              hL:[26,86], hR:[26,90], pelvis:[64,76], hipL:[66,74], hipR:[66,80],
              kL:[80,54], kR:[84,56], fL:[86,32], fR:[90,34] },
  // ---- twist ----
  twistL:   { head:[42,60], neck:[46,66], pelvis:[60,86], sL:[40,64], sR:[52,64],
              eL:[44,74], eR:[56,74], hL:[36,80], hR:[48,80],
              hipL:[58,88], hipR:[64,90], kL:[78,74], kR:[82,80], fL:[70,92], fR:[74,96] },
  twistR:   { head:[42,60], neck:[46,66], pelvis:[60,86], sL:[40,64], sR:[52,64],
              eL:[48,74], eR:[60,74], hL:[56,72], hR:[68,74], hipL:[58,88], hipR:[64,90],
              kL:[78,74], kR:[82,80], fL:[70,92], fR:[74,96] },
  // ---- stretches ----
  reachUp:  { eL:[48,14], eR:[62,14], hL:[50,1], hR:[60,1] },
  sideBend: { head:[64,22], neck:[60,30], sL:[50,36], sR:[70,34], eL:[44,18], eR:[72,52],
              hL:[42,4], hR:[74,70], pelvis:[57,78] },
  fold:     { head:[55,70], neck:[55,62], sL:[47,58], sR:[63,58], eL:[46,74], eR:[64,74],
              hL:[46,92], hR:[64,92], pelvis:[55,52], hipL:[49,52], hipR:[61,52] },
  quadStr:  { kL:[47,108], fL:[60,92], hL:[60,92], eL:[52,80] },
  child:    { head:[28,80], neck:[36,80], sL:[40,76], sR:[40,84], eL:[24,80], eR:[24,84],
              hL:[14,80], hR:[14,84], pelvis:[72,82], hipL:[74,80], hipR:[74,86],
              kL:[84,86], kR:[88,90], fL:[96,86], fR:[100,90] },
  cobra:    { head:[26,58], neck:[34,62], sL:[36,62], sR:[36,68], eL:[30,76], eR:[30,80],
              hL:[34,90], hR:[34,94], pelvis:[76,86], hipL:[74,84], hipR:[74,90],
              kL:[96,88], kR:[100,92], fL:[110,90], fR:[110,94] }
};

function _pose(name){ return Object.assign({}, FIG.BASE, POSES[name] || {}); }
function _mid(a,b,t){ t = (t==null)?0.5:t; return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t]; }
function _line(a,b,w,c){ return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`; }
function _blob(pt,r,c){ return `<circle cx="${pt[0]}" cy="${pt[1]}" r="${r}" fill="${c}" opacity="0.92"/>`; }

// where each muscle's highlight blob(s) sit, given a pose's joints
function _muscleBlobs(p, muscle){
  switch(muscle){
    case 'chest': return [[_mid(p.neck,p.pelvis,0.30),5]];
    case 'abs': case 'core': return [[_mid(p.neck,p.pelvis,0.68),4.5]];
    case 'obliques': return [[_mid(p.neck,p.pelvis,0.62).map((v,i)=>v+(i?0:-5)),3.2],[_mid(p.neck,p.pelvis,0.62).map((v,i)=>v+(i?0:5)),3.2]];
    case 'back': case 'lats': return [[_mid(p.neck,p.pelvis,0.45),5]];
    case 'lowerBack': return [[_mid(p.neck,p.pelvis,0.82),4]];
    case 'traps': return [[_mid(p.neck,_mid(p.sL,p.sR),0.4),4]];
    case 'shoulders': case 'rearDelts': return [[p.sL,4],[p.sR,4]];
    case 'biceps': return [[_mid(p.sL,p.eL,0.5),3.6],[_mid(p.sR,p.eR,0.5),3.6]];
    case 'triceps': return [[_mid(p.sL,p.eL,0.6),3.6],[_mid(p.sR,p.eR,0.6),3.6]];
    case 'forearms': return [[_mid(p.eL,p.hL,0.5),3],[_mid(p.eR,p.hR,0.5),3]];
    case 'quads': return [[_mid(p.hipL,p.kL,0.45),4.5],[_mid(p.hipR,p.kR,0.45),4.5]];
    case 'hamstrings': return [[_mid(p.hipL,p.kL,0.55),4],[_mid(p.hipR,p.kR,0.55),4]];
    case 'adductors': return [[_mid(p.hipL,p.kL,0.4),3],[_mid(p.hipR,p.kR,0.4),3]];
    case 'glutes': return [[_mid(p.pelvis,_mid(p.hipL,p.hipR),0.6),4.5]];
    case 'calves': return [[_mid(p.kL,p.fL,0.5),3.4],[_mid(p.kR,p.fR,0.5),3.4]];
    default: return [];
  }
}

function buildFigure(poseName, primary, secondary){
  primary = primary || []; secondary = secondary || [];
  const p = _pose(poseName);
  let s = `<svg viewBox="0 0 110 150" xmlns="http://www.w3.org/2000/svg" role="img">`;
  // limbs (capsule lines)
  const W = 7;
  s += _line(p.neck, p.pelvis, W+2, FIG.LIMB);      // torso
  s += _line(p.sL, p.sR, 4, FIG.LIMB);               // shoulders bar
  s += _line(p.sL, p.eL, W-1, FIG.LIMB);             // upper arm L
  s += _line(p.sR, p.eR, W-1, FIG.LIMB);
  s += _line(p.eL, p.hL, W-2, FIG.LIMB);             // forearm L
  s += _line(p.eR, p.hR, W-2, FIG.LIMB);
  s += _line(p.pelvis, p.hipL, 4, FIG.LIMB);
  s += _line(p.pelvis, p.hipR, 4, FIG.LIMB);
  s += _line(p.hipL, p.kL, W, FIG.LIMB);             // thigh L
  s += _line(p.hipR, p.kR, W, FIG.LIMB);
  s += _line(p.kL, p.fL, W-2, FIG.LIMB);             // shin L
  s += _line(p.kR, p.fR, W-2, FIG.LIMB);
  // head
  s += `<circle cx="${p.head[0]}" cy="${p.head[1]}" r="7.5" fill="${FIG.HEAD}"/>`;
  s += _line(p.neck, p.head, 5, FIG.LIMB);
  // muscle highlights (secondary first, primary on top)
  secondary.forEach(m => _muscleBlobs(p,m).forEach(([pt,r]) => s += _blob(pt,r,FIG.ACCENT2)));
  primary.forEach(m => _muscleBlobs(p,m).forEach(([pt,r]) => s += _blob(pt,r,FIG.ACCENT)));
  s += `</svg>`;
  return s;
}

/* ---------- Exercise database (84) ---------- */
const E = (id,name,cat,equip,diff,primary,secondary,start,end,steps,variants,stretch)=>(
  {id,name,cat,equip,diff,primary,secondary,start,end,steps,variants,stretch});

const EXERCISES = [
  // ===== PETTO =====
  E('panca-piana','Panca Piana','petto',['Rack','Bilanciere'],'Intermedio',['chest'],['triceps','shoulders'],'cpDown','cpUp',
    ['Sdraiati sulla panca, scapole retratte e piedi a terra.','Afferra il bilanciere poco più largo delle spalle.','Scendi controllato fino a sfiorare il petto.','Spingi esplosivo fino a braccia tese senza bloccare i gomiti.'],
    {easier:'Panca con manubri o multipower',harder:'Pausa di 1s al petto'},'chest-stretch'),
  E('panca-inclinata','Panca Inclinata','petto',['Rack','Bilanciere','Manubri'],'Intermedio',['chest'],['shoulders','triceps'],'cpDown','cpUp',
    ['Imposta la panca a 30-45°.','Scendi verso la parte alta del petto.','Spingi mantenendo i gomiti a ~45°.'],
    {easier:'Manubri leggeri',harder:'Tempo 3-1-1'},'chest-stretch'),
  E('panca-declinata','Panca Declinata','petto',['Rack','Bilanciere'],'Intermedio',['chest'],['triceps'],'cpDown','cpUp',
    ['Panca inclinata verso il basso, gambe bloccate.','Scendi verso la parte bassa del petto.','Spingi concentrandoti sul petto basso.'],
    {easier:'Push-up declinati',harder:'Carico maggiore con spotter'},'chest-stretch'),
  E('distensioni-manubri','Distensioni con Manubri','petto',['Manubri'],'Principiante',['chest'],['triceps','shoulders'],'cpDown','cpUp',
    ['Sdraiato su panca piana, un manubrio per mano sopra il petto.','Scendi controllato fino a sentire stiramento al petto.','Spingi i manubri verso l\'alto avvicinandoli.'],
    {easier:'Carico leggero',harder:'Su panca inclinata'},'chest-stretch'),
  E('croci-manubri','Croci con Manubri','petto',['Manubri'],'Principiante',['chest'],['shoulders'],'flyOpen','flyClose',
    ['Sdraiati con manubri sopra il petto, gomiti leggermente piegati.','Apri le braccia ad arco fino a sentire stiramento.','Chiudi contraendo il petto.'],
    {easier:'Cavi croci',harder:'Pausa in massima apertura'},'chest-stretch'),
  E('push-up','Push-up','petto',['Corpo libero'],'Principiante',['chest'],['triceps','core'],'puUp','puDown',
    ['Posizione plank, mani poco più larghe delle spalle.','Scendi con il corpo dritto fino a sfiorare il pavimento.','Spingi fino a braccia tese.'],
    {easier:'Push-up sulle ginocchia',harder:'Push-up con TRX o zavorra'},'chest-stretch'),
  E('dips','Dips alle Parallele','petto',['Rack'],'Intermedio',['chest'],['triceps','shoulders'],'dipUp','dipDown',
    ['Sospeso alle parallele, busto inclinato in avanti.','Scendi fino a gomiti a 90°.','Spingi verso l\'alto contraendo petto e tricipiti.'],
    {easier:'Dips assistiti con elastico',harder:'Dips zavorrati'},'chest-stretch'),
  E('cavi-croci','Cavi Croci (Crossover)','petto',['Rack'],'Intermedio',['chest'],['shoulders'],'flyOpen','flyClose',
    ['In piedi al centro dei cavi, leggero affondo.','Porta le mani avanti e in basso ad arco.','Contrai al centro e ritorna controllato.'],
    {easier:'Carico ridotto',harder:'Cavi alti->bassi a una mano'},'chest-stretch'),
  E('pec-deck','Pec Deck (Butterfly)','petto',['Multi-power'],'Principiante',['chest'],[],'flyOpen','flyClose',
    ['Seduto, schiena aderente, gomiti all\'altezza delle spalle.','Chiudi le braccia davanti contraendo il petto.','Ritorna controllato senza far sbattere i pesi.'],
    {easier:'Carico leggero',harder:'Pausa 2s in chiusura'},'chest-stretch'),
  E('pullover','Pullover con Manubrio','petto',['Manubri'],'Intermedio',['chest'],['lats','triceps'],'povBack','povFront',
    ['Sdraiato, manubrio tenuto sopra il petto a due mani.','Porta il peso dietro la testa stirando petto e dorsali.','Riporta sopra il petto contraendo.'],
    {easier:'Range ridotto',harder:'Su panca trasversale'},'chest-stretch'),
  E('push-up-diamante','Push-up Diamante','petto',['Corpo libero'],'Intermedio',['triceps'],['chest'],'puUp','puDown',
    ['Mani vicine a formare un diamante sotto il petto.','Scendi mantenendo i gomiti vicini al corpo.','Spingi fino a estensione completa.'],
    {easier:'Sulle ginocchia',harder:'Piedi rialzati'},'triceps-stretch'),

  // ===== SCHIENA =====
  E('stacco','Stacco da Terra','schiena',['Rack','Bilanciere'],'Avanzato',['back','glutes','hamstrings'],['lowerBack','traps','forearms'],'hingeDn','hingeUp',
    ['Piedi a larghezza anche, bilanciere sopra il metatarso.','Presa fuori dalle ginocchia, schiena neutra.','Spingi col pavimento estendendo anche e ginocchia insieme.','In piedi contrai i glutei, poi scendi controllato.'],
    {easier:'Stacco con trap-bar o rack pull',harder:'Stacco a deficit'},'hamstring-stretch'),
  E('rematore-bilanciere','Rematore con Bilanciere','schiena',['Rack','Bilanciere'],'Intermedio',['back','lats'],['biceps','rearDelts'],'rowDown','rowUp',
    ['Busto inclinato ~45°, schiena neutra.','Tira il bilanciere verso l\'ombelico.','Stringi le scapole, poi scendi controllato.'],
    {easier:'Rematore a un braccio con manubrio',harder:'Pendlay row'},'lat-stretch'),
  E('trazioni','Trazioni alla Sbarra','schiena',['Rack'],'Avanzato',['lats','back'],['biceps','forearms'],'pullTop','pullBot',
    ['Appeso alla sbarra, presa prona larga.','Tira portando il petto verso la sbarra.','Scendi controllato a braccia tese.'],
    {easier:'Lat machine o trazioni assistite',harder:'Trazioni zavorrate'},'lat-stretch'),
  E('lat-machine','Lat Machine','schiena',['Multi-power'],'Principiante',['lats'],['biceps'],'pullTop','pullBot',
    ['Seduto, ginocchia bloccate, presa larga.','Tira la barra verso il petto.','Risali controllato allungando i dorsali.'],
    {easier:'Carico ridotto, presa neutra',harder:'Presa stretta a una mano'},'lat-stretch'),
  E('pulley','Pulley Basso','schiena',['Multi-power'],'Principiante',['back','lats'],['biceps'],'rowDown','rowUp',
    ['Seduto, gambe semipiegate, schiena dritta.','Tira l\'impugnatura verso l\'addome.','Stringi le scapole e ritorna controllato.'],
    {easier:'Carico leggero',harder:'Presa larga'},'lat-stretch'),
  E('t-bar-row','T-Bar Row','schiena',['Bilanciere'],'Intermedio',['back','lats'],['biceps','traps'],'rowDown','rowUp',
    ['Busto inclinato, bilanciere tra le gambe.','Tira verso il petto stringendo le scapole.','Scendi controllato.'],
    {easier:'Rematore manubrio',harder:'Presa stretta supina'},'lat-stretch'),
  E('pullover-manubrio','Pullover per Dorsali','schiena',['Manubri'],'Intermedio',['lats'],['chest','triceps'],'povBack','povFront',
    ['Sdraiato, manubrio sopra il petto.','Porta dietro la testa stirando i dorsali.','Riporta sopra contraendo i dorsali.'],
    {easier:'Range ridotto',harder:'Carico maggiore'},'lat-stretch'),
  E('face-pull','Face Pull','schiena',['Multi-power'],'Principiante',['rearDelts','traps'],['back'],'latDown','latUp',
    ['Cavo all\'altezza del viso, presa con corda.','Tira verso la fronte aprendo i gomiti.','Stringi le scapole e ritorna.'],
    {easier:'Carico leggero',harder:'Pausa 2s in contrazione'},'shoulder-stretch'),
  E('good-morning','Good Morning','schiena',['Rack','Bilanciere'],'Intermedio',['hamstrings','lowerBack'],['glutes'],'hingeUp','hingeDn',
    ['Bilanciere sulle spalle, ginocchia morbide.','Fletti le anche portando il busto avanti.','Risali contraendo glutei e femorali.'],
    {easier:'A corpo libero',harder:'Tempo lento'},'hamstring-stretch'),
  E('iperestensioni','Iperestensioni Lombari','schiena',['Multi-power'],'Principiante',['lowerBack'],['glutes','hamstrings'],'hingeDn','hingeUp',
    ['Anche appoggiate al supporto, gambe bloccate.','Scendi flettendo il busto.','Risali fino ad allineare busto e gambe.'],
    {easier:'Range ridotto senza peso',harder:'Con disco al petto'},'hamstring-stretch'),
  E('rematore-manubrio','Rematore con Manubrio','schiena',['Manubri'],'Principiante',['lats','back'],['biceps'],'rowDown','rowUp',
    ['Un ginocchio e una mano sulla panca.','Tira il manubrio verso il fianco.','Stringi la scapola e scendi controllato.'],
    {easier:'Carico leggero',harder:'Pausa in alto'},'lat-stretch'),

  // ===== GAMBE =====
  E('squat','Squat con Bilanciere','gambe',['Rack','Bilanciere'],'Intermedio',['quads','glutes'],['hamstrings','core'],'squatUp','squatDn',
    ['Bilanciere sui trapezi, piedi a larghezza spalle.','Scendi spingendo le anche indietro, schiena neutra.','Arriva almeno parallelo, poi spingi col pavimento.'],
    {easier:'Goblet squat o box squat',harder:'Pausa in buca / front squat'},'quad-stretch'),
  E('leg-press','Leg Press','gambe',['Multi-power'],'Principiante',['quads','glutes'],['hamstrings'],'legextEx','legextFl',
    ['Seduto, piedi a larghezza spalle sulla pedana.','Sblocca e scendi fino a ~90° di ginocchio.','Spingi senza bloccare le ginocchia.'],
    {easier:'Range ridotto',harder:'Una gamba alla volta'},'quad-stretch'),
  E('affondi','Affondi','gambe',['Manubri','Corpo libero'],'Principiante',['quads','glutes'],['hamstrings'],'lungeUp','lungeDn',
    ['In piedi, fai un passo avanti.','Scendi fino a ginocchio posteriore vicino a terra.','Spingi col tallone anteriore per risalire.'],
    {easier:'Affondi statici',harder:'Affondi camminati con manubri'},'quad-stretch'),
  E('romanian-deadlift','Stacco Rumeno (RDL)','gambe',['Bilanciere','Manubri'],'Intermedio',['hamstrings','glutes'],['lowerBack'],'hingeUp','hingeDn',
    ['In piedi, bilanciere sulle cosce, ginocchia morbide.','Spingi le anche indietro facendo scivolare il peso lungo le gambe.','Risali contraendo i glutei.'],
    {easier:'Con manubri, range ridotto',harder:'Su una gamba'},'hamstring-stretch'),
  E('leg-curl','Leg Curl','gambe',['Multi-power'],'Principiante',['hamstrings'],['calves'],'legcurlEx','legcurlFl',
    ['Sdraiato o seduto alla macchina, caviglie sotto il rullo.','Fletti le ginocchia portando i talloni ai glutei.','Ritorna controllato.'],
    {easier:'Carico leggero',harder:'Una gamba / pausa 2s'},'hamstring-stretch'),
  E('leg-extension','Leg Extension','gambe',['Multi-power'],'Principiante',['quads'],[],'legextFl','legextEx',
    ['Seduto, caviglie dietro il rullo.','Estendi le ginocchia fino a gambe tese.','Contrai i quadricipiti e ritorna.'],
    {easier:'Carico leggero',harder:'Pausa in contrazione'},'quad-stretch'),
  E('calf-raises','Calf Raises','gambe',['Manubri','Corpo libero'],'Principiante',['calves'],[],'calfFlat','calfRaise',
    ['In piedi, avampiede su un rialzo.','Sollevati sulle punte il più in alto possibile.','Scendi lentamente sotto il livello del gradino.'],
    {easier:'A corpo libero',harder:'Su una gamba con manubrio'},'calf-stretch'),
  E('goblet-squat','Goblet Squat','gambe',['Manubri'],'Principiante',['quads','glutes'],['core'],'squatUp','squatDn',
    ['Tieni un manubrio al petto a due mani.','Scendi tra le gambe mantenendo busto eretto.','Spingi col pavimento per risalire.'],
    {easier:'Senza peso',harder:'Tempo lento 3s discesa'},'quad-stretch'),
  E('sumo-squat','Sumo Squat','gambe',['Manubri'],'Principiante',['glutes','adductors'],['quads'],'squatUp','squatDn',
    ['Piedi molto larghi, punte verso l\'esterno.','Scendi mantenendo le ginocchia in linea con le punte.','Spingi contraendo glutei e adduttori.'],
    {easier:'A corpo libero',harder:'Con manubrio pesante'},'quad-stretch'),
  E('hack-squat','Hack Squat','gambe',['Multi-power'],'Intermedio',['quads'],['glutes'],'squatUp','squatDn',
    ['Spalle e schiena contro lo schienale della macchina.','Scendi controllato fino a ~90°.','Spingi coi talloni senza bloccare le ginocchia.'],
    {easier:'Range ridotto',harder:'Piedi bassi sulla pedana'},'quad-stretch'),
  E('bulgarian-split-squat','Bulgarian Split Squat','gambe',['Manubri'],'Intermedio',['quads','glutes'],['hamstrings'],'lungeUp','lungeDn',
    ['Piede posteriore su una panca dietro di te.','Scendi con la gamba anteriore fino a ~90°.','Spingi col tallone anteriore per risalire.'],
    {easier:'A corpo libero',harder:'Con manubri pesanti'},'quad-stretch'),
  E('wall-sit','Wall Sit','gambe',['Corpo libero'],'Principiante',['quads'],['glutes'],'squatDn','squatDn',
    ['Schiena contro il muro, scendi fino a cosce parallele.','Mantieni la posizione il più a lungo possibile.','Respira e tieni i quadricipiti in tensione.'],
    {easier:'Angolo più aperto',harder:'Con disco sulle cosce'},'quad-stretch'),

  // ===== SPALLE =====
  E('lento-avanti','Lento Avanti (OHP)','spalle',['Rack','Bilanciere'],'Intermedio',['shoulders'],['triceps','traps'],'pressDown','pressUp',
    ['In piedi, bilanciere all\'altezza delle clavicole.','Spingi sopra la testa estendendo le braccia.','Scendi controllato alle clavicole.'],
    {easier:'Con manubri da seduto',harder:'In piedi strict press'},'shoulder-stretch'),
  E('lento-manubri','Lento con Manubri','spalle',['Manubri'],'Principiante',['shoulders'],['triceps'],'pressDown','pressUp',
    ['Seduto o in piedi, manubri all\'altezza delle spalle.','Spingi sopra la testa senza inarcare la schiena.','Scendi controllato alle spalle.'],
    {easier:'Da seduto con schienale',harder:'In piedi a corpo libero'},'shoulder-stretch'),
  E('arnold-press','Arnold Press','spalle',['Manubri'],'Intermedio',['shoulders'],['triceps'],'pressDown','pressUp',
    ['Manubri davanti alle spalle, palmi verso di te.','Ruota i palmi mentre spingi sopra la testa.','Inverti il movimento in discesa.'],
    {easier:'Carico leggero',harder:'In piedi'},'shoulder-stretch'),
  E('alzate-laterali','Alzate Laterali','spalle',['Manubri'],'Principiante',['shoulders'],[],'latDown','latUp',
    ['In piedi, manubri ai lati, gomiti morbidi.','Solleva ai lati fino all\'altezza delle spalle.','Scendi lentamente controllando il movimento.'],
    {easier:'Carico leggero',harder:'Pausa 2s in alto'},'shoulder-stretch'),
  E('alzate-frontali','Alzate Frontali','spalle',['Manubri'],'Principiante',['shoulders'],[],'latDown','frontUp',
    ['Manubri davanti alle cosce.','Solleva davanti fino all\'altezza delle spalle.','Scendi controllato.'],
    {easier:'Una mano alla volta',harder:'Con disco a due mani'},'shoulder-stretch'),
  E('scrollate','Scrollate (Shrugs)','spalle',['Manubri','Bilanciere'],'Principiante',['traps'],[],'latDown','latDown',
    ['In piedi con pesi lungo i fianchi.','Solleva le spalle verso le orecchie.','Stringi i trapezi, poi scendi.'],
    {easier:'Carico leggero',harder:'Pausa 2s in alto'},'neck-stretch'),
  E('upright-row','Tirata al Mento','spalle',['Bilanciere','Manubri'],'Intermedio',['shoulders','traps'],['biceps'],'latDown','frontUp',
    ['Presa stretta, bilanciere davanti alle cosce.','Tira verso il mento con gomiti alti.','Scendi controllato.'],
    {easier:'Presa più larga',harder:'Tempo lento'},'shoulder-stretch'),
  E('reverse-fly','Reverse Fly (Posteriori)','spalle',['Manubri'],'Principiante',['rearDelts'],['back'],'rowDown','latUp',
    ['Busto inclinato avanti, manubri sotto al petto.','Apri le braccia ai lati stringendo le scapole.','Ritorna controllato.'],
    {easier:'Al pec deck inverso',harder:'Pausa in contrazione'},'shoulder-stretch'),
  E('face-pull-spalle','Face Pull (Spalle)','spalle',['Multi-power'],'Principiante',['rearDelts'],['traps'],'latDown','latUp',
    ['Cavo all\'altezza del viso.','Tira verso la fronte aprendo i gomiti.','Stringi e ritorna controllato.'],
    {easier:'Carico leggero',harder:'Pausa 2s'},'shoulder-stretch'),

  // ===== BICIPITI =====
  E('curl-bilanciere','Curl con Bilanciere','bicipiti',['Bilanciere'],'Principiante',['biceps'],['forearms'],'curlDown','curlUp',
    ['In piedi, bilanciere con presa supina.','Fletti i gomiti portando il peso alle spalle.','Scendi controllato senza dondolare.'],
    {easier:'Bilanciere EZ',harder:'Tempo 3s discesa'},'biceps-stretch'),
  E('curl-manubri','Curl con Manubri','bicipiti',['Manubri'],'Principiante',['biceps'],['forearms'],'curlDown','curlUp',
    ['Manubri ai lati, palmi in avanti.','Fletti alternando o insieme.','Contrai e scendi controllato.'],
    {easier:'Da seduto',harder:'Con supinazione'},'biceps-stretch'),
  E('curl-martello','Curl a Martello','bicipiti',['Manubri'],'Principiante',['biceps','forearms'],[],'curlDown','curlUp',
    ['Manubri con presa neutra (palmi affrontati).','Fletti i gomiti mantenendo i polsi neutri.','Scendi controllato.'],
    {easier:'Una mano alla volta',harder:'Cross-body'},'biceps-stretch'),
  E('curl-concentrazione','Curl di Concentrazione','bicipiti',['Manubri'],'Principiante',['biceps'],[],'curlDown','curlUp',
    ['Seduto, gomito appoggiato all\'interno coscia.','Fletti concentrandoti sul picco di contrazione.','Scendi lento.'],
    {easier:'Carico leggero',harder:'Pausa 2s in alto'},'biceps-stretch'),
  E('curl-cavi','Curl ai Cavi','bicipiti',['Multi-power'],'Principiante',['biceps'],['forearms'],'curlDown','curlUp',
    ['In piedi al cavo basso, presa supina.','Fletti i gomiti mantenendo tensione costante.','Scendi controllato.'],
    {easier:'Carico leggero',harder:'A una mano'},'biceps-stretch'),
  E('curl-inclinato','Curl su Panca Inclinata','bicipiti',['Manubri'],'Intermedio',['biceps'],[],'curlDown','curlUp',
    ['Seduto su panca a 45°, braccia pendenti.','Fletti i gomiti senza muovere le spalle.','Scendi in massimo allungamento.'],
    {easier:'Inclinazione minore',harder:'Tempo lento'},'biceps-stretch'),

  // ===== TRICIPITI =====
  E('french-press','French Press','tricipiti',['Bilanciere','Manubri'],'Intermedio',['triceps'],[],'ohExtUp','ohExtBent',
    ['Sdraiato, bilanciere sopra la fronte, braccia tese.','Fletti i gomiti portando il peso dietro la testa.','Estendi contraendo i tricipiti.'],
    {easier:'Bilanciere EZ',harder:'A una mano con manubrio'},'triceps-stretch'),
  E('dips-tricipiti','Dips alle Parallele (Tricipiti)','tricipiti',['Rack'],'Intermedio',['triceps'],['chest'],'dipUp','dipDown',
    ['Busto verticale alle parallele.','Scendi mantenendo i gomiti vicini al corpo.','Spingi fino a estensione completa.'],
    {easier:'Bench dips',harder:'Con zavorra'},'triceps-stretch'),
  E('push-down-cavi','Push Down ai Cavi','tricipiti',['Multi-power'],'Principiante',['triceps'],[],'pdTop','pdBottom',
    ['Cavo alto, gomiti ai fianchi.','Spingi verso il basso fino a braccia tese.','Risali controllato senza alzare i gomiti.'],
    {easier:'Carico leggero',harder:'Con corda + apertura finale'},'triceps-stretch'),
  E('kick-back','Kick Back','tricipiti',['Manubri'],'Principiante',['triceps'],[],'pdTop','pdBottom',
    ['Busto inclinato, gomito alto e fermo.','Estendi l\'avambraccio indietro fino a braccio teso.','Contrai e ritorna.'],
    {easier:'Ai cavi',harder:'Pausa 2s in contrazione'},'triceps-stretch'),
  E('skull-crusher','Skull Crusher','tricipiti',['Bilanciere'],'Intermedio',['triceps'],[],'ohExtUp','ohExtBent',
    ['Sdraiato, bilanciere EZ sopra il petto.','Fletti i gomiti portando il bilanciere verso la fronte.','Estendi senza muovere i gomiti.'],
    {easier:'Carico leggero',harder:'Su panca declinata'},'triceps-stretch'),
  E('overhead-extension','Overhead Extension','tricipiti',['Manubri'],'Principiante',['triceps'],[],'ohExtUp','ohExtBent',
    ['Seduto o in piedi, manubrio sopra la testa a due mani.','Fletti i gomiti dietro la testa.','Estendi le braccia contraendo i tricipiti.'],
    {easier:'Carico leggero',harder:'A una mano'},'triceps-stretch'),

  // ===== CORE =====
  E('plank','Plank','core',['Corpo libero'],'Principiante',['core'],['shoulders'],'plank','plank',
    ['Avambracci a terra sotto le spalle, corpo dritto.','Contrai addome e glutei.','Mantieni la posizione respirando.'],
    {easier:'Plank sulle ginocchia',harder:'Plank con sollevamento arti'},'cobra-stretch'),
  E('crunch','Crunch','core',['Corpo libero'],'Principiante',['abs'],[],'crunchDn','crunchUp',
    ['Sdraiato, ginocchia piegate, mani alle tempie.','Solleva le scapole contraendo l\'addome.','Scendi controllato senza staccare i lombari.'],
    {easier:'Range ridotto',harder:'Con disco al petto'},'cobra-stretch'),
  E('reverse-crunch','Reverse Crunch','core',['Corpo libero'],'Principiante',['abs'],['core'],'lrDown','lrUp',
    ['Sdraiato, gambe piegate a 90°, mani lungo i fianchi.','Porta le ginocchia verso il petto sollevando il bacino.','Scendi controllato senza slanci.'],
    {easier:'Range ridotto',harder:'Gambe più tese'},'cobra-stretch'),
  E('leg-raise','Leg Raise','core',['Corpo libero'],'Intermedio',['abs'],['core'],'lrDown','lrUp',
    ['Sdraiato, gambe tese, mani sotto i glutei.','Solleva le gambe fino a 90°.','Scendi lentamente senza inarcare la schiena.'],
    {easier:'Ginocchia piegate',harder:'Alla sbarra (hanging)'},'cobra-stretch'),
  E('russian-twist','Russian Twist','core',['Corpo libero','Manubri'],'Intermedio',['obliques'],['abs'],'twistL','twistR',
    ['Seduto, busto inclinato indietro, piedi sollevati.','Ruota il busto toccando il pavimento ai lati.','Mantieni l\'addome contratto.'],
    {easier:'Piedi a terra',harder:'Con peso'},'side-stretch'),
  E('deadbug','Dead Bug','core',['Corpo libero'],'Principiante',['core'],['abs'],'lrUp','lrDown',
    ['Sdraiato, braccia e gambe in alto.','Estendi braccio e gamba opposti senza inarcare.','Ritorna e alterna.'],
    {easier:'Solo gambe',harder:'Tempo lento'},'cobra-stretch'),
  E('ab-wheel','Ab Wheel','core',['Corpo libero'],'Avanzato',['abs','core'],['lats'],'plank','puDown',
    ['In ginocchio, ruota davanti a te.','Rotola in avanti mantenendo l\'addome contratto.','Riporta indietro senza inarcare la schiena.'],
    {easier:'Range ridotto verso il muro',harder:'In piedi'},'cobra-stretch'),
  E('hollow-hold','Hollow Hold','core',['Corpo libero'],'Intermedio',['abs','core'],[],'lrUp','lrUp',
    ['Sdraiato, schiena premuta a terra.','Solleva gambe e spalle formando una scodella.','Mantieni la posizione.'],
    {easier:'Ginocchia piegate',harder:'Braccia distese sopra la testa'},'cobra-stretch'),
  E('mountain-climber','Mountain Climber','core',['Corpo libero'],'Principiante',['core'],['quads'],'plank','puUp',
    ['Posizione plank alta.','Porta alternativamente le ginocchia al petto.','Mantieni ritmo e core contratto.'],
    {easier:'Lento',harder:'Veloce / cross-body'},'hip-flexor-stretch'),

  // ===== GLUTEI =====
  E('hip-thrust','Hip Thrust','glutei',['Bilanciere'],'Intermedio',['glutes'],['hamstrings'],'crunchDn','crunchUp',
    ['Schiena su panca, bilanciere sulle anche.','Spingi le anche verso l\'alto contraendo i glutei.','Scendi controllato.'],
    {easier:'A corpo libero',harder:'Su una gamba'},'glute-stretch'),
  E('glute-bridge','Glute Bridge','glutei',['Corpo libero'],'Principiante',['glutes'],['hamstrings'],'lrDown','crunchUp',
    ['Sdraiato, ginocchia piegate, piedi a terra.','Solleva il bacino contraendo i glutei.','Scendi controllato.'],
    {easier:'Senza pausa',harder:'Una gamba / con disco'},'glute-stretch'),
  E('kickback-glutei','Glute Kickback','glutei',['Multi-power','Corpo libero'],'Principiante',['glutes'],['hamstrings'],'hingeDn','hingeUp',
    ['A quattro zampe o al cavo.','Estendi la gamba indietro contraendo il gluteo.','Ritorna controllato.'],
    {easier:'A corpo libero',harder:'Con cavigliera'},'glute-stretch'),

  // ===== STRETCHING =====
  E('chest-stretch','Stretching Petto (doorway)','stretching',['Corpo libero'],'Principiante',['chest'],['shoulders'],'latUp','latUp',
    ['Avambraccio appoggiato a uno stipite, gomito a 90°.','Ruota il busto in avanti fino a sentire allungamento.','Tieni 30s per lato, respirando.'],
    {easier:'Allungamento più morbido',harder:'Gomito più alto'},null),
  E('lat-stretch','Stretching Dorsali','stretching',['Corpo libero'],'Principiante',['lats'],['back'],'reachUp','fold',
    ['In piedi, afferra un supporto e siediti indietro.','Allunga i dorsali tenendo le braccia tese.','Tieni 30s per lato.'],
    {easier:'In piedi',harder:'A terra in posizione cucciolo'},null),
  E('shoulder-stretch','Stretching Spalle','stretching',['Corpo libero'],'Principiante',['shoulders'],[],'latUp','latUp',
    ['Porta un braccio teso davanti al petto.','Spingilo con l\'altro verso di te.','Tieni 30s per lato.'],
    {easier:'Range ridotto',harder:'Aggiungi rotazione'},null),
  E('biceps-stretch','Stretching Bicipiti','stretching',['Corpo libero'],'Principiante',['biceps'],['forearms'],'latUp','latUp',
    ['Braccio teso indietro contro una parete.','Ruota leggermente il busto.','Tieni 30s per lato.'],
    {easier:'Range ridotto',harder:'Braccio più alto'},null),
  E('triceps-stretch','Stretching Tricipiti','stretching',['Corpo libero'],'Principiante',['triceps'],[],'ohExtBent','ohExtBent',
    ['Porta una mano dietro la testa, gomito in alto.','Spingi il gomito con l\'altra mano.','Tieni 30s per lato.'],
    {easier:'Range ridotto',harder:'Allungamento maggiore'},null),
  E('quad-stretch','Stretching Quadricipiti','stretching',['Corpo libero'],'Principiante',['quads'],['hip-flexors'],'quadStr','quadStr',
    ['In piedi, afferra una caviglia portando il tallone al gluteo.','Mantieni le ginocchia vicine.','Tieni 30s per lato.'],
    {easier:'Appoggiato a un muro',harder:'Da sdraiato sul fianco'},null),
  E('hamstring-stretch','Stretching Femorali','stretching',['Corpo libero'],'Principiante',['hamstrings'],['lowerBack'],'fold','fold',
    ['Seduto o in piedi, allunga verso le punte dei piedi.','Schiena lunga, non curvare.','Tieni 30s.'],
    {easier:'Ginocchia morbide',harder:'Gamba sollevata su rialzo'},null),
  E('glute-stretch','Stretching Glutei','stretching',['Corpo libero'],'Principiante',['glutes'],[],'crunchUp','crunchUp',
    ['Sdraiato, caviglia su ginocchio opposto.','Tira la coscia verso il petto.','Tieni 30s per lato.'],
    {easier:'Seduto',harder:'Pigeon pose'},null),
  E('calf-stretch','Stretching Polpacci','stretching',['Corpo libero'],'Principiante',['calves'],[],'lungeDn','lungeDn',
    ['Affondo contro il muro, gamba posteriore tesa.','Spingi il tallone verso terra.','Tieni 30s per lato.'],
    {easier:'Range ridotto',harder:'Su rialzo'},null),
  E('hip-flexor-stretch','Stretching Flessori d\'Anca','stretching',['Corpo libero'],'Principiante',['glutes'],['quads'],'lungeDn','lungeDn',
    ['Affondo basso, ginocchio posteriore a terra.','Spingi il bacino in avanti.','Tieni 30s per lato.'],
    {easier:'Range ridotto',harder:'Braccio sopra la testa'},null),
  E('child-pose','Posizione del Bambino','stretching',['Corpo libero'],'Principiante',['back'],['lats'],'child','child',
    ['In ginocchio, siediti sui talloni.','Allunga le braccia in avanti, fronte a terra.','Respira profondamente per 30-60s.'],
    {easier:'Ginocchia più larghe',harder:'Allungamento laterale'},null),
  E('cat-cow','Gatto-Mucca','stretching',['Corpo libero'],'Principiante',['lowerBack'],['core'],'child','cobra',
    ['A quattro zampe.','Inarca e poi incurva la schiena alternando.','Sincronizza col respiro per 8-10 cicli.'],
    {easier:'Movimento ridotto',harder:'Pause in fine range'},null),
  E('neck-stretch','Stretching Collo','stretching',['Corpo libero'],'Principiante',['traps'],[],'stand','sideBend',
    ['Inclina la testa verso una spalla.','Aiutati con la mano per allungare.','Tieni 20-30s per lato.'],
    {easier:'Solo inclinazione',harder:'Aggiungi rotazione'},null),
  E('side-stretch','Stretching Laterale (Obliqui)','stretching',['Corpo libero'],'Principiante',['obliques'],['lats'],'reachUp','sideBend',
    ['In piedi, braccia in alto.','Inclina il busto lateralmente.','Tieni 30s per lato.'],
    {easier:'Range ridotto',harder:'Da seduto a terra'},null),
  E('cobra-stretch','Stretching Addome (Cobra)','stretching',['Corpo libero'],'Principiante',['abs'],['lowerBack'],'plank','cobra',
    ['Sdraiato a pancia in giù, mani sotto le spalle.','Spingi il busto in alto allungando l\'addome.','Tieni 20-30s, spalle basse.'],
    {easier:'Sui gomiti (sfinge)',harder:'Estensione completa'},null)
];

/* category metadata */
const CATEGORIES = [
  {id:'petto', label:'Petto', icon:'💪'},
  {id:'schiena', label:'Schiena', icon:'🔙'},
  {id:'gambe', label:'Gambe', icon:'🦵'},
  {id:'spalle', label:'Spalle', icon:'🏋️'},
  {id:'bicipiti', label:'Bicipiti', icon:'💪'},
  {id:'tricipiti', label:'Tricipiti', icon:'💪'},
  {id:'core', label:'Core', icon:'🔥'},
  {id:'glutei', label:'Glutei', icon:'🍑'},
  {id:'stretching', label:'Stretching', icon:'🧘'}
];

const EQUIPMENT = ['Rack','Bilanciere','Manubri','Multi-power','Spin Bike','Corpo libero'];
const DIFFICULTIES = ['Principiante','Intermedio','Avanzato'];

const EX_BY_ID = {};
EXERCISES.forEach(x => EX_BY_ID[x.id] = x);

/* ---------- Default 4-day plan (A/B/C/D) ---------- */
const DEFAULT_PLAN = {
  version: 1,
  startDate: null, // set on first save
  days: [
    { type:'A', name:'Petto + Tricipiti', muscleGroup:'petto', exercises:[
      {exId:'panca-piana', sets:4, reps:'8-10'},
      {exId:'panca-inclinata', sets:3, reps:'10-12'},
      {exId:'croci-manubri', sets:3, reps:'12-15'},
      {exId:'dips', sets:3, reps:'10'},
      {exId:'push-down-cavi', sets:3, reps:'12-15'},
      {exId:'french-press', sets:3, reps:'10-12'}
    ]},
    { type:'B', name:'Schiena + Bicipiti', muscleGroup:'schiena', exercises:[
      {exId:'stacco', sets:4, reps:'6-8'},
      {exId:'trazioni', sets:3, reps:'8-10'},
      {exId:'rematore-bilanciere', sets:3, reps:'10-12'},
      {exId:'lat-machine', sets:3, reps:'12'},
      {exId:'curl-bilanciere', sets:3, reps:'10-12'},
      {exId:'curl-martello', sets:3, reps:'12'}
    ]},
    { type:'C', name:'Gambe + Spalle', muscleGroup:'gambe', exercises:[
      {exId:'squat', sets:4, reps:'8-10'},
      {exId:'romanian-deadlift', sets:3, reps:'10-12'},
      {exId:'leg-press', sets:3, reps:'12'},
      {exId:'calf-raises', sets:4, reps:'15-20'},
      {exId:'lento-avanti', sets:3, reps:'8-10'},
      {exId:'alzate-laterali', sets:3, reps:'15'}
    ]},
    { type:'D', name:'Full Body + Core', muscleGroup:'core', exercises:[
      {exId:'goblet-squat', sets:3, reps:'12'},
      {exId:'panca-inclinata', sets:3, reps:'10'},
      {exId:'rematore-manubrio', sets:3, reps:'12'},
      {exId:'alzate-laterali', sets:3, reps:'15'},
      {exId:'plank', sets:3, reps:'45s'},
      {exId:'leg-raise', sets:3, reps:'15'}
    ]}
  ]
};

const DAY_COLORS = { A:'var(--A)', B:'var(--B)', C:'var(--C)', D:'var(--D)' };
const DAY_HEX = { A:'#E8472A', B:'#1A6FBF', C:'#2EAD6B', D:'#8B2FC9' };

/* ============================================================
   REAL-MEDIA layer — free-exercise-db (yuhonas) on jsDelivr CDN.
   Each matched exercise gives 2 real photo frames (start/end)
   that the UI animates like a GIF. SVG figure is the fallback.
   ============================================================ */
const FDB_JSON  = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/dist/exercises.json';
const FDB_IMG   = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises/';
// Italian exId -> English search terms used to match the live dataset.
const FDB_MATCH = {
  'panca-piana':'Barbell Bench Press Medium Grip','panca-inclinata':'Barbell Incline Bench Press Medium Grip',
  'panca-declinata':'Decline Barbell Bench Press','croci-manubri':'Dumbbell Flyes','push-up':'Pushups',
  'dips':'Dips Chest Version','cavi-croci':'Cable Crossover','pec-deck':'Butterfly',
  'pullover':'Bent Arm Dumbbell Pullover','push-up-diamante':'Pushups',
  'stacco':'Barbell Deadlift','rematore-bilanciere':'Bent Over Barbell Row','trazioni':'Pullups',
  'lat-machine':'Wide-Grip Lat Pulldown','pulley':'Seated Cable Rows','t-bar-row':'Lying T-Bar Row',
  'pullover-manubrio':'Bent Arm Dumbbell Pullover','face-pull':'Face Pull','good-morning':'Good Morning',
  'iperestensioni':'Hyperextensions Back Extensions','rematore-manubrio':'One-Arm Dumbbell Row',
  'squat':'Barbell Squat','leg-press':'Leg Press','affondi':'Barbell Lunge','romanian-deadlift':'Romanian Deadlift',
  'leg-curl':'Lying Leg Curls','leg-extension':'Leg Extensions','calf-raises':'Standing Calf Raises',
  'goblet-squat':'Dumbbell Squat','sumo-squat':'Plie Dumbbell Squat','hack-squat':'Barbell Hack Squat',
  'bulgarian-split-squat':'Barbell Lunge','wall-sit':'Bodyweight Squat',
  'lento-avanti':'Barbell Shoulder Press','arnold-press':'Arnold Dumbbell Press','alzate-laterali':'Side Lateral Raise',
  'alzate-frontali':'Front Dumbbell Raise','scrollate':'Barbell Shrug','upright-row':'Upright Barbell Row',
  'reverse-fly':'Reverse Flyes','face-pull-spalle':'Face Pull',
  'curl-bilanciere':'Barbell Curl','curl-manubri':'Dumbbell Bicep Curl','curl-martello':'Hammer Curls',
  'curl-concentrazione':'Concentration Curls','curl-cavi':'Standing Biceps Cable Curl','curl-inclinato':'Incline Dumbbell Curl',
  'french-press':'Seated Triceps Press','dips-tricipiti':'Dips Triceps Version','push-down-cavi':'Triceps Pushdown',
  'kick-back':'Tricep Dumbbell Kickback','skull-crusher':'Lying Triceps Press','overhead-extension':'Standing Dumbbell Triceps Extension',
  'distensioni-manubri':'Dumbbell Bench Press','lento-manubri':'Dumbbell Shoulder Press','reverse-crunch':'Reverse Crunch',
  'plank':'Plank','crunch':'Crunches','leg-raise':'Flat Bench Lying Leg Raise','russian-twist':'Russian Twist',
  'ab-wheel':'Ab Roller','mountain-climber':'Mountain Climbers',
  'hip-thrust':'Barbell Hip Thrust','glute-bridge':'Barbell Glute Bridge','kickback-glutei':'One Legged Cable Kickback',
  'chest-stretch':'Behind Head Chest Stretch','quad-stretch':'All Fours Quad Stretch',
  'hamstring-stretch':'Standing Hamstring Stretch','hip-flexor-stretch':'Kneeling Hip Flexor Stretch',
  'cat-cow':'Cat Stretch','calf-stretch':'Standing Calf Stretch'
};
