importScripts("https://www.gstatic.com/firebasejs/11.9.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.9.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDwx5WBh4UMR9oUGv5YOiPApnOavUko-zM",
  authDomain: "ryuso-af2f2.firebaseapp.com",
  databaseURL: "https://ryuso-af2f2-default-rtdb.firebaseio.com",
  projectId: "ryuso-af2f2",
  storageBucket: "ryuso-af2f2.firebasestorage.app",
  messagingSenderId: "482986904758",
  appId: "1:482986904758:web:46216cfea61f04d12f2a17",
  measurementId: "G-82ZT77J5FM"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || payload?.data?.title || "국장실 보고대기";
  const body = payload?.notification?.body || payload?.data?.body || "새 알림이 도착했습니다.";

  self.registration.showNotification(title, {
    body,
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    tag: "director-queue-alert",
    renotify: true,
    data: { url: "./index.html" }
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification?.data?.url || "./index.html"));
});

const CACHE_NAME = "director-queue-pwa-v2-fcm";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.hostname.includes("firebaseio.com")) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
  );
});
