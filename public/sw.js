const CACHE_NAME = "good-app-v1";

// Background polling state
let pollInterval = null;
let supabaseUrl = "";
let supabaseKey = "";
let currentUserId = null;
let lastCheckedAt = null;

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

  // Register user for background polling
  if (event.data?.type === "REGISTER_POLL") {
    supabaseUrl = event.data.supabaseUrl || "";
    supabaseKey = event.data.supabaseKey || "";
    currentUserId = event.data.userId || null;
    lastCheckedAt = new Date().toISOString();
    startPolling();
  }

  // Stop polling
  if (event.data?.type === "STOP_POLL") {
    stopPolling();
  }
});

function startPolling() {
  stopPolling();
  if (!supabaseUrl || !supabaseKey || !currentUserId) return;
  // Poll every 5 seconds
  pollInterval = setInterval(() => pollForCalls(), 5000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function pollForCalls() {
  if (!supabaseUrl || !supabaseKey || !currentUserId) return;

  // Check if any visible client exists - if so, skip (app handles it)
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const hasVisibleClient = clients.some(c => c.visibilityState === "visible");
  if (hasVisibleClient) return;

  try {
    const since = lastCheckedAt || new Date(Date.now() - 10000).toISOString();
    const url = `${supabaseUrl}/rest/v1/call_signals?receiver_id=eq.${currentUserId}&signal_type=eq.call-request&created_at=gte.${since}&order=created_at.desc&limit=1`;
    
    const res = await fetch(url, {
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) return;
    const data = await res.json();
    lastCheckedAt = new Date().toISOString();

    if (data && data.length > 0) {
      const signal = data[0];
      // Check if signal is recent (within 30 seconds)
      const age = Date.now() - new Date(signal.created_at).getTime();
      if (age > 30000) return;

      // Fetch caller name
      let callerName = "Someone";
      try {
        const userRes = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${signal.caller_id}&select=display_name&limit=1`, {
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
          },
        });
        if (userRes.ok) {
          const users = await userRes.json();
          if (users[0]?.display_name) callerName = users[0].display_name;
        }
      } catch {}

      self.registration.showNotification(`${callerName} calling...`, {
        body: "Tap to answer the call",
        tag: "incoming-call-bg",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        vibrate: [400, 200, 400, 200, 400, 200, 400],
        requireInteraction: true,
        data: { url: "/" },
      });
    }

    // Also check for new messages
    const msgUrl = `${supabaseUrl}/rest/v1/messages?sender_id=neq.${currentUserId}&is_read=eq.false&created_at=gte.${since}&order=created_at.desc&limit=1`;
    const msgRes = await fetch(msgUrl, {
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
      },
    });
    if (msgRes.ok) {
      const msgs = await msgRes.json();
      if (msgs && msgs.length > 0) {
        const msg = msgs[0];
        const preview = msg.message_type === "text" ? (msg.content || "New message") : (msg.message_type === "image" ? "📷 Photo" : "🎤 Voice");
        
        // Get sender name
        let senderName = "New Message";
        try {
          const senderRes = await fetch(`${supabaseUrl}/rest/v1/users?id=eq.${msg.sender_id}&select=display_name&limit=1`, {
            headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` },
          });
          if (senderRes.ok) {
            const senders = await senderRes.json();
            if (senders[0]?.display_name) senderName = senders[0].display_name;
          }
        } catch {}

        self.registration.showNotification(senderName, {
          body: preview,
          tag: "new-message-bg",
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          vibrate: [200, 100, 200],
          data: { url: "/chat" },
        });
      }
    }
  } catch {
    // Network error - ignore
  }
}