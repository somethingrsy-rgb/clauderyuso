'use strict';
/* 아바타 탭: 옷장에 등록한 옷을 아바타에게 겹쳐 입혀 보는 옷 갈아입히기.
   - 머리는 avatar/head.png, 몸은 아래 SVG 마네킹, 옷은 옷장 사진(배경 제거)을 종류별 자리에 얹어요.
   - 입은 옷과 직접 맞춘 크기·위치는 이 기기(localStorage)에 기억해요.
   - app.js보다 먼저 불러오고, 화면 갱신은 app.js의 refresh()가 renderAvatar()를 불러서 해요. */
const AV_W=300,AV_H=470;
const AV_HEAD={x:42,y:0,w:216,h:173};                       // head.png 305×244 비율
// 종류별 자리(중심 x, 위 y, 최대 너비·높이)와 겹치는 순서(z)
const AV_SLOT={
  하의:{cx:150,y:288,w:124,h:142,z:10},
  신발:{cx:150,y:424,w:132,h:42,z:15},
  상의:{cx:150,y:168,w:150,h:142,z:20},
  원피스:{cx:150,y:168,w:160,h:268,z:20},
  아우터:{cx:150,y:166,w:196,h:172,z:30},
  액세서리:{cx:238,y:240,w:84,h:96,z:40}
};
const AV_HEAD_Z=35;
const AV_BODY=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${AV_W} ${AV_H}"><g fill="#f1d9c8" stroke="#dcbfa9" stroke-width="2"><rect x="132" y="126" width="36" height="64" rx="14"/><rect x="70" y="180" width="30" height="124" rx="15"/><rect x="200" y="180" width="30" height="124" rx="15"/><rect x="100" y="172" width="100" height="136" rx="38"/><rect x="108" y="290" width="38" height="142" rx="18"/><rect x="154" y="290" width="38" height="142" rx="18"/><ellipse cx="127" cy="438" rx="24" ry="9"/><ellipse cx="173" cy="438" rx="24" ry="9"/></g></svg>`;

let avState=(()=>{try{const s=JSON.parse(localStorage.getItem('avatar:v1'));if(s&&Array.isArray(s.worn))return{worn:s.worn,adj:s.adj||{}}}catch{}return{worn:[],adj:{}}})();
let avSel=null,avCat='전체',avSeq=0;
const avSave=()=>{try{localStorage.setItem('avatar:v1',JSON.stringify(avState))}catch{}};
const avItem=id=>items.find(i=>i.id===id);
const avCut=new Map();   // 옷 id+사진 → {url,w,h} (옷 부분만 잘라 투명하게)
async function avCutOf(it){
  const k=it.id+':'+it.photo.length;
  if(!avCut.has(k)){
    avCut.set(k,loadImg(it.photo).then(im=>{
      const b=cutout(im),c=el('canvas',{width:b.w,height:b.h});
      c.getContext('2d').drawImage(b.c,b.x,b.y,b.w,b.h,0,0,b.w,b.h);
      return{url:c.toDataURL('image/png'),w:b.w,h:b.h};
    }).catch(()=>{avCut.delete(k);return null}));
  }
  return avCut.get(k);
}
// 입을 때: 원피스는 상의·하의와, 상의·하의는 원피스와 함께 못 입음. 액세서리 외에는 종류당 한 벌
function avToggle(id){
  const it=avItem(id);if(!it)return;
  const w=avState.worn;
  if(w.includes(id)){avState.worn=w.filter(x=>x!==id);if(avSel===id)avSel=null}
  else{
    const drop=c=>avState.worn=avState.worn.filter(x=>avItem(x)&&avItem(x).cat!==c);
    if(it.cat==='원피스'){drop('상의');drop('하의');drop('원피스')}
    else if(it.cat==='상의'||it.cat==='하의'){drop('원피스');drop(it.cat)}
    else if(it.cat!=='액세서리')drop(it.cat);
    avState.worn.push(id);avSel=id;
  }
  avSave();renderAvatar();
}
function avBox(it,cut){   // 옷 한 벌이 서는 자리(스테이지 단위)
  const s=AV_SLOT[it.cat]||AV_SLOT.액세서리,a=avState.adj[it.id]||{},k=Math.min(s.w/cut.w,s.h/cut.h)*(a.s||1);
  const w=cut.w*k,h=cut.h*k;
  return{x:s.cx-w/2+(a.dx||0),y:s.y+(s.h-h)/2+(a.dy||0),w,h,z:s.z};
}
async function renderAvatar(){
  const stage=$('#av-stage');if(!stage)return;
  const my=++avSeq;
  avState.worn=avState.worn.filter(avItem);
  if(avSel&&!avState.worn.includes(avSel))avSel=null;
  const pieces=(await Promise.all(avState.worn.map(async id=>{const it=avItem(id),cut=await avCutOf(it);return cut&&{it,cut}}))).filter(Boolean);
  if(my!==avSeq)return;                                   // 더 최근 요청이 있으면 그쪽이 그림
  const pct=(v,t)=>(v/t*100)+'%';
  stage.replaceChildren(
    el('img',{className:'av-layer',src:'data:image/svg+xml;utf8,'+encodeURIComponent(AV_BODY),alt:'',style:'inset:0;width:100%;height:100%;z-index:1'}),
    ...pieces.map(({it,cut})=>{const b=avBox(it,cut);
      const im=el('img',{className:'av-layer'+(it.id===avSel?' sel':''),src:cut.url,alt:it.name||it.cat,
        style:`left:${pct(b.x,AV_W)};top:${pct(b.y,AV_H)};width:${pct(b.w,AV_W)};height:${pct(b.h,AV_H)};z-index:${b.z}`});
      im.dataset.cw=cut.w;im.dataset.ch=cut.h;return im}),
    el('img',{className:'av-layer',src:'avatar/head.png',alt:'아바타',style:`left:${pct(AV_HEAD.x,AV_W)};top:0;width:${pct(AV_HEAD.w,AV_W)};height:${pct(AV_HEAD.h,AV_H)};z-index:${AV_HEAD_Z}`}));
  // 입고 있는 옷
  const worn=$('#av-worn');
  worn.replaceChildren(...(pieces.length?pieces.map(({it})=>el('button',{type:'button',className:'chip'+(it.id===avSel?' on':''),textContent:it.name||it.cat,onclick:()=>{avSel=avSel===it.id?null:it.id;renderAvatar()}})):[el('span',{className:'muted sm',textContent:'아래 옷장에서 옷을 눌러 입혀 보세요.'})]));
  $('#av-undress').disabled=$('#av-savecombo').disabled=$('#av-photo').disabled=!pieces.length;
  // 선택한 옷 조절
  const adj=$('#av-adjust'),it=avSel&&avItem(avSel);adj.hidden=!it;
  if(it){const a=avState.adj[it.id]||{};$('#av-adj-name').textContent=(it.name||it.cat)+' 조절';$('#av-size').value=a.s||1;$('#av-reset').disabled=!avState.adj[it.id]}
  // 옷장 목록
  $('#av-cats').replaceChildren(...['전체',...CATS].map(c=>chip(`${c} ${c==='전체'?items.length:items.filter(i=>i.cat===c).length}`,c===avCat,()=>{avCat=c;renderAvatar()})));
  const list=items.filter(i=>avCat==='전체'||i.cat===avCat);
  $('#av-grid').replaceChildren(...list.map(i=>{const b=card(i,()=>avToggle(i.id));b.classList.toggle('av-on',avState.worn.includes(i.id));return b}));
  $('#av-empty').hidden=!!items.length;$('#av-grid').hidden=!items.length;
}
function avSetAdj(id,patch){
  const a={...(avState.adj[id]||{}),...patch};
  if(!a.s||a.s===1)delete a.s;if(!a.dx)delete a.dx;if(!a.dy)delete a.dy;
  if(Object.keys(a).length)avState.adj[id]=a;else delete avState.adj[id];
  avSave();
}
// 고른 옷을 스테이지에서 끌어 옮기기
function avPlace(img,it){   // 이미 그려진 옷 한 벌의 위치·크기만 갱신
  const b=avBox(it,{w:+img.dataset.cw,h:+img.dataset.ch});
  img.style.left=(b.x/AV_W*100)+'%';img.style.top=(b.y/AV_H*100)+'%';img.style.width=(b.w/AV_W*100)+'%';img.style.height=(b.h/AV_H*100)+'%';
}
function avInitDrag(){
  const stage=$('#av-stage');let d=null;
  stage.addEventListener('pointerdown',e=>{
    if(!avSel)return;const a=avState.adj[avSel]||{};
    d={x:e.clientX,y:e.clientY,dx:a.dx||0,dy:a.dy||0,k:AV_W/stage.getBoundingClientRect().width,moved:false};
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove',e=>{
    if(!d)return;d.moved=true;
    const dx=d.dx+(e.clientX-d.x)*d.k,dy=d.dy+(e.clientY-d.y)*d.k;
    avSetAdj(avSel,{dx:Math.round(dx),dy:Math.round(dy)});
    const img=stage.querySelector('.av-layer.sel');if(img)avPlace(img,avItem(avSel));
  });
  const end=()=>{if(d&&d.moved)renderAvatar();d=null};
  stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);
}
function initAvatar(){
  avInitDrag();
  $('#av-size').oninput=e=>{if(!avSel)return;avSetAdj(avSel,{s:+e.target.value});renderAvatar()};
  $('#av-reset').onclick=()=>{if(!avSel)return;delete avState.adj[avSel];avSave();renderAvatar()};
  $('#av-undress').onclick=()=>{avState.worn=[];avSel=null;avSave();renderAvatar()};
  $('#av-savecombo').onclick=async()=>{
    const ids=avState.worn.slice();if(!ids.length)return;
    const d=new Date();await put('outfits',{ids,name:`아바타 코디 ${d.getMonth()+1}/${d.getDate()}`,at:Date.now(),uses:0,tags:[]});
    await refresh();toast('코디에 저장했어요.');
  };
  $('#av-photo').onclick=avDownload;
}
// 지금 모습을 이미지로 저장
async function avDownload(){
  const S=2,cv=el('canvas',{width:AV_W*S,height:AV_H*S}),g=cv.getContext('2d');
  g.fillStyle=getComputedStyle(document.body).getPropertyValue('--sunk').trim()||'#f0efeb';g.fillRect(0,0,cv.width,cv.height);
  g.imageSmoothingQuality='high';
  const parts=[{z:1,src:'data:image/svg+xml;utf8,'+encodeURIComponent(AV_BODY),x:0,y:0,w:AV_W,h:AV_H},
    {z:AV_HEAD_Z,src:'avatar/head.png',x:AV_HEAD.x,y:0,w:AV_HEAD.w,h:AV_HEAD.h}];
  for(const id of avState.worn){const it=avItem(id),cut=it&&await avCutOf(it);if(cut)parts.push({...avBox(it,cut),src:cut.url})}
  parts.sort((a,b)=>a.z-b.z);
  for(const p of parts){const im=await loadImg(p.src);g.drawImage(im,p.x*S,p.y*S,p.w*S,p.h*S)}
  const a=el('a',{href:cv.toDataURL('image/png'),download:'avatar-outfit.png'});document.body.append(a);a.click();a.remove();
}
