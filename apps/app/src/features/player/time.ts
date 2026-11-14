/** `m:ss` for a number of seconds; 0:00 for anything that isn't a positive number. */
export const clock = (seconds: number) => {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/** How far into a song, as a 0 to 100 percentage. 0 while the length isn't known yet. */
export const progressPercent = (current: number, duration: number) => {
  if (!Number.isFinite(current) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(100, Math.max(0, (current / duration) * 100));
};
