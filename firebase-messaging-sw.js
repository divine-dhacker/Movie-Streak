importScripts("https://www.gstatic.com/firebasejs/9.6.10/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.6.10/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAd_eJ8Y-rmBLae9dAEXLgT4oaK_PX3pMM",
  authDomain: "moviespark-9663d.firebaseapp.com",
  projectId: "moviespark-9663d",
  messagingSenderId: "827433785766",
  appId: "1:827433785766:web:9b5cb5336011330b3dd767"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  self.registration.showNotification(
    payload.notification.title,
    {
      body: payload.notification.body,
      icon: "/logos.png"
    }
  );
});