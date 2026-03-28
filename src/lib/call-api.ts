import { supabase } from "@/integrations/supabase/client";

const CALL_REMOTE_AUDIO_CLASS = "call-remote-audio";
let activeRingtoneStop: (() => void) | null = null;

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
  if (activeRingtoneStop) {
    activeRingtoneStop();
    activeRingtoneStop = null;
  }

  let stopped = false;
  let loopTimer: number | null = null;
  let toneTimer1: number | null = null;
  let toneTimer2: number | null = null;
  let audioCtx: AudioContext | null = null;

  const playBeep = (freq: number, duration = 0.32) => {
    if (!audioCtx || audioCtx.state === "closed") return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.55, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.02, audioCtx.currentTime + duration);

    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  };

  const playRingCycle = () => {
    if (stopped || !audioCtx || audioCtx.state === "closed") return;

    try {
      playBeep(720, 0.34);
      toneTimer1 = window.setTimeout(() => {
        if (stopped) return;
        playBeep(860, 0.34);
      }, 420);

      toneTimer2 = window.setTimeout(() => {
        if (stopped) return;
        playBeep(720, 0.34);
      }, 840);
    } catch {
      // no-op
    }
  };

  const init = async () => {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // Critical: resume AudioContext (required in PWA/standalone mode)
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }
    playRingCycle();
    loopTimer = window.setInterval(playRingCycle, 2400);
  };

  init().catch(() => {
    // no-op
  });

  const stop = () => {
      stopped = true;
      if (loopTimer) {
        clearInterval(loopTimer);
        loopTimer = null;
      }
      if (toneTimer1) {
        clearTimeout(toneTimer1);
        toneTimer1 = null;
      }
      if (toneTimer2) {
        clearTimeout(toneTimer2);
        toneTimer2 = null;
      }
      if (audioCtx && audioCtx.state !== "closed") {
        audioCtx.close().catch(() => {});
      }
      audioCtx = null;

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

// WebRTC config with free STUN servers
export const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};
