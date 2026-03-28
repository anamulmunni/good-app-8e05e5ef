import { supabase } from "@/integrations/supabase/client";

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

// Ringtone using Web Audio API - with proper AudioContext resume for PWA/standalone
export function playRingtone(): { stop: () => void } {
  let stopped = false;
  let timeoutId: any;
  let audioCtx: AudioContext | null = null;

  const init = async () => {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Critical: resume AudioContext (required in PWA/standalone mode)
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    playTone();
  };

  const playTone = () => {
    if (stopped || !audioCtx || audioCtx.state === "closed") return;

    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 440;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.7);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.7);

      timeoutId = setTimeout(() => {
        if (stopped || !audioCtx || audioCtx.state === "closed") return;
        try {
          const osc2 = audioCtx.createOscillator();
          const gain2 = audioCtx.createGain();
          osc2.connect(gain2);
          gain2.connect(audioCtx.destination);
          osc2.frequency.value = 554;
          osc2.type = "sine";
          gain2.gain.setValueAtTime(0.4, audioCtx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.7);
          osc2.start();
          osc2.stop(audioCtx.currentTime + 0.7);
        } catch {}
        timeoutId = setTimeout(playTone, 1800);
      }, 900);
    } catch {}
  };

  init();

  return {
    stop: () => {
      stopped = true;
      clearTimeout(timeoutId);
      if (audioCtx && audioCtx.state !== "closed") {
        audioCtx.close().catch(() => {});
      }
      audioCtx = null;
    },
  };
}

// Attach remote audio stream to a real <audio> element for reliable playback (especially PWA)
export function attachRemoteAudio(stream: MediaStream): HTMLAudioElement {
  // Remove any existing call audio elements
  document.querySelectorAll('.call-remote-audio').forEach(el => el.remove());

  const audio = document.createElement("audio");
  audio.className = "call-remote-audio";
  audio.autoplay = true;
  (audio as any).playsInline = true;
  audio.setAttribute("playsinline", "true");
  audio.setAttribute("webkit-playsinline", "true");
  audio.volume = 1.0;
  audio.srcObject = stream;
  // Some mobile browsers need the element in the DOM
  audio.style.display = "none";
  document.body.appendChild(audio);

  // Force play - critical for standalone/PWA mode
  const tryPlay = () => {
    const p = audio.play();
    if (p) {
      p.catch(() => {
        // If autoplay blocked, retry on next user tap
        const handler = () => {
          audio.play().catch(() => {});
          document.removeEventListener("touchstart", handler);
          document.removeEventListener("click", handler);
        };
        document.addEventListener("click", handler, { once: false });
        document.addEventListener("touchstart", handler, { once: false });
      });
    }
  };

  tryPlay();
  // Also retry after a short delay (helps on some devices)
  setTimeout(tryPlay, 300);

  return audio;
}

// WebRTC config with free STUN servers
export const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};
