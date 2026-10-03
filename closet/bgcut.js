'use strict';
/* 배경 지우기 — 사진은 기기 밖으로 나가지 않고 이 브라우저 안에서만 처리해요.
   1) 사진 가장자리의 색을 배경으로 보고, 가장자리에서 이어진 비슷한 색 영역을 지워요.
   2) 남은 배경은 눌러서(같은 색이 이어진 영역) 더 지울 수 있어요.
   색 차이는 사람 눈에 가까운 Lab 색 공간의 거리(ΔE)로 재요. */
const BgCut=(()=>{
  let S=null;
  const lin=new Float32Array(256);
  for(let i=0;i<256;i++){const c=i/255;lin[i]=c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4)}
  const f=t=>t>.008856?Math.cbrt(t):7.787*t+16/116;

  function load(url,max=640){return new Promise((res,rej)=>{
    const img=new Image();
    img.onload=()=>{
      const k=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
      const w=Math.max(1,Math.round(img.naturalWidth*k)),h=Math.max(1,Math.round(img.naturalHeight*k));
      const c=document.createElement('canvas');c.width=w;c.height=h;
      const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(img,0,0,w,h);
      const rgba=x.getImageData(0,0,w,h).data,n=w*h;
      const L=new Float32Array(n),A=new Float32Array(n),B=new Float32Array(n),alpha=new Uint8Array(n);
      for(let i=0,j=0;i<n;i++,j+=4){
        const R=lin[rgba[j]],G=lin[rgba[j+1]],Bl=lin[rgba[j+2]];
        const fx=f((R*.4124+G*.3576+Bl*.1805)/.95047),fy=f(R*.2126+G*.7152+Bl*.0722),fz=f((R*.0193+G*.1192+Bl*.9505)/1.08883);
        L[i]=116*fy-16;A[i]=500*(fx-fy);B[i]=200*(fy-fz);
        alpha[i]=rgba[j+3]>=128?255:0;
      }
      S={w,h,rgba,L,A,B,alpha,base:alpha.slice(),stack:[],q:new Int32Array(n)};
      res({w,h});
    };
    img.onerror=()=>rej(new Error('이미지를 읽을 수 없어요'));
    img.src=url;
  })}

  const push=()=>{S.stack.push(S.alpha.slice());if(S.stack.length>15)S.stack.shift()};
  const d2=(i,l,a,b)=>{const x=S.L[i]-l,y=S.A[i]-a,z=S.B[i]-b;return x*x+y*y+z*z};

  // 가장 큰 덩어리와 그에 견줄 만한 덩어리만 남기고 흩어진 점은 지움
  function keepMain(){
    const {w,h,alpha,q}=S,n=w*h,lab=new Int32Array(n),sizes=[];
    let cur=0;
    for(let s=0;s<n;s++){
      if(!alpha[s]||lab[s])continue;
      cur++;let head=0,tail=0;q[tail++]=s;lab[s]=cur;
      while(head<tail){
        const p=q[head++],x=p%w,y=(p/w)|0;
        if(x>0&&alpha[p-1]&&!lab[p-1]){lab[p-1]=cur;q[tail++]=p-1}
        if(x<w-1&&alpha[p+1]&&!lab[p+1]){lab[p+1]=cur;q[tail++]=p+1}
        if(y>0&&alpha[p-w]&&!lab[p-w]){lab[p-w]=cur;q[tail++]=p-w}
        if(y<h-1&&alpha[p+w]&&!lab[p+w]){lab[p+w]=cur;q[tail++]=p+w}
      }
      sizes[cur]=tail;
    }
    const big=Math.max(0,...sizes.filter(Boolean));
    for(let i=0;i<n;i++)if(alpha[i]&&sizes[lab[i]]<big*.06)alpha[i]=0;
  }

  // 가장자리에서 한 겹 깎아 배경색이 묻은 테두리를 없앰 (이미지 끝에 닿은 부분은 그대로)
  function erode(){
    const {w,h,alpha}=S,out=alpha.slice();
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x;if(!alpha[i])continue;
      if((x>0&&!alpha[i-1])||(x<w-1&&!alpha[i+1])||(y>0&&!alpha[i-w])||(y<h-1&&!alpha[i+w]))out[i]=0;
    }
    alpha.set(out);
  }

  const count=()=>{let c=0;for(let i=0;i<S.alpha.length;i++)if(S.alpha[i])c++;return c};

  function auto(tol){
    if(!S)return{ok:false,reason:'nophoto'};
    push();S.alpha.set(S.base);
    const {w,h,L,A,B,alpha,q}=S,n=w*h,before=count();
    const bw=Math.max(2,Math.round(Math.min(w,h)*.012)),bins=new Map();let total=0;
    const onBorder=(x,y)=>x<bw||y<bw||x>=w-bw||y>=h-bw;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      if(!onBorder(x,y))continue;const i=y*w+x;if(!alpha[i])continue;
      const k=(Math.round(L[i]/10)*64+Math.round((A[i]+128)/10))*64+Math.round((B[i]+128)/10);
      let e=bins.get(k);if(!e){e={n:0,l:0,a:0,b:0};bins.set(k,e)}
      e.n++;e.l+=L[i];e.a+=A[i];e.b+=B[i];total++;
    }
    if(!total){S.stack.pop();return{ok:true,removed:0,already:true}}   // 가장자리가 이미 투명: 지워진 사진
    let cs=[...bins.values()].sort((a,b)=>b.n-a.n);
    const main=cs.filter(e=>e.n>=total*.06).slice(0,4);
    cs=(main.length?main:[cs[0]]).map(e=>({l:e.l/e.n,a:e.a/e.n,b:e.b/e.n}));
    const t2=tol*tol,near=i=>{for(const c of cs)if(d2(i,c.l,c.a,c.b)<=t2)return true;return false};
    const vis=new Uint8Array(n);let head=0,tail=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      if(!onBorder(x,y))continue;const i=y*w+x;
      if(alpha[i]&&!vis[i]&&near(i)){vis[i]=1;q[tail++]=i}
    }
    while(head<tail){
      const p=q[head++],x=p%w,y=(p/w)|0;
      if(x>0&&!vis[p-1]&&alpha[p-1]&&near(p-1)){vis[p-1]=1;q[tail++]=p-1}
      if(x<w-1&&!vis[p+1]&&alpha[p+1]&&near(p+1)){vis[p+1]=1;q[tail++]=p+1}
      if(y>0&&!vis[p-w]&&alpha[p-w]&&near(p-w)){vis[p-w]=1;q[tail++]=p-w}
      if(y<h-1&&!vis[p+w]&&alpha[p+w]&&near(p+w)){vis[p+w]=1;q[tail++]=p+w}
    }
    for(let i=0;i<n;i++)if(vis[i])alpha[i]=0;
    keepMain();erode();
    const left=count(),removed=before?1-left/before:0;
    if(removed>.97||left<n*.01){S.alpha.set(S.stack.pop());return{ok:false,reason:'all'}}   // 옷까지 다 지워진 경우는 취소
    return{ok:true,removed};
  }

  // 누른 곳과 비슷한 색이 이어진 영역을 지움
  function wand(px,py,tol){
    if(!S)return 0;
    const {w,h,L,A,B,alpha,q}=S,s=py*w+px;
    if(px<0||py<0||px>=w||py>=h||!alpha[s])return 0;
    push();
    const l=L[s],a=A[s],b=B[s],t2=tol*tol,vis=new Uint8Array(w*h);
    let head=0,tail=0,cnt=0;q[tail++]=s;vis[s]=1;
    while(head<tail){
      const p=q[head++],x=p%w,y=(p/w)|0;alpha[p]=0;cnt++;
      if(x>0&&!vis[p-1]&&alpha[p-1]&&d2(p-1,l,a,b)<=t2){vis[p-1]=1;q[tail++]=p-1}
      if(x<w-1&&!vis[p+1]&&alpha[p+1]&&d2(p+1,l,a,b)<=t2){vis[p+1]=1;q[tail++]=p+1}
      if(y>0&&!vis[p-w]&&alpha[p-w]&&d2(p-w,l,a,b)<=t2){vis[p-w]=1;q[tail++]=p-w}
      if(y<h-1&&!vis[p+w]&&alpha[p+w]&&d2(p+w,l,a,b)<=t2){vis[p+w]=1;q[tail++]=p+w}
    }
    return cnt;
  }

  function undo(){if(S&&S.stack.length){S.alpha.set(S.stack.pop());return true}return false}
  function reset(){if(S){S.alpha.set(S.base);S.stack=[]}}

  // 가장자리에 1px 부드러운 경계를 줘서 화면에 그림
  function paint(canvas){
    const {w,h,rgba,alpha}=S,out=new Uint8ClampedArray(rgba);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const i=y*w+x;let sum=0;
      for(let dy=-1;dy<=1;dy++){const yy=Math.min(h-1,Math.max(0,y+dy))*w;
        for(let dx=-1;dx<=1;dx++)sum+=alpha[yy+Math.min(w-1,Math.max(0,x+dx))]}
      out[i*4+3]=sum/9;
    }
    canvas.width=w;canvas.height=h;
    canvas.getContext('2d').putImageData(new ImageData(out,w,h),0,0);
    return canvas;
  }

  // 저장용 이미지: 투명 배경을 지원하는 WebP 우선, 안 되면 PNG. 용량이 크면 줄여서 맞춤 (Firestore 문서 1MB 제한)
  function encode(){
    let c=paint(document.createElement('canvas'));
    for(let i=0;i<6;i++){
      let url=c.toDataURL('image/webp',.82);
      if(!url.startsWith('data:image/webp'))url=c.toDataURL('image/png');
      if(url.length<700000)return url;
      const n=document.createElement('canvas');n.width=Math.round(c.width*.8);n.height=Math.round(c.height*.8);
      n.getContext('2d').drawImage(c,0,0,n.width,n.height);c=n;
    }
    return c.toDataURL('image/webp',.7);
  }

  function pointToPixel(el,cx,cy){
    if(!S)return null;
    const r=el.getBoundingClientRect(),k=Math.min(r.width/S.w,r.height/S.h);
    const ox=(r.width-S.w*k)/2,oy=(r.height-S.h*k)/2;
    const x=Math.floor((cx-r.left-ox)/k),y=Math.floor((cy-r.top-oy)/k);
    return x<0||y<0||x>=S.w||y>=S.h?null:{x,y};
  }

  return{load,auto,wand,undo,reset,paint,encode,pointToPixel,
    get ready(){return !!S},get dirty(){return !!S&&S.stack.length>0},get canUndo(){return !!S&&S.stack.length>0}};
})();
