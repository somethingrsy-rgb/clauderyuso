// 일요일 저녁 9시(한국)에 GitHub Actions가 실행해요: PUSH_SUB 에 저장된 기기로 알림을 보내요
import webpush from 'web-push'
const clean = (v) => (v ?? '').replace(/[\s"'`]/g, '').replace(/=+$/, '')
const pub = clean(process.env.VAPID_PUBLIC), priv = clean(process.env.VAPID_PRIVATE), raw = (process.env.PUSH_SUB ?? '').trim()
if (!pub || !priv || !raw) { console.error('설정(Secrets)이 비어 있어요: VAPID_PUBLIC, VAPID_PRIVATE, PUSH_SUB 를 확인해 주세요.'); process.exit(1) }
webpush.setVapidDetails('mailto:noreply@example.com', pub, priv)
let sub
try { sub = JSON.parse(raw) } catch { console.error('PUSH_SUB 가 올바른 글자가 아니에요. 앱에서 복사한 글자를 통째로 붙여넣어 주세요.'); process.exit(1) }
const msg = { title: '👗 이번 주 코디', body: '일주일간 입을 옷을 정하세요', tag: 'weekly-outfit', url: './' }
try { await webpush.sendNotification(sub, JSON.stringify(msg), { TTL: 6 * 3600 }); console.log('알림을 보냈어요.') }
catch (e) {
  if (e.statusCode === 404 || e.statusCode === 410) console.error('알림 등록이 만료됐어요. 앱에서 알림을 껐다 켜고 PUSH_SUB 를 다시 붙여넣어 주세요.')
  else console.error('전송 실패', e.statusCode ?? e.message)
  process.exit(1)
}
