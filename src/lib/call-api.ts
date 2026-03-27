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
  // Delete old signals between these two users
  await (supabase.from("call_signals").delete() as any)
    .or(`and(caller_id.eq.${userId1},receiver_id.eq.${userId2}),and(caller_id.eq.${userId2},receiver_id.eq.${userId1})`);
}

// Simple ringtone using Web Audio API
export function playRingtone(): { stop: () => void } {
  const audioCtx = new AudioContext();
  let stopped = false;
  let timeoutId: any;

  const playTone = () => {
    if (stopped) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 440;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.8);

    timeoutId = setTimeout(() => {
      if (!stopped) {
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.frequency.value = 554;
        osc2.type = "sine";
        gain2.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.8);
      }
      timeoutId = setTimeout(playTone, 2000);
    }, 1000);
  };

  playTone();

  return {
    stop: () => {
      stopped = true;
      clearTimeout(timeoutId);
      audioCtx.close();
    },
  };
}

// WebRTC config with free STUN servers
export const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};
