'use strict';
/* 날씨: Open-Meteo 예보(무료, 가입·키 없음)를 날짜별 기온 단계(더워요·적당해요·쌀쌀해요·추워요)로 바꿔요.
   위치는 이 기기(localStorage)에만 저장하고, 예보를 받을 때만 좌표를 Open-Meteo에 보내요. */
const CITIES={서울:[37.5665,126.978],부산:[35.1796,129.0756],인천:[37.4563,126.7052],대구:[35.8714,128.6014],대전:[36.3504,127.3845],광주:[35.1595,126.8526],울산:[35.5384,129.3114],세종:[36.48,127.289],수원:[37.2636,127.0286],제주:[33.4996,126.5312]};
const isoDate=d=>{const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
// 낮 기온에 더 무게를 둔 체감값으로 단계를 나눔 (앱의 단계: 25°↑ / 15–24° / 5–14° / 5°↓)
const tempKey=(max,min)=>{const f=max*.6+min*.4;return f>=25?'hot':f>=15?'mild':f>=5?'cool':'cold'};
const jget=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}};
const jset=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const WX_TTL=60*60*1000;
const WX={loc:null,days:{},status:'',onChange(){}};
WX.get=date=>{const d=WX.days[isoDate(date)];return d?{...d,temp:tempKey(d.max,d.min)}:null};
WX.init=()=>{WX.loc=jget('wx:loc');return WX.refresh()};
WX.setLoc=loc=>{WX.loc=loc;jset('wx:loc',loc);WX.days={};WX.onChange();return WX.refresh()};
WX.setCity=name=>WX.setLoc({name,lat:CITIES[name][0],lon:CITIES[name][1]});
WX.useHere=()=>new Promise((res,rej)=>{
  if(!navigator.geolocation)return rej(new Error('unsupported'));
  navigator.geolocation.getCurrentPosition(p=>res(WX.setLoc({name:'현재 위치',lat:p.coords.latitude,lon:p.coords.longitude})),e=>rej(e),{timeout:10000,maximumAge:3600000});
});
WX.refresh=async()=>{
  if(typeof WX.mock==='function'){WX.days=WX.mock();WX.status='ok';WX.onChange();return}   // 미리보기용
  const L=WX.loc;if(!L)return;
  const key=`${L.lat.toFixed(2)},${L.lon.toFixed(2)}`,c=jget('wx:cache'),same=c&&c.key===key;
  if(same&&Date.now()-c.at<WX_TTL){WX.days=c.days;WX.status='ok';WX.onChange();return}
  try{
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${L.lat}&longitude=${L.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=8`);
    if(!r.ok)throw new Error(r.status);
    const j=await r.json(),days={};
    j.daily.time.forEach((t,i)=>{days[t]={max:Math.round(j.daily.temperature_2m_max[i]),min:Math.round(j.daily.temperature_2m_min[i]),pop:j.daily.precipitation_probability_max[i]??0}});
    WX.days=days;WX.status='ok';jset('wx:cache',{key,at:Date.now(),days});
  }catch{
    if(same){WX.days=c.days;WX.status='stale'}else WX.status='error';   // 못 받으면 마지막으로 받은 예보를 씀
  }
  WX.onChange();
};
