'use strict';
const CATS=['상의','하의','원피스','아우터','신발','액세서리'];
const SEASONS=['봄','여름','가을','겨울'];
const COLORS={검정:'#111',흰색:'#fff',회색:'#999',베이지:'#d9c3a0',네이비:'#1f2a56',데님:'#4a6a96',갈색:'#7a5230',빨강:'#d03a3a',주황:'#ee8a2b',노랑:'#f2d33b',초록:'#3f9a5a',파랑:'#2f6fe0',보라:'#7a4fc4',분홍:'#f0a0c0'};
const NEUTRAL=new Set(['검정','흰색','회색','베이지','네이비','데님','갈색']);
// 온도 → 계절 / 아우터 필요 여부
const TEMP={hot:{s:['여름'],outer:false},mild:{s:['봄','가을'],outer:false},cool:{s:['봄','가을'],outer:true},cold:{s:['겨울'],outer:true}};

const $=s=>document.querySelector(s);
const el=(t,p={},...k)=>{const e=Object.assign(document.createElement(t),p);k.forEach(c=>e.append(c));return e};

/* ---------- IndexedDB ---------- */
let db;
const open=()=>new Promise((res,rej)=>{const r=indexedDB.open('closet',1);
  r.onupgradeneeded=()=>{r.result.createObjectStore('items',{keyPath:'id',autoIncrement:true});r.result.createObjectStore('outfits',{keyPath:'id',autoIncrement:true})};
  r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
const tx=(s,m,fn)=>new Promise((res,rej)=>{const t=db.transaction(s,m);const r=fn(t.objectStore(s));t.oncomplete=()=>res(r.result);t.onerror=()=>rej(t.error)});
const all=s=>tx(s,'readonly',o=>o.getAll());
const put=(s,v)=>tx(s,'readwrite',o=>o.put(v));
const del=(s,id)=>tx(s,'readwrite',o=>o.delete(id));

/* ---------- 상태 ---------- */
let items=[],outfits=[],filter='전체',editing=null,photoData=null,current=null;
let selCat=CATS[0],selColor='검정',temp='mild',mood='any';
const TEMP_LABEL={hot:['더워요','25°↑'],mild:['적당해요','15–24°'],cool:['쌀쌀해요','5–14°'],cold:['추워요','5°↓']};
const MOOD_LABEL={any:'상관없음',neutral:'차분하게',color:'포인트'};

async function refresh(){
  items=await all('items');outfits=await all('outfits');
  renderCloset();renderSaved();
  $('#count').textContent=items.length?`총 ${items.length}벌`:'';
}

/* ---------- 이미지 리사이즈 (저장 용량 절약) ---------- */
function resize(file,max=640){return new Promise((res,rej)=>{
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{const k=Math.min(1,max/Math.max(img.width,img.height));
    const c=el('canvas',{width:Math.round(img.width*k),height:Math.round(img.height*k)});
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);res(c.toDataURL('image/jpeg',.82))};
  img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('이미지를 읽을 수 없어요'))};img.src=url})}

/* ---------- 옷장 화면 ---------- */
function chip(label,on,fn){return el('button',{className:'chip'+(on?' on':''),type:'button',textContent:label,onclick:fn})}
function dot(c){return el('i',{className:'dot',style:`background:${COLORS[c]||'#ccc'}`})}
function card(it,onclick){
  const b=el('button',{className:'item',type:'button',onclick});
  b.append(el('span',{className:'ph'},el('img',{src:it.photo,alt:it.name,loading:'lazy'})),
    el('span',{className:'meta'},el('b',{textContent:it.name||it.cat}),el('small',{},dot(it.color),`${it.color} · ${it.cat}`)));
  return b}
function renderCloset(){
  const f=$('#filter-cat');f.replaceChildren(...['전체',...CATS].map(c=>chip(`${c} ${c==='전체'?items.length:items.filter(i=>i.cat===c).length}`,c===filter,()=>{filter=c;renderCloset()})));
  const q=$('#q').value.trim().toLowerCase(),so=$('#sort').value;
  const list=items.filter(i=>(filter==='전체'||i.cat===filter)&&(!q||[i.name,i.cat,i.color].join(' ').toLowerCase().includes(q)))
    .sort(so==='name'?(a,b)=>(a.name||a.cat).localeCompare(b.name||b.cat,'ko'):so==='cat'?(a,b)=>CATS.indexOf(a.cat)-CATS.indexOf(b.cat)||b.id-a.id:(a,b)=>b.id-a.id);
  $('#grid').replaceChildren(...(list.length||!items.length?list.map(i=>card(i,()=>openDlg(i))):[el('p',{className:'none',textContent:'조건에 맞는 옷이 없어요.'})]));
  $('#empty').hidden=items.length>0;$('#filter-cat').hidden=!items.length;
}

/* ---------- 추가/수정 다이얼로그 ---------- */
function renderCatChips(){
  $('#f-cat').replaceChildren(...CATS.map(c=>chip(c,c===selCat,()=>{selCat=c;renderCatChips()})));}
function renderSwatches(){
  $('#color-name').textContent=selColor;
  $('#f-color').replaceChildren(...Object.entries(COLORS).map(([n,hex])=>
    el('button',{type:'button',className:'sw'+(n===selColor?' on':''),style:`background:${hex}`,title:n,'aria-label':n,onclick:()=>{selColor=n;renderSwatches()}})));}
function renderSeasonChips(sel){
  $('#f-seasons').replaceChildren(...SEASONS.map(s=>chip(s,sel.has(s),e=>{sel.has(s)?sel.delete(s):sel.add(s);e.target.classList.toggle('on')})));
}
let seasonSel=new Set();
function openDlg(it){
  editing=it||null;photoData=it?it.photo:null;
  $('#dlg-title').textContent=it?'옷 수정':'옷 추가';
  $('#f-name').value=it?.name||'';selCat=it?.cat||CATS[0];selColor=it?.color||'검정';renderCatChips();renderSwatches();
  $('#photo').value='';$('#preview').hidden=!photoData;if(photoData)$('#preview').src=photoData;else $('#preview').removeAttribute('src');
  seasonSel=new Set(it?it.seasons:SEASONS);renderSeasonChips(seasonSel);
  $('#btn-del').hidden=!it;$('#dlg').showModal();$('#dlg').scrollTop=0;
}
$('#q').oninput=renderCloset;$('#sort').onchange=renderCloset;
$('#fab').onclick=()=>openDlg();$('#empty-add').onclick=()=>openDlg();
$('#btn-cancel').onclick=()=>$('#dlg').close();
$('#photo').onchange=async e=>{const f=e.target.files[0];if(!f)return;
  try{photoData=await resize(f);$('#preview').src=photoData;$('#preview').hidden=false}catch(err){alert(err.message)}};
$('#form').onsubmit=async e=>{
  if(!photoData){e.preventDefault();alert('사진을 선택해 주세요');return}
  const it={...(editing||{}),name:$('#f-name').value.trim(),cat:selCat,color:selColor,
    seasons:[...seasonSel],photo:photoData};
  if(!it.seasons.length)it.seasons=[...SEASONS];
  await put('items',it);await refresh();
};
$('#btn-del').onclick=async()=>{
  if(!editing||!confirm('이 옷을 삭제할까요?'))return;
  await del('items',editing.id);
  for(const o of outfits)if(o.ids.includes(editing.id))await del('outfits',o.id);
  $('#dlg').close();await refresh();
};

/* ---------- 코디 추천 ---------- */
const pick=a=>a[Math.floor(Math.random()*a.length)];
// 두 색 궁합 점수
function pairScore(a,b){
  if(a===b)return NEUTRAL.has(a)?2:1;            // 톤온톤
  const na=NEUTRAL.has(a),nb=NEUTRAL.has(b);
  if(na&&nb)return (a==='검정'&&b==='네이비')||(a==='네이비'&&b==='검정')||(a==='갈색'&&b==='검정')||(a==='검정'&&b==='갈색')?-1:2;
  if(na||nb)return 2;                            // 무채색 + 컬러
  return -2;                                     // 컬러 + 다른 컬러는 피함
}
function outfitScore(parts,mood){
  const cs=parts.map(p=>p.color);let s=0;
  for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length;j++)s+=pairScore(cs[i],cs[j]);
  const colorful=new Set(cs.filter(c=>!NEUTRAL.has(c))).size;
  if(mood==='neutral')s+=colorful?-3:3;
  if(mood==='color')s+=colorful===1?3:-2;
  return s+Math.random()*1.5;                    // 매번 다른 결과
}
function recommend(){
  const t=TEMP[temp];
  const ok=c=>items.filter(i=>i.cat===c&&i.seasons.some(s=>t.s.includes(s)));
  const tops=ok('상의'),bottoms=ok('하의'),dresses=ok('원피스'),outers=ok('아우터'),shoes=ok('신발'),accs=ok('액세서리');
  const bases=[];
  tops.forEach(a=>bottoms.forEach(b=>bases.push([a,b])));
  dresses.forEach(d=>bases.push([d]));
  if(!bases.length)return null;
  let best=null,bs=-Infinity;
  for(let n=0;n<200;n++){
    const parts=[...pick(bases)];
    if(t.outer&&outers.length)parts.push(pick(outers));
    else if(!t.outer&&outers.length&&Math.random()<.25)parts.push(pick(outers));
    if(shoes.length)parts.push(pick(shoes));
    if(accs.length&&Math.random()<.4)parts.push(pick(accs));
    const s=outfitScore(parts,mood);
    if(s>bs){bs=s;best=parts}
  }
  return best;
}
function showOutfit(parts){
  current=parts;const box=$('#outfit-result');
  if(!parts){box.replaceChildren(el('div',{className:'look'},el('p',{className:'note',textContent:'이 날씨에 맞는 상의+하의(또는 원피스)가 부족해요. 옷을 더 등록하거나 계절 설정을 확인해 보세요.'})));return}
  const miss=[];
  if(TEMP[temp].outer&&!parts.some(p=>p.cat==='아우터'))miss.push('아우터');
  if(!parts.some(p=>p.cat==='신발'))miss.push('신발');
  box.replaceChildren(el('div',{className:'look'},
    el('div',{className:'look-head'},el('h2',{textContent:'오늘의 코디'}),el('small',{className:'muted',textContent:`${TEMP_LABEL[temp][0]} · ${parts.length}피스`})),
    el('div',{className:'look-grid'},...parts.map(p=>card(p,()=>{}))),
    ...(miss.length?[el('p',{className:'note',textContent:`${miss.join(', ')}도 등록하면 더 완성된 코디를 추천해 드려요.`})]:[]),
    el('div',{className:'row'},
      el('button',{className:'ghost',textContent:'다시 추천',onclick:()=>showOutfit(recommend())}),
      el('button',{className:'primary',textContent:'이 코디 저장',onclick:saveOutfit}))));
  box.scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function saveOutfit(){if(!current)return;await put('outfits',{ids:current.map(p=>p.id),at:Date.now()});await refresh();}
function renderSaved(){
  const box=$('#saved');
  const rows=outfits.slice().reverse().map(o=>{
    const parts=o.ids.map(id=>items.find(i=>i.id===id)).filter(Boolean);
    return el('div',{className:'mini'},...parts.map(p=>el('img',{src:p.photo,alt:p.name})),
      el('button',{className:'x',textContent:'✕',title:'삭제','aria-label':'삭제',onclick:async()=>{await del('outfits',o.id);await refresh()}}))});
  box.replaceChildren(...(rows.length?rows:[el('p',{className:'muted',textContent:'아직 저장한 코디가 없어요.'})]));
}
$('#btn-recommend').onclick=()=>showOutfit(recommend());

/* ---------- 현재 날씨 (Open-Meteo, 키 불필요) ---------- */
$('#btn-weather').onclick=()=>{
  const msg=$('#weather-msg');
  if(!navigator.geolocation){msg.textContent='위치 기능을 쓸 수 없어요.';return}
  msg.textContent='날씨 확인 중…';
  navigator.geolocation.getCurrentPosition(async p=>{
    try{
      const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.coords.latitude}&longitude=${p.coords.longitude}&current=apparent_temperature`);
      const t=(await r.json()).current.apparent_temperature;
      temp=t>=25?'hot':t>=15?'mild':t>=5?'cool':'cold';renderSegs();
      msg.textContent=`체감온도 ${Math.round(t)}°C 기준으로 설정했어요.`;
    }catch{msg.textContent='날씨를 가져오지 못했어요. 직접 선택해 주세요.'}
  },()=>{msg.textContent='위치 권한이 없어요. 직접 선택해 주세요.'},{timeout:8000});
};

/* ---------- 분할 버튼 ---------- */
function seg(id,opts,get,set){
  $(id).replaceChildren(...opts.map(([v,label,sub])=>el('button',{type:'button',className:get()===v?'on':'',role:'radio','aria-checked':get()===v,
    onclick:()=>{set(v);renderSegs()}},label,...(sub?[el('br'),el('small',{textContent:sub,style:'opacity:.7;font-weight:400'})]:[]))));
}
function renderSegs(){
  seg('#temp-seg',Object.entries(TEMP_LABEL).map(([k,[l,sub]])=>[k,l,sub]),()=>temp,v=>temp=v);
  seg('#mood-seg',Object.entries(MOOD_LABEL).map(([k,l])=>[k,l]),()=>mood,v=>mood=v);
}

/* ---------- 탭 / 시작 ---------- */
const TITLES={closet:['MY CLOSET','옷장'],outfit:['TODAY','코디']};
document.querySelectorAll('.dock button[data-tab]').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.dock button[data-tab],.tab').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');$('#tab-'+b.dataset.tab).classList.add('active');
  $('#eyebrow').textContent=TITLES[b.dataset.tab][0];$('#title').textContent=TITLES[b.dataset.tab][1];
  $('#count').hidden=b.dataset.tab!=='closet';window.scrollTo({top:0});
});
(async()=>{
  renderSegs();renderCatChips();renderSwatches();db=await open();await refresh();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
