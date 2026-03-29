export type UiSoundType = "like" | "message";

type Tone = {
  frequency: number;
  durationMs: number;
  delayMs: number;
  gain: number;
  waveform: OscillatorType;
};

const SOUND_MAP: Record<UiSoundType, Tone[]> = {
  like: [
    { frequency: 880, durationMs: 42, delayMs: 0, gain: 0.08, waveform: "sine" },
    { frequency: 1318.51, durationMs: 58, delayMs: 48, gain: 0.09, waveform: "triangle" },
  ],
  message: [
    { frequency: 740, durationMs: 80, delayMs: 0, gain: 0.07, waveform: "triangle" },
    { frequency: 987.77, durationMs: 120, delayMs: 88, gain: 0.08, waveform: "triangle" },
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
  const attack = 0.01;
  const release = Math.max(0.04, tone.durationMs / 1000);

  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = tone.waveform;
  oscillator.frequency.setValueAtTime(tone.frequency, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, tone.gain), now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + release);

  oscillator.connect(gain);
  gain.connect(ctx.destination);

  oscillator.start(now);
  oscillator.stop(now + release + 0.01);
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
