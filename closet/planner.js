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
const nextWeek=()=>todayIdx()===6;   // 일요일에는 다음 주(월~일)를 보여줌
function weekDates(){const t=new Date(),off=todayIdx()-(nextWeek()?7:0);return DAYS.map((_,i)=>{const d=new Date(t);d.setDate(t.getDate()-off+i);return d})}
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

/* ---------- 콜라주: 옷들을 한 장의 룩북처럼 배치 ---------- */
// 왼쪽 줄 = 상의(원피스)·하의, 오른쪽 줄 = 아우터·신발·액세서리. 사진의 여백은 잘라 내고 옷끼리 바짝 붙여 한 덩어리로 모음
const CW=600,CH=800;
function collageCols(its){
  const get=c=>its.filter(i=>i.cat===c),dress=get('원피스')[0];
  const main=dress?[dress]:[get('상의')[0],get('하의')[0]].filter(Boolean);
  const side=[...get('아우터').slice(0,1),...get('신발').slice(0,1),...get('액세서리')];
  const both=main.length&&side.length;
  return [
    {gap:4,items:main.map(it=>({it,w:both?340:460,h:dress?740:main.length===2?(it.cat==='상의'?340:420):560}))},
    {gap:14,items:side.map(it=>({it,w:main.length?240:400,h:it.cat==='아우터'?300:it.cat==='신발'?190:140}))},
  ].filter(c=>c.items.length);
}
const loadImg=src=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=rej;im.src=src});
// 사진에서 옷만 남김: 밝은 배경은 투명하게(희미한 배경 네모가 안 보이게) 하고, 옷이 있는 부분(x,y,w,h)을 구함
function cutout(im){
  const w=im.width,h=im.height,c=el('canvas',{width:w,height:h}),g=c.getContext('2d',{willReadFrequently:true});
  g.drawImage(im,0,0);
  const px=g.getImageData(0,0,w,h),d=px.data;
  let clear=0;for(let i=3;i<d.length;i+=4)if(d[i]<250)clear++;
  let bg=null;
  if(clear<=w*h*.02){                                       // 배경을 지운 사진은 이미 투명
    const ch=[[],[],[]],at=(x,y)=>{const i=(y*w+x)*4;for(let k=0;k<3;k++)ch[k].push(d[i+k])};
    for(let x=0;x<w;x++){at(x,0);at(x,h-1)}for(let y=1;y<h-1;y++){at(0,y);at(w-1,y)}
    bg=ch.map(a=>a.sort((p,q)=>p-q)[a.length>>1]);
    if(Math.min(...bg)<200)bg=null;                         // 배경이 밝지 않으면 손대지 않음
  }
  if(bg)for(let i=0;i<w*h*4;i+=4){const e=Math.abs(d[i]-bg[0])+Math.abs(d[i+1]-bg[1])+Math.abs(d[i+2]-bg[2]);d[i+3]=e<24?0:e>60?d[i+3]:d[i+3]*(e-24)/36}
  // 옷 덩어리에서 떨어진 작은 점(사진 구석의 워터마크, 먼지)은 지움. 옷 안쪽의 무늬·단추는 남김
  const lab=new Int32Array(w*h),q=new Int32Array(w*h),comp=[null];
  for(let s=0;s<w*h;s++){
    if(lab[s]||d[s*4+3]<=40)continue;
    const id=comp.length,c={size:0,x0:w,x1:-1,y0:h,y1:-1};comp.push(c);
    let head=0,tail=0;q[tail++]=s;lab[s]=id;
    while(head<tail){
      const p=q[head++],x=p%w,y=(p/w)|0;
      if(x<c.x0)c.x0=x;if(x>c.x1)c.x1=x;if(y<c.y0)c.y0=y;if(y>c.y1)c.y1=y;
      if(x>0&&!lab[p-1]&&d[(p-1)*4+3]>40){lab[p-1]=id;q[tail++]=p-1}
      if(x<w-1&&!lab[p+1]&&d[(p+1)*4+3]>40){lab[p+1]=id;q[tail++]=p+1}
      if(y>0&&!lab[p-w]&&d[(p-w)*4+3]>40){lab[p-w]=id;q[tail++]=p-w}
      if(y<h-1&&!lab[p+w]&&d[(p+w)*4+3]>40){lab[p+w]=id;q[tail++]=p+w}
    }
    c.size=tail;
  }
  const main=comp.reduce((a,c)=>c&&(!a||c.size>a.size)?c:a,null);
  if(!main)return{c,x:0,y:0,w,h};
  const keep=comp.map(c=>c&&(c===main||c.size>=main.size*.08||(c.x0>=main.x0&&c.x1<=main.x1&&c.y0>=main.y0&&c.y1<=main.y1)));
  const rows=new Uint32Array(h),cols=new Uint32Array(w);
  for(let i=0;i<w*h;i++){
    if(!lab[i])continue;
    if(keep[lab[i]]){rows[(i/w)|0]++;cols[i%w]++}else d[i*4+3]=0;
  }
  g.putImageData(px,0,0);
  const tr=Math.max(2,w*.004),tc=Math.max(2,h*.004);       // 먼지 같은 점은 무시
  let x0=0,x1=w-1,y0=0,y1=h-1;
  while(x0<x1&&cols[x0]<tc)x0++;while(x1>x0&&cols[x1]<tc)x1--;
  while(y0<y1&&rows[y0]<tr)y0++;while(y1>y0&&rows[y1]<tr)y1--;
  return{c,x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};
}
async function drawCollage(ids){
  const cols=collageCols(sortIds(ids).map(itemById)),flat=cols.flatMap(c=>c.items);
  const cuts=(await Promise.all(flat.map(s=>loadImg(s.it.photo)))).map(cutout);
  flat.forEach((s,n)=>{const b=cuts[n],k=Math.min(s.w/b.w,s.h/b.h);s.cut=b;s.w=b.w*k;s.h=b.h*k});
  // 사진마다 크기가 제각각이라, 상의(없으면 원피스)를 기준으로 폭이 현실적인 비율이 되게 맞춤
  const ref=flat.find(s=>s.it.cat==='상의')||flat.find(s=>s.it.cat==='원피스')||flat[0];
  const REL={하의:[.7,1.05],아우터:[1,1.2],신발:[.4,.6],액세서리:[.3,.5]};   // 기준 폭에 대한 비율 범위
  const refW=ref.w;
  flat.forEach(s=>{const r=REL[s.it.cat];if(!r||s===ref)return;
    const k=Math.min(Math.max(s.w,r[0]*refW),r[1]*refW)/s.w;s.w*=k;s.h*=k;
    if(s.it.cat==='하의'&&s.h>1.55*ref.h){                       // 하의 길이는 상의의 1.5배 안팎까지 (폭은 .55배 아래로는 안 줄임)
      const k2=Math.max(1.55*ref.h/s.h,.55*refW/s.w);s.w*=k2;s.h*=k2}
  });
  cols.forEach(c=>{c.w=Math.max(...c.items.map(s=>s.w));c.h=c.items.reduce((a,s)=>a+s.h,0)+c.gap*(c.items.length-1)});
  const GAPX=30,W=cols.reduce((a,c)=>a+c.w,0)+GAPX*(cols.length-1),H=Math.max(...cols.map(c=>c.h));
  const f=Math.min(1.5,(CW-48)/W,(CH-48)/H);                // 한 덩어리로 키워서 캔버스를 채움
  const cv=el('canvas',{width:CW,height:CH}),g=cv.getContext('2d');
  g.fillStyle='#fff';g.fillRect(0,0,CW,CH);g.imageSmoothingQuality='high';
  let x=(CW-W*f)/2;
  for(const c of cols){
    let y=(CH-c.h*f)/2;
    for(const s of c.items){const w=s.w*f,h=s.h*f;g.drawImage(s.cut.c,s.cut.x,s.cut.y,s.cut.w,s.cut.h,x+(c.w*f-w)/2,y,w,h);y+=h+c.gap*f}
    x+=c.w*f+GAPX*f;
  }
  return cv.toDataURL('image/png');
}
const colUrl=new Map(),colPending=new Map();
const colKey=ids=>sortIds(ids).map(id=>id+':'+itemById(id).photo.length).join('|');
function collage(ids){
  const k=colKey(ids);
  if(!colPending.has(k)){
    if(colPending.size>20){colPending.clear();colUrl.clear()}
    colPending.set(k,drawCollage(ids).then(u=>(colUrl.set(k,u),u)));
  }
  return colPending.get(k);
}
function collageImg(ids){
  const img=el('img',{alt:'코디 콜라주',draggable:false}),u=colUrl.get(colKey(ids));
  if(u)img.src=u;else collage(ids).then(x=>{img.src=x}).catch(()=>{});
  return img;
}
// 폰에서는 공유 창(이미지 저장 포함), 그 밖에는 PNG 내려받기
async function saveCollage(ids,name){
  try{
    const blob=await (await fetch(await collage(ids))).blob(),file=new File([blob],`${name}.png`,{type:'image/png'});
    if(navigator.canShare&&navigator.canShare({files:[file]})){
      try{await navigator.share({files:[file],title:name});return}catch(e){if(e.name==='AbortError')return}
    }
    const a=el('a',{href:URL.createObjectURL(blob),download:file.name});
    document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  }catch{toast('이미지를 만들지 못했어요.')}
}

/* ---------- 요일 칸 ---------- */
function renderWeek(){
  const box=$('#week-grid');if(!box)return;
  const dates=weekDates(),ti=nextWeek()?-1:todayIdx();   // 다음 주에는 '오늘' 표시 없음
  const planned=DAYS.filter(d=>sortIds(planOf(d).ids).length).length;
  const pieces=new Set(DAYS.flatMap(d=>sortIds(planOf(d).ids))).size;
  $('#week-sum').textContent=planned?`${planned}일 계획됨 · 옷 ${pieces}벌`:'아직 비어 있어요';
  $('#btn-clear-week').hidden=!planned;
  box.replaceChildren(...DAYS.map((d,i)=>dayCard(d,i,dates[i],ti)));
  renderToday();
  renderCombos();
}
// 그날의 기온 단계: 직접 고른 게 있으면 그것, 아니면 예보, 둘 다 없으면 저장된 값
function effTemp(d,date){const p=planOf(d);if(p.tempManual)return p.temp||'mild';const w=date&&WX.get(date);return w?w.temp:(p.temp||'mild')}
function tempSel(d,date){
  const p=planOf(d),w=date&&WX.get(date),auto=!!w&&!p.tempManual;
  const opts=[...(w?[el('option',{value:'auto',textContent:`자동 · ${TEMP_LABEL[w.temp][0]} ${w.min}~${w.max}°`,selected:auto})]:[]),
    ...Object.entries(TEMP_LABEL).map(([k,[l,sub]])=>el('option',{value:k,textContent:`${l} ${sub}`,selected:!auto&&k===(p.temp||'mild')}))];
  const sel=el('select',{className:'wsel','aria-label':DAY_FULL[d]+' 날씨'},...opts);
  sel.onchange=async()=>{await savePlan(d,sel.value==='auto'?{tempManual:false}:{temp:sel.value,tempManual:true});renderWeek()};   // 맨 위 카드와 요일 칸의 날씨를 같이 맞춤
  return sel;
}
// 예보 한 줄 (누르면 위치 설정)
function wxLine(date){
  const w=WX.get(date),b=el('button',{type:'button',className:'wx-line',onclick:openWx});
  b.textContent=!WX.loc?'날씨를 자동으로 불러오기 ›':w?`${WX.loc.name} · ${w.min}°~${w.max}°${w.pop>=30?` · 비 ${w.pop}%`:''} ›`
    :WX.status==='error'?`${WX.loc.name} · 날씨를 못 불러왔어요 ›`:`${WX.loc.name} · 이 날 예보는 아직 없어요 ›`;
  return b;
}
function openWx(){
  const box=$('#wx-body'),here=el('button',{type:'button',className:'primary small',textContent:'현재 위치로 설정',onclick:async e=>{
    e.currentTarget.disabled=true;
    try{await WX.useHere();$('#d-wx').close();toast('현재 위치의 날씨를 불러왔어요.')}catch{toast('위치를 가져오지 못했어요. 아래에서 도시를 골라 주세요.',4000);e.target.disabled=false}
  }});
  box.replaceChildren(
    el('p',{className:'muted sm',textContent:WX.loc?`지금: ${WX.loc.name}${WX.status==='stale'?' (마지막으로 받은 예보)':WX.status==='error'?' (예보를 못 받았어요)':''}`:'위치를 정하면 7일 예보로 날씨가 자동으로 채워져요. 위치는 이 기기에만 저장돼요.'}),
    here,
    el('div',{className:'chips'},...Object.keys(CITIES).map(n=>el('button',{type:'button',className:'chip'+(WX.loc&&WX.loc.name===n?' on':''),textContent:n,onclick:async()=>{await WX.setCity(n);$('#d-wx').close();toast(`${n} 날씨를 불러왔어요.`)}}))),
    ...(WX.loc?[el('button',{type:'button',className:'ghost small',textContent:'자동 날씨 끄기',onclick:()=>{WX.loc=null;WX.days={};jset('wx:loc',null);WX.onChange();$('#d-wx').close()}})]:[]));
  $('#d-wx').showModal();
}
// 맨 위 카드: 오늘(일요일엔 내일=월요일)부터 하루씩 7장을 옆으로 넘겨 봄. 비어 있는 날은 추천받기
const TGAP=28;let todayPos=0;
function todaySlides(){
  const t=new Date(),idx=todayIdx(),start=nextWeek()?1:0;
  return Array.from({length:7},(_,j)=>{
    const off=start+j,date=new Date(t);date.setDate(t.getDate()+off);
    const d=DAYS[(idx+off)%7],md=`${date.getMonth()+1}/${date.getDate()}`;
    return{d,date,off,label:off===0?'오늘':off===1?'내일':DAY_FULL[d],sub:off<2?`${DAY_FULL[d]} ${md}`:md};
  });
}
let todayFx=null;   // 방금 추천으로 바뀐 날: 비어 있었으면 펼쳐지고, 이미 있었으면 교체
function todaySlide(s){
  const d=s.d,ids=sortIds(planOf(d).ids),open=()=>openPicker({mode:'day',day:d});
  const fx=todayFx&&todayFx.d===d&&ids.length?todayFx:null;if(fx)todayFx=null;
  const slide=el('div',{className:'tslide'},
    el('div',{className:'wd-head'},el('b',{className:'wd-name',textContent:s.label}),el('span',{className:'wd-date',textContent:s.sub}),tempSel(d,s.date)),
    wxLine(s.date),
    ids.length
      ?el('div',{className:'collage-wrap'},el('button',{type:'button',className:'collage'+(fx?(fx.had?' swap-in':' grow-in'):''),onclick:open,'aria-label':DAY_FULL[d]+' 옷 바꾸기'},collageImg(ids)),
        ...(fx&&fx.had&&fx.old?[el('img',{className:'collage-ghost',src:fx.old,alt:'',onanimationend:e=>e.target.remove()})]:[]))
      :el('div',{className:'today-empty'},el('p',{className:'muted sm',textContent:'아직 정하지 않았어요'}),
        el('button',{type:'button',className:'primary small',textContent:'추천받기',onclick:()=>recommendDay(d,s.date)}),miniBtn('직접 고르기',open)),
    ...(ids.length?[el('div',{className:'wd-acts'},miniBtn('바꾸기',open),miniBtn('다시 추천',()=>recommendDay(d,s.date)),
      miniBtn('이미지 저장',()=>saveCollage(ids,`${DAY_FULL[d]} 코디`)),miniBtn('비우기',async()=>{await savePlan(d,{ids:[]});renderWeek()},'quiet'))]:[]));
  slide.dataset.day=d;return slide;
}
function goToday(n,smooth=true){   // 카드가 가려져 있으면(폭 0) 탭으로 돌아올 때 app.js가 다시 불러줌
  const tr=$('#today-track');if(tr)tr.scrollTo({left:Math.max(0,Math.min(6,n))*(tr.clientWidth+TGAP),behavior:smooth?'smooth':'instant'});
}
function markToday(){
  document.querySelectorAll('#today .tdot').forEach((b,i)=>b.setAttribute('aria-current',i===todayPos));
  const pv=$('#t-prev'),nx=$('#t-next');if(pv)pv.disabled=todayPos===0;if(nx)nx.disabled=todayPos===6;
}
function renderToday(){
  const box=$('#today');if(!box)return;
  const ss=todaySlides();
  const track=el('div',{className:'today-track',id:'today-track',tabIndex:0,ariaLabel:'날짜별 코디, 옆으로 넘기기'},...ss.map(todaySlide));
  track.onscroll=()=>{clearTimeout(track._t);track._t=setTimeout(()=>{if(track.clientWidth){todayPos=Math.round(track.scrollLeft/(track.clientWidth+TGAP));markToday()}},60)};
  track.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();goToday(todayPos+(e.key==='ArrowRight'?1:-1))}};
  box.replaceChildren(track,el('div',{className:'today-nav'},
    el('button',{type:'button',className:'tarrow',id:'t-prev',textContent:'‹','aria-label':'이전 날',onclick:()=>goToday(todayPos-1)}),
    el('div',{className:'tdots'},...ss.map((s,i)=>el('button',{type:'button',className:'tdot','aria-label':s.label,onclick:()=>goToday(i)},el('i')))),
    el('button',{type:'button',className:'tarrow',id:'t-next',textContent:'›','aria-label':'다음 날',onclick:()=>goToday(todayPos+1)})));
  goToday(todayPos,false);markToday();   // 다시 그려도 보던 날짜에 머무름
}
function dayCard(d,i,date,ti){
  const p=planOf(d),ids=sortIds(p.ids);
  const sel=tempSel(d,date);
  const head=el('div',{className:'wd-head'},el('b',{className:'wd-name',textContent:d}),el('span',{className:'wd-date',textContent:`${date.getMonth()+1}/${date.getDate()}`}),
    ...(i===ti?[el('span',{className:'today',textContent:'오늘'})]:[]),sel);
  const open=()=>openPicker({mode:'day',day:d});
  const body=ids.length
    ?el('button',{type:'button',className:'wd-strip',onclick:open,'aria-label':DAY_FULL[d]+' 옷 바꾸기'},...thumbs(ids))
    :el('button',{type:'button',className:'wd-empty',onclick:open,textContent:'＋ 옷 고르기'});
  const acts=el('div',{className:'wd-acts'},miniBtn('고르기',open),miniBtn('코디 불러오기',()=>openApply(d)),miniBtn('추천',()=>recommendDay(d,date)),
    ...(ids.length?[miniBtn('비우기',async()=>{await savePlan(d,{ids:[]});renderWeek()},'quiet')]:[]));
  return el('div',{className:'wd'+(i===ti?' now':'')},head,body,acts);
}
async function recommendDay(d,date,silent){
  const usage={},near=new Set(),idx=DAYS.indexOf(d);
  DAYS.forEach(x=>{if(x!==d)sortIds(planOf(x).ids).forEach(id=>{usage[id]=(usage[id]||0)+1})});
  [idx-1,idx+1].forEach(k=>{if(DAYS[k])sortIds(planOf(DAYS[k]).ids).forEach(id=>near.add(id))});
  const r=recommend(effTemp(d,date),{usage,near});
  if(!r){if(!silent)toast('이 날씨에 맞는 상의+하의(또는 원피스)가 부족해요.');return false}
  todayFx={d,had:sortIds(planOf(d).ids).length>0,old:document.querySelector(`#today .tslide[data-day="${d}"] .collage img`)?.src||null};   // 오늘 카드 전환 연출용
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
  pk.ids=o.mode==='day'?sortIds(planOf(o.day).ids):sortIds(combo?combo.ids:o.ids||[]);   // 옷장에서 고른 옷으로 시작할 수도 있음
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
// 코디 카드의 큰 이미지: 콜라주 → 올려 둔 착용샷(최대 3장) → 올리기 칸을 옆으로 넘김
const MAX_LOOKS=3,LGAP=16;let onlyLooks=false,lookTarget=null;const comboPos={};
function renderCombos(){
  const box=$('#combo-list');if(!box)return;
  const withLooks=outfits.filter(o=>(o.looks||[]).length);
  const f=$('#f-looks');f.classList.toggle('on',onlyLooks);f.setAttribute('aria-pressed',onlyLooks);f.textContent=`착용샷 있는 것만 · ${withLooks.length}`;
  const list=(onlyLooks?withLooks:outfits).slice().sort((a,b)=>(b.uses||0)-(a.uses||0)||(b.at||0)-(a.at||0));
  const none=onlyLooks&&outfits.length?'착용샷을 올린 코디가 아직 없어요.':'아직 등록한 코디가 없어요. 자주 입는 차림을 코디로 만들어 두면 어느 요일에든 한 번에 넣을 수 있어요.';
  box.replaceChildren(...(list.length?list.map(comboCard):[el('p',{className:'muted sm',style:'padding:0 22px;margin:0',textContent:none})]));
  goCombos();
}
function goCombos(){document.querySelectorAll('#combo-list .looks').forEach(w=>w._go&&w._go(false))}   // 가려진 탭에서 다시 그려졌을 때도 보던 장으로
function lookSlide(o,i){
  let armed=false;
  const del=el('button',{type:'button',className:'look-del',textContent:'삭제',onclick:async e=>{
    const b=e.currentTarget;
    if(!armed){armed=true;b.textContent='한 번 더';setTimeout(()=>{armed=false;b.textContent='삭제'},3000);return}
    comboPos[o.id]=0;await put('outfits',{...o,looks:o.looks.filter((_,k)=>k!==i)});await refresh();
  }});
  return el('div',{className:'look-photo'},el('img',{src:o.looks[i],alt:`${comboName(o)} 착용샷 ${i+1}`}),del);
}
function addSlide(o){
  return el('button',{type:'button',className:'look-add',onclick:()=>{lookTarget=o.id;$('#look-file').click()}},
    el('b',{textContent:'＋ 착용샷 올리기'}),el('small',{textContent:'입어본 사진을 올려 두세요'}));
}
function looksSlider(o,ids){
  const looks=o.looks||[];
  const slides=[ids.length?el('button',{type:'button',className:'collage',onclick:()=>openPicker({mode:'combo',comboId:o.id}),'aria-label':comboName(o)+' 수정'},collageImg(ids)):el('p',{className:'muted sm',style:'margin:0',textContent:'옷이 모두 삭제됐어요. 수정에서 다시 고르세요.'}),
    ...looks.map((_,i)=>lookSlide(o,i)),...(looks.length<MAX_LOOKS?[addSlide(o)]:[])];
  const track=el('div',{className:'look-track'},...slides.map(x=>el('div',{className:'look-slide'},x)));
  const n=slides.length,pos=()=>Math.min(comboPos[o.id]||0,n-1);
  const go=(i,smooth=true)=>{comboPos[o.id]=Math.max(0,Math.min(n-1,i));if(track.clientWidth)track.scrollTo({left:comboPos[o.id]*(track.clientWidth+LGAP),behavior:smooth?'smooth':'instant'});mark()};
  const mark=()=>{dots.forEach((d,k)=>d.setAttribute('aria-current',k===pos()));prev.disabled=pos()===0;next.disabled=pos()===n-1};
  const prev=el('button',{type:'button',className:'tarrow',textContent:'‹','aria-label':'이전',onclick:()=>go(pos()-1)});
  const next=el('button',{type:'button',className:'tarrow',textContent:'›','aria-label':'다음',onclick:()=>go(pos()+1)});
  const dots=slides.map((_,k)=>el('button',{type:'button',className:'tdot','aria-label':`${k+1}번째`,onclick:()=>go(k)},el('i')));
  let t;track.onscroll=()=>{clearTimeout(t);t=setTimeout(()=>{if(track.clientWidth){comboPos[o.id]=Math.round(track.scrollLeft/(track.clientWidth+LGAP));mark()}},60)};
  const wrap=el('div',{className:'looks'},track,...(n>1?[el('div',{className:'today-nav'},prev,el('div',{className:'tdots'},...dots),next)]:[]));
  wrap._go=smooth=>go(pos(),smooth);
  return wrap;
}
function comboCard(o){
  const ids=sortIds(o.ids);
  return el('div',{className:'combo'},
    el('div',{className:'combo-head'},el('b',{textContent:comboName(o)}),el('small',{className:'muted',textContent:o.uses?`${o.uses}회 사용`:'아직 안 썼어요'}),
      miniBtn('수정',()=>openPicker({mode:'combo',comboId:o.id}),'quiet'),miniBtn('저장',()=>saveCollage(ids,comboName(o)),'quiet')),
    looksSlider(o,ids),
    el('div',{className:'combo-days'},el('span',{className:'lbl',textContent:'넣기'}),...DAYS.map(d=>el('button',{type:'button',className:'dbtn',textContent:d,'aria-label':DAY_FULL[d]+'에 넣기',disabled:!ids.length,onclick:()=>applyCombo(o,d)}))));
}
// 올린 사진은 긴 변 960px 이하 JPEG로 줄이고, 3장을 합쳐도 클라우드 문서 한도(1MB) 안에 들어오게 한 장을 약 280KB 이하로 맞춤
async function shrinkLook(file){
  const url=URL.createObjectURL(file);
  try{
    const im=await loadImg(url);let k=Math.min(1,960/Math.max(im.naturalWidth,im.naturalHeight)),q=.85,out;
    for(let n=0;n<8;n++){
      const c=el('canvas',{width:Math.max(1,Math.round(im.naturalWidth*k)),height:Math.max(1,Math.round(im.naturalHeight*k))}),g=c.getContext('2d');
      g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(im,0,0,c.width,c.height);
      out=c.toDataURL('image/jpeg',q);if(out.length<=280000)return out;
      if(q>.5)q-=.1;else k*=.85;
    }
    return out.length<=400000?out:null;
  }finally{URL.revokeObjectURL(url)}
}
async function addLooks(files){
  const o=outfits.find(x=>x.id===lookTarget);if(!o)return;
  const room=MAX_LOOKS-(o.looks||[]).length,list=[...files].slice(0,room),added=[];
  for(const f of list){try{const u=await shrinkLook(f);if(u)added.push(u);else toast('사진이 너무 커서 줄이지 못했어요.')}catch{toast('사진을 읽지 못했어요.')}}
  if(files.length>room)toast(`착용샷은 코디마다 ${MAX_LOOKS}장까지예요.`);
  if(!added.length)return;
  const looks=[...(o.looks||[]),...added];
  comboPos[o.id]=looks.length;                                 // 방금 올린 마지막 사진으로 이동
  await put('outfits',{...o,looks});await refresh();
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
  WX.onChange=()=>renderWeek();
  $('#f-looks').onclick=()=>{onlyLooks=!onlyLooks;renderCombos()};
  $('#look-file').onchange=async e=>{const fs=[...e.target.files];e.target.value='';if(fs.length)await addLooks(fs)};
  renderWeek();
}
