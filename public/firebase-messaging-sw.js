importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js");

let messagingInitialization;

function initializeMessaging() {
  if (!messagingInitialization) {
    messagingInitialization = fetch("/api/firebase/public-config")
      .then(async (response) => {
        if (!response.ok) throw new Error("Firebase web-push configuration is unavailable.");
        firebase.initializeApp(await response.json());
        const messaging = firebase.messaging();
        messaging.onBackgroundMessage((payload) => {
          const notification = payload.notification || {};
          self.registration.showNotification(notification.title || "My Prayer Line", {
            body: notification.body || "You have a new community update.",
            icon: notification.icon || "/icons/prayer-line.svg",
            tag: notification.tag,
            data: notification.data || {}
          });
        });
      });
  }
  return messagingInitialization;
}

self.addEventListener("install", (event) => {
  event.waitUntil(initializeMessaging().catch((error) => {
    console.error("Unable to initialize background notifications.", error);
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = event.notification.data?.url || "/prayer";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      existing.navigate(destination);
      return existing.focus();
    }
    return self.clients.openWindow(destination);
  }));
});
