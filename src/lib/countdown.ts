export function getRemainingMilliseconds(lockUntil: string | null | undefined, nowMs: number = Date.now()): number {
  if (!lockUntil) return 0;

  const lockAtMs = new Date(lockUntil).getTime();
  if (!Number.isFinite(lockAtMs)) return 0;

  return Math.max(0, lockAtMs - nowMs);
}

export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return days > 0 ? `${days}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;
}