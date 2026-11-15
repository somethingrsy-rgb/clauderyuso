/* 일요일 저녁 푸시 알림 켜기/끄기. 알림을 보내는 쪽은 GitHub Actions(.github/workflows/sunday-push.yml) */
(()=>{
const VAPID_PUBLIC='BL1zvMlJcoHI92if5uN_TPaaeRyojJ2g0R0Ysmz0EnoWszy2zDq7gaKH1LD6tEMjJvvwaTUyyLck05gAMUCBuRQ';
const $=s=>document.querySelector(s);
const el=(t,p={},...k)=>{const e=Object.assign(document.createElement(t),p);k.forEach(c=>e.append(c));return e};
const isIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const standalone=()=>navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
const supported=()=>'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
const key=b=>{const r=atob((b+'='.repeat((4-b.length%4)%4)).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(r,c=>c.charCodeAt(0))};
const sub=async()=>{try{return await(await navigator.serviceWorker.ready).pushManager.getSubscription()}catch(e){return null}};
async function enable(){
  if(isIOS()&&!standalone())return msg('아이폰은 사파리 공유 버튼 → "홈 화면에 추가"로 설치한 앱에서만 알림을 켤 수 있어요.');
  if(await Notification.requestPermission()!=='granted')return msg('알림이 허용되지 않았어요. 기기 설정에서 이 앱의 알림을 허용해 주세요.');
  const reg=await navigator.serviceWorker.ready;
  try{await(reg.pushManager.getSubscription().then(s=>s||reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key(VAPID_PUBLIC)})))}
  catch(e){return msg('알림을 켜지 못했어요: '+(e.message||e))}
  render();
}
async function disable(){const s=await sub();if(s)await s.unsubscribe();render()}
let note='';
function msg(t){note=t;render()}
async function render(){
  const d=$('#push-body');if(!d)return;
  const kids=[el('h3',{textContent:'일요일 저녁 알림'}),el('p',{className:'muted sm',textContent:'매주 일요일 저녁 9시에 "일주일간 입을 옷을 정하세요" 알림을 보내요.'})];
  if(!supported())kids.push(el('p',{className:'muted sm',textContent:'이 브라우저는 푸시 알림을 지원하지 않아요.'}));
  else{
    const s=await sub();
    if(!s||Notification.permission!=='granted')kids.push(el('button',{className:'ghost wide',textContent:'알림 켜기',onclick:enable}));
    else{
      const json=JSON.stringify(s.toJSON());
      kids.push(el('p',{className:'muted sm',textContent:'알림이 켜졌어요. 아래 글자를 복사해서 GitHub 저장소의 Settings → Secrets and variables → Actions → New repository secret에 이름 PUSH_SUB 로 붙여넣어 주세요. (한 번만 하면 돼요)'}),
        el('textarea',{readOnly:true,rows:3,value:json,className:'push-sub',onfocus:e=>e.target.select()}),
        el('button',{className:'ghost wide',textContent:'복사',onclick:async()=>{try{await navigator.clipboard.writeText(json);msg('복사했어요.')}catch(e){$('.push-sub').select();msg('글자를 길게 눌러 복사해 주세요.')}}}),
        el('button',{className:'ghost wide',textContent:'알림 끄기',onclick:disable}));
    }
  }
  if(note)kids.push(el('p',{className:'muted sm',textContent:note}));
  d.replaceChildren(...kids);
}
addEventListener('DOMContentLoaded',()=>{const b=$('#acct');if(b)b.addEventListener('click',()=>{note='';render()});render()});
})();
