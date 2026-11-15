// 일요일 저녁 9시(한국)에 GitHub Actions가 실행해요: PUSH_SUB 에 저장된 기기로 알림을 보내요
import webpush from 'web-push'
const clean = (v) => (v ?? '').replace(/[\s"'`]/g, '').replace(/=+$/, '')
const pub = clean(process.env.VAPID_PUBLIC), priv = clean(process.env.VAPID_PRIVATE), raw = (process.env.PUSH_SUB ?? '').trim()
if (!pub || !priv || !raw) { console.error('설정(Secrets)이 비어 있어요: VAPID_PUBLIC, VAPID_PRIVATE, PUSH_SUB 를 확인해 주세요.'); process.exit(1) }
webpush.setVapidDetails('mailto:noreply@example.com', pub, priv)
let sub
try { sub = JSON.parse(raw) } catch { console.error('PUSH_SUB 가 올바른 글자가 아니에요. 앱에서 복사한 글자를 통째로 붙여넣어 주세요.'); process.exit(1) }
// 붙여넣을 때 섞여 들어간 공백·줄바꿈을 지워 줘요
const bad = []
const z = (v) => (typeof v === 'string' ? v.replace(/[^\x21-\x7e]/g, (c) => { bad.push(c.codePointAt(0).toString(16)); return '' }) : v)
sub.endpoint = z(sub.endpoint)
if (sub.keys) { sub.keys.p256dh = z(sub.keys.p256dh); sub.keys.auth = z(sub.keys.auth) }
if (bad.length) console.log('지운 이상한 글자 코드(16진수):', [...new Set(bad)].join(','), '개수', bad.length)
try { const u = new URL(sub.endpoint); console.log('알림 서버:', u.hostname) }
catch { console.error('PUSH_SUB 의 endpoint 가 올바른 주소가 아니에요. 앱에서 "복사"한 글자를 통째로 다시 붙여넣어 주세요.'); process.exit(1) }
const msg = { title: '👗 이번 주 코디', body: '일주일간 입을 옷을 정하세요', tag: 'weekly-outfit', url: './' }
try { await webpush.sendNotification(sub, JSON.stringify(msg), { TTL: 6 * 3600 }); console.log('알림을 보냈어요.') }
catch (e) {
  if (e.statusCode === 404 || e.statusCode === 410) console.error('알림 등록이 만료됐어요. 앱에서 알림을 껐다 켜고 PUSH_SUB 를 다시 붙여넣어 주세요.')
  else console.error('전송 실패', e.statusCode ?? e.message)
  process.exit(1)
}
