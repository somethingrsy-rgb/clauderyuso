const admin = require("firebase-admin");

const DATABASE_URL = process.env.FIREBASE_DATABASE_URL || "https://ryuso-af2f2-default-rtdb.firebaseio.com";
const STATE_PATH = "/directorQueue/v1/state";

function getServiceAccount() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing one of FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY env vars"
    );
  }
  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount()),
    databaseURL: DATABASE_URL,
  });
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
  if (event.httpMethod !== "POST") return json(405, { ok: false, error: "POST only" });

  try {
    const ref = admin.database().ref(STATE_PATH);
    const snap = await ref.get();
    const state = snap.val() || { bookings: [] };
    const bookings = Array.isArray(state.bookings) ? state.bookings : [];

    const idx = bookings.findIndex((b) => b && b.status === "REPORTING");
    if (idx < 0) return json(200, { ok: true, skipped: "no-reporting" });

    const current = bookings[idx];
    if (!current.fcmToken) return json(200, { ok: true, skipped: "no-fcm-token", reportingId: current.id });

    // 같은 calledAt에 대해 중복 발송 방지
    if (current.pushNotifiedAt && current.pushNotifiedCalledAt === current.calledAt) {
      return json(200, { ok: true, skipped: "already-sent", reportingId: current.id });
    }

    const title = "국장실 보고대기";
    const body = `${current.department || "해당"}팀 차례입니다. 국장실 앞으로 와주세요.`;

    await admin.messaging().send({
      token: current.fcmToken,
      notification: { title, body },
      webpush: {
        notification: {
          title,
          body,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          requireInteraction: true,
        },
        fcmOptions: {
          link: "https://reportflowincomeenergy-git.netlify.app/",
        },
      },
      data: {
        title,
        body,
        bookingId: String(current.id || ""),
        calledAt: String(current.calledAt || ""),
      },
    });

    bookings[idx] = {
      ...current,
      pushNotifiedAt: Date.now(),
      pushNotifiedCalledAt: current.calledAt || null,
    };

    await ref.update({ bookings });

    return json(200, { ok: true, sent: true, reportingId: current.id });
  } catch (error) {
    console.error("send-next-notification error", error);
    return json(500, { ok: false, error: error.message || String(error) });
  }
};
