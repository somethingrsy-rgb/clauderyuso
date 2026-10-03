'use strict';
const CATS=['상의','하의','원피스','아우터','신발','액세서리'];
const SEASONS=['봄','여름','가을','겨울'];
const COLORS={검정:'#111',흰색:'#fff',아이보리:'#f1ead8',회색:'#999',베이지:'#d9c3a0',갈색:'#7a5230',카키:'#7a7a4a',네이비:'#1f2a56',데님:'#4a6a96',버건디:'#6e2536',빨강:'#d03a3a',주황:'#ee8a2b',머스타드:'#d4a62a',노랑:'#f2d33b',초록:'#3f9a5a',민트:'#a5d6c8',하늘색:'#9ec8ea',파랑:'#2f6fe0',라벤더:'#b9a6dd',보라:'#7a4fc4',분홍:'#f0a0c0'};
const NEUTRAL=new Set(['검정','흰색','아이보리','회색','베이지','네이비','데님','갈색','카키']);
// 온도 → 계절 / 아우터 필요 여부
const TEMP={hot:{s:['여름'],outer:false},mild:{s:['봄','가을'],outer:false},cool:{s:['봄','가을'],outer:true},cold:{s:['겨울'],outer:true}};

const $=s=>document.querySelector(s);
const el=(t,p={},...k)=>{const e=Object.assign(document.createElement(t),p);k.forEach(c=>e.append(c));return e};

/* ---------- IndexedDB ---------- */
let db;
const open=()=>new Promise((res,rej)=>{const r=indexedDB.open('closet',2);
  r.onupgradeneeded=()=>{const d=r.result;for(const s of ['items','outfits','plans'])if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:'id',autoIncrement:true})};
  r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
const tx=(s,m,fn)=>new Promise((res,rej)=>{const t=db.transaction(s,m);const r=fn(t.objectStore(s));t.oncomplete=()=>res(r.result);t.onerror=()=>rej(t.error)});
const uid=()=>(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,10));
const all=s=>tx(s,'readonly',o=>o.getAll());
// 기기 안 저장소만 건드리는 함수 (클라우드에서 내려받은 변경을 반영할 때도 사용)
const localPut=(s,v)=>tx(s,'readwrite',o=>o.put(v));
const localDel=(s,id)=>tx(s,'readwrite',o=>o.delete(id));
// 화면에서 쓰는 함수: 기기에 저장하고, 로그인 상태면 클라우드에도 반영
const put=async(s,v)=>{if(!v.id)v.id=uid();v.updatedAt=Date.now();await localPut(s,v);cloudSet(s,v)};
const del=async(s,id)=>{await localDel(s,id);cloudDel(s,id)};

// 예전 버전의 숫자 id를 기기 간에 겹치지 않는 문자열 id로 바꿔 둔다
async function migrateIds(){
  const map={};
  for(const it of await all('items'))if(typeof it.id==='number'){const n=uid();map[it.id]=n;await localDel('items',it.id);await localPut('items',{...it,id:n})}
  for(const o of await all('outfits')){
    const ids=o.ids.map(i=>map[i]??i);
    if(typeof o.id==='number'||ids.some((x,k)=>x!==o.ids[k])){await localDel('outfits',o.id);await localPut('outfits',{...o,id:typeof o.id==='number'?uid():o.id,ids})}
  }
}

/* ---------- 클라우드 동기화 (Firebase) ---------- */
const FIREBASE_CONFIG={
  apiKey:"AIzaSyC7LCM2tggcjLIUTofov_Iksj631JZUnUE",
  authDomain:"my-closet-5bd18.firebaseapp.com",
  projectId:"my-closet-5bd18",
  storageBucket:"my-closet-5bd18.firebasestorage.app",
  messagingSenderId:"502142334513",
  appId:"1:502142334513:web:296b1e34ba11c324444710"
};
const cloud={on:false,user:null,fs:null,auth:null,unsubs:[],pending:false,fromCache:false,error:'',serverSeen:false,startedAt:0,counts:{},uploading:false};
const base=()=>cloud.fs.collection('users').doc(cloud.user.uid);
const lsGet=k=>{try{return localStorage.getItem(k)}catch{return null}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};
function toast(msg,ms=3200){let t=$('#toast');if(!t){t=el('div',{id:'toast',className:'toast',role:'status'})}
  (document.querySelector('dialog[open]')||document.body).append(t);   // 모달이 열려 있으면 그 안에 띄워야 보임
  t.textContent=msg;t.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,ms)}
const withTimeout=(p,ms)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej({code:'timeout'}),ms))]);
const cloudErr=(e,what)=>e&&e.code==='timeout'?'서버에 연결되지 않아요. 광고 차단 확장 프로그램이나 네트워크를 확인해 주세요.':`클라우드 ${what} 실패: ${e.code||e.message}`;
// 서버가 받았으면 true. 오래 응답이 없으면 알림을 띄운다(요청은 대기열에 남아 연결되면 자동으로 올라감)
function cloudSet(s,v){if(!cloud.user)return Promise.resolve(false);
  return withTimeout(base().collection(s).doc(String(v.id)).set(JSON.parse(JSON.stringify(v))),12000).then(()=>true).catch(e=>{toast(cloudErr(e,'저장'),6000);return false})}
function cloudDel(s,id){if(!cloud.user)return Promise.resolve(false);
  return withTimeout(base().collection(s).doc(String(id)).delete(),12000).then(()=>true).catch(e=>{toast(cloudErr(e,'삭제'),6000);return false})}
async function uploadAll(){
  if(!cloud.user||cloud.uploading)return;
  cloud.uploading=true;renderAcct();
  let ok=0,fail=0;
  outer:for(const s of ['items','outfits','plans'])for(const v of await all(s)){if(await cloudSet(s,v))ok++;else{fail++;break outer}}
  cloud.uploading=false;renderAcct();
  toast(fail?`${ok}개 올리고 멈췄어요. 연결 상태를 확인해 주세요.`:ok?`${ok}개를 클라우드에 올렸어요.`:'올릴 옷이 없어요.',5000);
}

let refreshTimer;const refreshSoon=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,60)};
function listen(name){
  let reconciled=false;
  return base().collection(name).onSnapshot({includeMetadataChanges:true},async snap=>{
    try{
      cloud.fromCache=snap.metadata.fromCache;cloud.pending=snap.metadata.hasPendingWrites;cloud.counts[name]=snap.size;
      if(!snap.metadata.fromCache)cloud.serverSeen=true;
      let changed=false;
      for(const ch of snap.docChanges()){
        if(ch.doc.metadata.hasPendingWrites)continue;               // 내가 방금 쓴 변경은 이미 기기에 있음
        const d={...ch.doc.data(),id:ch.doc.id};
        if(ch.type==='removed')await localDel(name,d.id);else await localPut(name,d);
        changed=true;
      }
      // 서버에서 받은 첫 목록과 기기 목록을 한 번 맞춘다
      if(!reconciled&&!snap.metadata.fromCache){
        reconciled=true;
        const cloudIds=new Set(snap.docs.map(d=>d.id)),key=`sync:${cloud.user.uid}:${name}`,seen=lsGet(key)==='1';
        for(const v of await all(name))if(!cloudIds.has(String(v.id))){
          if(seen){await localDel(name,v.id);changed=true}          // 다른 기기에서 지운 것
          else cloudSet(name,v);                                    // 이 기기에만 있던 것은 올림
        }
        lsSet(key,'1');
      }
      if(changed)refreshSoon();
      renderAcct();
    }catch(e){console.error(e)}
  },e=>{cloud.error=e.code||e.message;toast(e.code==='permission-denied'?'저장 권한이 없어요. Firestore 보안 규칙을 확인해 주세요.':'동기화 오류: '+cloud.error);renderAcct()});
}
function startSync(){stopSync();cloud.startedAt=Date.now();cloud.serverSeen=false;cloud.counts={};cloud.unsubs=['items','outfits','plans'].map(listen)}
function stopSync(){cloud.unsubs.forEach(u=>u());cloud.unsubs=[];cloud.pending=false;cloud.fromCache=false;cloud.error=''}

async function signIn(){
  if(!cloud.on)return toast('로그인 기능을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.');
  const p=new firebase.auth.GoogleAuthProvider();
  try{await cloud.auth.signInWithPopup(p)}
  catch(e){
    if(e.code==='auth/popup-blocked'||e.code==='auth/operation-not-supported-in-this-environment'){try{await cloud.auth.signInWithRedirect(p)}catch(e2){toast('로그인 실패: '+(e2.code||e2.message),6000)}}
    else if(e.code==='auth/unauthorized-domain')toast('이 주소가 Firebase 승인된 도메인에 없어요.',6000);
    else if(e.code!=='auth/popup-closed-by-user'&&e.code!=='auth/cancelled-popup-request')toast('로그인 실패: '+(e.code||e.message),6000);
  }
}
function syncLabel(){
  if(cloud.error)return ['오류',cloud.error];
  if(!navigator.onLine)return ['오프라인','인터넷에 연결되면 자동으로 맞춰요.'];
  if(!cloud.serverSeen)return Date.now()-cloud.startedAt>10000
    ?['연결 안 됨','서버에 연결되지 않아요. 광고 차단 확장 프로그램이나 네트워크(회사·학교 망)를 확인해 주세요.']
    :['연결 중…','서버에 연결하는 중이에요.'];
  if(cloud.pending)return ['동기화 중…','잠시만 기다려 주세요.'];
  return ['동기화됨','다른 기기에서도 같은 옷장이 보여요.'];
}
function renderAcct(){
  const b=$('#acct');
  if(!cloud.user){b.className='acct';b.textContent='로그인';b.title='로그인하면 폰과 컴퓨터가 동기화돼요';}
  else{b.className='acct on';b.textContent=(cloud.user.displayName||cloud.user.email||'?').trim().charAt(0).toUpperCase();b.title=cloud.user.email||''}
  const d=$('#acct-body');if(!d)return;
  const [st0,sub0]=cloud.user?syncLabel():['',''];
  const sig=cloud.user?[cloud.user.uid,st0,sub0,items.length,cloud.counts.items,cloud.uploading].join('|'):'out';
  if(d.dataset.sig===sig)return;d.dataset.sig=sig;      // 내용이 그대로면 다시 그리지 않아 버튼 터치가 끊기지 않게 함
  if(!cloud.user){
    d.replaceChildren(el('p',{className:'muted',textContent:'구글 계정으로 로그인하면 폰과 컴퓨터에서 같은 옷장을 볼 수 있어요. 로그인하지 않으면 이 기기에만 저장돼요.'}),
      el('button',{className:'primary wide',textContent:'Google로 로그인',onclick:signIn}));
  }else{
    const [st,sub]=syncLabel();
    d.replaceChildren(el('div',{className:'who'},el('b',{textContent:cloud.user.displayName||'내 계정'}),el('span',{className:'muted',textContent:cloud.user.email||''})),
      el('div',{className:'syncrow'},el('i',{className:'led '+(st==='동기화됨'?'ok':(st==='오류'||st==='연결 안 됨')?'bad':'wait')}),el('b',{textContent:st}),el('span',{className:'muted',textContent:sub})),
      el('p',{className:'muted sm',textContent:`이 기기 ${items.length}벌 · 클라우드 ${cloud.counts.items??'-'}벌`}),
      el('button',{className:'ghost wide',textContent:cloud.uploading?'올리는 중…':'이 기기의 옷 다시 올리기',disabled:cloud.uploading,onclick:uploadAll}),
      el('p',{className:'muted sm',textContent:'로그아웃해도 이 기기에 저장된 옷은 그대로 남아요.'}),
      el('button',{className:'ghost wide',textContent:'로그아웃',onclick:async()=>{await cloud.auth.signOut();$('#d-acct').close()}}));
  }
}
function initCloud(){
  $('#acct').onclick=()=>{renderAcct();if(!cloud.user&&!cloud.on)return signIn();$('#d-acct').showModal()};
  document.querySelectorAll('#d-acct [data-close]').forEach(b=>b.onclick=()=>$('#d-acct').close());
  window.addEventListener('online',renderAcct);window.addEventListener('offline',renderAcct);
  setInterval(()=>{if($('#d-acct').open)renderAcct()},2000);
  if(typeof firebase==='undefined'){renderAcct();return}           // SDK를 못 받으면 기기 저장만 사용
  try{
    firebase.initializeApp(FIREBASE_CONFIG);
    cloud.auth=firebase.auth();cloud.fs=firebase.firestore();
    cloud.fs.enablePersistence({synchronizeTabs:true}).catch(()=>{});  // 오프라인에서도 쓰고 다시 연결되면 올림
    cloud.on=true;
    cloud.auth.getRedirectResult().catch(e=>toast('로그인 실패: '+(e.code||e.message),6000));
    cloud.auth.onAuthStateChanged(user=>{
      cloud.user=user;
      if(user)startSync();else stopSync();
      renderAcct();
    });
  }catch(e){console.error(e);cloud.on=false}
  renderAcct();
}

/* ---------- 상태 ---------- */
let items=[],outfits=[],filter='전체',editing=null,photoData=null,current=null;
let selCat=CATS[0],selColor='검정',temp='mild',mood='any';
const TEMP_LABEL={hot:['더워요','25°↑'],mild:['적당해요','15–24°'],cool:['쌀쌀해요','5–14°'],cold:['추워요','5°↓']};
const MOOD_LABEL={any:'상관없음',neutral:'차분하게',color:'포인트'};

async function refresh(){
  items=await all('items');outfits=await all('outfits');
  plans=Object.fromEntries((await all('plans')).map(p=>[p.day,p]));
  renderCloset();renderWeek();
  $('#count').textContent=items.length?`총 ${items.length}벌`:'';
  fitAll();
}

/* ---------- 이미지 리사이즈 (저장 용량 절약) ---------- */
function resize(file,max=640){return new Promise((res,rej)=>{
  const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{const k=Math.min(1,max/Math.max(img.width,img.height));
    const c=el('canvas',{width:Math.round(img.width*k),height:Math.round(img.height*k)});
    c.getContext('2d').drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);res(c.toDataURL('image/jpeg',.82))};
  img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('이미지를 읽을 수 없어요'))};img.src=url})}

/* ---------- 사진 크기 맞추기: 옷 부분만 잘라서 3:4 칸에 늘 같은 여백으로 다시 놓음 ---------- */
const FIT_W=480,FIT_H=640,FIT_FILL=.86;
function fitPhoto(url){return new Promise(res=>{
  const img=new Image();
  img.onerror=()=>res(url);
  img.onload=()=>{try{
    const w=img.naturalWidth,h=img.naturalHeight;
    const c=el('canvas',{width:w,height:h}),x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0);
    const d=x.getImageData(0,0,w,h).data;
    let clear=0;for(let i=3;i<d.length;i+=4)if(d[i]<250)clear++;
    const alphaMode=clear>w*h*.02;                        // 배경을 지운 사진은 투명도로, 아니면 가장자리 색과 다른 곳을 옷으로 봄
    const bgc=[255,255,255];
    if(!alphaMode){
      const px=[[],[],[]],at=(X,Y)=>{const i=(Y*w+X)*4;for(let k=0;k<3;k++)px[k].push(d[i+k])};
      for(let X=0;X<w;X++){at(X,0);at(X,h-1)}for(let Y=1;Y<h-1;Y++){at(0,Y);at(w-1,Y)}
      for(let k=0;k<3;k++){px[k].sort((a,b)=>a-b);bgc[k]=px[k][px[k].length>>1]}   // 중앙값이라 옷이 가장자리에 닿아도 괜찮음
    }
    const rows=new Uint32Array(h),cols=new Uint32Array(w);let n=0;
    for(let Y=0,i=0;Y<h;Y++)for(let X=0;X<w;X++,i+=4){
      const on=alphaMode?d[i+3]>40:Math.abs(d[i]-bgc[0])+Math.abs(d[i+1]-bgc[1])+Math.abs(d[i+2]-bgc[2])>36;
      if(on){rows[Y]++;cols[X]++;n++}
    }
    if(n<w*h*.03)return res(url);                        // 옷을 못 찾으면(흰 옷+흰 배경 등) 그대로 둠
    const tr=Math.max(2,w*.004),tc=Math.max(2,h*.004);   // 먼지 같은 점은 무시
    let x0=0,x1=w-1,y0=0,y1=h-1;
    while(x0<x1&&cols[x0]<tc)x0++;while(x1>x0&&cols[x1]<tc)x1--;
    while(y0<y1&&rows[y0]<tr)y0++;while(y1>y0&&rows[y1]<tr)y1--;
    const mx=Math.round((x1-x0)*.02),my=Math.round((y1-y0)*.02);
    x0=Math.max(0,x0-mx);x1=Math.min(w-1,x1+mx);y0=Math.max(0,y0-my);y1=Math.min(h-1,y1+my);
    const bw=x1-x0+1,bh=y1-y0+1,k=Math.min(FIT_W*FIT_FILL/bw,FIT_H*FIT_FILL/bh,3);
    const o=el('canvas',{width:FIT_W,height:FIT_H}),g=o.getContext('2d');
    if(!alphaMode){g.fillStyle=`rgb(${bgc})`;g.fillRect(0,0,FIT_W,FIT_H)}
    g.imageSmoothingQuality='high';
    g.drawImage(c,x0,y0,bw,bh,(FIT_W-bw*k)/2,(FIT_H-bh*k)/2,bw*k,bh*k);
    let u=o.toDataURL('image/webp',.85);
    if(!u.startsWith('data:image/webp'))u=o.toDataURL(alphaMode?'image/png':'image/jpeg',.85);
    res(u.length<700000?u:url);                          // Firestore 문서 1MB 제한
  }catch{res(url)}};
  img.src=url})}
// 예전에 올린 사진도 한 번씩 맞춤 (fit 표시가 없는 것만)
let fitting=false;
async function fitAll(){
  if(fitting)return;fitting=true;let n=0;
  try{
    for(const it of items){
      if(it.fit||!it.photo)continue;
      await put('items',{...it,createdAt:it.createdAt||it.updatedAt,photo:await fitPhoto(it.photo),fit:1});n++;   // 목록 순서가 바뀌지 않게 등록 시각을 고정
    }
  }finally{fitting=false}
  if(n){await refresh();toast(`옷 사진 ${n}장의 크기를 맞췄어요`)}
}

/* ---------- 옷장 화면 ---------- */
function chip(label,on,fn){return el('button',{className:'chip'+(on?' on':''),type:'button',textContent:label,onclick:fn})}
function dot(c){return el('i',{className:'dot',style:`background:${COLORS[c]||'#ccc'}`})}
function card(it,onclick){
  const b=el('button',{className:'item',type:'button',onclick});
  b.append(el('span',{className:'ph'},el('img',{src:it.photo,alt:it.name,loading:'lazy'})),
    el('span',{className:'meta'},el('b',{textContent:it.name||it.cat}),el('small',{},dot(it.color),`${it.color} · ${it.cat}`)));
  return b}
const born=i=>i.createdAt||i.updatedAt||0;   // 등록한 시각 (예전에 올린 옷은 마지막으로 고친 시각)
function renderCloset(){
  const f=$('#filter-cat');f.replaceChildren(...['전체',...CATS].map(c=>chip(`${c} ${c==='전체'?items.length:items.filter(i=>i.cat===c).length}`,c===filter,()=>{filter=c;renderCloset()})));
  const q=$('#q').value.trim().toLowerCase(),so=$('#sort').value;
  const list=items.filter(i=>(filter==='전체'||i.cat===filter)&&(!q||[i.name,i.cat,i.color].join(' ').toLowerCase().includes(q)))
    .sort(so==='name'?(a,b)=>(a.name||a.cat).localeCompare(b.name||b.cat,'ko'):so==='cat'?(a,b)=>(CATS.indexOf(a.cat)+1||99)-(CATS.indexOf(b.cat)+1||99)||born(b)-born(a):(a,b)=>born(b)-born(a));
  const open=i=>card(i,()=>openDlg(i));
  let nodes;
  if(!list.length&&items.length)nodes=[el('p',{className:'none',textContent:'조건에 맞는 옷이 없어요.'})];
  else if(filter==='전체'&&so==='cat'){          // 전체 + 종류순: 상의 → 하의 → 원피스 → 아우터 → 신발 → 액세서리 묶음으로 나열
    nodes=[];
    for(const c of [...CATS,'기타']){
      const g=c==='기타'?list.filter(i=>!CATS.includes(i.cat)):list.filter(i=>i.cat===c);
      if(g.length)nodes.push(el('h3',{className:'grp'},c,el('small',{textContent:`${g.length}벌`})),...g.map(open));
    }
  }else nodes=list.map(open);
  $('#grid').replaceChildren(...nodes);
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
/* ---------- 배경 지우기 ---------- */
let cutOn=false;
const bgMsg=t=>{$('#bg-msg').textContent=t};
function showCut(on){
  cutOn=on;$('#bg-canvas').hidden=!on;$('#drop').classList.toggle('cut',on);
  $('#preview').hidden=on||!photoData;$('#bg-undo').disabled=!BgCut.canUndo;$('#bg-reset').disabled=!BgCut.dirty;
}
async function setupCut(url){
  $('#bg-tools').hidden=true;showCut(false);
  if(!url)return;
  try{await BgCut.load(url);$('#bg-tools').hidden=false;
    bgMsg('배경이 단색이면 한 번에 지워져요. 강도가 높을수록 비슷한 색을 더 많이 지워요.');showCut(false)}
  catch{/* 읽지 못하면 도구만 숨김 */}
}
$('#bg-tol').oninput=e=>{$('#bg-tol-v').textContent=e.target.value};
$('#bg-auto').onclick=()=>{
  const r=BgCut.auto(+$('#bg-tol').value);
  if(!r.ok){bgMsg(r.reason==='all'?'옷까지 같이 지워질 것 같아 취소했어요. 강도를 낮추거나, 남기고 싶은 옷과 배경 색이 다른 사진으로 해 보세요.':'사진 가장자리에서 배경을 찾지 못했어요.');showCut(cutOn);return}
  BgCut.paint($('#bg-canvas'));showCut(true);
  if(r.already){bgMsg('이미 배경이 지워진 사진이에요. 남은 부분은 눌러서 지울 수 있어요.');return}
  bgMsg(r.removed<.03?'거의 지워지지 않았어요. 강도를 높이거나 남은 배경을 눌러서 지워 보세요.':'남은 배경은 눌러서 지울 수 있어요. 옷이 지워졌다면 되돌리기를 누르세요.');
};
$('#bg-canvas').onclick=e=>{
  e.preventDefault();                                 // 라벨이 사진 선택창을 열지 않게 막음
  const p=BgCut.pointToPixel($('#bg-canvas'),e.clientX,e.clientY);if(!p)return;
  if(!BgCut.wand(p.x,p.y,+$('#bg-tol').value)){bgMsg('이미 지워진 곳이에요.');return}
  BgCut.paint($('#bg-canvas'));showCut(true);bgMsg('눌러서 더 지울 수 있어요. 잘못 지웠다면 되돌리기를 누르세요.');
};
$('#bg-undo').onclick=()=>{if(BgCut.undo()){BgCut.paint($('#bg-canvas'));showCut(BgCut.dirty)}};
$('#bg-reset').onclick=()=>{BgCut.reset();showCut(false);bgMsg('원본으로 돌렸어요.')};
$('#bg-change').onclick=()=>$('#photo').click();

function openDlg(it){
  editing=it||null;photoData=it?it.photo:null;
  $('#dlg-title').textContent=it?'옷 수정':'옷 추가';
  $('#f-name').value=it?.name||'';selCat=it?.cat||CATS[0];selColor=it?.color||'검정';renderCatChips();renderSwatches();
  $('#photo').value='';$('#preview').hidden=!photoData;if(photoData)$('#preview').src=photoData;else $('#preview').removeAttribute('src');
  setupCut(photoData);
  seasonSel=new Set(it?it.seasons:SEASONS);renderSeasonChips(seasonSel);
  $('#btn-del').hidden=!it;$('#dlg').showModal();$('#dlg').scrollTop=0;
}
$('#q').oninput=renderCloset;$('#sort').onchange=renderCloset;
$('#fab').onclick=()=>openDlg();$('#empty-add').onclick=()=>openDlg();
$('#btn-cancel').onclick=()=>$('#dlg').close();
$('#photo').onchange=async e=>{const f=e.target.files[0];if(!f)return;
  try{photoData=await resize(f);$('#preview').src=photoData;$('#preview').hidden=false;await setupCut(photoData)}catch(err){alert(err.message)}};
$('#form').onsubmit=async e=>{
  if(!photoData){e.preventDefault();alert('사진을 선택해 주세요');return}
  const raw=BgCut.dirty?BgCut.encode():photoData;
  const same=editing&&editing.fit&&raw===editing.photo;       // 사진을 안 바꿨으면 다시 맞추지 않음
  const it={...(editing||{createdAt:Date.now()}),name:$('#f-name').value.trim(),cat:selCat,color:selColor,
    seasons:[...seasonSel],photo:same?raw:await fitPhoto(raw),fit:1};
  if(!it.seasons.length)it.seasons=[...SEASONS];
  await put('items',it);await refresh();
};
$('#btn-del').onclick=async()=>{
  if(!editing||!confirm('이 옷을 삭제할까요?'))return;
  await del('items',editing.id);
  await scrubItem(editing.id);
  $('#dlg').close();await refresh();
};

/* ---------- 코디 추천 ---------- */
const pick=a=>a[Math.floor(Math.random()*a.length)];
// 색마다 계절별 어울림 점수 (봄, 여름, 가을, 겨울 순서, -2 ~ +2)
const COLOR_SEASON={검정:[0,0,1,1],흰색:[1,2,0,1],아이보리:[2,1,1,1],회색:[0,0,1,1],베이지:[2,0,2,0],갈색:[0,-1,2,1],카키:[1,0,2,0],네이비:[0,1,2,2],데님:[1,1,1,0],
  버건디:[-1,-2,2,2],빨강:[0,0,1,1],주황:[0,0,2,-1],머스타드:[0,-1,2,0],노랑:[1,1,0,-1],초록:[1,1,1,1],민트:[2,2,-2,-2],하늘색:[2,2,-1,-1],파랑:[0,1,0,0],라벤더:[2,1,-1,-1],보라:[0,0,1,1],분홍:[2,1,-1,0]};
// 무채색이 아니어도 잘 어울리는 색 조합
const HARMONY=[['버건디','네이비'],['머스타드','네이비'],['카키','버건디'],['카키','머스타드'],['버건디','머스타드'],['민트','분홍'],['하늘색','분홍'],['라벤더','하늘색'],['민트','하늘색']];
function currentSeason(d=new Date()){const m=d.getMonth()+1;return m>=3&&m<=5?'봄':m>=6&&m<=8?'여름':m>=9&&m<=11?'가을':'겨울'}
// 날씨 + 오늘 날짜로 어느 계절 옷차림인지 정함 (선선한 날은 지금이 봄이면 봄, 가을이면 가을)
function targetSeason(tk,d=new Date()){
  if(tk==='hot')return'여름';if(tk==='cold')return'겨울';
  const c=currentSeason(d);return c==='봄'||c==='가을'?c:(d.getMonth()<6?'봄':'가을');
}
// 두 색 궁합 점수
function pairScore(a,b){
  if(a===b)return NEUTRAL.has(a)?2:1;            // 톤온톤
  const na=NEUTRAL.has(a),nb=NEUTRAL.has(b);
  if(na&&nb)return (a==='검정'&&b==='네이비')||(a==='네이비'&&b==='검정')||(a==='갈색'&&b==='검정')||(a==='검정'&&b==='갈색')?-1:2;
  if(na||nb)return 2;                            // 무채색 + 컬러
  return HARMONY.some(([x,y])=>(x===a&&y===b)||(x===b&&y===a))?1.5:-2;   // 컬러끼리는 어울리는 조합만 허용
}
function outfitScore(parts,mood,season){
  const cs=parts.map(p=>p.color);let s=0;
  for(let i=0;i<cs.length;i++)for(let j=i+1;j<cs.length;j++)s+=pairScore(cs[i],cs[j]);
  const colorful=new Set(cs.filter(c=>!NEUTRAL.has(c))).size;
  if(mood==='neutral')s+=colorful?-3:3;
  if(mood==='color')s+=colorful===1?3:-2;
  if(season){
    const si=SEASONS.indexOf(season);
    for(const p of parts){
      const w=(p.cat==='신발'||p.cat==='액세서리')?.3:1,cs2=(COLOR_SEASON[p.color]||[0,0,0,0])[si];
      s+=cs2*.9*w;                                 // 그 계절에 어울리는 색은 가점, 안 어울리면 감점
      if(cs2<=-2&&w===1)s-=2;                      // 계절과 정반대인 색(가을의 민트 등)은 더 감점
      if(p.seasons&&p.seasons.includes(season))s+=.6*w;   // 그 계절용으로 등록한 옷 우대
    }
  }
  return s+Math.random()*1.5;                    // 매번 다른 결과
}
function recommend(tk=temp,opt={}){
  const t=TEMP[tk],usage=opt.usage||{},near=opt.near||new Set(),season=targetSeason(tk);
  const ok=c=>items.filter(i=>i.cat===c&&i.seasons.some(s=>t.s.includes(s)));
  const tops=ok('상의'),bottoms=ok('하의'),dresses=ok('원피스'),outers=ok('아우터'),shoes=ok('신발'),accs=ok('액세서리');
  const bases=[];
  tops.forEach(a=>bottoms.forEach(b=>bases.push([a,b])));
  dresses.forEach(d=>bases.push([d]));
  if(!bases.length)return null;
  // 일주일 코디에서는 이미 입은 옷, 전날/다음날과 겹치는 옷에 감점
  const repeat=parts=>parts.reduce((a,p)=>{const w=(p.cat==='신발'||p.cat==='액세서리')?.5:1.4;return a+w*(usage[p.id]||0)+(w>1&&near.has(p.id)?4:0)},0);
  let best=null,bs=-Infinity;
  for(let n=0;n<200;n++){
    const parts=[...pick(bases)];
    if(t.outer&&outers.length)parts.push(pick(outers));
    else if(!t.outer&&outers.length&&Math.random()<.25)parts.push(pick(outers));
    if(shoes.length)parts.push(pick(shoes));
    if(accs.length&&Math.random()<.4)parts.push(pick(accs));
    const s=outfitScore(parts,mood,season)-repeat(parts);
    if(s>bs){bs=s;best=parts}
  }
  return best;
}

/* ---------- 분할 버튼 ---------- */
function seg(id,opts,get,set){
  $(id).replaceChildren(...opts.map(([v,label,sub])=>el('button',{type:'button',className:get()===v?'on':'',role:'radio','aria-checked':get()===v,
    onclick:()=>{set(v);renderSegs()}},label,...(sub?[el('br'),el('small',{textContent:sub,style:'opacity:.7;font-weight:400'})]:[]))));
}
function renderSegs(){
  seg('#mood-seg',Object.entries(MOOD_LABEL).map(([k,l])=>[k,l]),()=>mood,v=>mood=v);
}

/* ---------- 탭 / 시작 ---------- */
const TITLES={closet:['MY CLOSET','옷장'],week:['THIS WEEK','코디']};
document.querySelectorAll('.dock button[data-tab]').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.dock button[data-tab],.tab').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');$('#tab-'+b.dataset.tab).classList.add('active');
  $('#eyebrow').textContent=TITLES[b.dataset.tab][0];$('#title').textContent=TITLES[b.dataset.tab][1];
  $('#count').hidden=b.dataset.tab!=='closet';$('#fab').hidden=b.dataset.tab!=='closet';window.scrollTo({top:0});
});
(async()=>{
  renderSegs();renderCatChips();renderSwatches();db=await open();await migrateIds();initPlanner();await refresh();initCloud();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
