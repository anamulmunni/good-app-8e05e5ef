const CACHE_NAME = "good-app-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SHOW_NOTIFICATION") {
    const { title, body, tag, url, icon } = event.data;
    self.registration.showNotification(title, {
      body: body || "",
      tag: tag || "default",
      icon: icon || "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [300, 150, 300, 150, 300],
      requireInteraction: tag === "incoming-call",
      data: { url: url || "/" },
    });
  }
});