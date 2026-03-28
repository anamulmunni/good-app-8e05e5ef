export type RingtoneType = "incoming" | "outgoing";

type Note = {
  frequency: number;
  durationMs: number;
  delayMs: number;
  gain: number;
  waveform: OscillatorType;
};

const INCOMING_NOTES: Note[] = [
  { frequency: 659.25, durationMs: 220, delayMs: 0, gain: 0.22, waveform: "triangle" },
  { frequency: 783.99, durationMs: 220, delayMs: 250, gain: 0.24, waveform: "triangle" },
  { frequency: 987.77, durationMs: 330, delayMs: 520, gain: 0.26, waveform: "triangle" },
  { frequency: 783.99, durationMs: 220, delayMs: 980, gain: 0.22, waveform: "triangle" },
];

const OUTGOING_NOTES: Note[] = [
  { frequency: 440, durationMs: 620, delayMs: 0, gain: 0.16, waveform: "sine" },
  { frequency: 554.37, durationMs: 620, delayMs: 760, gain: 0.16, waveform: "sine" },
];

const LOOP_MS: Record<RingtoneType, number> = {
  incoming: 2300,
  outgoing: 3200,
};

const NOTE_MAP: Record<RingtoneType, Note[]> = {
  incoming: INCOMING_NOTES,
  outgoing: OUTGOING_NOTES,
};

function playNote(audioCtx: AudioContext, note: Note) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.type = note.waveform;
  osc.frequency.setValueAtTime(note.frequency, audioCtx.currentTime);

  const attack = 0.02;
  const release = Math.max(0.03, note.durationMs / 1000);
  gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(note.gain, audioCtx.currentTime + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + release);

  osc.start();
  osc.stop(audioCtx.currentTime + release + 0.02);
}

export function startRingtoneLoop(type: RingtoneType): { stop: () => void } {
  let stopped = false;
  let audioCtx: AudioContext | null = null;
  let loopTimer: number | null = null;
  const noteTimers: number[] = [];

  const clearNoteTimers = () => {
    while (noteTimers.length) {
      const id = noteTimers.pop();
      if (id) clearTimeout(id);
    }
  };

  const playCycle = () => {
    if (stopped || !audioCtx || audioCtx.state === "closed") return;
    clearNoteTimers();

    const notes = NOTE_MAP[type];
    notes.forEach((note) => {
      const timer = window.setTimeout(() => {
        if (stopped || !audioCtx || audioCtx.state === "closed") return;
        try {
          playNote(audioCtx, note);
        } catch {
          // no-op
        }
      }, note.delayMs);
      noteTimers.push(timer);
    });
  };

  const init = async () => {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === "suspended") {
      await audioCtx.resume();
    }

    playCycle();
    loopTimer = window.setInterval(playCycle, LOOP_MS[type]);
  };

  init().catch(() => {
    // no-op
  });

  const stop = () => {
    stopped = true;
    clearNoteTimers();

    if (loopTimer) {
      clearInterval(loopTimer);
      loopTimer = null;
    }

    if (audioCtx && audioCtx.state !== "closed") {
      audioCtx.close().catch(() => {});
    }

    audioCtx = null;
  };

  return { stop };
}
