export type UiSoundType = "like" | "message";

type Tone = {
  frequency: number;
  durationMs: number;
  delayMs: number;
  gain: number;
  waveform: OscillatorType;
};

// Messenger-style crisp pop sounds — louder & more satisfying
const SOUND_MAP: Record<UiSoundType, Tone[]> = {
  like: [
    { frequency: 1046.5, durationMs: 60, delayMs: 0, gain: 0.28, waveform: "sine" },
    { frequency: 1568, durationMs: 80, delayMs: 50, gain: 0.22, waveform: "sine" },
    { frequency: 2093, durationMs: 50, delayMs: 100, gain: 0.15, waveform: "sine" },
  ],
  message: [
    { frequency: 587.33, durationMs: 70, delayMs: 0, gain: 0.3, waveform: "sine" },
    { frequency: 880, durationMs: 100, delayMs: 70, gain: 0.25, waveform: "sine" },
    { frequency: 1174.66, durationMs: 130, delayMs: 140, gain: 0.18, waveform: "sine" },
  ],
};

const COOLDOWN_MS: Record<UiSoundType, number> = {
  like: 120,
  message: 260,
};

let audioCtx: AudioContext | null = null;
const lastPlayedAt: Record<UiSoundType, number> = { like: 0, message: 0 };

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx && audioCtx.state !== "closed") return audioCtx;

  const Ctx = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) return null;

  try {
    audioCtx = new Ctx();
    return audioCtx;
  } catch {
    return null;
  }
}

function playTone(ctx: AudioContext, tone: Tone) {
  const now = ctx.currentTime + tone.delayMs / 1000;
  const attack = 0.008;
  const decay = 0.04;
  const sustain = tone.gain * 0.6;
  const release = Math.max(0.06, tone.durationMs / 1000);

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = tone.waveform;
  oscillator.frequency.setValueAtTime(tone.frequency, now);
  
  // Sharp attack for a crisp pop
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, tone.gain), now + attack);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, sustain), now + attack + decay);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + release);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(now);
  oscillator.stop(now + release + 0.02);
}

export function playUiSound(type: UiSoundType) {
  const nowTs = Date.now();
  if (nowTs - lastPlayedAt[type] < COOLDOWN_MS[type]) return;
  lastPlayedAt[type] = nowTs;

  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }

  SOUND_MAP[type].forEach((tone) => {
    try {
      playTone(ctx, tone);
    } catch {
      // no-op
    }
  });
}
