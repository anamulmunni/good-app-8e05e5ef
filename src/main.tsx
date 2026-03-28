import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Register Service Worker for push notifications (PWA)
if ("serviceWorker" in navigator) {
  const isInIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();
  const isPreview = window.location.hostname.includes("id-preview--") || window.location.hostname.includes("lovableproject.com");

  if (!isInIframe && !isPreview) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  } else {
    navigator.serviceWorker?.getRegistrations().then((r) => r.forEach((reg) => reg.unregister()));
  }
}

// Request notification permission early
if ("Notification" in window && Notification.permission === "default") {
  setTimeout(() => Notification.requestPermission(), 3000);
}

createRoot(document.getElementById("root")!).render(<App />);
