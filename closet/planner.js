'use strict';
/* 주간 계획: 월~일 칸에 옷을 직접 고르고, 코디(자주 입는 차림)를 등록해 어느 요일에든 넣어요.
   - 요일 칸은 'plans' 저장소(요일마다 문서 하나), 코디는 기존 'outfits' 저장소를 써요.
   - app.js보다 먼저 불러오고, 화면 연결은 app.js가 initPlanner()를 불러서 해요. */
const DAYS=['월','화','수','목','금','토','일'];
const DAY_FULL={월:'월요일',화:'화요일',수:'수요일',목:'목요일',금:'금요일',토:'토요일',일:'일요일'};
let plans={};                                   // 요일 → {id:'plan-월', day, ids:[], temp}
const itemById=id=>items.find(i=>i.id===id);
const sortIds=ids=>(ids||[]).filter(itemById).sort((a,b)=>CATS.indexOf(itemById(a).cat)-CATS.indexOf(itemById(b).cat));
const planOf=day=>plans[day]||{id:'plan-'+day,day,ids:[],temp:'mild'};
// 저장은 누른 순서대로 한 줄로 처리 (빠르게 연달아 눌러도 마지막 선택이 앞 선택에 덮어써지지 않게)
let planQ=Promise.resolve();
function savePlan(day,patch){
  const run=planQ.then(async()=>{const p={...planOf(day),...patch};await put('plans',p);plans[day]=p});
  planQ=run.catch(()=>{});return run;
}
const todayIdx=()=>(new Date().getDay()+6)%7;
function weekDates(){const t=new Date(),off=todayIdx();return DAYS.map((_,i)=>{const d=new Date(t);d.setDate(t.getDate()-off+i);return d})}
const miniBtn=(t,fn,cls='')=>el('button',{type:'button',className:'mini-btn '+cls,textContent:t,onclick:fn});
const thumbs=(ids,cls='piece')=>sortIds(ids).map(id=>{const it=itemById(id);return el('span',{className:cls},el('img',{src:it.photo,alt:it.name}),el('small',{textContent:it.name||it.cat}))});

/* 한 종류에서는 하나만, 원피스를 고르면 상의·하의는 빠짐 (액세서리는 여러 개 가능) */
function toggleSel(ids,id){
  const it=itemById(id);if(!it)return ids;
  if(ids.includes(id))return ids.filter(x=>x!==id);
  let next=ids.slice();
  if(it.cat!=='액세서리')next=next.filter(x=>itemById(x)?.cat!==it.cat);
  if(it.cat==='원피스')next=next.filter(x=>!['상의','하의'].includes(itemById(x)?.cat));
  if(it.cat==='상의'||it.cat==='하의')next=next.filter(x=>itemById(x)?.cat!=='원피스');
  next.push(id);return sortIds(next);
}

/* ---------- 요일 칸 ---------- */
function renderWeek(){
  const box=$('#week-grid');if(!box)return;
  const dates=weekDates(),ti=todayIdx();
  const planned=DAYS.filter(d=>sortIds(planOf(d).ids).length).length;
  const pieces=new Set(DAYS.flatMap(d=>sortIds(planOf(d).ids))).size;
  $('#week-sum').textContent=planned?`${planned}일 계획됨 · 옷 ${pieces}벌`:'아직 비어 있어요';
  $('#btn-clear-week').hidden=!planned;
  box.replaceChildren(...DAYS.map((d,i)=>dayCard(d,i,dates[i],ti)));
  renderCombos();
}
function dayCard(d,i,date,ti){
  const p=planOf(d),ids=sortIds(p.ids);
  const sel=el('select',{className:'wsel','aria-label':DAY_FULL[d]+' 날씨'},...Object.entries(TEMP_LABEL).map(([k,[l,sub]])=>el('option',{value:k,textContent:`${l} ${sub}`,selected:k===(p.temp||'mild')})));
  sel.onchange=async()=>{await savePlan(d,{temp:sel.value})};
  const head=el('div',{className:'wd-head'},el('b',{className:'wd-name',textContent:d}),el('span',{className:'wd-date',textContent:`${date.getMonth()+1}/${date.getDate()}`}),
    ...(i===ti?[el('span',{className:'today',textContent:'오늘'})]:[]),sel);
  const open=()=>openPicker({mode:'day',day:d});
  const body=ids.length
    ?el('button',{type:'button',className:'wd-strip',onclick:open,'aria-label':DAY_FULL[d]+' 옷 바꾸기'},...thumbs(ids))
    :el('button',{type:'button',className:'wd-empty',onclick:open,textContent:'＋ 옷 고르기'});
  const acts=el('div',{className:'wd-acts'},miniBtn('고르기',open),miniBtn('코디 불러오기',()=>openApply(d)),miniBtn('추천',()=>recommendDay(d)),
    ...(ids.length?[miniBtn('비우기',async()=>{await savePlan(d,{ids:[]});renderWeek()},'quiet')]:[]));
  return el('div',{className:'wd'+(i===ti?' now':'')},head,body,acts);
}
async function recommendDay(d,silent){
  const usage={},near=new Set(),idx=DAYS.indexOf(d);
  DAYS.forEach(x=>{if(x!==d)sortIds(planOf(x).ids).forEach(id=>{usage[id]=(usage[id]||0)+1})});
  [idx-1,idx+1].forEach(k=>{if(DAYS[k])sortIds(planOf(DAYS[k]).ids).forEach(id=>near.add(id))});
  const r=recommend(planOf(d).temp||'mild',{usage,near});
  if(!r){if(!silent)toast('이 날씨에 맞는 상의+하의(또는 원피스)가 부족해요.');return false}
  await savePlan(d,{ids:sortIds(r.map(p=>p.id))});if(!silent)renderWeek();return true;
}
let clearArmed=false;
async function clearWeek(btn){
  if(!clearArmed){clearArmed=true;btn.textContent='한 번 더';setTimeout(()=>{clearArmed=false;btn.textContent='모두 비우기'},3500);return}
  clearArmed=false;btn.textContent='모두 비우기';
  for(const d of DAYS)if(plans[d]&&plans[d].ids.length)await savePlan(d,{ids:[]});
  renderWeek();
}

/* ---------- 옷 고르기 (요일 칸 / 코디 공용) ---------- */
const pk={mode:'day',day:null,comboId:null,ids:[],cat:'상의'};
function openPicker(o){
  pk.mode=o.mode;pk.day=o.day||null;pk.comboId=o.comboId||null;
  const combo=o.comboId?outfits.find(x=>x.id===o.comboId):null;
  pk.ids=o.mode==='day'?sortIds(planOf(o.day).ids):sortIds(combo?combo.ids:[]);
  pk.cat=CATS.find(c=>items.some(i=>i.cat===c))||CATS[0];
  $('#pk-title').textContent=o.mode==='day'?`${DAY_FULL[o.day]} 옷 고르기`:(combo?'코디 수정':'새 코디 만들기');
  $('#pk-name-wrap').hidden=o.mode!=='combo';$('#pk-name').value=combo?.name||'';
  renderPicker();$('#d-pick').showModal();$('#d-pick').scrollTop=0;
}
async function pickToggle(id){
  pk.ids=toggleSel(pk.ids,id);renderPicker();                                  // 화면은 바로 바꾸고
  if(pk.mode==='day'){await savePlan(pk.day,{ids:pk.ids});renderWeek()}      // 요일 칸은 누를 때마다 저장
}
function renderPicker(){
  const sel=$('#pk-sel');
  sel.replaceChildren(...(pk.ids.length?sortIds(pk.ids).map(id=>{const it=itemById(id);
    return el('button',{type:'button',className:'pk-chip',title:'빼기','aria-label':(it.name||it.cat)+' 빼기',onclick:()=>pickToggle(id)},el('img',{src:it.photo,alt:''}),el('i',{textContent:'✕'}))})
    :[el('span',{className:'muted sm',textContent:'아래에서 옷을 눌러 담아 보세요.'})]));
  $('#pk-cats').replaceChildren(...CATS.map(c=>{const n=pk.ids.filter(id=>itemById(id)?.cat===c).length;
    return chip(n?`${c} · ${n}`:c,c===pk.cat,()=>{pk.cat=c;renderPicker()})}));
  const list=items.filter(i=>i.cat===pk.cat);
  $('#pk-grid').replaceChildren(...(list.length?list.map(it=>{const on=pk.ids.includes(it.id);
    const b=el('button',{type:'button',className:'pkitem'+(on?' on':''),'aria-pressed':on,onclick:()=>pickToggle(it.id)},
      el('span',{className:'pk-ph'},el('img',{src:it.photo,alt:it.name,loading:'lazy'}),...(on?[el('span',{className:'chk',textContent:'✓'})]:[])),
      el('span',{className:'pk-nm',textContent:it.name||it.cat}));return b})
    :[el('p',{className:'muted sm none2',textContent:`등록된 ${pk.cat}가 없어요.`})]));
  const acts=$('#pk-acts'),save=$('#pk-save');
  if(pk.mode==='day'){
    save.hidden=false;$('#pk-combo-name').value=$('#pk-combo-name').value||'';
    $('#pk-save-btn').disabled=!pk.ids.length;
    acts.replaceChildren(miniBtn('비우기',async()=>{pk.ids=[];await savePlan(pk.day,{ids:[]});renderWeek();renderPicker()},'quiet'),
      el('button',{type:'button',className:'primary',textContent:'완료',onclick:()=>$('#d-pick').close()}));
  }else{
    save.hidden=true;
    const combo=outfits.find(x=>x.id===pk.comboId);
    acts.replaceChildren(...(combo?[el('button',{type:'button',className:'danger small',textContent:'삭제',onclick:async()=>{await del('outfits',combo.id);$('#d-pick').close();await refresh()}})]:[]),
      el('span',{className:'spacer'}),
      el('button',{type:'button',className:'primary',textContent:'저장',disabled:!pk.ids.length,onclick:saveComboFromPicker}));
  }
}
async function saveComboFromPicker(){
  if(!pk.ids.length)return;
  const combo=outfits.find(x=>x.id===pk.comboId),name=$('#pk-name').value.trim()||combo?.name||`코디 ${outfits.length+1}`;
  await put('outfits',{...(combo||{at:Date.now(),uses:0}),ids:pk.ids,name});
  $('#d-pick').close();await refresh();toast('코디에 저장했어요.');
}
async function registerFromDay(){
  if(!pk.ids.length)return;
  const name=$('#pk-combo-name').value.trim()||`${pk.day}요일 코디`;
  await put('outfits',{ids:pk.ids.slice(),name,at:Date.now(),uses:0});
  $('#pk-combo-name').value='';await refresh();toast(`"${name}"을(를) 코디에 등록했어요.`);
}

/* ---------- 코디 (자주 입는 조합) ---------- */
async function applyCombo(o,day){
  await savePlan(day,{ids:sortIds(o.ids)});
  o.uses=(o.uses||0)+1;await put('outfits',o);          // 사용 횟수를 세어 자주 쓰는 코디가 위로 오게 함
  renderWeek();toast(`${DAY_FULL[day]}에 넣었어요.`);
}
const comboName=o=>o.name||`코디 ${outfits.indexOf(o)+1}`;
function renderCombos(){
  const box=$('#combo-list');if(!box)return;
  const list=outfits.slice().sort((a,b)=>(b.uses||0)-(a.uses||0)||(b.at||0)-(a.at||0));
  box.replaceChildren(...(list.length?list.map(comboCard):[el('p',{className:'muted sm',style:'padding:0 22px;margin:0',textContent:'아직 등록한 코디가 없어요. 자주 입는 차림을 코디로 만들어 두면 어느 요일에든 한 번에 넣을 수 있어요.'})]));
}
function comboCard(o){
  const ids=sortIds(o.ids);
  return el('div',{className:'combo'},
    el('div',{className:'combo-head'},el('b',{textContent:comboName(o)}),el('small',{className:'muted',textContent:o.uses?`${o.uses}회 사용`:'아직 안 썼어요'}),
      miniBtn('수정',()=>openPicker({mode:'combo',comboId:o.id}),'quiet')),
    ids.length?el('div',{className:'wd-strip static'},...thumbs(ids)):el('p',{className:'muted sm',style:'margin:0',textContent:'옷이 모두 삭제됐어요. 수정에서 다시 고르세요.'}),
    el('div',{className:'combo-days'},el('span',{className:'lbl',textContent:'넣기'}),...DAYS.map(d=>el('button',{type:'button',className:'dbtn',textContent:d,'aria-label':DAY_FULL[d]+'에 넣기',disabled:!ids.length,onclick:()=>applyCombo(o,d)}))));
}
function openApply(day){
  $('#ap-title').textContent=`${DAY_FULL[day]}에 넣을 코디`;
  const box=$('#ap-list'),list=outfits.filter(o=>sortIds(o.ids).length).sort((a,b)=>(b.uses||0)-(a.uses||0));
  box.replaceChildren(...(list.length?list.map(o=>el('button',{type:'button',className:'ap-item',onclick:async()=>{await applyCombo(o,day);$('#d-apply').close()}},
      el('span',{className:'ap-name'},el('b',{textContent:comboName(o)}),el('small',{className:'muted',textContent:o.uses?`${o.uses}회 사용`:'새 코디'})),
      el('span',{className:'wd-strip static'},...thumbs(o.ids)))):[el('p',{className:'muted sm',textContent:'등록한 코디가 없어요. 코디 탭에서 만들어 보세요.'})]));
  $('#d-apply').showModal();
}

/* 옷이 삭제되면 요일 칸과 조합에서도 빼기 */
async function scrubItem(id){
  for(const o of outfits.slice())if(o.ids.includes(id)){const ids=o.ids.filter(x=>x!==id);if(ids.length)await put('outfits',{...o,ids});else await del('outfits',o.id)}
  for(const d of DAYS){const p=plans[d];if(p&&p.ids.includes(id))await savePlan(d,{ids:p.ids.filter(x=>x!==id)})}
}

function initPlanner(){
  $('#btn-clear-week').onclick=e=>clearWeek(e.currentTarget);
  $('#btn-new-combo').onclick=()=>openPicker({mode:'combo'});
  $('#pk-save-btn').onclick=registerFromDay;
  for(const id of ['#d-pick','#d-apply']){
    document.querySelectorAll(id+' [data-close]').forEach(b=>b.onclick=()=>$(id).close());
    $(id).addEventListener('click',e=>{if(e.target===$(id))$(id).close()});
  }
  $('#d-pick').addEventListener('close',()=>refresh());
  renderWeek();
}
