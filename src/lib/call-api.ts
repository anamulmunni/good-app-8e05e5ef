import { supabase } from "@/integrations/supabase/client";
import { startRingtoneLoop } from "@/lib/ringtone";

const CALL_REMOTE_AUDIO_CLASS = "call-remote-audio";
let activeRingtoneStop: (() => void) | null = null;

// Send notification via Service Worker (works in background PWA)
export function showCallNotification(title: string, body: string, tag = "incoming-call", url = "/") {
  if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: "SHOW_NOTIFICATION",
      title,
      body,
      tag,
      url,
      icon: "/icon-192.png",
    });
  } else if ("Notification" in window && Notification.permission === "granted") {
    const n = new Notification(title, { body, tag, icon: "/icon-192.png" });
    n.onclick = () => { window.focus(); n.close(); };
  }
}

export function showMessageNotification(senderName: string, preview: string) {
  if (document.visibilityState === "visible") return;
  showCallNotification(senderName, preview, "new-message", "/chat");
}

export type CallSignal = {
  id: string;
  caller_id: number;
  receiver_id: number;
  signal_type: string;
  signal_data: any;
  created_at: string | null;
};

export async function sendCallSignal(
  callerId: number,
  receiverId: number,
  signalType: string,
  signalData?: any
) {
  const { error } = await (supabase.from("call_signals").insert({
    caller_id: callerId,
    receiver_id: receiverId,
    signal_type: signalType,
    signal_data: signalData || null,
  } as any) as any);
  if (error) throw error;
}

export async function cleanupCallSignals(userId1: number, userId2: number) {
  await (supabase.from("call_signals").delete() as any)
    .or(`and(caller_id.eq.${userId1},receiver_id.eq.${userId2}),and(caller_id.eq.${userId2},receiver_id.eq.${userId1})`);
}

// Two distinct ringtone patterns
// "outgoing" = caller hears a long ring-back tone
// "incoming" = receiver hears a short alert ringtone
export function playRingtone(type: "outgoing" | "incoming" = "incoming"): { stop: () => void } {
  if (activeRingtoneStop) {
    activeRingtoneStop();
    activeRingtoneStop = null;
  }

  const loop = startRingtoneLoop(type);

  const stop = () => {
    loop.stop();
    if (activeRingtoneStop === stop) {
      activeRingtoneStop = null;
    }
  };

  activeRingtoneStop = stop;

  return { stop };
}

// Attach remote audio stream to a real <audio> element for reliable playback (especially PWA)
export function attachRemoteAudio(stream: MediaStream): HTMLAudioElement {
  // Remove any existing call audio elements
  document.querySelectorAll(`.${CALL_REMOTE_AUDIO_CLASS}`).forEach(el => el.remove());

  stream.getAudioTracks().forEach((track) => {
    track.enabled = true;
  });

  const audio = document.createElement("audio");
  audio.className = CALL_REMOTE_AUDIO_CLASS;
  audio.autoplay = true;
  audio.muted = false;
  (audio as any).playsInline = true;
  audio.setAttribute("playsinline", "true");
  audio.setAttribute("webkit-playsinline", "true");
  audio.volume = 1.0;
  audio.srcObject = stream;

  // Keep in DOM but off-screen; display:none can break playback on some mobile browsers.
  audio.style.position = "fixed";
  audio.style.width = "1px";
  audio.style.height = "1px";
  audio.style.opacity = "0";
  audio.style.pointerEvents = "none";
  audio.style.left = "-9999px";
  audio.style.bottom = "0";

  document.body.appendChild(audio);

  let playAttemptTimer: number | null = null;
  let attempts = 0;

  const tryPlay = () => {
    const p = audio.play();
    if (p) {
      p.then(() => {
        if (playAttemptTimer) {
          clearInterval(playAttemptTimer);
          playAttemptTimer = null;
        }
      }).catch(() => {
        // If autoplay blocked, retry on next user tap
        const handler = () => {
          audio.play().catch(() => {});
          document.removeEventListener("touchstart", handler);
          document.removeEventListener("click", handler);
        };
        document.addEventListener("click", handler, { once: true });
        document.addEventListener("touchstart", handler, { once: true });
      });
    }
  };

  tryPlay();
  audio.addEventListener("loadedmetadata", tryPlay);
  audio.addEventListener("canplay", tryPlay);

  playAttemptTimer = window.setInterval(() => {
    attempts += 1;
    if (!audio.isConnected || attempts > 8) {
      if (playAttemptTimer) {
        clearInterval(playAttemptTimer);
        playAttemptTimer = null;
      }
      return;
    }
    if (audio.paused) {
      tryPlay();
    }
  }, 450);

  return audio;
}

// WebRTC config with STUN + TURN servers for reliable connectivity on mobile networks
export const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    {
      urls: "turn:a.relay.metered.ca:80",
      username: "e8dd65b92c5e139eb89a53a5",
      credential: "hJK2Rfjfi+tkWVCA",
    },
    {
      urls: "turn:a.relay.metered.ca:80?transport=tcp",
      username: "e8dd65b92c5e139eb89a53a5",
      credential: "hJK2Rfjfi+tkWVCA",
    },
    {
      urls: "turn:a.relay.metered.ca:443",
      username: "e8dd65b92c5e139eb89a53a5",
      credential: "hJK2Rfjfi+tkWVCA",
    },
    {
      urls: "turns:a.relay.metered.ca:443",
      username: "e8dd65b92c5e139eb89a53a5",
      credential: "hJK2Rfjfi+tkWVCA",
    },
  ],
  iceTransportPolicy: "all",
};
