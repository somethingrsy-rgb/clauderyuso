'use strict';
/* 날씨: Open-Meteo 예보(무료, 가입·키 없음)를 날짜별 기온 단계(더워요·적당해요·쌀쌀해요·추워요)로 바꿔요.
   위치는 이 기기(localStorage)에만 저장하고, 예보를 받을 때만 좌표를 Open-Meteo에 보내요. */
const CITIES={서울:[37.5665,126.978],부산:[35.1796,129.0756],인천:[37.4563,126.7052],대구:[35.8714,128.6014],대전:[36.3504,127.3845],광주:[35.1595,126.8526],울산:[35.5384,129.3114],세종:[36.48,127.289],수원:[37.2636,127.0286],제주:[33.4996,126.5312]};
const isoDate=d=>{const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`};
// 낮 기온에 더 무게를 둔 체감값으로 단계를 나눔 (앱의 단계: 25°↑ / 15–24° / 5–14° / 5°↓)
// WMO 날씨 코드 → 선으로 그린 단순한 아이콘 (SVG)
const IC={
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
  cloud:'<path d="M7 18.5h10a3.8 3.8 0 0 0 .4-7.6A5.5 5.5 0 0 0 6.8 9.8 4.4 4.4 0 0 0 7 18.5Z"/>',
  part:'<path d="M17 3v1.6M21.4 7.4h-1.6M20.1 4.3l-1.1 1.1M13.9 4.3 15 5.4"/><path d="M14.3 8.1a3.6 3.6 0 0 1 5.6 3.6"/><path d="M6.5 20h9a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.2A3 3 0 0 0 6.5 20Z"/>',
  rain:'<path d="M7 15.5h10a3.8 3.8 0 0 0 .4-7.6A5.5 5.5 0 0 0 6.8 6.8 4.4 4.4 0 0 0 7 15.5Z"/><path d="m9 18.5-.8 2M13 18.5l-.8 2M17 18.5l-.8 2"/>',
  snow:'<path d="M7 15.5h10a3.8 3.8 0 0 0 .4-7.6A5.5 5.5 0 0 0 6.8 6.8 4.4 4.4 0 0 0 7 15.5Z"/><path d="M9 18.6h.01M13 20.2h.01M17 18.6h.01"/>',
  fog:'<path d="M4 9h16M6 13h12M8 17h8"/>',
  storm:'<path d="M7 15.5h10a3.8 3.8 0 0 0 .4-7.6A5.5 5.5 0 0 0 6.8 6.8 4.4 4.4 0 0 0 7 15.5Z"/><path d="m12.5 15.5-2 3h3l-1.5 3"/>'};
const wxIcon=(c,pop)=>{
  const k=c==null?(pop>=50?'rain':'part'):c===0?'sun':c<=2?'part':c===3?'cloud':c<=48?'fog':c<=67?'rain':c<=77?'snow':c<=82?'rain':c<=86?'snow':'storm';
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${IC[k]}</svg>`};
const tempKey=(max,min)=>{const f=max*.6+min*.4;return f>=25?'hot':f>=15?'mild':f>=5?'cool':'cold'};
const jget=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}};
const jset=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const WX_TTL=60*60*1000;
const WX={loc:null,days:{},status:'',onChange(){}};
WX.get=date=>{const d=WX.days[isoDate(date)];return d?{...d,temp:d.fmax!=null?tempKey(d.fmax,d.fmin):tempKey(d.max,d.min)}:null};   // 옷은 체감온도로 고름
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
    const r=await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${L.lat}&longitude=${L.lon}&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=8`);
    if(!r.ok)throw new Error(r.status);
    const j=await r.json(),days={};
    j.daily.time.forEach((t,i)=>{days[t]={max:Math.round(j.daily.temperature_2m_max[i]),min:Math.round(j.daily.temperature_2m_min[i]),fmax:j.daily.apparent_temperature_max?Math.round(j.daily.apparent_temperature_max[i]):null,fmin:j.daily.apparent_temperature_min?Math.round(j.daily.apparent_temperature_min[i]):null,pop:j.daily.precipitation_probability_max[i]??0,code:j.daily.weather_code?j.daily.weather_code[i]:null}});
    WX.days=days;WX.status='ok';jset('wx:cache',{key,at:Date.now(),days});
  }catch{
    if(same){WX.days=c.days;WX.status='stale'}else WX.status='error';   // 못 받으면 마지막으로 받은 예보를 씀
  }
  WX.onChange();
};
